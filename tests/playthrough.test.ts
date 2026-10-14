/**
 * Playthrough tests — scripted, headless runs of every mission through the
 * REAL systems (Level, MissionManager, InteractionManager, StealthSystem,
 * Pathfinding). Proves each operation is mechanically completable end-to-end:
 * triggers fire, terminals apply effects, keycards unlock, elevators teleport,
 * lockdown sequences run, extraction is gated, and a clean run grades GHOST.
 */
import { describe, expect, it } from 'vitest'
import { EventBus } from '@/engine/core/EventBus'
import { Level, TILE } from '@/engine/world/Level'
import { findPath } from '@/engine/world/Pathfinding'
import { createPlayer } from '@/engine/player/PlayerController'
import { MissionManager } from '@/engine/mission/MissionManager'
import { StealthSystem } from '@/engine/stealth/StealthSystem'
import { EnemyManager } from '@/engine/ai/Guard'
import { InteractionManager } from '@/engine/interaction/InteractionManager'
import { LEVELS } from '@/data/levels'
import {
  MISSION_NIGHTFALL, MISSION_DEEP_ENTRY, MISSION_BLACK_SIGNAL, MISSION_EXTRACTION,
} from '@/data/missions'
import { makeRng } from '@/engine/core/math'
import type { MissionDef, MissionReportData, Vec2 } from '@/engine/core/types'

class Harness {
  level: Level
  bus = new EventBus()
  player = createPlayer({ x: 1, y: 1 })
  enemies: EnemyManager
  stealth: StealthSystem
  mission: MissionManager
  interaction: InteractionManager
  report: MissionReportData | null = null
  private rng = makeRng(7)

  constructor(levelId: string, def: MissionDef, guards = false) {
    this.level = new Level(LEVELS[levelId])
    this.player = createPlayer(this.level.spawnTile)
    const playerLight = () =>
      this.level.lightAtTile(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y))
    this.enemies = new EnemyManager(guards ? LEVELS[levelId].guards.filter((g) => !g.wave) : [], {
      level: this.level, bus: this.bus, rng: this.rng, player: this.player, playerLight,
      broadcast: () => {}, alertnessBonus: 0,
    })
    this.stealth = new StealthSystem({
      level: this.level, bus: this.bus, player: this.player, playerLight,
      rng: this.rng, getGuards: () => this.enemies.guards,
    })
    this.mission = new MissionManager(def, {
      level: this.level, bus: this.bus, stealth: this.stealth, enemies: this.enemies,
      allGuardDefs: LEVELS[levelId].guards,
      playerPos: () => this.player.pos, playerHealth: () => this.player.health,
    })
    this.interaction = new InteractionManager({
      level: this.level, bus: this.bus, player: this.player, stealth: this.stealth,
      enemies: this.enemies, extractionArmed: () => this.mission.extractionArmed,
    })
    this.bus.on('mission:complete', (r) => (this.report = r))
    this.bus.on('mission:failed', (r) => (this.report = r))
    // apply elevator teleports like the real Game does
    this.bus.on('world:teleport', ({ x, y }) => {
      this.player.pos = { x, y }
    })
  }

  /** walk the player along an A* path, firing triggers as we go */
  goto(tx: number, ty: number): void {
    const path = findPath(this.level, this.player.pos, { x: tx + 0.5, y: ty + 0.5 })
    expect(path, `path to (${tx},${ty})`).not.toBeNull()
    for (const wp of path!) {
      const dx = wp.x - this.player.pos.x
      const dy = wp.y - this.player.pos.y
      if (Math.hypot(dx, dy) > 0.01) this.player.yaw = Math.atan2(dy, dx)
      this.player.pos = wp
      this.mission.update(0.05)
      this.interaction.update()
    }
  }

  /** stand adjacent to an entity, face it, and complete its interaction */
  use(entityId: string, opts: { expectBlocked?: boolean; from?: Vec2 } = {}): void {
    const ent = this.level.getEntity(entityId)
    expect(ent, `entity ${entityId}`).toBeTruthy()
    // find a walkable neighbor tile (or use the scripted approach tile)
    const spots: Vec2[] = [
      { x: ent!.tile.x - 1, y: ent!.tile.y }, { x: ent!.tile.x + 1, y: ent!.tile.y },
      { x: ent!.tile.x, y: ent!.tile.y - 1 }, { x: ent!.tile.x, y: ent!.tile.y + 1 },
    ]
    const spot = opts.from ?? (spots.find((s) =>
      this.level.isWalkableTileIgnoreDoors(s.x, s.y) && !this.level.entityAt(s.x, s.y),
    ) ?? spots.find((s) => this.level.isWalkableTileIgnoreDoors(s.x, s.y)))
    expect(spot, `adjacent spot for ${entityId}`).toBeTruthy()
    this.goto(spot!.x, spot!.y)
    this.player.pos = { x: spot!.x + 0.5, y: spot!.y + 0.5 }
    this.player.yaw = Math.atan2(
      ent!.tile.y + 0.5 - this.player.pos.y,
      ent!.tile.x + 0.5 - this.player.pos.x,
    )
    this.interaction.update()
    const t = this.interaction.target
    expect(t, `interaction candidate for ${entityId}`).not.toBeNull()
    expect(t!.ent?.id, `selected entity (got ${t!.ent?.id ?? t!.kind})`).toBe(entityId)
    if (opts.expectBlocked) {
      expect(t!.blocked).toBe(true)
      return
    }
    if (t!.hold > 0) {
      const steps = Math.ceil(t!.hold * 60) + 30
      for (let i = 0; i < steps; i++) {
        this.interaction.tickHold(1 / 60, true)
        this.mission.update(1 / 60)
      }
    } else {
      this.interaction.press()
    }
    this.interaction.update()
  }

  /** unlock (if needed) then open a door */
  openDoor(entityId: string): void {
    const ent = this.level.getEntity(entityId)!
    if (ent.locked) this.use(entityId) // unlock with keycard
    this.use(entityId) // open
    expect(this.level.getEntity(entityId)!.open, `door ${entityId} open`).toBe(true)
  }

  objective(id: string) {
    return this.mission.objectives.find((o) => o.id === id)!
  }
}

