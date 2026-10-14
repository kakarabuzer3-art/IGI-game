/**
 * PlayerController — movement, stamina, crouch, noise emission.
 * Pure simulation: reads InputManager + Level, mutates PlayerState,
 * emits footstep/noise events. No rendering knowledge.
 */

import { clamp, damp } from '@/engine/core/math'
import type { Vec2 } from '@/engine/core/types'
import { TILE, type Level } from '@/engine/world/Level'
import type { InputManager } from '@/engine/input/InputManager'

export interface NoiseEvent {
  pos: Vec2 // tile space
  radius: number // world units
  kind: 'step' | 'door' | 'terminal' | 'takedown' | 'switch' | 'alarm'
}

export interface PlayerState {
  pos: Vec2 // tile space (float)
  yaw: number // radians, 0 = +x (east)
  pitch: number // radians
  vel: Vec2
  health: number
  stamina: number
  crouching: boolean
  sprinting: boolean
  moving: boolean
  speed: number // current planar speed (world u/s)
  noiseLevel: number // 0..1 instantaneous
  bobPhase: number
  eyeHeight: number
  equipment: string[]
}

export const PLAYER_RADIUS = 0.18 // tile units (0.36 world)
const EYE_STAND = 1.68
const EYE_CROUCH = 0.95
const WALK_SPEED = 3.4
const SPRINT_SPEED = 5.8
const CROUCH_SPEED = 1.7
const ACCEL = 26
const FRICTION = 14
const STAMINA_DRAIN = 24
const STAMINA_REGEN = 16
const STAMINA_MIN_SPRINT = 8

export function createPlayer(spawnTile: Vec2): PlayerState {
  return {
    pos: { x: spawnTile.x + 0.5, y: spawnTile.y + 0.5 },
    yaw: -Math.PI / 2,
    pitch: 0,
    vel: { x: 0, y: 0 },
    health: 100,
    stamina: 100,
    crouching: false,
    sprinting: false,
    moving: false,
    speed: 0,
    noiseLevel: 0,
    bobPhase: 0,
    eyeHeight: EYE_STAND,
    equipment: [],
  }
}

export interface PlayerFrameResult {
  noises: NoiseEvent[]
  footsteps: number // count of footstep events this frame (audio)
}

const result: PlayerFrameResult = { noises: [], footsteps: 0 }
let strideAccum = 0
let staminaDelay = 0
let crouchToggle = false

export function resetPlayerSystems(): void {
  strideAccum = 0
  staminaDelay = 0
  crouchToggle = false
}

export function updatePlayer(
  p: PlayerState,
  input: InputManager,
  level: Level,
  dt: number,
  reducedMotion: boolean,
): PlayerFrameResult {
  result.noises.length = 0
  result.footsteps = 0

  // crouch: hold Ctrl OR toggle C
  if (input.crouchTogglePressed()) crouchToggle = !crouchToggle
  p.crouching = crouchToggle || input.crouchHeld()

  const axis = input.moveAxis()
  const wantsMove = Math.hypot(axis.x, axis.y) > 0.05

  // sprint: held + moving forward-ish + stamina + not crouching
  const canSprint =
    input.sprintHeld() && !p.crouching && p.stamina > STAMINA_MIN_SPRINT && axis.y > 0.3
  p.sprinting = canSprint && wantsMove

  if (p.sprinting) {
    p.stamina = clamp(p.stamina - STAMINA_DRAIN * dt, 0, 100)
    staminaDelay = 0.8
  } else {
    staminaDelay = Math.max(0, staminaDelay - dt)
    if (staminaDelay === 0) p.stamina = clamp(p.stamina + STAMINA_REGEN * dt, 0, 100)
  }

  const maxSpeed = p.crouching ? CROUCH_SPEED : p.sprinting ? SPRINT_SPEED : WALK_SPEED

  // desired velocity in tile space, rotated by yaw (yaw 0 = +x east)
  const cos = Math.cos(p.yaw)
  const sin = Math.sin(p.yaw)
  // forward = (cos, sin); right = (-sin, cos)  [grid y grows "south"]
  const wishX = cos * axis.y - sin * axis.x
  const wishY = sin * axis.y + cos * axis.x
  const wishLen = Math.hypot(wishX, wishY)

  if (wantsMove && wishLen > 0) {
    p.vel.x += (wishX / wishLen) * maxSpeed * ACCEL * dt * 0.5
    p.vel.y += (wishY / wishLen) * maxSpeed * ACCEL * dt * 0.5
  }
  // friction
  const fr = Math.exp(-FRICTION * dt)
  p.vel.x *= fr
  p.vel.y *= fr
  // clamp to max speed
  const sp = Math.hypot(p.vel.x, p.vel.y)
  if (sp > maxSpeed) {
    p.vel.x = (p.vel.x / sp) * maxSpeed
    p.vel.y = (p.vel.y / sp) * maxSpeed
  }
  p.speed = Math.hypot(p.vel.x, p.vel.y)
  p.moving = p.speed > 0.25

  // collision: axis-separated circle vs solid tiles (vel world u/s → tile units)
  moveAxis(p, (p.vel.x * dt) / TILE, 0, level)
  moveAxis(p, 0, (p.vel.y * dt) / TILE, level)

  // noise + footsteps
  p.noiseLevel = p.crouching ? 0.12 : p.sprinting ? 1 : p.moving ? 0.45 : 0
  if (p.moving) {
    const stride = p.crouching ? 1.5 : p.sprinting ? 1.5 : 1.1 // world units per step
    strideAccum += p.speed * dt
    if (strideAccum >= stride) {
      strideAccum = 0
      result.footsteps = 1
      const radius = p.crouching ? 3 : p.sprinting ? 13 : 7
      result.noises.push({ pos: { x: p.pos.x, y: p.pos.y }, radius, kind: 'step' })
    }
  } else {
    strideAccum = 0
  }

  // head bob phase (render uses; disabled visually under reduced motion)
  p.bobPhase += p.speed * dt * (p.sprinting ? 1.35 : 1) * 2.2
  if (!reducedMotion) void p.bobPhase

  // eye height spring
  p.eyeHeight = damp(p.eyeHeight, p.crouching ? EYE_CROUCH : EYE_STAND, 10, dt)

  // health clamp
  p.health = clamp(p.health, 0, 100)
  return result
}

/** vel is world-units/s; positions are tile units → divide by TILE via caller scale. */
function moveAxis(p: PlayerState, dxTiles: number, dyTiles: number, level: Level): void {
  const r = PLAYER_RADIUS
  if (dxTiles !== 0) {
    const nx = p.pos.x + dxTiles
    if (!circleHitsSolid(level, nx, p.pos.y, r)) p.pos.x = nx
    else p.vel.x = 0
  }
  if (dyTiles !== 0) {
    const ny = p.pos.y + dyTiles
    if (!circleHitsSolid(level, p.pos.x, ny, r)) p.pos.y = ny
    else p.vel.y = 0
  }
}

export function circleHitsSolid(level: Level, x: number, y: number, r: number): boolean {
  const x0 = Math.floor(x - r)
  const x1 = Math.floor(x + r)
  const y0 = Math.floor(y - r)
  const y1 = Math.floor(y + r)
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (level.isSolidAt(tx + 0.5, ty + 0.5)) {
        // refined: closest point of tile to circle center
        const cx = clamp(x, tx, tx + 1)
        const cy = clamp(y, ty, ty + 1)
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r) return true
      }
    }
  }
  return false
}

/** apply damage (guard attack, etc.) */
export function damagePlayer(p: PlayerState, amount: number): void {
  p.health = clamp(p.health - amount, 0, 100)
}
