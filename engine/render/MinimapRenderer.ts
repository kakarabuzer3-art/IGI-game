/**
 * MinimapRenderer — 2D canvas tactical map with fog-of-war.
 * Shows only what the player has physically seen (visited tiles); guards
 * appear only when in the player's line of sight or very close (audio contact).
 * Updated at ~12 Hz — never per frame.
 */

import { TILE, Terrain, type Level } from '@/engine/world/Level'
import { hasLos } from '@/engine/world/LOS'
import type { Guard } from '@/engine/ai/Guard'
import type { ParsedEntity } from '@/engine/world/Level'

export interface MinimapMarker {
  x: number // tile space
  y: number
  kind: 'objective' | 'optional' | 'extract'
}

export interface MinimapContext {
  level: Level
  visited: Uint8Array
  playerPos: { x: number; y: number }
  playerYaw: number
  guards: Guard[]
  markers: MinimapMarker[]
  extractionArmed: boolean
  reducedMotion: boolean
}

const WINDOW = 26 // tiles across
const PX = 7 // pixels per tile

export class MinimapRenderer {
  private ctx: CanvasRenderingContext2D
  size = WINDOW * PX

  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = this.size
    canvas.height = this.size
    this.ctx = canvas.getContext('2d')!
  }

  draw(c: MinimapContext, t: number): void {
    const ctx = this.ctx
    const s = this.size
    ctx.clearRect(0, 0, s, s)
    ctx.fillStyle = 'rgba(4,7,10,0.82)'
    ctx.fillRect(0, 0, s, s)

    const { level, visited, playerPos } = c
    const cx = playerPos.x
    const cy = playerPos.y
    const half = WINDOW / 2
    const ox = cx - half
    const oy = cy - half

    const toX = (tx: number) => (tx - ox) * PX
    const toY = (ty: number) => (ty - oy) * PX

    for (let ty = Math.floor(oy); ty <= Math.ceil(oy + WINDOW); ty++) {
      for (let tx = Math.floor(ox); tx <= Math.ceil(ox + WINDOW); tx++) {
        if (!level.inBounds(tx, ty)) continue
        const i = level.idx(tx, ty)
        if (!visited[i]) continue
        const term = level.terrain[i]
        const px = toX(tx)
        const py = toY(ty)
        if (term === Terrain.WallConcrete || term === Terrain.WallPanel) {
          ctx.fillStyle = '#2c3440'
          ctx.fillRect(px, py, PX, PX)
        } else if (term === Terrain.Crate) {
          ctx.fillStyle = '#3d3a2c'
          ctx.fillRect(px + 1, py + 1, PX - 2, PX - 2)
        } else if (term === Terrain.Fence) {
          ctx.fillStyle = 'rgba(120,130,140,0.35)'
          ctx.fillRect(px, py + PX / 2 - 1, PX, 2)
        } else {
          const light = level.light[i]
          const v = Math.floor(14 + light * 26)
          ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`
          ctx.fillRect(px, py, PX, PX)
        }
      }
    }

    // entities on visited tiles
    for (const ent of level.entities) {
      if (ent.taken) continue
      if (!visited[level.idx(ent.tile.x, ent.tile.y)]) continue
      this.drawEntity(ctx, ent, toX(ent.tile.x) + PX / 2, toY(ent.tile.y) + PX / 2, t, c.extractionArmed)
    }

    // objective markers (pulse unless reduced motion)
    const pulse = c.reducedMotion ? 1 : 0.75 + Math.sin(t * 3.4) * 0.25
    for (const m of c.markers) {
      const mx = toX(m.x + 0.5)
      const my = toY(m.y + 0.5)
      if (mx < -10 || mx > s + 10 || my < -10 || my > s + 10) continue
      ctx.strokeStyle = m.kind === 'extract' ? `rgba(80,230,140,${pulse})` : m.kind === 'optional' ? `rgba(150,170,220,${pulse})` : `rgba(255,196,84,${pulse})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(mx, my - 5)
      ctx.lineTo(mx + 5, my)
      ctx.lineTo(mx, my + 5)
      ctx.lineTo(mx - 5, my)
      ctx.closePath()
      ctx.stroke()
    }

    // guards — only with player LOS or very close (hearing distance)
    for (const g of c.guards) {
      const dx = (g.pos.x - cx) * TILE
      const dy = (g.pos.y - cy) * TILE
      const d = Math.hypot(dx, dy)
      const los = hasLos(level, cx, cy, g.pos.x, g.pos.y)
      const known = (los && d < 26) || d < 5
      if (!known) continue
      if (!visited[level.idx(Math.floor(g.pos.x), Math.floor(g.pos.y))]) continue
      const gx = toX(g.pos.x)
      const gy = toY(g.pos.y)
      ctx.save()
      ctx.translate(gx, gy)
      ctx.rotate(g.facing + Math.PI / 2)
      ctx.fillStyle = g.downed
        ? '#7c8593'
        : g.mode === 'combat'
          ? '#ff4433'
          : g.mode === 'investigate' || g.mode === 'search'
            ? '#ff9a3d'
            : g.mode === 'suspicious'
              ? '#ffc247'
              : '#c25353'
      ctx.beginPath()
      ctx.moveTo(0, -5)
      ctx.lineTo(4, 4)
      ctx.lineTo(-4, 4)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // player arrow + FOV wedge
    const pxc = toX(cx)
    const pyc = toY(cy)
    ctx.save()
    ctx.translate(pxc, pyc)
    // FOV wedge (visual only)
    ctx.rotate(c.playerYaw + Math.PI / 2)
    ctx.fillStyle = 'rgba(140,200,255,0.14)'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 26, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#dfe8f2'
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4.5, 5)
    ctx.lineTo(-4.5, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // frame + north tick
    ctx.strokeStyle = 'rgba(120,140,160,0.35)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1)
    ctx.fillStyle = 'rgba(160,180,200,0.8)'
    ctx.font = '9px monospace'
    ctx.fillText('N', s / 2 - 3, 10)
  }

  private drawEntity(
    ctx: CanvasRenderingContext2D,
    ent: ParsedEntity,
    x: number,
    y: number,
    t: number,
    extractionArmed: boolean,
  ): void {
    switch (ent.kind) {
      case 'door':
      case 'lockeddoor':
        ctx.fillStyle = ent.locked ? '#b3453c' : ent.open ? '#3f7a58' : '#59708a'
        ctx.fillRect(x - 3, y - 1, 6, 2)
        break
      case 'terminal':
        ctx.fillStyle = ent.disabled ? '#3c4a44' : '#43d67f'
        ctx.fillRect(x - 2, y - 2, 4, 4)
        break
      case 'camera': {
        const on = Math.sin(t * 4) > 0
        ctx.fillStyle = ent.disabled ? '#444c55' : on ? '#ff5544' : '#8a3730'
        ctx.beginPath()
        ctx.arc(x, y, 2.4, 0, 7)
        ctx.fill()
        break
      }
      case 'keycard':
        ctx.fillStyle = '#ffb43d'
        ctx.fillRect(x - 3, y - 2, 6, 4)
        break
      case 'intel':
        ctx.fillStyle = '#7dffc4'
        ctx.fillRect(x - 2, y - 3, 4, 6)
        break
      case 'jammer':
        ctx.fillStyle = '#53c8ff'
        ctx.fillRect(x - 2, y - 2, 4, 4)
        break
      case 'switch':
        ctx.fillStyle = ent.on ? '#c8d24a' : '#5a5f3a'
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3)
        break
      case 'elevator':
        ctx.strokeStyle = '#53c8ff'
        ctx.strokeRect(x - 3, y - 3, 6, 6)
        break
      case 'extract':
        ctx.strokeStyle = extractionArmed ? '#50e68c' : '#2c6e49'
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, 7)
        ctx.stroke()
        break
    }
  }
}
