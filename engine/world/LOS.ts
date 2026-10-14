/**
 * Grid DDA line-of-sight. The same traversal primitive is used by:
 *  - guard/camera vision
 *  - audio occlusion (no LOS → muffled/attenuated)
 *  - interaction validation
 * Operates in tile space against Level.blocksSightTile. Allocation-free.
 */

import type { Level } from './Level'

export interface LosResult {
  clear: boolean
  /** distance in tile units to blocker (or to target) */
  dist: number
}

const _result: LosResult = { clear: true, dist: 0 }

/**
 * DDA ray march from (x0,y0) to (x1,y1) in TILE space (floats).
 * Returns a reused object — read immediately, do not store.
 */
export function losBetween(
  level: Level,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  maxDist = 64,
): LosResult {
  const dx = x1 - x0
  const dy = y1 - y0
  const total = Math.sqrt(dx * dx + dy * dy)
  const limit = Math.min(total, maxDist)
  if (total < 1e-6) {
    _result.clear = true
    _result.dist = 0
    return _result
  }
  const stepX = dx / total
  const stepY = dy / total

  let gx = Math.floor(x0)
  let gy = Math.floor(y0)

  const deltaDistX = stepX === 0 ? Infinity : Math.abs(1 / stepX)
  const deltaDistY = stepY === 0 ? Infinity : Math.abs(1 / stepY)

  let sideDistX =
    stepX > 0 ? (gx + 1 - x0) * deltaDistX : (x0 - gx) * deltaDistX
  let sideDistY =
    stepY > 0 ? (gy + 1 - y0) * deltaDistY : (y0 - gy) * deltaDistY

  let traveled = 0
  let guard = 0
  while (traveled < limit && guard++ < 512) {
    let axis: 0 | 1
    if (sideDistX < sideDistY) {
      traveled = sideDistX
      sideDistX += deltaDistX
      gx += stepX > 0 ? 1 : -1
      axis = 0
    } else {
      traveled = sideDistY
      sideDistY += deltaDistY
      gy += stepY > 0 ? 1 : -1
      axis = 1
    }
    if (traveled > limit) break
    if (level.blocksSightTile(gx, gy)) {
      _result.clear = false
      _result.dist = traveled
      return _result
    }
    void axis
  }
  _result.clear = true
  _result.dist = limit
  return _result
}

export function hasLos(
  level: Level,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  maxDist = 64,
): boolean {
  return losBetween(level, x0, y0, x1, y1, maxDist).clear
}
