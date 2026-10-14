/**
 * A* pathfinding on the tile grid (8-directional, no corner cutting).
 * Recomputed only on destination change — never per frame.
 * Grid sizes are small (<= ~60x40) so a simple sorted-open-set is sufficient
 * and keeps this dependency-free and easy to audit.
 */

import type { Level } from './Level'
import type { Vec2 } from '@/engine/core/types'

interface Node {
  i: number
  g: number
  f: number
  parent: Node | null
}

const SQ2 = Math.SQRT2

export function findPath(
  level: Level,
  start: Vec2,
  goal: Vec2,
  maxNodes = 2500,
): Vec2[] | null {
  const sx = Math.floor(start.x)
  const sy = Math.floor(start.y)
  const gx = Math.floor(goal.x)
  const gy = Math.floor(goal.y)
  if (!level.inBounds(sx, sy) || !level.inBounds(gx, gy)) return null
  if (!level.isWalkableTileIgnoreDoors(gx, gy)) return null

  const w = level.w
  const startI = sy * w + sx
  const goalI = gy * w + gx
  if (startI === goalI) return [{ x: gx + 0.5, y: gy + 0.5 }]

  const gScore = new Float32Array(w * level.h).fill(Infinity)
  const closed = new Uint8Array(w * level.h)
  const open: Node[] = []

  const h = (i: number) => {
    const x = i % w
    const y = (i / w) | 0
    const dx = Math.abs(x - gx)
    const dy = Math.abs(y - gy)
    return (dx + dy) + (SQ2 - 2) * Math.min(dx, dy)
  }

  const startNode: Node = { i: startI, g: 0, f: h(startI), parent: null }
  gScore[startI] = 0
  open.push(startNode)

  let expanded = 0
  while (open.length && expanded < maxNodes) {
    // pop lowest f
    let best = 0
    for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k
    const cur = open.splice(best, 1)[0]
    if (closed[cur.i]) continue
    closed[cur.i] = 1
    expanded++
    if (cur.i === goalI) return reconstruct(cur, w)

    const cx = cur.i % w
    const cy = (cur.i / w) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = cx + dx
        const ny = cy + dy
        if (!level.inBounds(nx, ny)) continue
        const ni = ny * w + nx
        if (closed[ni]) continue
        if (!level.isWalkableTileIgnoreDoors(nx, ny)) continue
        // no corner cutting
        if (dx !== 0 && dy !== 0) {
          if (
            !level.isWalkableTileIgnoreDoors(cx + dx, cy) ||
            !level.isWalkableTileIgnoreDoors(cx, cy + dy)
          )
            continue
        }
        const step = dx !== 0 && dy !== 0 ? SQ2 : 1
        const g = cur.g + step
        if (g < gScore[ni]) {
          gScore[ni] = g
          open.push({ i: ni, g, f: g + h(ni), parent: cur })
        }
      }
    }
  }
  return null
}

function reconstruct(end: Node, w: number): Vec2[] {
  const out: Vec2[] = []
  let n: Node | null = end
  while (n) {
    out.push({ x: (n.i % w) + 0.5, y: ((n.i / w) | 0) + 0.5 })
    n = n.parent
  }
  out.reverse()
  return out
}
