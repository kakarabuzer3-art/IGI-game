/**
 * Level: parses authored tile-grid data into runtime structures.
 * Owns terrain, the mutable lightmap, entity registry and spatial queries.
 * Rendering and AI both read from here — terrain is the single source of truth.
 */

import type {
  EntityOverride,
  LevelDef,
  TerminalEffect,
  TriggerDef,
  Vec2,
} from '@/engine/core/types'

export const TILE = 2 // world units per tile
export const WALL_H = 3.2

export const enum Terrain {
  Void = 0,
  Floor = 1,
  WallConcrete = 2,
  WallPanel = 3,
  Fence = 4,
  Crate = 5,
}

export type EntityKind =
  | 'door'
  | 'lockeddoor'
  | 'terminal'
  | 'camera'
  | 'keycard'
  | 'intel'
  | 'jammer'
  | 'switch'
  | 'extract'
  | 'elevator'
  | 'body'

export interface ParsedEntity {
  id: string
  kind: EntityKind
  tile: Vec2
  /** 0=N 1=E 2=S 3=W — camera sweep center / terminal facing */
  dir: 0 | 1 | 2 | 3
  label: string
  hold: number
  /* mutable runtime state */
  open: boolean // doors
  locked: boolean // doors
  disabled: boolean // cameras
  taken: boolean // pickups
  on: boolean // switches (light state)
  active: boolean // elevator availability etc.
  /* config */
  link?: string
  effect?: TerminalEffect
  variant?: 'fixed' | 'searchlight'
  charges: number
  lockdown: boolean
  radius: number
  intelText?: string
}

const BASE_LIGHT: Record<string, number> = {
  ',': 0.1, // exterior night
  '.': 0.38, // interior dim
  '*': 0.85, // lit
}

const MARKER_FLOOR_LIGHT = 0.38

const KIND_BY_CHAR: Record<string, EntityKind> = {
  D: 'door',
  L: 'lockeddoor',
  T: 'terminal',
  C: 'camera',
  K: 'keycard',
  I: 'intel',
  J: 'jammer',
  '~': 'switch',
  X: 'extract',
  V: 'elevator',
}

const DEFAULT_LABEL: Record<EntityKind, string> = {
  door: 'OPEN DOOR',
  lockeddoor: 'DOOR — KEYCARD REQUIRED',
  terminal: 'ACCESS TERMINAL',
  camera: 'CAMERA',
  keycard: 'TAKE KEYCARD',
  intel: 'RETRIEVE DATA',
  jammer: 'TAKE SIGNAL JAMMER',
  switch: 'TOGGLE LIGHTS',
  extract: 'INITIATE EXTRACTION',
  elevator: 'USE ELEVATOR',
  body: '',
}

export class Level {
  readonly def: LevelDef
  readonly w: number
  readonly h: number
  readonly terrain: Uint8Array
  readonly ceiling: Uint8Array
  readonly baseLight: Float32Array
  readonly light: Float32Array
  readonly entities: ParsedEntity[] = []
  private entityByTile = new Map<number, ParsedEntity>()
  spawnTile: Vec2 = { x: 1, y: 1 }
  triggers: TriggerDef[]

