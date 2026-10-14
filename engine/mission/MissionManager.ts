/**
 * MissionManager — data-driven mission runtime.
 * Loads a MissionDef against a Level, resolves objectives from world events
 * (triggers, interactions), runs lockdown sequences, grades the operation.
 * No rendering knowledge; all output flows through the EventBus.
 */

import type { EventBus } from '@/engine/core/EventBus'
import type {
  AlertLevel,
  MissionDef,
  MissionGrade,
  MissionReportData,
  ObjectiveRuntime,
  ObjectiveStatus,
} from '@/engine/core/types'
import type { Level } from '@/engine/world/Level'
import type { StealthSystem } from '@/engine/stealth/StealthSystem'
import type { EnemyManager } from '@/engine/ai/Guard'
import type { GuardDef, Vec2 } from '@/engine/core/types'

export interface MissionDeps {
  level: Level
  bus: EventBus
  stealth: StealthSystem
  enemies: EnemyManager
  allGuardDefs: GuardDef[]
  playerPos: () => Vec2
  playerHealth: () => number
}

export class MissionManager {
  readonly mission: MissionDef
  objectives: ObjectiveRuntime[]
  timeSeconds = 0
  finished: 'complete' | 'failed' | null = null
  neutralizations = 0
  intelFound = 0
  lockdownFired = false
  private firedTriggers = new Set<string>()
  private unsubs: (() => void)[] = []

  constructor(mission: MissionDef, private deps: MissionDeps) {
    this.mission = mission
    this.objectives = mission.objectives.map((o) => ({
      ...o,
      status: o.hidden ? ('locked' as ObjectiveStatus) : ('active' as ObjectiveStatus),
    }))
    this.unsubs.push(
      deps.bus.on('interaction:done', (p) => this.onInteraction(p.entityId, p.kind)),
      deps.bus.on('world:event', (name) => {
        if (name === 'takedown') this.neutralizations++
        else if (name.startsWith('complete:')) this.complete(name.slice(9))
        else if (name.startsWith('reveal:')) this.reveal(name.slice(7))
      }),
    )
  }

  dispose(): void {
    for (const u of this.unsubs) u()
    this.unsubs = []
  }

  /* ---------------- status queries ---------------- */

  get extractionArmed(): boolean {
    return this.objectives
      .filter((o) => o.type !== 'escape' && o.status !== 'locked')
      .every((o) => o.status === 'completed')
  }

  visibleObjectives(): ObjectiveRuntime[] {
    return this.objectives.filter((o) => o.status !== 'locked')
  }

  /* ---------------- per-frame update ---------------- */

  update(dt: number): void {
    if (this.finished) return
    this.timeSeconds += dt

    const p = this.deps.playerPos()
    for (const t of this.deps.level.triggers) {
      if (t.once && this.firedTriggers.has(t.id)) continue
      if (p.x < t.x || p.x >= t.x + t.w || p.y < t.y || p.y >= t.y + t.h) continue
      this.firedTriggers.add(t.id)
      switch (t.kind) {
        case 'objective':
          if (t.objectiveId) this.complete(t.objectiveId)
          break
        case 'reveal':
          if (t.objectiveId) this.reveal(t.objectiveId)
          break
        case 'radio':
          for (const line of t.text ?? []) this.deps.stealth.pushRadio(t.speaker ?? 'HANDLER', line)
          break
        case 'lockdown':
          this.triggerLockdown()
          break
      }
    }

    if (this.deps.playerHealth() <= 0) this.fail('Killed in action')
  }

  /* ---------------- objective resolution ---------------- */

  private onInteraction(entityId: string, kind: string): void {
    if (kind === 'intel') this.intelFound++
    if (kind === 'extract' && this.extractionArmed) {
      this.complete('extract')
      this.finish(true)
      return
    }
    for (const o of this.objectives) {
      if (o.entityId === entityId && o.status !== 'completed') this.complete(o.id)
    }
    // terminals can complete objectives via effect (handled in InteractionManager
    // through world events) — mirror here for effect-driven ids
  }

  completeObjectiveById(id: string): void {
    this.complete(id)
  }

  revealObjectiveById(id: string): void {
    this.reveal(id)
  }

  private complete(id: string): void {
    const o = this.objectives.find((x) => x.id === id)
    if (!o || o.status === 'completed') return
    o.status = 'completed'
    this.deps.bus.emit('objective:update', { id: o.id, status: 'completed', title: o.title })
    this.deps.bus.emit('sfx', { name: 'objective' })
    if (o.type === 'escape') this.finish(true)
  }

  private reveal(id: string): void {
    const o = this.objectives.find((x) => x.id === id)
    if (!o || o.status !== 'locked') return
    o.status = 'active'
    this.deps.bus.emit('objective:reveal', { id: o.id, title: o.title })
    this.deps.bus.emit('objective:update', { id: o.id, status: 'active', title: o.title })
  }

  /* ---------------- lockdown (M04 finale mechanic) ---------------- */

  triggerLockdown(): void {
    if (this.lockdownFired || this.finished) return
    this.lockdownFired = true
    const { level, stealth, enemies, bus } = this.deps
    stealth.setLockdown(true)
    const lockIds = level.entities.filter((e) => e.lockdown).map((e) => e.id)
    level.closeDoors(lockIds)
    enemies.spawnWave(1, this.deps.allGuardDefs)
    stealth.raiseAlarm('Silent alarm tripped — facility sealed')
    stealth.pushRadio('CONTROL', 'Intruder in the core building. Seal it. I want them pinned.')
    bus.emit('world:event', 'lockdown')
    bus.emit('sfx', { name: 'alertSting' })
  }

  /* ---------------- completion & grading ---------------- */

  private fail(reason: string): void {
    if (this.finished) return
    this.finished = 'failed'
    const report = this.buildReport(false)
    report.stats.detectedReasons = [...report.stats.detectedReasons, reason]
    this.deps.bus.emit('mission:failed', report)
  }

  private finish(success: boolean): void {
    if (this.finished) return
    this.finished = success ? 'complete' : 'failed'
    this.deps.bus.emit(success ? 'mission:complete' : 'mission:failed', this.buildReport(success))
  }

  buildReport(success: boolean): MissionReportData {
    const s = this.deps.stealth
    const maxAlert = s.maxAlert
    const grade = this.grade(maxAlert)
    return {
      missionId: this.mission.id,
      codeName: this.mission.codeName,
      grade,
      success,
      timeSeconds: this.timeSeconds,
      objectives: this.objectives
        .filter((o) => o.status !== 'locked')
        .map((o) => ({ title: o.title, optional: !!o.optional, status: o.status })),
      stats: {
        timesSpotted: s.timesSpotted,
        neutralizations: this.neutralizations,
        maxAlert,
        intelFound: this.intelFound,
        detectedReasons: [...s.detectedReasons],
      },
    }
  }

  private grade(maxAlert: AlertLevel): MissionGrade {
    const order: AlertLevel[] = ['undetected', 'suspicious', 'alert', 'searching', 'combat', 'lockdown']
    const ai = order.indexOf(maxAlert)
    const combatIdx = order.indexOf('combat')
    if (ai <= order.indexOf('suspicious') && this.neutralizations === 0) return 'ghost'
    if (ai < combatIdx) return 'shadow'
    if (maxAlert === 'lockdown' || this.deps.stealth.timesSpotted >= 3 || this.neutralizations >= 4)
      return 'compromised'
    return 'operative'
  }
}
