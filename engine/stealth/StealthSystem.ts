/**
 * StealthSystem — facility-wide awareness model + camera/searchlight sensors.
 *
 *   UNDETECTED → SUSPICIOUS → ALERT → SEARCHING → COMBAT → (LOCKDOWN)
 *
 * The facility state is an aggregate of what its guards and cameras actually
 * perceived — never omniscient. Every escalation records a human-readable
 * reason so the HUD can always tell the player WHY they were detected.
 */

import { clamp } from '@/engine/core/math'
import type { EventBus } from '@/engine/core/EventBus'
import type { AlertLevel, DetectionLevel, RadioLine, Vec2 } from '@/engine/core/types'
import { TILE, type Level, type ParsedEntity } from '@/engine/world/Level'
import { DIR_ANGLES, sampleVision } from '@/engine/ai/Perception'
import type { Guard } from '@/engine/ai/Guard'
import type { PlayerState } from '@/engine/player/PlayerController'

export interface CameraRuntime {
  ent: ParsedEntity
  kind: 'fixed' | 'searchlight'
  baseAngle: number
  angle: number
  t: number
  phase: number
  suspicion: number
  lastScore: number
}

export interface StealthDeps {
  level: Level
  bus: EventBus
  player: PlayerState
  playerLight: () => number
  rng: () => number
  getGuards: () => Guard[]
}

let radioSeq = 0

export class StealthSystem {
  alert: AlertLevel = 'undetected'
  reason: string | null = null
  maxAlert: AlertLevel = 'undetected'
  timesSpotted = 0
  detectedReasons: string[] = []
  lockdown = false
  cameras: CameraRuntime[] = []

  jammerCharges = 0
  jammerActiveT = 0

  private spotEpisode = false

  constructor(private deps: StealthDeps) {
    for (const e of deps.level.entities) {
      if (e.kind !== 'camera') continue
      this.cameras.push({
        ent: e,
        kind: e.variant ?? 'fixed',
        baseAngle: DIR_ANGLES[e.dir],
        angle: DIR_ANGLES[e.dir],
        t: 0,
        phase: deps.rng() * Math.PI * 2,
        suspicion: 0,
        lastScore: 0,
      })
    }
  }

  get jammerActive(): boolean {
    return this.jammerActiveT > 0
  }

  useJammer(): boolean {
    if (this.jammerCharges <= 0 || this.jammerActiveT > 0) return false
    this.jammerCharges--
    this.jammerActiveT = 15
    this.deps.bus.emit('sfx', { name: 'jammer' })
    this.pushRadio('EQUIPMENT', 'Jammer active — their net is deaf for fifteen seconds.')
    return true
  }

  setLockdown(on: boolean): void {
    this.lockdown = on
    if (on) this.bumpAlert('lockdown', 'FACILITY LOCKDOWN — blast doors sealing')
  }

  /* ---------------- per-tick update (called at ~15 Hz by Game) ---------- */

  update(dt: number): void {
    this.jammerActiveT = Math.max(0, this.jammerActiveT - dt)

    // cameras
    for (const cam of this.cameras) {
      if (cam.ent.disabled) {
        cam.lastScore = 0
        continue
      }
      cam.t += dt
      if (cam.kind === 'searchlight') {
        cam.angle = cam.baseAngle + cam.t * 0.42 // slow full rotation
      } else {
        cam.angle = cam.baseAngle + Math.sin(cam.t * 0.55 + cam.phase) * 0.95
      }
      const v = sampleVision(
        this.deps.level,
        cam.ent.tile,
        cam.angle,
        cam.kind === 'searchlight' ? 0.5 : 0.75,
        cam.kind === 'searchlight' ? 17 : 11,
        1.5,
        this.deps.player.pos,
        this.deps.playerLight(),
        this.deps.player.crouching,
        this.deps.player.speed,
      )
      cam.lastScore = v.visible ? v.score : 0
      if (v.visible && this.deps.player.health > 0) {
        cam.suspicion = clamp(cam.suspicion + v.score * 65 * dt, 0, 120)
        if (cam.suspicion >= 100) {
          cam.suspicion = 35
          this.onCameraDetection(cam)
        }
      } else {
        cam.suspicion = Math.max(0, cam.suspicion - 25 * dt)
      }
    }

    this.recomputeAlert(dt)
  }

  private onCameraDetection(cam: CameraRuntime): void {
    const where = cam.kind === 'searchlight' ? 'SWEEP LIGHT' : 'CAMERA'
    this.notifySpotted(`${where} picked you up`)
    this.deps.bus.emit('sfx', { name: 'cameraDown', gain: 0.9 })
    this.pushRadio('CONTROL', 'Motion on the grid — sentry team, investigate.')
    // dispatch two nearest guards to investigate the player's position
    const p = { ...this.deps.player.pos }
    const guards = this.deps
      .getGuards()
      .filter((g) => !g.downed && g.mode !== 'combat')
      .sort((a, b) => dist2t(a.pos, p) - dist2t(b.pos, p))
      .slice(0, 2)
    for (const g of guards) g.receiveIntel(p, 60)
  }

