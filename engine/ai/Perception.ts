/**
 * Perception — pure detection math shared by guards and cameras.
 * Information-limited by design: sensors only see what geometry and light
 * allow. No omniscience: every input is a measurable world quantity.
 */

import { angleDiff } from '@/engine/core/math'
import { hasLos } from '@/engine/world/LOS'
import { TILE, type Level } from '@/engine/world/Level'
import type { Vec2 } from '@/engine/core/types'

export interface GuardTypeParams {
  viewDist: number // world units
  fov: number // radians, full cone
  alertness: number // multiplier
  speed: number // tiles/s patrol
  runSpeed: number // tiles/s combat
  damage: number // hp/s in melee
  label: string
}

export const GUARD_TYPES: Record<'grunt' | 'officer', GuardTypeParams> = {
  grunt: {
    viewDist: 15, fov: (100 * Math.PI) / 180, alertness: 1,
    speed: 0.85, runSpeed: 1.5, damage: 16, label: 'SENTRY',
  },
  officer: {
    viewDist: 19, fov: (118 * Math.PI) / 180, alertness: 1.3,
    speed: 1.0, runSpeed: 1.65, damage: 22, label: 'OFFICER',
  },
}

export interface VisionSample {
  visible: boolean
  /** 0..1 detection strength this tick */
  score: number
  dist: number // world units
}

const _sample: VisionSample = { visible: false, score: 0, dist: 0 }

/**
 * Visibility of the player from a sensor.
 * @param lightExposure 0..1 lightmap value at the player
 * @param crouching reduces profile
 * @param speed current player speed (world u/s) — movement attracts the eye
 */
export function sampleVision(
  level: Level,
  sensorPos: Vec2, // tile space
  facing: number, // radians, tile-space atan2 convention
  fov: number,
  viewDist: number,
  alertness: number,
  playerPos: Vec2, // tile space
  lightExposure: number,
  crouching: boolean,
  speed: number,
): VisionSample {
  const dx = (playerPos.x - sensorPos.x) * TILE
  const dy = (playerPos.y - sensorPos.y) * TILE
  const dist = Math.hypot(dx, dy)
  _sample.dist = dist
  _sample.visible = false
  _sample.score = 0
  if (dist > viewDist) return _sample

  // FOV check — except almost-touching (<1.2 world units): you feel someone there
  if (dist > 1.2) {
    const ang = Math.atan2(dy, dx)
    if (Math.abs(angleDiff(ang, facing)) > fov / 2) return _sample
  }

  if (!hasLos(level, sensorPos.x, sensorPos.y, playerPos.x, playerPos.y, viewDist / TILE))
    return _sample

  const distFactor = Math.pow(1 - dist / viewDist, 0.65)
  const lightFactor = 0.28 + 0.72 * Math.min(1, lightExposure * 1.15)
  const crouchFactor = crouching ? 0.55 : 1
  const moveFactor = 1 + Math.min(speed, 6) * 0.085
  const closeBonus = dist < 2.2 ? 2.2 : 1

  _sample.visible = true
  _sample.score = Math.min(
    1.6,
    distFactor * lightFactor * crouchFactor * moveFactor * alertness * closeBonus,
  )
  return _sample
}

/** suspicion points per second for a visibility score */
export function suspicionRate(score: number, dist: number): number {
  if (dist < 2.4) return 55 // arm's length: near-instant
  return score * 34
}

export const SUSPICION_DECAY = 7 // per second, no stimulus
export const THRESH_SUSPICIOUS = 25
export const THRESH_INVESTIGATE = 55
export const THRESH_COMBAT = 100

/**
 * Can the sensor hear a noise at pos with given radius?
 * Occluded (no LOS) noises carry at 55% radius. Returns 0..1 strength.
 */
export function hearNoise(
  level: Level,
  sensorPos: Vec2,
  noisePos: Vec2,
  radiusWorld: number,
): number {
  const dx = (noisePos.x - sensorPos.x) * TILE
  const dy = (noisePos.y - sensorPos.y) * TILE
  const dist = Math.hypot(dx, dy)
  const los = hasLos(level, sensorPos.x, sensorPos.y, noisePos.x, noisePos.y, radiusWorld / TILE)
  const effective = los ? radiusWorld : radiusWorld * 0.55
  if (dist > effective) return 0
  return 1 - dist / effective
}

export const DIR_ANGLES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const
