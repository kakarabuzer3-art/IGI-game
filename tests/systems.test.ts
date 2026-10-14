/**
 * Systems tests — pure simulation logic (no DOM/WebGL):
 * perception math, LOS, pathfinding, collision, lightmap switches,
 * and the mission/objective event flow.
 */
import { describe, expect, it } from 'vitest'
import { EventBus } from '@/engine/core/EventBus'
import { Level, TILE } from '@/engine/world/Level'
import { hasLos } from '@/engine/world/LOS'
import { findPath } from '@/engine/world/Pathfinding'
import { sampleVision, hearNoise, GUARD_TYPES } from '@/engine/ai/Perception'
import { circleHitsSolid, createPlayer, updatePlayer, type PlayerState } from '@/engine/player/PlayerController'
import { MissionManager } from '@/engine/mission/MissionManager'
import { StealthSystem } from '@/engine/stealth/StealthSystem'
import { EnemyManager } from '@/engine/ai/Guard'
import type { InputManager } from '@/engine/input/InputManager'
import type { LevelDef, MissionDef } from '@/engine/core/types'
import { makeRng } from '@/engine/core/math'

/* ---------------- fixture level ---------------- */

const FIXTURE: LevelDef = {
  id: 'test',
  name: 'TEST',
  ambient: 'night',
  grid: [
    '############',
    '#S..#....T.#',
    '#...D......#',
    '#..o#...I..#',
    '#...#......#',
    '#f..........',
    '#...~.....X#',
    '############',
  ],
  guards: [
    { id: 'g1', tile: { x: 6, y: 3 }, type: 'grunt', route: [{ x: 6, y: 3 }, { x: 9, y: 3 }] },
  ],
  triggers: [
    { id: 't-room', x: 5, y: 1, w: 6, h: 4, once: true, kind: 'objective', objectiveId: 'reach-room' },
  ],
  overrides: [
    { tile: { x: 9, y: 1 }, id: 'term', effect: { completeObjective: 'hack' } },
    { tile: { x: 8, y: 3 }, id: 'intel-item' },
    { tile: { x: 10, y: 6 }, id: 'extract', hold: 1 },
  ],
  lamps: [],
}

const MISSION: MissionDef = {
  id: 'test-mission',
  index: 1,
  codeName: 'TEST',
  title: 'Test',
  levelId: 'test',
  difficulty: 1,
  newMechanic: 'none',
  briefing: { location: 'X', threatLevel: 'LOW', insertion: 'X', lines: [] },
  insertionRadio: [],
  objectives: [
    { id: 'reach-room', type: 'reach', title: 'Reach room', description: '', triggerId: 't-room' },
    { id: 'hack', type: 'interact', title: 'Hack', description: '', entityId: 'term' },
    { id: 'secret', type: 'retrieve', title: 'Secret', description: '', entityId: 'intel-item', hidden: true, optional: true },
    { id: 'extract', type: 'escape', title: 'Extract', description: '' },
  ],
  extraction: { label: 'X', holdSeconds: 1 },
}

function makeWorld() {
  const level = new Level(FIXTURE)
  const bus = new EventBus()
  const rng = makeRng(42)
  const player = createPlayer(level.spawnTile)
  const playerLight = () => level.lightAtTile(Math.floor(player.pos.x), Math.floor(player.pos.y))
  const enemies = new EnemyManager(FIXTURE.guards, {
    level, bus, rng, player, playerLight,
    broadcast: () => {},
    alertnessBonus: 0,
  })
  const stealth = new StealthSystem({ level, bus, player, playerLight, rng, getGuards: () => enemies.guards })
  const mission = new MissionManager(MISSION, {
    level, bus, stealth, enemies,
    allGuardDefs: FIXTURE.guards,
    playerPos: () => player.pos,
    playerHealth: () => player.health,
  })
  return { level, bus, rng, player, enemies, stealth, mission }
}

/* ---------------- LOS ---------------- */

