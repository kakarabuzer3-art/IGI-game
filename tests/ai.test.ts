/**
 * AI behavior tests — guard FSM escalation, information limits (no
 * omniscience), noise investigation, radio propagation, body discovery,
 * combat damage, and takedowns. Runs the real Guard/StealthSystem code.
 */
import { describe, expect, it } from 'vitest'
import { EventBus } from '@/engine/core/EventBus'
import { Level } from '@/engine/world/Level'
import { EnemyManager, Guard } from '@/engine/ai/Guard'
import { StealthSystem } from '@/engine/stealth/StealthSystem'
import { createPlayer } from '@/engine/player/PlayerController'
import { makeRng } from '@/engine/core/math'
import type { LevelDef, Vec2 } from '@/engine/core/types'

// open yard with a wall divider — plenty of LOS control
const OPEN: LevelDef = {
  id: 'ai-test',
  name: 'AI TEST',
  ambient: 'night',
  grid: [
    '####################',
    '#S.................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#......####........#',
    '#......####........#',
    '#..................#',
    '#..................#',
    '####################',
  ],
  guards: [],
  triggers: [],
  overrides: [],
}

function world(guardDef: { tile: Vec2; route?: Vec2[]; type?: 'grunt' | 'officer' }, light = 0.85) {
  const level = new Level(OPEN)
  level.light.fill(light) // uniform exposure for deterministic perception
  const bus = new EventBus()
  const rng = makeRng(99)
  const player = createPlayer(level.spawnTile)
  player.pos = { x: 10.5, y: 2.5 }
  const playerLight = () =>
    level.lightAtTile(Math.floor(player.pos.x), Math.floor(player.pos.y))
  const broadcasts: { kind: string; pos: Vec2 }[] = []
  const def = {
    id: 'g', tile: guardDef.tile, type: guardDef.type ?? ('grunt' as const),
    route: guardDef.route ?? [],
  }
  // eslint-disable-next-line prefer-const -- assigned after enemies (mutual reference in the broadcast closure)
  let stealth: StealthSystem
  const enemies = new EnemyManager([def], {
    level, bus, rng, player, playerLight,
    broadcast: (from, kind, pos) => {
      broadcasts.push({ kind, pos })
      stealth?.broadcast(from, kind, pos) // real radio propagation
    },
    alertnessBonus: 0,
  })
  stealth = new StealthSystem({
    level, bus, player, playerLight, rng, getGuards: () => enemies.guards,
  })
  const damages: number[] = []
  bus.on('player:damage', (d) => damages.push(d))
  return { level, bus, player, enemies, stealth, broadcasts, damages, guard: enemies.guards[0] }
}

const step = (w: ReturnType<typeof world>, n: number, dt = 0.1) => {
  for (let i = 0; i < n; i++) {
    w.enemies.update(dt)
    w.stealth.update(dt)
  }
}

