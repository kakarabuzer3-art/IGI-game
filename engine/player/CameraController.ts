/**
 * CameraController — first-person Three.js camera driven by PlayerState.
 * Yaw/pitch look, sprint FOV, crouch eye height, head bob (reduced-motion aware).
 * Rendering-side only: reads simulation state, never mutates gameplay.
 */

import * as THREE from 'three'
import { clamp, damp } from '@/engine/core/math'
import { TILE } from '@/engine/world/Level'
import type { PlayerState } from '@/engine/player/PlayerController'
import type { GameSettings } from '@/engine/core/types'

const BASE_FOV = 72
const SPRINT_FOV = 79
const PITCH_LIMIT = 1.35

/** tile-space yaw → three.js Y-rotation (three looks down -Z) */
export const yawToThree = (yaw: number): number => -yaw - Math.PI / 2

export class CameraController {
  readonly camera: THREE.PerspectiveCamera
  private fovCurrent = BASE_FOV
  private shake = 0

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 90)
    this.camera.rotation.order = 'YXZ'
  }

  setAspect(a: number): void {
    this.camera.aspect = a
    this.camera.updateProjectionMatrix()
  }

  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, 0.35)
  }

  look(p: PlayerState, dx: number, dy: number, settings: GameSettings): void {
    const sens = 0.0022 * settings.sensitivity
    p.yaw += dx * sens
    p.pitch = clamp(p.pitch - dy * sens * (settings.invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT)
    if (p.yaw > Math.PI) p.yaw -= Math.PI * 2
    if (p.yaw < -Math.PI) p.yaw += Math.PI * 2
  }

  update(p: PlayerState, dt: number, settings: GameSettings): void {
    const reduced = settings.reducedMotion

    // position + bob
    let bobY = 0
    let bobX = 0
    if (!reduced && p.moving) {
      const amp = p.crouching ? 0.018 : p.sprinting ? 0.06 : 0.035
      bobY = Math.sin(p.bobPhase * 2) * amp
      bobX = Math.cos(p.bobPhase) * amp * 0.5
    }

    this.shake = Math.max(0, this.shake - dt * 0.9)
    const shakeX = reduced ? 0 : (Math.random() - 0.5) * this.shake * 0.12
    const shakeY = reduced ? 0 : (Math.random() - 0.5) * this.shake * 0.12

    this.camera.position.set(
      p.pos.x * TILE + bobX,
      p.eyeHeight + bobY + shakeY,
      p.pos.y * TILE,
    )
    this.camera.rotation.set(p.pitch + shakeX * 0.4, yawToThree(p.yaw), reduced ? 0 : bobX * 0.06, 'YXZ')

    // sprint FOV
    const targetFov = p.sprinting && !reduced ? SPRINT_FOV : BASE_FOV
    this.fovCurrent = damp(this.fovCurrent, targetFov, reduced ? 4 : 7, dt)
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.05) {
      this.camera.fov = this.fovCurrent
      this.camera.updateProjectionMatrix()
    }
  }
}
