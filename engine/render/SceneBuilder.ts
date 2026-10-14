/**
 * SceneBuilder — translates a Level into a Three.js scene and keeps dynamic
 * rigs (doors, cameras, guards, props, lights) synchronized with simulation
 * state each frame. Rendering only reads game state; it never mutates it.
 *
 * Static geometry (walls/floors/ceilings/crates) is merged into a handful of
 * draw calls with vertex-color lightmaps baked from Level.light — so the same
 * light values that drive stealth detection also drive what the player SEES.
 */

import * as THREE from 'three'
import { damp, makeRng } from '@/engine/core/math'
import { TILE, WALL_H, Terrain, type Level, type ParsedEntity } from '@/engine/world/Level'
import type { Guard } from '@/engine/ai/Guard'
import type { CameraRuntime } from '@/engine/stealth/StealthSystem'
import { getTextures, type TextureSet } from './textures'

export interface RenderContext {
  level: Level
  guards: Guard[]
  cameras: CameraRuntime[]
  extractionArmed: boolean
  lockdown: boolean
  playerPos: { x: number; y: number }
}

interface DoorRig {
  ent: ParsedEntity
  panel: THREE.Mesh
  indicator: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  openT: number
}

interface GuardRig {
  group: THREE.Group
  legL: THREE.Mesh
  legR: THREE.Mesh
  armL: THREE.Mesh
  armR: THREE.Mesh
  visorMat: THREE.MeshBasicMaterial
  cone: THREE.Mesh
  coneMat: THREE.MeshBasicMaterial
  sprite: THREE.Sprite
  spriteMats: Record<string, THREE.SpriteMaterial>
}

interface CamRig {
  ent: ParsedEntity
  mount: THREE.Group
  coneMat: THREE.MeshBasicMaterial
  lensMat: THREE.MeshBasicMaterial
  cone: THREE.Mesh
}

interface PropRig {
  ent: ParsedEntity
  obj: THREE.Object3D
  spin?: THREE.Object3D
  blinkMat?: THREE.MeshBasicMaterial
}

const DIR_VEC = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
] as const

function sectorGeometry(radius: number, fov: number, segments = 20): THREE.CircleGeometry {
  return new THREE.CircleGeometry(radius, segments, Math.PI / 2 - fov / 2, fov)
}