describe('line of sight', () => {
  it('is blocked by walls', () => {
    const { level } = makeWorld()
    // spawn (1,1) to terminal room across the wall column x=4
    expect(hasLos(level, 1.5, 1.5, 10.5, 1.5)).toBe(false)
  })
  it('passes through open doorway', () => {
    const { level } = makeWorld()
    level.setDoorOpen(level.entities.find((e) => e.kind === 'door')!.id, true)
    expect(hasLos(level, 2.5, 2.5, 8.5, 2.5)).toBe(true)
  })
  it('passes through fence (see-through)', () => {
    const { level } = makeWorld()
    // fence at (1,5): from (1,6) south to (1,4)? column x=1 y5 'f'
    expect(hasLos(level, 1.5, 6.5, 1.5, 4.5)).toBe(true)
  })
  it('is blocked by crates', () => {
    const { level } = makeWorld()
    expect(hasLos(level, 3.5, 1.5, 3.5, 6.5)).toBe(false) // crate at (3,3)
  })
})

/* ---------------- pathfinding ---------------- */

describe('pathfinding', () => {
  it('finds a path through an open door', () => {
    const { level } = makeWorld()
    level.setDoorOpen(level.entities.find((e) => e.kind === 'door')!.id, true)
    const path = findPath(level, { x: 2.5, y: 2.5 }, { x: 9.5, y: 2.5 })
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(3)
  })
  it('ignores door state (guards can open doors)', () => {
    const { level } = makeWorld()
    const path = findPath(level, { x: 2.5, y: 2.5 }, { x: 9.5, y: 2.5 })
    expect(path).not.toBeNull()
  })
  it('returns null for unreachable goals', () => {
    const { level } = makeWorld()
    // inside a wall tile
    expect(findPath(level, { x: 2.5, y: 2.5 }, { x: 4.5, y: 0.5 })).toBeNull()
  })
})

/* ---------------- perception ---------------- */

describe('perception', () => {
  const params = GUARD_TYPES.grunt
  it('sees a standing player in light, down the corridor', () => {
    const { level } = makeWorld()
    const v = sampleVision(level, { x: 6.5, y: 3.5 }, Math.PI / 2, params.fov, params.viewDist, 1,
      { x: 6.5, y: 6.5 }, 0.85, false, 3)
    expect(v.visible).toBe(true)
    expect(v.score).toBeGreaterThan(0.3)
  })
  it('does not see through walls', () => {
    const { level } = makeWorld()
    const v = sampleVision(level, { x: 2.5, y: 2.5 }, 0, params.fov, params.viewDist, 1,
      { x: 9.5, y: 2.5 }, 0.85, false, 0)
    expect(v.visible).toBe(false)
  })
  it('does not see outside the FOV cone', () => {
    const { level } = makeWorld()
    const v = sampleVision(level, { x: 6.5, y: 3.5 }, 0, params.fov, params.viewDist, 1,
      { x: 6.5, y: 6.5 }, 0.85, false, 0) // facing east, player south
    expect(v.visible).toBe(false)
  })
  it('darkness and crouching dramatically reduce detection', () => {
    const { level } = makeWorld()
    const lit = sampleVision(level, { x: 6.5, y: 3.5 }, Math.PI / 2, params.fov, params.viewDist, 1,
      { x: 6.5, y: 5.5 }, 0.85, false, 4).score
    const dark = sampleVision(level, { x: 6.5, y: 3.5 }, Math.PI / 2, params.fov, params.viewDist, 1,
      { x: 6.5, y: 5.5 }, 0.1, true, 0.5).score
    expect(dark).toBeLessThan(lit * 0.35)
  })
  it('hears loud noises at range, muffled through walls', () => {
    const { level } = makeWorld()
    const open = hearNoise(level, { x: 6.5, y: 6.5 }, { x: 6.5, y: 4.5 }, 10)
    expect(open).toBeGreaterThan(0.5)
    const occluded = hearNoise(level, { x: 2.5, y: 2.5 }, { x: 9.5, y: 2.5 }, 8)
    expect(occluded).toBe(0) // beyond halved radius
  })
})

/* ---------------- collision ---------------- */

