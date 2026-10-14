/** Small math helpers shared across engine systems. Allocation-free by design. */

import type { Vec2 } from './types'

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const clamp01 = (v: number): number => clamp(v, 0, 1)

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(dist2(ax, ay, bx, by))

export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y)

/** Shortest signed difference between two angles (radians), result in [-PI, PI]. */
export const angleDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

/** Deterministic seeded RNG (mulberry32) so levels/procedural textures are stable. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y })

export const tileDist = (a: Vec2, b: Vec2): number => dist(a.x, a.y, b.x, b.y)

export const formatTime = (s: number): string => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}