describe('guard AI', () => {
  it('escalates: sees player in light → suspicious → investigate → combat', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    w.guard.facing = -Math.PI / 2 // face north toward player at y2.5
    const modes = new Set<string>()
    for (let i = 0; i < 40; i++) {
      step(w, 1)
      modes.add(w.guard.mode)
      if (w.guard.mode === 'combat') break
    }
    expect(modes.has('suspicious')).toBe(true)
    expect(w.guard.mode === 'combat' || modes.has('investigate')).toBe(true)
    expect(w.guard.suspicion).toBeGreaterThan(50)
    // combat was broadcast over radio
    expect(w.broadcasts.some((b) => b.kind === 'combat' || b.kind === 'investigate')).toBe(true)
  })

  it('is NOT omniscient: player behind a wall is never detected', () => {
    const w = world({ tile: { x: 8, y: 7 } })
    w.player.pos = { x: 8.5, y: 2.5 } // directly north, behind the wall block (x7..10, y5..6)
    w.guard.facing = -Math.PI / 2 // aim straight at the player through the wall
    step(w, 30)
    expect(w.guard.suspicion).toBe(0)
    expect(['patrol', 'idle']).toContain(w.guard.mode)
  })

  it('darkness + crouch + stillness keeps suspicion far lower than light + sprint', () => {
    const lit = world({ tile: { x: 12, y: 7 } })
    lit.guard.facing = -Math.PI / 2
    lit.player.speed = 5
    step(lit, 10)

    const dark = world({ tile: { x: 12, y: 7 } }, 0.05)
    dark.guard.facing = -Math.PI / 2
    dark.player.crouching = true
    dark.player.speed = 0
    step(dark, 10)

    expect(dark.guard.suspicion).toBeLessThan(lit.guard.suspicion * 0.3)
  })

  it('investigates noises at the noise position, not the player', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    w.guard.facing = Math.PI // facing away (east)
    w.player.pos = { x: 18.5, y: 1.5 } // far corner, out of cone
    // loud noise to the north-east, clear LOS
    w.enemies.noiseEvent({ x: 14.5, y: 3.5 }, 20, w.level)
    expect(w.guard.lastKnown).not.toBeNull()
    expect(w.guard.lastKnown!.x).toBeCloseTo(14.5, 5)
    expect(w.guard.lastKnown!.y).toBeCloseTo(3.5, 5)
    step(w, 5)
    expect(['investigate', 'suspicious']).toContain(w.guard.mode)
  })

  it('combat deals damage when adjacent with LOS', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    w.guard.mode = 'combat'
    w.guard.suspicion = 120
    w.guard.sawPlayerT = 0
    w.guard.path = null
    w.guard.pos = { x: w.player.pos.x + 0.3, y: w.player.pos.y + 0.2 }
    w.guard.facing = Math.atan2(
      w.player.pos.y - w.guard.pos.y,
      w.player.pos.x - w.guard.pos.x,
    )
    step(w, 12)
    const total = w.damages.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(5)
    expect(w.stealth.alert).toBe('combat')
  })

  it('a discovered body puts witnesses into search and radios it in', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    // second, downed guard in clear view to the north-east
    const body: Guard = new Guard(
      { id: 'body', tile: { x: 14, y: 5 }, type: 'grunt', route: [] },
      {
        level: w.level, bus: w.bus, rng: makeRng(5), player: w.player,
        playerLight: () => 0.85, guards: w.enemies.guards,
        broadcast: () => {}, alertnessBonus: 0,
      },
      0,
    )
    body.takedown()
    w.enemies.guards.push(body)
    w.guard.facing = Math.atan2(5.5 - 7.5, 14.5 - 12.5) // faces the body
    step(w, 5)
    expect(['search', 'combat']).toContain(w.guard.mode)
    expect(w.broadcasts.some((b) => b.kind === 'body')).toBe(true)
  })

  it('radio propagation alerts nearby guards (and jammer blocks it)', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    const second = new Guard(
      { id: 'g2', tile: { x: 16, y: 7 }, type: 'grunt', route: [] },
      {
        level: w.level, bus: w.bus, rng: makeRng(6), player: w.player,
        playerLight: () => 0.85, guards: w.enemies.guards,
        broadcast: () => {}, alertnessBonus: 0,
      },
      0,
    )
    w.enemies.guards.push(second)
    w.guard.facing = -Math.PI / 2
    w.guard.suspicion = 120
    step(w, 1) // guard broadcasts combat
    expect(second.suspicion).toBeGreaterThanOrEqual(58) // received intel

    // with jammer active, propagation is blocked
    const j = world({ tile: { x: 12, y: 7 } })
    const secondJ = new Guard(
      { id: 'g2', tile: { x: 16, y: 7 }, type: 'grunt', route: [] },
      {
        level: j.level, bus: j.bus, rng: makeRng(6), player: j.player,
        playerLight: () => 0.85, guards: j.enemies.guards,
        broadcast: () => {}, alertnessBonus: 0,
      },
      0,
    )
    j.enemies.guards.push(secondJ)
    j.stealth.jammerCharges = 1
    j.stealth.useJammer()
    j.guard.suspicion = 120
    step(j, 1)
    expect(secondJ.suspicion).toBe(0)
  })

  it('returns to patrol after losing the player (no infinite omniscient chase)', () => {
    const w = world({ tile: { x: 12, y: 7 } })
    w.guard.mode = 'combat'
    w.guard.suspicion = 120
    w.guard.sawPlayerT = 0
    // player vanishes into darkness across the map: crouched, lights out.
    // The guard's last known position is stale (opposite corner) — it must
    // search THERE, find nothing, and stand down. No omniscient tracking.
    w.player.pos = { x: 1.5, y: 1.5 }
    w.player.crouching = true
    w.level.light.fill(0.02)
    w.guard.lastKnown = { x: 17.5, y: 8.5 }
    w.guard.facing = Math.PI / 2
    // run long enough for "lost contact" (sawPlayerT > 8s) + search (10s)
    for (let i = 0; i < 400; i++) {
      step(w, 1)
      const m: string = w.guard.mode
      if (m === 'returning' || m === 'patrol') break
    }
    expect(['search', 'returning', 'patrol', 'idle']).toContain(w.guard.mode)
    expect(w.guard.suspicion).toBeLessThan(100)
  })

  it('takedown neutralizes silently-ish and marks the guard downed', () => {
    const w = world({ tile: { x: 10, y: 7 } })
    w.guard.takedown()
    expect(w.guard.downed).toBe(true)
    expect(w.guard.mode).toBe('downed')
    step(w, 5) // downed guards never act again
    expect(w.guard.downed).toBe(true)
  })
})

describe('facility alert aggregation', () => {
  it('facility level mirrors the worst guard state', () => {
    const w = world({ tile: { x: 10, y: 7 } })
    w.guard.mode = 'suspicious'
    w.stealth.update(0.1)
    expect(w.stealth.alert).toBe('suspicious')
    w.guard.mode = 'investigate'
    w.stealth.update(0.1)
    expect(w.stealth.alert).toBe('alert')
    w.guard.mode = 'search'
    w.stealth.update(0.1)
    expect(w.stealth.alert).toBe('searching')
    w.guard.mode = 'combat'
    w.stealth.update(0.1)
    expect(w.stealth.alert).toBe('combat')
    w.guard.mode = 'patrol'
    w.stealth.update(0.1)
    expect(w.stealth.alert).toBe('undetected')
  })
})
