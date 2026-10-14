/**
 * InteractionManager — center-of-view candidate selection, prompts,
 * hold-to-progress actions and their world consequences.
 *
 * Flow: Player → proximity/angle selection → prompt → action →
 *       GameState update → world response (events on the bus).
 */

import { angleDiff } from '@/engine/core/math'
import type { EventBus } from '@/engine/core/EventBus'
import type { Vec2 } from '@/engine/core/types'
import { TILE, type Level, type ParsedEntity } from '@/engine/world/Level'
import { hasLos } from '@/engine/world/LOS'
import type { PlayerState } from '@/engine/player/PlayerController'
import type { Guard, EnemyManager } from '@/engine/ai/Guard'
import type { StealthSystem } from '@/engine/stealth/StealthSystem'

export interface InteractTarget {
  kind:
    | 'door' | 'terminal' | 'pickup' | 'switch' | 'extract' | 'elevator' | 'takedown'
  ent?: ParsedEntity
  guard?: Guard
  label: string
  hold: number
  blocked?: boolean // visible but not usable (locked without key)
}

export interface InteractionDeps {
  level: Level
  bus: EventBus
  player: PlayerState
  stealth: StealthSystem
  enemies: EnemyManager
  extractionArmed: () => boolean
}

const REACH_TILES = 1.35

export class InteractionManager {
  target: InteractTarget | null = null
  holdT = 0
  private holding = false
  private lastPromptKey = ''

  constructor(private deps: InteractionDeps) {}

  reset(): void {
    this.target = null
    this.holdT = 0
    this.holding = false
    this.lastPromptKey = ''
    this.deps.bus.emit('interaction:prompt', null)
  }

