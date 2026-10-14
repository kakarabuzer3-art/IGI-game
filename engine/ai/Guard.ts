/**
 * Guard — modular finite-state-machine agent.
 *
 *   PATROL/IDLE → SUSPICIOUS → INVESTIGATE → SEARCH → COMBAT → RETURNING
 *
 * Information-limited: a guard only ever knows positions it perceived
 * (lastKnown), never the player's true position unless currently visible.
 * Expensive work (LOS rays, A*) runs in think() at ~10 Hz; cheap steering
 * and animation run in move() per frame.
 */

import { angleDiff, clamp, damp } from '@/engine/core/math'
import type { EventBus } from '@/engine/core/EventBus'
import type { GuardDef, GuardMode, Vec2 } from '@/engine/core/types'
import { TILE, type Level } from '@/engine/world/Level'
import { findPath } from '@/engine/world/Pathfinding'
import { hasLos } from '@/engine/world/LOS'
import {
  hearNoise,
  GUARD_TYPES,
  SUSPICION_DECAY,
  THRESH_COMBAT,
  THRESH_INVESTIGATE,
  THRESH_SUSPICIOUS,
  sampleVision,
  suspicionRate,
  type GuardTypeParams,
} from './Perception'
import type { PlayerState } from '@/engine/player/PlayerController'

export interface GuardDeps {
  level: Level
  bus: EventBus
  rng: () => number
  player: PlayerState
  playerLight: () => number
  guards: Guard[]
  broadcast: (from: Guard, kind: 'investigate' | 'combat' | 'body', pos: Vec2) => void
  alertnessBonus: number
}

const THINK_INTERVAL = 0.1

export class Guard {
  readonly def: GuardDef
  readonly params: GuardTypeParams
  pos: Vec2
  facing: number
  mode: GuardMode = 'patrol'
  suspicion = 0
  lastKnown: Vec2 | null = null
  path: Vec2[] | null = null
  pathIdx = 0
  routeIdx = 0
  waitT = 0
  scanT = 0
  scanDir = 1
  sawPlayerT = 99
  searchT = 0
  radioedInvestigate = false
  /** current path targets the player's live position (combat memory window) */
  private pathTargetsPlayer = false
  downed = false
  attackSfxT = 0
  animPhase = 0
  speedCur = 0
  private thinkAcc: number
  private arrivedFlag = false

  constructor(def: GuardDef, private deps: GuardDeps, phaseOffset: number) {
    this.def = def
    this.params = GUARD_TYPES[def.type]
    this.pos = { x: def.tile.x + 0.5, y: def.tile.y + 0.5 }
    this.facing = deps.rng() * Math.PI * 2
    this.thinkAcc = phaseOffset * THINK_INTERVAL
    if (def.route.length === 0) this.mode = 'idle'
  }

  get alertness(): number {
    return this.params.alertness * (1 + this.deps.alertnessBonus)
  }

  /* ---------------- per-frame: cheap steering + animation ---------------- */

  move(dt: number): void {
    if (this.downed) {
      this.speedCur = damp(this.speedCur, 0, 8, dt)
      return
    }
    let target = 0
    switch (this.mode) {
      case 'patrol': target = this.params.speed; break
      case 'idle': target = 0; break
      case 'suspicious': target = 0; break
      case 'investigate': target = this.params.speed * 1.3; break
      case 'search': target = this.params.speed * 0.85; break
      case 'combat': target = this.params.runSpeed; break
      case 'returning': target = this.params.speed * 1.1; break
    }

    // follow path
    if (this.path && this.pathIdx < this.path.length && target > 0) {
      const next = this.path[this.pathIdx]
      const dx = next.x - this.pos.x
      const dy = next.y - this.pos.y
      const d = Math.hypot(dx, dy)
      if (d < 0.09) {
        this.pathIdx++
        this.openDoorAhead()
        if (this.pathIdx >= this.path.length) {
          this.path = null
          this.arrivedFlag = true
        }
      } else {
        const step = Math.min(target * dt, d)
        this.pos.x += (dx / d) * step
        this.pos.y += (dy / d) * step
        this.facing = dampAngle(this.facing, Math.atan2(dy, dx), 8, dt)
        this.speedCur = damp(this.speedCur, target, 8, dt)
      }
    } else {
      this.speedCur = damp(this.speedCur, 0, 8, dt)
      // idle scanning — paused while something is actively drawing suspicion
      const curious = this.suspicion > 8 && this.sawPlayerT < 0.4
      if ((this.mode === 'idle' || this.mode === 'suspicious' || this.mode === 'search') && !curious) {
        this.scanT -= dt
        if (this.scanT <= 0) {
          this.scanDir = this.deps.rng() > 0.5 ? 1 : -1
          this.scanT = 1.2 + this.deps.rng() * 1.6
        }
        this.facing += this.scanDir * dt * 0.45
      } else if (this.mode === 'combat' && this.sawPlayerT < 0.4) {
        const p = this.deps.player.pos
        this.facing = dampAngle(this.facing, Math.atan2(p.y - this.pos.y, p.x - this.pos.x), 10, dt)
      }
    }

    // attention snap: a guard accumulating suspicion turns toward the stimulus.
    // Readable telegraph for the player — you can SEE them notice you.
    if (
      this.suspicion > 5 &&
      this.sawPlayerT < 0.4 &&
      (this.mode === 'idle' || this.mode === 'patrol' || this.mode === 'suspicious')
    ) {
      const p = this.deps.player.pos
      this.facing = dampAngle(this.facing, Math.atan2(p.y - this.pos.y, p.x - this.pos.x), 3.5, dt)
    }

    this.animPhase += this.speedCur * dt * 5.2
  }