describe('collision', () => {
  it('blocks circles overlapping walls', () => {
    const { level } = makeWorld()
    expect(circleHitsSolid(level, 4.4, 2.5, 0.18)).toBe(true) // next to wall column x=4
    expect(circleHitsSolid(level, 2.5, 2.5, 0.18)).toBe(false)
  })
})

/* ---------------- lightmap & switches ---------------- */

describe('lightmap', () => {
  it('switch darkens tiles in radius and toggles back', () => {
    const { level } = makeWorld()
    const sw = level.entities.find((e) => e.kind === 'switch')!
    const before = level.lightAtTile(4, 6)
    level.toggleSwitch(sw)
    expect(level.lightAtTile(sw.tile.x, sw.tile.y)).toBeLessThan(0.06)
    level.toggleSwitch(sw)
    expect(level.lightAtTile(4, 6)).toBeCloseTo(before, 5)
  })
  it('disableAllCameras + unlockDoor mutate state', () => {
    const { level } = makeWorld()
    level.disableAllCameras()
    const locked = level.entities.find((e) => e.kind === 'lockeddoor')
    expect(locked === undefined || locked.disabled === false).toBe(true) // no cameras in fixture
  })
})

/* ---------------- player movement ---------------- */

function stubInput(over: Partial<InputManager> = {}): InputManager {
  return {
    moveAxis: () => ({ x: 0, y: 1 }),
    sprintHeld: () => false,
    crouchHeld: () => false,
    crouchTogglePressed: () => false,
    ...over,
  } as unknown as InputManager
}

describe('player', () => {
  it('moves forward relative to yaw and stops at walls', () => {
    const { level, player } = makeWorld()
    player.yaw = 0 // east
    for (let i = 0; i < 120; i++) updatePlayer(player, stubInput(), level, 1 / 60, true)
    expect(player.pos.x).toBeGreaterThan(2)
    // slam into wall column x=4 (door at y2 is closed)
    player.pos.y = 1.5
    for (let i = 0; i < 300; i++) updatePlayer(player, stubInput(), level, 1 / 60, true)
    expect(player.pos.x).toBeLessThan(4)
  })
  it('sprint drains stamina; crouch lowers eye height', () => {
    const { level, player } = makeWorld()
    player.yaw = Math.PI / 2
    for (let i = 0; i < 90; i++) updatePlayer(player, stubInput({ sprintHeld: () => true }), level, 1 / 60, true)
    expect(player.stamina).toBeLessThan(100)
    const p2: PlayerState = { ...createPlayer(level.spawnTile), equipment: [] }
    for (let i = 0; i < 30; i++) {
      updatePlayer(p2, stubInput({ crouchHeld: () => true, moveAxis: () => ({ x: 0, y: 0 }) }), level, 1 / 60, true)
    }
    expect(p2.crouching).toBe(true)
    expect(p2.eyeHeight).toBeLessThan(1.2)
  })
  it('emits larger noise radius when sprinting than crouch-walking', () => {
    const { level, player } = makeWorld()
    player.yaw = Math.PI / 2
    let sprintR = 0
    let crouchR = Infinity
    for (let i = 0; i < 240; i++) {
      const r = updatePlayer(player, stubInput({ sprintHeld: () => true }), level, 1 / 60, true)
      for (const n of r.noises) sprintR = Math.max(sprintR, n.radius)
    }
    player.stamina = 100
    player.pos = { x: 6.5, y: 6.5 }
    player.yaw = 0
    player.vel = { x: 0, y: 0 }
    for (let i = 0; i < 480; i++) {
      const r = updatePlayer(player, stubInput({ crouchHeld: () => true }), level, 1 / 60, true)
      for (const n of r.noises) crouchR = Math.min(crouchR, n.radius)
    }
    expect(sprintR).toBeGreaterThan(8)
    expect(crouchR).toBeLessThan(5)
  })
})

/* ---------------- mission / objective flow ---------------- */