  update(): void {
    const { level, player } = this.deps
    const fwdX = Math.cos(player.yaw)
    const fwdY = Math.sin(player.yaw)

    let best: InteractTarget | null = null
    let bestScore = Infinity

    // entities
    for (const ent of level.entities) {
      if (ent.taken) continue
      if (ent.kind === 'body') continue
      const dx = ent.tile.x + 0.5 - player.pos.x
      const dy = ent.tile.y + 0.5 - player.pos.y
      const d = Math.hypot(dx, dy)
      if (d > REACH_TILES) continue
      // facing check (relaxed when very close)
      if (d > 0.6) {
        const ang = Math.atan2(dy, dx)
        if (Math.abs(angleDiff(ang, player.yaw)) > 1.1) continue
        if (d > 1.0 && !hasLos(level, player.pos.x, player.pos.y, ent.tile.x + 0.5, ent.tile.y + 0.5, 4))
          continue
      }
      const t = this.classify(ent, d)
      if (!t) continue
      const score = d + (t.blocked ? 0.3 : 0)
      if (score < bestScore) {
        bestScore = score
        best = t
      }
    }
    void fwdX
    void fwdY

    // takedown candidate (prioritized when valid — it is the urgent action)
    const td = this.takedownCandidate()

    this.target = td ?? best

    // prompt (only emit on change)
    const key = td
      ? 'td'
      : best
        ? `${best.ent?.id ?? best.kind}:${best.blocked ? 'b' : ''}:${best.label}`
        : ''
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key
      this.holdT = 0
      this.deps.bus.emit(
        'interaction:prompt',
        this.target ? { label: this.target.label, kind: this.target.kind } : null,
      )
    }
    if (!this.target) this.holdT = 0
  }

  private classify(ent: ParsedEntity, d: number): InteractTarget | null {
    void d
    const p = this.deps.player
    switch (ent.kind) {
      case 'door':
      case 'lockeddoor': {
        if (ent.locked) {
          const hasKey = p.equipment.includes('keycard')
          return {
            kind: 'door', ent, hold: 0,
            blocked: !hasKey,
            label: hasKey ? 'UNLOCK WITH KEYCARD' : ent.label,
          }
        }
        return { kind: 'door', ent, hold: 0, label: ent.open ? 'CLOSE DOOR' : 'OPEN DOOR' }
      }
      case 'terminal':
        return { kind: 'terminal', ent, hold: ent.hold, label: ent.label }
      case 'keycard':
      case 'intel':
      case 'jammer':
        return { kind: 'pickup', ent, hold: 0, label: ent.label }
      case 'switch':
        return { kind: 'switch', ent, hold: 0, label: ent.label }
      case 'extract':
        return {
          kind: 'extract', ent, hold: ent.hold,
          blocked: !this.deps.extractionArmed(),
          label: this.deps.extractionArmed() ? ent.label : 'EXTRACTION — OBJECTIVES REMAIN',
        }
      case 'elevator':
        return { kind: 'elevator', ent, hold: ent.hold, label: ent.label }
      case 'camera':
        return null // observed, not touched
      default:
        return null
    }
  }

  private takedownCandidate(): InteractTarget | null {
    const { player, level } = this.deps
    for (const g of this.deps.enemies.guards) {
      if (g.downed) continue
      if (g.mode === 'combat') continue
      const dx = player.pos.x - g.pos.x
      const dy = player.pos.y - g.pos.y
      const d = Math.hypot(dx, dy) * TILE
      if (d > 1.55) continue
      // must approach from behind
      const toPlayer = Math.atan2(dy, dx)
      if (Math.abs(angleDiff(toPlayer, g.facing)) < 1.9) continue
      if (!hasLos(level, g.pos.x, g.pos.y, player.pos.x, player.pos.y, 3)) continue
      return {
        kind: 'takedown', guard: g, hold: 0,
        label: `NEUTRALIZE ${g.params.label}`,
      }
    }
    return null
  }

  /** advance hold progress; returns true when a hold completes */
  tickHold(dt: number, heldDown: boolean): void {
    const t = this.target
    if (!t || t.blocked) {
      this.holdT = 0
      this.holding = false
      return
    }
    if (t.hold <= 0) return
    if (!heldDown) {
      if (this.holding) this.deps.bus.emit('sfx', { name: 'uiClick', gain: 0.2 })
      this.holdT = 0
      this.holding = false
      return
    }
    if (!this.holding) {
      this.holding = true
      if (t.kind === 'terminal') this.deps.bus.emit('sfx', { name: 'terminalStart' })
    }
    this.holdT += dt
    // working on a terminal makes soft noise (tension tradeoff)
    if (t.kind === 'terminal' && Math.random() < dt * 2) {
      this.emitNoise(t.ent!.tile, 5, 'terminal')
    }
    if (this.holdT >= t.hold) {
      this.holdT = 0
      this.holding = false
      this.execute(t)
    }
  }

  /** press-triggered (zero hold) actions */
  press(): void {
    const t = this.target
    if (!t) return
    if (t.blocked) {
      this.deps.bus.emit('sfx', { name: 'doorLocked' })
      if (t.kind === 'door' && t.ent?.locked) {
        this.deps.stealth.pushRadio('EQUIPMENT', 'Maglock engaged. You need a keycard.')
      }
      return
    }
    if (t.hold <= 0) this.execute(t)
  }

  takedownPress(): void {
    const t = this.target
    if (!t || t.kind !== 'takedown' || !t.guard) return
    const g = t.guard
    g.takedown()
    this.deps.bus.emit('sfx', { name: 'takedown' })
    this.deps.bus.emit('world:event', 'takedown')
    this.emitNoise(g.pos, 3.5, 'takedown')
    this.deps.stealth.pushRadio('HANDLER', 'Clean. Hide the body if you can — patrols talk.')
    this.target = null
    this.lastPromptKey = ''
    this.deps.bus.emit('interaction:prompt', null)
  }

  private execute(t: InteractTarget): void {
    const { level, bus, player, stealth } = this.deps
    const ent = t.ent
    switch (t.kind) {
      case 'door': {
        if (!ent) return
        if (ent.locked) {
          ent.locked = false
          ent.label = 'OPEN DOOR'
          bus.emit('sfx', { name: 'doorLocked' })
          stealth.pushRadio('EQUIPMENT', 'Keycard accepted.')
          return
        }
        ent.open = !ent.open
        bus.emit('sfx', { name: 'doorOpen', x: ent.tile.x * TILE, y: ent.tile.y * TILE })
        if (ent.open) this.emitNoise(ent.tile, 5, 'door')
        break
      }
      case 'terminal': {
        if (!ent) return
        bus.emit('sfx', { name: 'terminalDone' })
        const eff = ent.effect
        if (eff?.disableCameras) {
          level.disableAllCameras()
          bus.emit('sfx', { name: 'cameraDown' })
          bus.emit('world:event', 'cameras-offline')
        }
        for (const id of eff?.unlockDoors ?? []) level.unlockDoor(id)
        for (const id of eff?.closeDoors ?? []) level.closeDoors([id])
        for (const line of eff?.radio ?? []) stealth.pushRadio('CONTROL', line)
        if (eff?.completeObjective) bus.emit('world:event', `complete:${eff.completeObjective}`)
        if (eff?.revealObjective) bus.emit('world:event', `reveal:${eff.revealObjective}`)
        if (eff?.decoyPos) {
          for (const g of this.deps.enemies.guards) g.receiveDecoy(eff.decoyPos)
          bus.emit('world:event', 'decoy')
        }
        bus.emit('interaction:done', { entityId: ent.id, kind: 'terminal' })
        break
      }
      case 'pickup': {
        if (!ent) return
        ent.taken = true
        bus.emit('sfx', { name: 'pickup' })
        if (ent.kind === 'keycard') {
          if (!player.equipment.includes('keycard')) player.equipment.push('keycard')
          stealth.pushRadio('EQUIPMENT', 'Keycard acquired. Locked doors will open now.')
        } else if (ent.kind === 'jammer') {
          stealth.jammerCharges += Math.max(1, ent.charges)
          if (!player.equipment.includes('jammer')) player.equipment.push('jammer')
          stealth.pushRadio('EQUIPMENT', `Signal jammer acquired (${Math.max(1, ent.charges)} charges). Press G to jam their net.`)
        } else {
          player.equipment.push('intel')
          if (ent.intelText) stealth.pushRadio('INTEL', ent.intelText)
        }
        bus.emit('interaction:done', { entityId: ent.id, kind: ent.kind })
        break
      }
      case 'switch': {
        if (!ent) return
        level.toggleSwitch(ent)
        bus.emit('sfx', { name: 'switch' })
        bus.emit('world:event', `light:${ent.id}`)
        this.emitNoise(ent.tile, 4, 'switch')
        break
      }
      case 'elevator': {
        if (!ent || !ent.link) return
        const pair = level.entities.find(
          (e) => e.kind === 'elevator' && e.link === ent.link && e !== ent,
        )
        if (!pair) return
        bus.emit('sfx', { name: 'elevator' })
        bus.emit('world:teleport', { x: pair.tile.x + 0.5, y: pair.tile.y + 0.5 })
        bus.emit('interaction:done', { entityId: ent.id, kind: 'elevator' })
        break
      }
      case 'extract': {
        if (!ent) return
        bus.emit('sfx', { name: 'extract' })
        bus.emit('interaction:done', { entityId: ent.id, kind: 'extract' })
        break
      }
    }
  }

  private emitNoise(tile: Vec2, radius: number, kind: 'door' | 'terminal' | 'takedown' | 'switch'): void {
    this.deps.bus.emit('world:noise', { pos: { x: tile.x + 0.5, y: tile.y + 0.5 }, radius, kind })
  }
}