  private openDoorAhead(): void {
    const pt = this.path && this.pathIdx < this.path.length ? this.path[this.pathIdx] : null
    const tiles: Vec2[] = pt ? [pt] : []
    tiles.push({ x: Math.floor(this.pos.x) + Math.round(Math.cos(this.facing)), y: Math.floor(this.pos.y) + Math.round(Math.sin(this.facing)) })
    for (const t of tiles) {
      const e = this.deps.level.entityAt(Math.floor(t.x), Math.floor(t.y))
      if (e && (e.kind === 'door' || e.kind === 'lockeddoor') && !e.open && !e.locked) {
        e.open = true
        this.deps.bus.emit('sfx', { name: 'doorOpen', x: this.pos.x * TILE, y: this.pos.y * TILE, gain: 0.8 })
      }
    }
  }

  /* ---------------- 10 Hz: perception + decisions ---------------- */

  update(dt: number): void {
    this.move(dt)
    this.thinkAcc += dt
    if (this.thinkAcc < THINK_INTERVAL) return
    const tdt = this.thinkAcc
    this.thinkAcc = 0
    this.think(tdt)
  }

  private think(dt: number): void {
    if (this.downed) return
    const { level, player } = this.deps
    const light = this.deps.playerLight()

    // --- perception ---
    const v = sampleVision(
      level, this.pos, this.facing, this.params.fov, this.params.viewDist,
      this.alertness, player.pos, light, player.crouching, player.speed,
    )
    if (v.visible && player.health > 0) {
      this.suspicion = Math.min(140, this.suspicion + suspicionRate(v.score, v.dist) * dt)
      this.sawPlayerT = 0
      this.lastKnown = { x: player.pos.x, y: player.pos.y }
    } else {
      this.suspicion = Math.max(0, this.suspicion - SUSPICION_DECAY * dt)
      this.sawPlayerT += dt
    }

    // --- body discovery (non-omniscient: needs LOS + cone) ---
    if (this.mode === 'patrol' || this.mode === 'investigate' || this.mode === 'returning' || this.mode === 'idle') {
      for (const other of this.deps.guards) {
        if (!other.downed || other === this) continue
        const d = Math.hypot(other.pos.x - this.pos.x, other.pos.y - this.pos.y) * TILE
        if (d > 7) continue
        const ang = Math.atan2(other.pos.y - this.pos.y, other.pos.x - this.pos.x)
        if (Math.abs(angleDiff(ang, this.facing)) > this.params.fov * 0.6) continue
        if (!hasLos(level, this.pos.x, this.pos.y, other.pos.x, other.pos.y)) continue
        this.suspicion = THRESH_COMBAT
        this.lastKnown = { x: other.pos.x, y: other.pos.y }
        this.deps.broadcast(this, 'body', this.lastKnown)
        this.enterMode('search')
        this.searchT = 14
        break
      }
    }

    // --- state transitions ---
    if (this.suspicion >= THRESH_COMBAT && this.mode !== 'combat' && this.mode !== 'search') {
      this.enterCombat()
    } else if (
      this.suspicion >= THRESH_INVESTIGATE &&
      (this.mode === 'patrol' || this.mode === 'idle' || this.mode === 'suspicious')
    ) {
      this.enterMode('investigate')
      if (!this.radioedInvestigate) {
        this.radioedInvestigate = true
        this.deps.broadcast(this, 'investigate', this.lastKnown ?? this.pos)
      }
    } else if (
      this.suspicion >= THRESH_SUSPICIOUS &&
      (this.mode === 'patrol' || this.mode === 'idle')
    ) {
      this.enterMode('suspicious')
      this.scanT = 2
    }

    // --- per-mode decisions ---
    switch (this.mode) {
      case 'patrol':
      case 'idle':
        this.patrolLogic()
        break
      case 'suspicious':
        this.scanT -= dt
        if (this.suspicion < THRESH_SUSPICIOUS && this.scanT <= 0) this.enterMode(this.def.route.length ? 'patrol' : 'idle')
        break
      case 'investigate':
        if (!this.path && this.lastKnown) this.setPath(this.lastKnown)
        if (this.arrivedFlag) {
          this.arrivedFlag = false
          this.enterMode('search')
          this.searchT = 7 + this.deps.rng() * 4
        }
        break
      case 'search':
        this.searchT -= dt
        if (!this.path && this.lastKnown && this.deps.rng() < 0.5) {
          const p = this.randomNear(this.lastKnown, 3)
          if (p) this.setPath(p)
        }
        if (this.arrivedFlag) {
          this.arrivedFlag = false
          this.path = null
        }
        if (this.searchT <= 0) {
          this.radioedInvestigate = false
          this.suspicion = Math.min(this.suspicion, THRESH_SUSPICIOUS - 5)
          this.enterMode('returning')
        }
        break
      case 'combat': {
        const p = this.deps.player
        if (this.sawPlayerT < 2 && p.health > 0) {
          // visual memory: pursue the player's live position briefly
          this.pathTargetsPlayer = true
          if (!this.path || this.deps.rng() < 0.6) this.setPath({ x: p.pos.x, y: p.pos.y })
          const d = Math.hypot(p.pos.x - this.pos.x, p.pos.y - this.pos.y) * TILE
          if (d < 1.9 && hasLos(this.deps.level, this.pos.x, this.pos.y, p.pos.x, p.pos.y)) {
            this.deps.bus.emit('player:damage', this.params.damage * dt)
            this.attackSfxT -= dt
            if (this.attackSfxT <= 0) {
              this.attackSfxT = 0.55
              this.deps.bus.emit('sfx', { name: 'damage', gain: 0.5 })
            }
          }
        } else {
          // memory expired — drop stale player-tracking path; only ever go
          // to positions actually perceived (no omniscient tracking)
          if (this.pathTargetsPlayer) {
            this.pathTargetsPlayer = false
            this.path = null
          }
          if (this.sawPlayerT > 8) {
            this.enterMode('search')
            this.searchT = 10
          } else if (!this.path && this.lastKnown) {
            this.setPath(this.lastKnown)
          }
        }
        if (this.arrivedFlag) {
          this.arrivedFlag = false
          this.path = null
        }
        break
      }
      case 'returning':
        if (!this.path) {
          const wp = this.currentWaypoint()
          if (wp) this.setPath(wp)
          else this.enterMode(this.def.route.length ? 'patrol' : 'idle')
        }
        if (this.arrivedFlag) {
          this.arrivedFlag = false
          this.enterMode(this.def.route.length ? 'patrol' : 'idle')
        }
        break
    }

    // path shortcutting: skip waypoints with clear LOS (smooth movement)
    if (this.path && this.pathIdx + 2 < this.path.length) {
      const ahead = this.path[this.pathIdx + 2]
      if (hasLos(this.deps.level, this.pos.x, this.pos.y, ahead.x, ahead.y)) {
        this.pathIdx += 2
      }
    }
  }