  constructor(def: LevelDef) {
    this.def = def
    this.h = def.grid.length
    this.w = Math.max(...def.grid.map((r) => r.length))
    const n = this.w * this.h
    this.terrain = new Uint8Array(n)
    this.ceiling = new Uint8Array(n)
    this.baseLight = new Float32Array(n)
    this.light = new Float32Array(n)
    this.triggers = def.triggers

    const overrides = new Map<string, EntityOverride>()
    for (const o of def.overrides ?? []) overrides.set(`${o.tile.x},${o.tile.y}`, o)

    let autoId = 0
    for (let y = 0; y < this.h; y++) {
      const row = def.grid[y] ?? ''
      for (let x = 0; x < this.w; x++) {
        const ch = row[x] ?? '#'
        const i = y * this.w + x
        const isMarker = ch in KIND_BY_CHAR || ch === 'S'
        // terrain
        switch (ch) {
          case '#': this.terrain[i] = Terrain.WallConcrete; break
          case 'B': this.terrain[i] = Terrain.WallPanel; break
          case 'C': this.terrain[i] = Terrain.WallConcrete; break // wall-mounted camera
          case 'f': this.terrain[i] = Terrain.Fence; break
          case 'o': this.terrain[i] = Terrain.Crate; break
          default: this.terrain[i] = Terrain.Floor
        }
        // light + ceiling: exterior char ',' has no ceiling; markers inherit interior
        const lightChar = ch === ',' ? ',' : ch === '*' ? '*' : isMarker ? '.' : ch
        const base = BASE_LIGHT[lightChar] ?? (isMarker ? MARKER_FLOOR_LIGHT : 0.38)
        this.baseLight[i] = base
        this.light[i] = base
        // floors get a ceiling unless they are outdoor terrain (',' / 'f')
        this.ceiling[i] =
          this.terrain[i] === Terrain.Floor && ch !== ',' && ch !== 'f' ? 1 : 0

        if (ch === 'S') {
          this.spawnTile = { x, y }
          continue
        }
        const kind = KIND_BY_CHAR[ch]
        if (!kind) continue
        const o = overrides.get(`${x},${y}`)
        const dir = (o?.dir ?? this.inferDir(x, y, ch)) as 0 | 1 | 2 | 3
        const ent: ParsedEntity = {
          id: o?.id ?? `${kind}-${x}-${y}-${autoId++}`,
          kind,
          tile: { x, y },
          dir,
          label: o?.label ?? DEFAULT_LABEL[kind],
          hold: o?.hold ?? (kind === 'terminal' ? 3 : kind === 'extract' ? 4 : kind === 'elevator' ? 2 : 0),
          open: false,
          locked: kind === 'lockeddoor',
          disabled: false,
          taken: false,
          on: true,
          active: true,
          link: o?.link,
          effect: o?.effect,
          variant: o?.variant ?? (kind === 'camera' ? 'fixed' : undefined),
          charges: o?.charges ?? 0,
          lockdown: o?.lockdown ?? false,
          radius: o?.radius ?? 3,
          intelText: o?.intelText,
        }
        this.entities.push(ent)
        this.entityByTile.set(y * this.w + x, ent)
      }
    }
  }

  /** Cameras mount facing away from the nearest wall. */
  private inferDir(x: number, y: number, ch: string): 0 | 1 | 2 | 3 {
    if (ch !== 'C') return 0
    const solid = (dx: number, dy: number) => this.terrainRaw(x + dx, y + dy) >= Terrain.WallConcrete
    if (solid(0, -1)) return 2 // wall north → face south
    if (solid(0, 1)) return 0
    if (solid(-1, 0)) return 1
    if (solid(1, 0)) return 3
    return 2
  }

  private terrainRaw(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return Terrain.WallConcrete
    return this.terrain[y * this.w + x]
  }

  /* ---------------- queries ---------------- */

  idx(tx: number, ty: number): number {
    return ty * this.w + tx
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h
  }

  entityAt(tx: number, ty: number): ParsedEntity | undefined {
    return this.entityByTile.get(this.idx(tx, ty))
  }

  getEntity(id: string): ParsedEntity | undefined {
    return this.entities.find((e) => e.id === id)
  }

  /** blocks movement: walls, crates, fence, closed doors. tx/ty are floats (tile space). */
  isSolidAt(tx: number, ty: number): boolean {
    const gx = Math.floor(tx)
    const gy = Math.floor(ty)
    if (!this.inBounds(gx, gy)) return true
    const t = this.terrain[this.idx(gx, gy)]
    if (t === Terrain.WallConcrete || t === Terrain.WallPanel || t === Terrain.Crate || t === Terrain.Fence)
      return true
    const e = this.entityByTile.get(this.idx(gx, gy))
    if (e && (e.kind === 'door' || e.kind === 'lockeddoor') && !e.open) return true
    return false
  }