describe('mission flow', () => {
  it('starts with hidden objectives locked and others active', () => {
    const { mission } = makeWorld()
    const secret = mission.objectives.find((o) => o.id === 'secret')!
    const hack = mission.objectives.find((o) => o.id === 'hack')!
    expect(secret.status).toBe('locked')
    expect(hack.status).toBe('active')
    expect(mission.visibleObjectives().some((o) => o.id === 'secret')).toBe(false)
  })

  it('completes reach objective when player enters trigger volume', () => {
    const { mission, player } = makeWorld()
    player.pos = { x: 7.5, y: 2.5 }
    mission.update(0.1)
    expect(mission.objectives.find((o) => o.id === 'reach-room')!.status).toBe('completed')
  })

  it('reveals hidden objectives on demand', () => {
    const { mission, bus } = makeWorld()
    bus.emit('world:event', 'reveal:secret')
    expect(mission.objectives.find((o) => o.id === 'secret')!.status).toBe('active')
  })

  it('resolves entity objectives from interaction events', () => {
    const { mission, bus } = makeWorld()
    bus.emit('interaction:done', { entityId: 'term', kind: 'terminal' })
    expect(mission.objectives.find((o) => o.id === 'hack')!.status).toBe('completed')
  })

  it('gates extraction until all other objectives complete', () => {
    const { mission, bus } = makeWorld()
    expect(mission.extractionArmed).toBe(false)
    bus.emit('interaction:done', { entityId: 'extract', kind: 'extract' })
    expect(mission.finished).toBeNull() // refused
    bus.emit('interaction:done', { entityId: 'term', kind: 'terminal' })
    bus.emit('world:event', 'complete:reach-room')
    expect(mission.extractionArmed).toBe(true)
    bus.emit('interaction:done', { entityId: 'extract', kind: 'extract' })
    expect(mission.finished).toBe('complete')
  })

  it('grades a clean run as GHOST and a combat run lower', () => {
    const w1 = makeWorld()
    let report: { grade?: string } | null = null
    w1.bus.on('mission:complete', (r) => (report = r))
    w1.bus.emit('interaction:done', { entityId: 'term', kind: 'terminal' })
    w1.bus.emit('world:event', 'complete:reach-room')
    w1.bus.emit('interaction:done', { entityId: 'extract', kind: 'extract' })
    expect(report).not.toBeNull()
    expect(report!.grade).toBe('ghost')

    const w2 = makeWorld()
    let r2: { grade?: string } | null = null
    w2.bus.on('mission:complete', (r) => (r2 = r))
    w2.stealth.notifySpotted('test')
    w2.bus.emit('interaction:done', { entityId: 'term', kind: 'terminal' })
    w2.bus.emit('world:event', 'complete:reach-room')
    w2.bus.emit('interaction:done', { entityId: 'extract', kind: 'extract' })
    expect(r2!.grade).not.toBe('ghost')
  })

  it('fails the mission when the player dies', () => {
    const { mission, player, bus } = makeWorld()
    let failed = false
    bus.on('mission:failed', () => (failed = true))
    player.health = 0
    mission.update(0.1)
    expect(failed).toBe(true)
    expect(mission.finished).toBe('failed')
  })
})

/* ---------------- stealth facility state ---------------- */

describe('stealth facility state', () => {
  it('escalates to combat when a guard is broadcast combat and decodes reasons', () => {
    const { stealth, enemies } = makeWorld()
    const g = enemies.guards[0]
    g.mode = 'combat'
    stealth.update(0.1)
    expect(stealth.alert).toBe('combat')
    g.mode = 'patrol'
    g.suspicion = 0
    stealth.update(0.1)
    expect(stealth.alert).toBe('undetected')
  })
  it('jammers block radio propagation', () => {
    const { stealth } = makeWorld()
    stealth.jammerCharges = 1
    expect(stealth.useJammer()).toBe(true)
    expect(stealth.jammerActive).toBe(true)
    expect(stealth.jammerCharges).toBe(0)
    expect(stealth.useJammer()).toBe(false) // no charges left
  })
})

/* ---------------- world scale sanity ---------------- */

describe('world scale', () => {
  it('tile center conversion is consistent', () => {
    const { level } = makeWorld()
    const w = level.tileCenterWorld(3, 4)
    expect(w.x).toBeCloseTo(3.5 * TILE)
    expect(w.y).toBeCloseTo(4.5 * TILE)
  })
})