function glyphTexture(glyph: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 52px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(glyph, 32, 36)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class SceneBuilder {
  readonly scene = new THREE.Scene()
  private tex: TextureSet
  private level!: Level

  private doorRigs: DoorRig[] = []
  private camRigs: CamRig[] = []
  private propRigs: PropRig[] = []
  private guardRigs = new Map<string, GuardRig>()
  private lampLights: { light: THREE.PointLight; tile: { x: number; y: number }; base: number }[] = []
  private redLights: THREE.PointLight[] = []
  private floorColorAttr: THREE.BufferAttribute | null = null
  private floorRanges = new Map<number, number>() // tileIdx → first vertex index
  private ceilColorAttr: THREE.BufferAttribute | null = null
  private ceilRanges = new Map<number, number>()
  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []
  private sprites: Record<string, THREE.Texture> = {}
  private lockdownT = 0

  constructor(ambient: string) {
    this.tex = getTextures()
    const fogColor =
      ambient === 'night' ? 0x05070d : ambient === 'underground' ? 0x04070a : 0x06080e
    const fogDensity = ambient === 'night' ? 0.042 : 0.06
    this.scene.fog = new THREE.FogExp2(fogColor, fogDensity)
    this.scene.background = new THREE.Color(fogColor)
    this.scene.add(new THREE.HemisphereLight(0x223044, 0x0a0c10, ambient === 'underground' ? 0.35 : 0.55))
    this.scene.add(new THREE.AmbientLight(0x1c2230, 0.5))
  }

  /* ================= build ================= */

  build(level: Level): void {
    this.level = level

    /* ---- static merged geometry ---- */
    const wallC = this.newArrays()
    const wallP = this.newArrays()
    const floorA = this.newArrays()
    const ceilA = this.newArrays()
    const crateA = this.newArrays()

    const tint = (light: number, r: number, g: number, b: number): [number, number, number] => [
      r * light, g * light, b * light,
    ]

    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        const i = level.idx(x, y)
        const t = level.terrain[i]
        const wx = x * TILE
        const wz = y * TILE
        if (t === Terrain.WallConcrete || t === Terrain.WallPanel) {
          const target = t === Terrain.WallConcrete ? wallC : wallP
          // faces toward open neighbors
          for (let d = 0; d < 4; d++) {
            const nx = x + DIR_VEC[d][0]
            const ny = y + DIR_VEC[d][1]
            const nt = level.inBounds(nx, ny) ? level.terrain[level.idx(nx, ny)] : Terrain.Floor
            if (nt === Terrain.WallConcrete || nt === Terrain.WallPanel || nt === Terrain.Crate) continue
            const neighborLight = level.inBounds(nx, ny) ? Math.max(level.light[level.idx(nx, ny)], 0.12) : 0.15
            const shade = d === 0 || d === 2 ? 0.86 : 1
            const col = tint(Math.min(1.2, neighborLight * 1.6) * shade, 0.95, 0.96, 1)
            this.addWallFace(target, wx, wz, d, col)
          }
        } else if (t === Terrain.Crate) {
          const col = tint(Math.max(level.light[i], 0.15) * 1.3, 1, 0.97, 0.9)
          this.addBox(crateA, wx + TILE / 2, 0.85, wz + TILE / 2, 1.7, 1.7, 1.7, col)
        } else if (t === Terrain.Floor) {
          const light = level.light[i]
          this.floorRanges.set(i, floorA.count)
          const isOut = !level.hasCeiling(x, y)
          const fc = tint(Math.max(light, 0.05) * 1.25, isOut ? 0.72 : 0.95, isOut ? 0.78 : 0.96, isOut ? 0.9 : 1)
          this.addFloorQuad(floorA, wx, wz, fc)
          if (level.hasCeiling(x, y)) {
            this.ceilRanges.set(i, ceilA.count)
            const cc = tint(Math.max(light, 0.05) * 0.5, 0.9, 0.92, 1)
            this.addCeilQuad(ceilA, wx, wz, cc)
          }
        }
      }
    }

    this.scene.add(
      this.makeMesh(wallC, new THREE.MeshLambertMaterial({ map: this.tex.concrete, vertexColors: true })),
      this.makeMesh(wallP, new THREE.MeshLambertMaterial({ map: this.tex.panel, vertexColors: true })),
      this.makeMesh(crateA, new THREE.MeshLambertMaterial({ map: this.tex.crate, vertexColors: true })),
    )
    const floorMesh = this.makeMesh(
      floorA,
      new THREE.MeshLambertMaterial({ map: this.tex.floor, vertexColors: true }),
    )
    this.floorColorAttr = floorMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    this.scene.add(floorMesh)
    const ceilMesh = this.makeMesh(
      ceilA,
      new THREE.MeshLambertMaterial({ map: this.tex.ceiling, vertexColors: true }),
    )
    this.ceilColorAttr = ceilMesh.geometry.getAttribute('color') as THREE.BufferAttribute
    this.scene.add(ceilMesh)

    /* ---- fence ---- */
    this.buildFences(level)

    /* ---- lights ---- */
    for (const lamp of level.def.lamps ?? []) {
      const p = level.tileCenterWorld(lamp.tile.x, lamp.tile.y)
      const light = new THREE.PointLight(lamp.color ?? 0xffe6bd, (lamp.intensity ?? 1) * 2.4, 15, 1.7)
      light.position.set(p.x, 2.6, p.y)
      this.scene.add(light)
      this.lampLights.push({ light, tile: lamp.tile, base: (lamp.intensity ?? 1) * 2.4 })
      // small emissive fixture
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: lamp.color ?? 0xffe6bd }),
      )
      bulb.position.set(p.x, 2.62, p.y)
      this.scene.add(bulb)
      this.disposables.push(bulb.geometry, bulb.material as THREE.Material)
    }
    // lockdown emergency lights (off until triggered)
    for (const [lx, ly] of [[0.5, 0.5], [0.5, 0.25]] as const) {
      const rl = new THREE.PointLight(0xff2a1a, 0, 26, 1.6)
      rl.position.set(level.w * TILE * lx, 2.8, level.h * TILE * ly)
      this.scene.add(rl)
      this.redLights.push(rl)
    }

    /* ---- entities ---- */
    for (const ent of level.entities) this.buildEntity(ent)

    /* ---- indicator glyphs (shared) ---- */
    this.sprites['?'] = glyphTexture('?', '#ffc247')
    this.sprites['!'] = glyphTexture('!', '#ff8a3d')
    this.sprites['!!'] = glyphTexture('‼', '#ff3d3d')
    this.sprites['x'] = glyphTexture('✕', '#8a93a3')
  }

  private newArrays(): {
    pos: number[]; norm: number[]; uv: number[]; col: number[]; idx: number[]; count: number
  } {
    return { pos: [], norm: [], uv: [], col: [], idx: [], count: 0 }
  }

  private pushQuad(
    a: ReturnType<SceneBuilder['newArrays']>,
    p: [number, number, number][],
    n: [number, number, number],
    uv: [number, number][],
    col: [number, number, number],
  ): void {
    const base = a.count
    for (let k = 0; k < 4; k++) {
      a.pos.push(p[k][0], p[k][1], p[k][2])
      a.norm.push(n[0], n[1], n[2])
      a.uv.push(uv[k][0], uv[k][1])
      a.col.push(col[0], col[1], col[2])
    }
    a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    a.count += 4
  }

  private addWallFace(
    a: ReturnType<SceneBuilder['newArrays']>,
    wx: number, wz: number, dir: number, col: [number, number, number],
  ): void {
    const s = TILE
    const h = WALL_H
    // dir: 0 north(-z) 1 east(+x) 2 south(+z) 3 west(-x)
    const uv: [number, number][] = [[0, 0], [1, 0], [1, h / 2], [0, h / 2]]
    if (dir === 0) {
      this.pushQuad(a, [[wx, 0, wz], [wx + s, 0, wz], [wx + s, h, wz], [wx, h, wz]], [0, 0, -1], uv, col)
    } else if (dir === 1) {
      this.pushQuad(a, [[wx + s, 0, wz], [wx + s, 0, wz + s], [wx + s, h, wz + s], [wx + s, h, wz]], [1, 0, 0], uv, col)
    } else if (dir === 2) {
      this.pushQuad(a, [[wx + s, 0, wz + s], [wx, 0, wz + s], [wx, h, wz + s], [wx + s, h, wz + s]], [0, 0, 1], uv, col)
    } else {
      this.pushQuad(a, [[wx, 0, wz + s], [wx, 0, wz], [wx, h, wz], [wx, h, wz + s]], [-1, 0, 0], uv, col)
    }
  }

  private addFloorQuad(a: ReturnType<SceneBuilder['newArrays']>, wx: number, wz: number, col: [number, number, number]): void {
    const s = TILE
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    this.pushQuad(a, [[wx, 0.01, wz + s], [wx + s, 0.01, wz + s], [wx + s, 0.01, wz], [wx, 0.01, wz]], [0, 1, 0], uv, col)
  }

  private addCeilQuad(a: ReturnType<SceneBuilder['newArrays']>, wx: number, wz: number, col: [number, number, number]): void {
    const s = TILE
    const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
    this.pushQuad(a, [[wx, WALL_H - 0.02, wz], [wx + s, WALL_H - 0.02, wz], [wx + s, WALL_H - 0.02, wz + s], [wx, WALL_H - 0.02, wz + s]], [0, -1, 0], uv, col)
  }

  private addBox(
    a: ReturnType<SceneBuilder['newArrays']>,
    cx: number, cy: number, cz: number, sx: number, sy: number, sz: number,
    col: [number, number, number],
  ): void {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2
    const faces: { p: [number, number, number][]; n: [number, number, number]; uv: [number, number][] }[] = [
      { p: [[cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz]], n: [0, 0, 1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { p: [[cx + hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz - hz], [cx - hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz - hz]], n: [0, 0, -1], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { p: [[cx + hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx + hx, cy + hy, cz + hz]], n: [1, 0, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { p: [[cx - hx, cy - hy, cz - hz], [cx - hx, cy - hy, cz + hz], [cx - hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz - hz]], n: [-1, 0, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { p: [[cx - hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz]], n: [0, 1, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
      { p: [[cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz + hz], [cx - hx, cy - hy, cz + hz]], n: [0, -1, 0], uv: [[0, 0], [1, 0], [1, 1], [0, 1]] },
    ]
    for (const f of faces) this.pushQuad(a, f.p, f.n, f.uv, col)
  }

  private makeMesh(a: ReturnType<SceneBuilder['newArrays']>, mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(a.norm, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3))
    g.setIndex(a.idx)
    this.disposables.push(g, mat)
    const m = new THREE.Mesh(g, mat)
    m.matrixAutoUpdate = false
    m.updateMatrix()
    return m
  }

  private buildFences(level: Level): void {
    const a = this.newArrays()
    const col: [number, number, number] = [0.75, 0.78, 0.82]
    for (let y = 0; y < level.h; y++) {
      for (let x = 0; x < level.w; x++) {
        if (level.terrain[level.idx(x, y)] !== Terrain.Fence) continue
        const wx = x * TILE
        const wz = y * TILE
        const h = 2.7
        for (let d = 0; d < 4; d++) {
          const nx = x + DIR_VEC[d][0]
          const ny = y + DIR_VEC[d][1]
          if (!level.inBounds(nx, ny)) continue
          if (level.terrain[level.idx(nx, ny)] === Terrain.Fence) continue
          const uv: [number, number][] = [[0, 0], [1, 0], [1, h / 2], [0, h / 2]]
          if (d === 0) this.pushQuad(a, [[wx, 0, wz], [wx + TILE, 0, wz], [wx + TILE, h, wz], [wx, h, wz]], [0, 0, -1], uv, col)
          else if (d === 1) this.pushQuad(a, [[wx + TILE, 0, wz], [wx + TILE, 0, wz + TILE], [wx + TILE, h, wz + TILE], [wx + TILE, h, wz]], [1, 0, 0], uv, col)
          else if (d === 2) this.pushQuad(a, [[wx + TILE, 0, wz + TILE], [wx, 0, wz + TILE], [wx, h, wz + TILE], [wx + TILE, h, wz + TILE]], [0, 0, 1], uv, col)
          else this.pushQuad(a, [[wx, 0, wz + TILE], [wx, 0, wz], [wx, h, wz], [wx, h, wz + TILE]], [-1, 0, 0], uv, col)
        }
      }
    }
    const mat = new THREE.MeshLambertMaterial({
      map: this.tex.fence, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, vertexColors: true,
    })
    this.scene.add(this.makeMesh(a, mat))
  }

  /* ================= entity rigs ================= */

  private buildEntity(ent: ParsedEntity): void {
    const p = this.level.tileCenterWorld(ent.tile.x, ent.tile.y)
    const dv = DIR_VEC[ent.dir]
    switch (ent.kind) {
      case 'door':
      case 'lockeddoor': {
        // door orientation: opens along the walkable axis
        const openNS =
          !this.level.isSolidAt(ent.tile.x + 0.5, ent.tile.y - 0.4) ||
          !this.level.isSolidAt(ent.tile.x + 0.5, ent.tile.y + 1.4)
        const group = new THREE.Group()
        group.position.set(p.x, 0, p.y)
        const geo = new THREE.BoxGeometry(openNS ? TILE * 0.96 : 0.18, 2.5, openNS ? 0.18 : TILE * 0.96)
        const mat = new THREE.MeshLambertMaterial({ map: this.tex.metal, color: ent.locked ? 0x6a5a58 : 0x77808c })
        const panel = new THREE.Mesh(geo, mat)
        panel.position.y = 1.25
        const indMat = new THREE.MeshBasicMaterial({ color: ent.locked ? 0xff3b30 : 0x43d67f })
        const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), indMat)
        indicator.position.set(openNS ? 0.1 : 0, 1.9, openNS ? 0 : 0.1)
        indicator.rotation.y = openNS ? Math.PI / 2 : 0
        group.add(panel, indicator)
        this.scene.add(group)
        this.disposables.push(geo, mat, indMat, indicator.geometry)
        this.doorRigs.push({ ent, panel, indicator, mat: indMat, openT: 0 })
        break
      }
      case 'terminal': {
        const group = new THREE.Group()
        group.position.set(p.x - dv[0] * 0.55, 0, p.y - dv[1] * 0.55)
        group.rotation.y = Math.atan2(dv[0], dv[1]) + Math.PI
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 0.55), new THREE.MeshLambertMaterial({ map: this.tex.metal, color: 0x5c646e }))
        desk.position.y = 0.48
        const screenMat = new THREE.MeshBasicMaterial({ map: this.tex.screen })
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.44), screenMat)
        screen.position.set(0, 1.18, 0.1)
        screen.rotation.x = -0.28
        const glow = new THREE.PointLight(0x3dff9a, 0.55, 4.5, 2)
        glow.position.set(0, 1.2, 0.4)
        group.add(desk, screen, glow)
        this.scene.add(group)
        this.disposables.push(desk.geometry, desk.material as THREE.Material, screen.geometry, screenMat)
        this.propRigs.push({ ent, obj: group, blinkMat: screenMat })
        break
      }
      case 'camera': {
        const mount = new THREE.Group()
        const off = 0.55
        mount.position.set(p.x + dv[0] * off, 2.45, p.y + dv[1] * off)
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.5), new THREE.MeshLambertMaterial({ color: 0x30363e }))
        const lensMat = new THREE.MeshBasicMaterial({ color: 0xff4433 })
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), lensMat)
        lens.rotation.x = Math.PI / 2
        lens.position.z = -0.28
        const isSL = ent.variant === 'searchlight'
        const range = (isSL ? 17 : 11) / TILE * TILE // world units
        const fov = isSL ? 0.5 : 0.75
        const coneGeo = sectorGeometry(range, fov, isSL ? 26 : 18)
        coneGeo.rotateX(-Math.PI / 2)
        const coneMat = new THREE.MeshBasicMaterial({
          color: isSL ? 0xfff2c0 : 0x8fd0ff, transparent: true, opacity: 0.06,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
        const cone = new THREE.Mesh(coneGeo, coneMat)
        cone.position.y = -2.38
        const arm = new THREE.Group()
        arm.add(body, lens, cone)
        mount.add(arm)
        // mount faces its dir; arm rotates for sweep
        mount.rotation.y = Math.atan2(dv[0], dv[1]) + Math.PI
        this.scene.add(mount)
        this.disposables.push(body.geometry, body.material as THREE.Material, lens.geometry, lensMat, coneGeo, coneMat)
        this.camRigs.push({ ent, mount: arm, coneMat, lensMat, cone })
        break
      }
      case 'switch': {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.12), new THREE.MeshLambertMaterial({ color: 0x4a5058 }))
        const led = new THREE.MeshBasicMaterial({ color: 0x43d67f })
        const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.08), led)
        ledMesh.position.z = 0.065
        const pole = new THREE.Group()
        pole.add(box, ledMesh)
        pole.position.set(p.x + 0.6, 1.3, p.y + 0.6)
        this.scene.add(pole)
        this.disposables.push(box.geometry, box.material as THREE.Material, ledMesh.geometry, led)
        this.propRigs.push({ ent, obj: pole, blinkMat: led })
        break
      }
      case 'keycard':
      case 'intel':
      case 'jammer': {
        const group = new THREE.Group()
        group.position.set(p.x, 0, p.y)
        const spin = new THREE.Group()
        let mesh: THREE.Mesh
        if (ent.kind === 'keycard') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb43d }))
        } else if (ent.kind === 'intel') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.05), new THREE.MeshBasicMaterial({ map: this.tex.screen, color: 0x7dffc4 }))
        } else {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.44), new THREE.MeshLambertMaterial({ color: 0x39424e, emissive: 0x112233 }))
          const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4), new THREE.MeshBasicMaterial({ color: 0x8892a0 }))
          antenna.position.set(0.1, 0.26, -0.16)
          spin.add(antenna)
          this.disposables.push(antenna.geometry, antenna.material as THREE.Material)
        }
        spin.position.y = 1.05
        spin.add(mesh)
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.36, 20),
          new THREE.MeshBasicMaterial({ color: 0x67e8a8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
        )
        halo.rotation.x = -Math.PI / 2
        halo.position.y = 0.04
        group.add(spin, halo)
        this.scene.add(group)
        this.disposables.push(mesh.geometry, mesh.material as THREE.Material, halo.geometry, halo.material as THREE.Material)
        this.propRigs.push({ ent, obj: group, spin })
        break
      }
      case 'extract': {
        const group = new THREE.Group()
        group.position.set(p.x, 0, p.y)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0x3c434d }))
        pole.position.y = 1.2
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0x43d67f })
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), beaconMat)
        beacon.position.y = 2.45
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.25, 1.45, 32),
          new THREE.MeshBasicMaterial({ color: 0x43d67f, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
        )
        ring.rotation.x = -Math.PI / 2
        ring.position.y = 0.05
        const pad = new THREE.Mesh(new THREE.CircleGeometry(3.1, 32), new THREE.MeshLambertMaterial({ map: this.tex.helipad, transparent: true, opacity: 0.9 }))
        pad.rotation.x = -Math.PI / 2
        pad.position.y = 0.03
        group.add(pole, beacon, ring, pad)
        this.scene.add(group)
        this.disposables.push(pole.geometry, pole.material as THREE.Material, beacon.geometry, beaconMat, ring.geometry, ring.material as THREE.Material, pad.geometry, pad.material as THREE.Material)
        this.propRigs.push({ ent, obj: group, blinkMat: beaconMat })
        break
      }
      case 'elevator': {
        const group = new THREE.Group()
        group.position.set(p.x, 0, p.y)
        const padMat = new THREE.MeshBasicMaterial({ color: 0x53c8ff, transparent: true, opacity: 0.22 })
        const pad = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 24), padMat)
        pad.rotation.x = -Math.PI / 2
        pad.position.y = 0.04
        const frame = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.9, 0.14, TILE * 0.9), new THREE.MeshLambertMaterial({ color: 0x444b55 }))
        frame.position.y = 2.9
        group.add(pad, frame)
        this.scene.add(group)
        this.disposables.push(pad.geometry, padMat, frame.geometry, frame.material as THREE.Material)
        this.propRigs.push({ ent, obj: group, blinkMat: padMat })
        break
      }
    }
    void dv
  }

  /* ================= guard rigs ================= */

  private ensureGuardRig(guard: Guard): GuardRig {
    const existing = this.guardRigs.get(guard.def.id)
    if (existing) return existing
    const rng = makeRng(guard.def.id.length * 7919 + guard.def.tile.x * 31 + guard.def.tile.y)
    void rng
    const group = new THREE.Group()
    const isOfficer = guard.def.type === 'officer'
    const uniform = new THREE.MeshLambertMaterial({ color: isOfficer ? 0x3b382a : 0x262d3a })
    const skin = new THREE.MeshLambertMaterial({ color: 0x8a6f5c })
    const mk = (w: number, h: number, d: number, mat: THREE.Material, pivotTop = false): THREE.Mesh => {
      const geo = new THREE.BoxGeometry(w, h, d)
      if (pivotTop) geo.translate(0, -h / 2, 0)
      this.disposables.push(geo)
      return new THREE.Mesh(geo, mat)
    }
    const legL = mk(0.16, 0.85, 0.16, uniform, true)
    const legR = mk(0.16, 0.85, 0.16, uniform, true)
    legL.position.set(-0.12, 0.85, 0)
    legR.position.set(0.12, 0.85, 0)
    const torso = mk(0.52, 0.62, 0.28, uniform)
    torso.position.y = 1.16
    const head = mk(0.24, 0.25, 0.24, skin)
    head.position.y = 1.62
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x59b6ff })
    const visor = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.06), visorMat)
    visor.position.set(0, 1.64, -0.125)
    const armL = mk(0.1, 0.55, 0.1, uniform, true)
    const armR = mk(0.1, 0.55, 0.1, uniform, true)
    armL.position.set(-0.32, 1.42, 0)
    armR.position.set(0.32, 1.42, 0)
    if (isOfficer) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16), new THREE.MeshBasicMaterial({ color: 0xd64545 }))
      band.position.set(0.33, 1.3, 0)
      band.rotation.y = Math.PI / 2
      group.add(band)
      this.disposables.push(band.geometry, band.material as THREE.Material)
    }
    const coneGeo = sectorGeometry(guard.params.viewDist, guard.params.fov, 18)
    coneGeo.rotateX(-Math.PI / 2)
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x59b6ff, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    const cone = new THREE.Mesh(coneGeo, coneMat)
    cone.position.y = 0.06
    // sprite indicator
    const spriteMats: Record<string, THREE.SpriteMaterial> = {}
    for (const key of Object.keys(this.sprites)) {
      spriteMats[key] = new THREE.SpriteMaterial({ map: this.sprites[key], transparent: true, depthTest: true })
      this.disposables.push(spriteMats[key])
    }
    const sprite = new THREE.Sprite(spriteMats['?'])
    sprite.position.y = 2.25
    sprite.scale.setScalar(0.42)
    sprite.visible = false
    group.add(legL, legR, torso, head, visor, armL, armR, cone, sprite)
    this.scene.add(group)
    this.disposables.push(uniform, skin, visorMat, visor.geometry, coneGeo, coneMat)
    const rig: GuardRig = { group, legL, legR, armL, armR, visorMat, cone, coneMat, sprite, spriteMats }
    this.guardRigs.set(guard.def.id, rig)
    return rig
  }

  /* ================= per-frame update ================= */

  update(ctx: RenderContext, dt: number, t: number): void {
    // doors
    for (const d of this.doorRigs) {
      d.openT = damp(d.openT, d.ent.open ? 1 : 0, 8, dt)
      d.panel.position.y = 1.25 + d.openT * 2.3
      const col = d.ent.locked ? 0xff3b30 : d.ent.open ? 0x2c8a55 : 0x43d67f
      if (d.mat.color.getHex() !== col) d.mat.color.setHex(col)
    }

    // cameras
    for (const rig of this.camRigs) {
      const cam = ctx.cameras.find((c) => c.ent === rig.ent)
      if (!cam) continue
      if (cam.ent.disabled) {
        rig.cone.visible = false
        rig.lensMat.color.setHex(0x332222)
        continue
      }
      rig.cone.visible = true
      rig.lensMat.color.setHex(cam.suspicion > 55 ? 0xff2222 : 0xff5533)
      // sweep rotation: arm local yaw so cone points along cam.angle
      const threeAngle = -cam.angle - Math.PI / 2
      const mountBase = Math.atan2(DIR_VEC[rig.ent.dir][0], DIR_VEC[rig.ent.dir][1]) + Math.PI
      rig.mount.rotation.y = threeAngle - mountBase
      const s = cam.suspicion
      rig.coneMat.color.setHex(s > 55 ? 0xff4433 : s > 25 ? 0xffb03d : rig.ent.variant === 'searchlight' ? 0xfff2c0 : 0x8fd0ff)
      rig.coneMat.opacity = 0.05 + Math.min(s / 100, 1) * 0.08
    }

    // guards
    for (const guard of ctx.guards) {
      const rig = this.ensureGuardRig(guard)
      const g = rig.group
      g.position.set(guard.pos.x * TILE, 0, guard.pos.y * TILE)
      if (guard.downed) {
        g.rotation.set(0, -guard.facing - Math.PI / 2, 0)
        g.rotation.x = 0
        g.rotation.z = Math.PI / 2
        g.position.y = 0.28
        rig.visorMat.color.setHex(0x222222)
        rig.cone.visible = false
        this.setSprite(rig, 'x', t, 0.3)
        rig.legL.rotation.x = 0.3
        rig.legR.rotation.x = -0.15
        rig.armL.rotation.x = -0.5
        rig.armR.rotation.x = 0.4
        continue
      }
      g.position.y = 0
      g.rotation.set(0, -guard.facing - Math.PI / 2, 0)
      // walk cycle
      const swing = Math.sin(guard.animPhase) * Math.min(guard.speedCur * 0.55, 0.65)
      rig.legL.rotation.x = swing
      rig.legR.rotation.x = -swing
      rig.armL.rotation.x = -swing * 0.7
      rig.armR.rotation.x = swing * 0.7
      // state colors
      let visor = 0x59b6ff
      let coneCol = 0x59b6ff
      let opacity = 0.05
      let glyph: string | null = null
      switch (guard.mode) {
        case 'suspicious': visor = 0xffc247; coneCol = 0xffc247; opacity = 0.08; glyph = '?'; break
        case 'investigate': visor = 0xff8a3d; coneCol = 0xff8a3d; opacity = 0.09; glyph = '!'; break
        case 'search': visor = 0xff8a3d; coneCol = 0xff8a3d; opacity = 0.09; glyph = '!'; break
        case 'combat': visor = 0xff3322; coneCol = 0xff3322; opacity = 0.12; glyph = '!!'; break
      }
      rig.visorMat.color.setHex(visor)
      rig.coneMat.color.setHex(coneCol)
      rig.coneMat.opacity = opacity
      rig.cone.visible = true
      this.setSprite(rig, glyph, t, 0.42)
    }

    // props
    for (const prop of this.propRigs) {
      if (prop.ent.taken) {
        prop.obj.visible = false
        continue
      }
      prop.obj.visible = true
      if (prop.spin) {
        prop.spin.rotation.y += dt * 1.4
        prop.spin.position.y = 1.05 + Math.sin(t * 2 + prop.ent.tile.x) * 0.06
      }
      if (prop.blinkMat) {
        if (prop.ent.kind === 'extract') {
          const armed = ctx.extractionArmed
          const rate = armed ? 6 : 1.6
          const on = Math.sin(t * rate) > (armed ? -0.3 : 0.55)
          prop.blinkMat.color.setHex(on ? 0x43d67f : 0x143d26)
        } else if (prop.ent.kind === 'switch') {
          prop.blinkMat.color.setHex(prop.ent.on ? 0x43d67f : 0x3a2020)
        } else if (prop.ent.kind === 'terminal') {
          const pulse = 0.75 + Math.sin(t * 3.1 + prop.ent.tile.y) * 0.25
          prop.blinkMat.color.setRGB(pulse * 0.85, pulse, pulse * 0.9)
        }
      }
    }

    // lockdown emergency lights
    this.lockdownT = damp(this.lockdownT, ctx.lockdown ? 1 : 0, 3, dt)
    for (const rl of this.redLights) {
      rl.intensity = this.lockdownT * (1.6 + Math.sin(t * 5.5) * 0.9)
    }

    // lamp state follows light switches
    for (const lamp of this.lampLights) {
      let on = true
      for (const e of this.level.entities) {
        if (e.kind !== 'switch') continue
        const d = Math.hypot(e.tile.x - lamp.tile.x, e.tile.y - lamp.tile.y)
        if (d <= e.radius + 0.5 && !e.on) on = false
      }
      lamp.light.intensity = damp(lamp.light.intensity, on ? lamp.base : 0, 6, dt)
    }
  }

  private setSprite(rig: GuardRig, glyph: string | null, t: number, scale: number): void {
    if (!glyph) {
      rig.sprite.visible = false
      return
    }
    const mat = rig.spriteMats[glyph]
    if (mat && rig.sprite.material !== mat) rig.sprite.material = mat
    rig.sprite.visible = true
    rig.sprite.scale.setScalar(scale * (1 + Math.sin(t * 7) * 0.08))
  }

  /** rewrite baked floor/ceiling vertex colors from Level.light (switch events) */
  updateLightmap(): void {
    if (!this.floorColorAttr) return
    const fc = this.floorColorAttr.array as Float32Array
    const cc = this.ceilColorAttr ? (this.ceilColorAttr.array as Float32Array) : null
    for (let y = 0; y < this.level.h; y++) {
      for (let x = 0; x < this.level.w; x++) {
        const i = this.level.idx(x, y)
        if (this.level.terrain[i] !== Terrain.Floor) continue
        const light = Math.max(this.level.light[i], 0.05)
        const isOut = !this.level.hasCeiling(x, y)
        const fi = this.floorRanges.get(i)
        if (fi !== undefined) {
          const l = light * 1.25
          for (let v = 0; v < 4; v++) {
            const o = (fi + v) * 3
            fc[o] = (isOut ? 0.72 : 0.95) * l
            fc[o + 1] = (isOut ? 0.78 : 0.96) * l
            fc[o + 2] = (isOut ? 0.9 : 1) * l
          }
        }
        const ci = this.ceilRanges.get(i)
        if (cc && ci !== undefined) {
          const l = light * 0.5
          for (let v = 0; v < 4; v++) {
            const o = (ci + v) * 3
            cc[o] = 0.9 * l
            cc[o + 1] = 0.92 * l
            cc[o + 2] = l
          }
        }
      }
    }
    this.floorColorAttr.needsUpdate = true
    if (cc && this.ceilColorAttr) this.ceilColorAttr.needsUpdate = true
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.disposables = []
    for (const t of Object.values(this.sprites)) t.dispose()
    this.sprites = {}
    this.guardRigs.clear()
    this.doorRigs = []
    this.camRigs = []
    this.propRigs = []
    this.lampLights = []
    this.redLights = []
    this.scene.clear()
  }
}