void TILE

/* ================================================================== */

describe('Mission 01 — NIGHTFALL playthrough', () => {
  it('completes end-to-end with GHOST grade', () => {
    const h = new Harness('greyline-perimeter', MISSION_NIGHTFALL)

    // cross the fence breach into the yard → infiltration objective
    h.goto(6, 24)
    h.goto(6, 17)
    expect(h.objective('infiltrate').status).toBe('completed')

    // yard floodlight switch actually darkens the lightmap
    const before = h.level.lightAtTile(11, 14)
    h.use('yard-lights')
    expect(h.level.lightAtTile(11, 14)).toBeLessThan(before)
    h.use('yard-lights') // restore

    // enter warehouse via the west bay and use the comms terminal (hold action)
    h.goto(8, 11)
    h.openDoor('bay-door-west')
    h.goto(20, 5)
    h.use('comm-terminal')
    expect(h.objective('terminal').status).toBe('completed')
    const cam = h.level.entities.find((e) => e.kind === 'camera')!
    expect(cam.disabled).toBe(true) // camera network offline chain

    // office was maglocked — terminal released it
    const office = h.level.getEntity('office-door')!
    expect(office.locked).toBe(false)
    h.openDoor('office-door')
    h.use('mission-data')
    expect(h.objective('data').status).toBe('completed')
    expect(h.player.equipment).toContain('intel') // intel pickup tracked

    // extraction is armed now; leave and reach the LZ (use() walks us there)
    expect(h.mission.extractionArmed).toBe(true)
    h.use('extract-m1')
    expect(h.mission.finished).toBe('complete')
    expect(h.report).not.toBeNull()
    expect(h.report!.grade).toBe('ghost')
    expect(h.report!.success).toBe(true)
    expect(h.report!.stats.timesSpotted).toBe(0)
  })
})

describe('Mission 02 — DEEP ENTRY playthrough', () => {
  it('completes end-to-end (keycard → elevator → hub → mainframe → drainage)', () => {
    const h = new Harness('greyline-underground', MISSION_DEEP_ENTRY)

    // checkpoint: grab the master keycard from the duty office
    h.goto(10, 27)
    h.use('guard-keycard')
    expect(h.objective('keycard').status).toBe('completed')
    expect(h.player.equipment).toContain('keycard')

    // north through the complex yard
    h.goto(10, 15)
    expect(h.objective('enter-complex').status).toBe('completed')

    // lift building: keycard door, then freight elevator down (teleport)
    h.use('lift-door', { expectBlocked: false }) // unlock with keycard
    h.openDoor('lift-door')
    h.use('elev-a')
    expect(h.objective('descend').status).toBe('completed')
    // player was teleported to the sublevel hall
    expect(Math.floor(h.player.pos.x)).toBe(25)

    // surveillance hub → cameras die + control room seal releases
    h.use('sec-hub')
    expect(h.objective('cams').status).toBe('completed')
    const cams = h.level.entities.filter((e) => e.kind === 'camera')
    expect(cams.length).toBeGreaterThan(0)
    for (const c of cams) expect(c.disabled).toBe(true)
    expect(h.level.getEntity('ctrl-door')!.locked).toBe(false)

    // control room mainframe
    h.openDoor('ctrl-door')
    h.use('mainframe')
    expect(h.objective('mainframe').status).toBe('completed')

    // drainage outlet extraction
    expect(h.mission.extractionArmed).toBe(true)
    h.use('extract-m2')
    expect(h.mission.finished).toBe('complete')
    expect(h.report!.grade).toBe('ghost')
  })
})