  /** a guard radioed out — propagate unless jammed */
  broadcast(from: Guard, kind: 'investigate' | 'combat' | 'body', pos: Vec2): void {
    if (kind === 'combat') {
      this.notifySpotted(`Spotted by ${from.params.label}`)
    }
    if (this.jammerActive) {
      this.pushRadio('SIGNAL', '(jammed — transmission failed)')
      return
    }
    switch (kind) {
      case 'investigate':
        this.pushRadio(from.params.label, 'Something wrong over here. Checking it out.')
        break
      case 'combat':
        this.pushRadio(from.params.label, 'CONTACT! Intruder on the facility! All units!')
        this.deps.bus.emit('sfx', { name: 'alertSting' })
        break
      case 'body':
        this.pushRadio(from.params.label, 'Man down! They are inside — lock it down!')
        this.deps.bus.emit('sfx', { name: 'alertSting' })
        break
    }
    // share last-known with nearby guards (radio range ~ 26 world units)
    for (const g of this.deps.getGuards()) {
      if (g === from || g.downed) continue
      const d = Math.hypot(g.pos.x - pos.x, g.pos.y - pos.y) * TILE
      if (d < 26) g.receiveIntel(pos, kind === 'combat' ? 100 : kind === 'body' ? 80 : 58)
    }
  }

  notifySpotted(reason: string): void {
    if (!this.detectedReasons.includes(reason)) this.detectedReasons.push(reason)
    if (!this.spotEpisode) {
      this.spotEpisode = true
      this.timesSpotted++
    }
    this.bumpAlert('combat', reason)
  }

  /** called by MissionManager when an alarm/lockdown device fires */
  raiseAlarm(reason: string): void {
    this.notifySpotted(reason)
    for (const g of this.deps.getGuards()) {
      if (!g.downed) g.receiveIntel({ ...this.deps.player.pos }, 70)
    }
  }

  private bumpAlert(level: AlertLevel, reason: string): void {
    this.alert = level
    this.reason = reason
    this.trackMax(level)
    this.deps.bus.emit('alert:change', { level, reason })
  }

  private trackMax(level: AlertLevel): void {
    const order: AlertLevel[] = ['undetected', 'suspicious', 'alert', 'searching', 'combat', 'lockdown']
    if (order.indexOf(level) > order.indexOf(this.maxAlert)) this.maxAlert = level
  }

  private recomputeAlert(dt: number): void {
    void dt
    const guards = this.deps.getGuards()
    let next: AlertLevel = 'undetected'
    let reason: string | null = null

    if (this.lockdown) {
      next = 'lockdown'
      reason = 'FACILITY LOCKDOWN'
    }
    if (!reason) {
      if (guards.some((g) => g.mode === 'combat' && !g.downed)) {
        next = 'combat'
        reason = 'ENGAGED — break line of sight and run'
      } else if (guards.some((g) => g.mode === 'search' && !g.downed)) {
        next = 'searching'
        reason = 'Search teams sweeping last known position'
      } else if (guards.some((g) => g.mode === 'investigate' && !g.downed)) {
        next = 'alert'
        reason = 'Sentries investigating'
      } else if (
        guards.some((g) => g.mode === 'suspicious' && !g.downed) ||
        this.cameras.some((c) => !c.ent.disabled && c.suspicion > 30)
      ) {
        next = 'suspicious'
        reason = 'Something caught their attention'
      }
    }

    if (next === 'undetected') this.spotEpisode = false

    const order: AlertLevel[] = ['undetected', 'suspicious', 'alert', 'searching', 'combat', 'lockdown']
    if (order.indexOf(next) !== order.indexOf(this.alert)) {
      this.alert = next
      this.reason = reason
      this.trackMax(next)
      this.deps.bus.emit('alert:change', { level: next, reason })
    } else if (reason && reason !== this.reason) {
      this.reason = reason
    }
  }

  detectionLevel(): DetectionLevel {
    let maxSusp = 0
    for (const g of this.deps.getGuards()) if (!g.downed) maxSusp = Math.max(maxSusp, g.suspicion)
    for (const c of this.cameras) if (!c.ent.disabled) maxSusp = Math.max(maxSusp, c.suspicion * 0.9)
    if (this.alert === 'combat' || this.alert === 'lockdown') return 'engaged'
    if (maxSusp >= 100) return 'engaged'
    if (maxSusp >= 55) return 'spotted'
    if (maxSusp >= 25) return 'suspect'
    return 'hidden'
  }

  /** normalized 0..1 suspicion for the HUD eye meter */
  suspicion01(): number {
    let s = 0
    for (const g of this.deps.getGuards()) if (!g.downed) s = Math.max(s, g.suspicion)
    for (const c of this.cameras) if (!c.ent.disabled) s = Math.max(s, c.suspicion)
    return clamp(s / 100, 0, 1)
  }

  pushRadio(speaker: string, text: string): void {
    const line: RadioLine = { id: radioSeq++, speaker, text, t: 0 }
    this.deps.bus.emit('radio', line)
    this.deps.bus.emit('sfx', { name: 'radioStatic', gain: 0.5 })
  }

  reset(): void {
    this.alert = 'undetected'
    this.reason = null
    this.maxAlert = 'undetected'
    this.timesSpotted = 0
    this.detectedReasons = []
    this.lockdown = false
    this.spotEpisode = false
    this.jammerActiveT = 0
  }
}

function dist2t(a: Vec2, b: Vec2): number {
  return (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)
}