  /** blocks line of sight: everything solid EXCEPT fence (see-through). */
  blocksSightTile(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return true
    const t = this.terrain[this.idx(gx, gy)]
    if (t === Terrain.WallConcrete || t === Terrain.WallPanel || t === Terrain.Crate) return true
    const e = this.entityByTile.get(this.idx(gx, gy))
    if (e && (e.kind === 'door' || e.kind === 'lockeddoor') && !e.open) return true
    return false
  }

  isWalkableTile(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return false
    const t = this.terrain[this.idx(gx, gy)]
    if (t !== Terrain.Floor) return false
    const e = this.entityByTile.get(this.idx(gx, gy))
    if (e && (e.kind === 'door' || e.kind === 'lockeddoor') && !e.open) return false
    return true
  }

  /** walkability ignoring door state — used by A* (guards can open doors). */
  isWalkableTileIgnoreDoors(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return false
    return this.terrain[this.idx(gx, gy)] === Terrain.Floor
  }

  lightAtTile(gx: number, gy: number): number {
    if (!this.inBounds(gx, gy)) return 0
    return this.light[this.idx(gx, gy)]
  }

  /** world units → tile space (float) */
  worldToTile(wx: number, wy: number): Vec2 {
    return { x: wx / TILE, y: wy / TILE }
  }

  /** tile (int) center → world units */
  tileCenterWorld(tx: number, ty: number): Vec2 {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }
  }

  hasCeiling(gx: number, gy: number): boolean {
    if (!this.inBounds(gx, gy)) return false
    return this.ceiling[this.idx(gx, gy)] === 1
  }

  /* ---------------- mutation ---------------- */

  setDoorOpen(id: string, open: boolean): void {
    const e = this.getEntity(id)
    if (e) e.open = open
  }

  toggleSwitch(ent: ParsedEntity): void {
    ent.on = !ent.on
    const r = ent.radius
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const gx = ent.tile.x + dx
        const gy = ent.tile.y + dy
        if (!this.inBounds(gx, gy)) continue
        if (dx * dx + dy * dy > r * r) continue
        const i = this.idx(gx, gy)
        this.light[i] = ent.on ? this.baseLight[i] : Math.min(this.baseLight[i], 0.05)
      }
    }
  }

  disableAllCameras(): void {
    for (const e of this.entities) if (e.kind === 'camera') e.disabled = true
  }

  unlockDoor(id: string): void {
    const e = this.getEntity(id)
    if (e && (e.kind === 'lockeddoor' || e.kind === 'door')) {
      e.locked = false
      e.label = 'OPEN DOOR'
    }
  }

  closeDoors(ids: string[]): void {
    for (const id of ids) {
      const e = this.getEntity(id)
      if (e) {
        e.open = false
        if (e.lockdown) e.locked = true
      }
    }
  }

  /** flood fill reachability (doors passable, locked doors passable — used by validation) */
  reachableFrom(tx: number, ty: number): Set<number> {
    const seen = new Set<number>()
    const stack: number[] = [this.idx(tx, ty)]
    seen.add(stack[0])
    while (stack.length) {
      const i = stack.pop()!
      const x = i % this.w
      const y = Math.floor(i / this.w)
      const t = this.terrain[i]
      if (t === Terrain.WallConcrete || t === Terrain.WallPanel || t === Terrain.Crate || t === Terrain.Fence)
        continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const ny = y + dy
        if (!this.inBounds(nx, ny)) continue
        const ni = this.idx(nx, ny)
        if (seen.has(ni)) continue
        seen.add(ni)
        stack.push(ni)
      }
    }
    return seen
  }
}