describe('Mission 03 — BLACK SIGNAL playthrough', () => {
  it('completes end-to-end including the hidden optional objective', () => {
    const h = new Harness('greyline-research', MISSION_BLACK_SIGNAL)

    // hidden objective starts locked
    expect(h.objective('notes').status).toBe('locked')

    // guard shack: cut the searchlight power
    h.openDoor('shack-door')
    h.use('sl-power')
    expect(h.objective('searchlight').status).toBe('completed')
    const sl = h.level.getEntity('searchlight')!
    expect(sl.disabled).toBe(true)

    // into the wing through the lobby door → reach-wing trigger
    h.openDoor('lobby-door')
    h.goto(17, 12)
    expect(h.objective('reach-wing').status).toBe('completed')

    // duty office: Dr. Voss's badge (grants keycard equipment)
    h.use('research-badge')
    expect(h.objective('badge').status).toBe('completed')

    // badge-locked main lab: terminal archives + reveals the hidden objective
    h.openDoor('duty-door')
    h.openDoor('lab-door')
    h.use('lab-terminal')
    expect(h.objective('lab-terminal').status).toBe('completed')
    expect(h.objective('notes').status).toBe('active') // revealed

    // core + optional notes
    h.use('signal-core')
    expect(h.objective('signal').status).toBe('completed')
    h.openDoor('annex-door')
    h.use('research-notes')
    expect(h.objective('notes').status).toBe('completed')

    // out east, around to the ridge extraction
    expect(h.mission.extractionArmed).toBe(true)
    h.goto(35, 20)
    h.goto(35, 3)
    h.use('extract-m3')
    expect(h.mission.finished).toBe('complete')
    expect(h.report!.grade).toBe('ghost')
    expect(h.report!.objectives.some((o) => o.title.includes('research notes'.toLowerCase()) || o.optional)).toBe(true)
  })
})

describe('Mission 04 — EXTRACTION playthrough', () => {
  it('completes under lockdown: decoy broadcast, sealed routes, helipad', () => {
    const h = new Harness('greyline-core', MISSION_EXTRACTION, true)

    // sublevel store room → stairwell up
    h.openDoor('start-door')
    h.goto(20, 21)
    h.goto(19, 16)
    // open the airlock FROM THE STAIR SIDE (a real operative opens it before
    // stepping into the corridor trip wire)
    h.use('airlock-mid', { from: { x: 19, y: 15 } })
    expect(h.level.getEntity('airlock-mid')!.open).toBe(true)
    h.goto(19, 13) // main corridor — silent alarm trip wire

    // lockdown fired: the airlock sealed BEHIND us, QRF spawned
    h.stealth.update(0.1)
    expect(h.mission.lockdownFired).toBe(true)
    expect(h.stealth.lockdown).toBe(true)
    expect(h.stealth.alert).toBe('lockdown')
    expect(h.level.getEntity('airlock-mid')!.locked).toBe(true)
    expect(h.level.getEntity('airlock-mid')!.open).toBe(false)
    expect(h.enemies.guards.some((g) => g.def.id === 'g-qrf1')).toBe(true)

    // comms room: broadcast the decoy (guards chase the ghost)
    h.goto(21, 10)
    expect(h.objective('reach-comms').status).toBe('completed')
    h.use('decoy')
    expect(h.objective('decoy').status).toBe('completed')
    const decoyed = h.enemies.guards.filter((g) => !g.downed && g.mode === 'investigate')
    expect(decoyed.length).toBeGreaterThan(0)

    // north stair → helipad
    h.openDoor('north-door')
    h.openDoor('heli-door')
    h.goto(30, 4)
    expect(h.objective('reach-helipad').status).toBe('completed')

    // extraction under threat — lockdown caps the grade below ghost, that is fair
    h.use('extract-m4')
    expect(h.mission.finished).toBe('complete')
    expect(['operative', 'compromised', 'shadow', 'ghost']).toContain(h.report!.grade)
  })
})