  private enterCombat(): void {
    this.enterMode('combat')
    this.sawPlayerT = 0
    if (this.deps.player.health > 0) this.lastKnown = { x: this.deps.player.pos.x, y: this.deps.player.pos.y }
    this.deps.broadcast(this, 'combat', this.lastKnown ?? this.pos)
  }

  enterMode(m: GuardMode): void {
    if (this.mode === m) return
    this.mode = m
    this.path = null
    this.pathIdx = 0
    this.arrivedFlag = false
    this.pathTargetsPlayer = false
    if (m === 'patrol' || m === 'idle') this.lastKnown = null
  }

  /** external nudge (radio propagation, camera dispatch, decoy) */
  receiveIntel(pos: Vec2, strength: number): void {
    if (this.downed) return
    this.suspicion = Math.max(this.suspicion, strength)
    this.lastKnown = { x: pos.x, y: pos.y }
    if (strength >= THRESH_INVESTIGATE && (this.mode === 'patrol' || this.mode === 'idle')) {
      this.enterMode('investigate')
    }
  }

  /** decoy broadcast: everyone chases a ghost position */
  receiveDecoy(pos: Vec2): void {
    if (this.downed || this.mode === 'combat') return
    this.suspicion = Math.max(this.suspicion, THRESH_INVESTIGATE + 10)
    this.lastKnown = { x: pos.x, y: pos.y }
    this.enterMode('investigate')
  }

  private patrolLogic(): void {
    const route = this.def.route
    if (route.length === 0) {
      this.mode = 'idle'
      return
    }
    if (this.waitT > 0) {
      this.waitT -= THINK_INTERVAL
      return
    }
    if (!this.path) {
      const wp = this.currentWaypoint()
      if (wp) this.setPath(wp)
    }
    if (this.arrivedFlag) {
      this.arrivedFlag = false
      if (route.length === 1) {
        this.waitT = 2 + this.deps.rng() * 2
      } else {
        this.routeIdx = (this.routeIdx + 1) % route.length
        this.waitT = route.length <= 2 ? 1.2 + this.deps.rng() * 1.5 : 0
      }
    }
  }

  private currentWaypoint(): Vec2 | null {
    const route = this.def.route
    if (route.length === 0) return null
    const wp = route[clamp(this.routeIdx, 0, route.length - 1)]
    return { x: wp.x + 0.5, y: wp.y + 0.5 }
  }

  private setPath(target: Vec2): void {
    const path = findPath(this.deps.level, this.pos, target)
    if (path && path.length > 1) {
      this.path = path
      this.pathIdx = 1
    } else {
      this.path = null
      this.arrivedFlag = true
    }
    this.arrivedFlag = false
  }

  private randomNear(center: Vec2, r: number): Vec2 | null {
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(center.x + (this.deps.rng() * 2 - 1) * r)
      const y = Math.floor(center.y + (this.deps.rng() * 2 - 1) * r)
      if (this.deps.level.isWalkableTileIgnoreDoors(x, y)) return { x: x + 0.5, y: y + 0.5 }
    }
    return null
  }

  takedown(): void {
    this.downed = true
    this.mode = 'downed'
    this.path = null
  }
}

function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + angleDiff(b, a) * (1 - Math.exp(-lambda * dt))
}

/* ================================================================== */

export class EnemyManager {
  guards: Guard[] = []
  private deps: GuardDeps

  constructor(defs: GuardDef[], deps: Omit<GuardDeps, 'guards'>) {
    // guards array is shared by reference so agents can see each other
    this.deps = { ...deps, guards: this.guards }
    this.spawn(defs)
  }

  spawn(defs: GuardDef[]): void {
    defs.forEach((d, i) => {
      if (this.guards.some((g) => g.def.id === d.id)) return
      this.guards.push(new Guard(d, this.deps, (i % 5) / 5))
    })
  }

  /** spawn reinforcements (lockdown waves) */
  spawnWave(wave: number, allDefs: GuardDef[]): void {
    this.spawn(allDefs.filter((d) => d.wave === wave))
  }

  update(dt: number): void {
    for (const g of this.guards) g.update(dt)
  }

  /** propagate a world noise event to all active guards */
  noiseEvent(pos: Vec2, radiusWorld: number, level: Level): void {
    for (const g of this.guards) {
      if (g.downed) continue
      const strength = hearNoise(level, g.pos, pos, radiusWorld)
      if (strength <= 0) continue
      g.suspicion = Math.max(g.suspicion, 10 + strength * 30)
      g.lastKnown = { x: pos.x, y: pos.y }
      if (
        g.suspicion >= THRESH_INVESTIGATE &&
        (g.mode === 'patrol' || g.mode === 'idle' || g.mode === 'returning')
      ) {
        g.enterMode('investigate')
      } else if (g.suspicion >= THRESH_SUSPICIOUS && g.mode === 'patrol') {
        g.enterMode('suspicious')
        g.scanT = 1.5
      }
    }
  }

  downed(): Guard[] {
    return this.guards.filter((g) => g.downed)
  }

  active(): Guard[] {
    return this.guards.filter((g) => !g.downed)
  }
}
