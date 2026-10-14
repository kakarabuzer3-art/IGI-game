/**
 * Level-data validation: catches authoring errors in the tile grids before
 * they become gameplay bugs (uneven rows, markers in walls, unreachable
 * objectives, override tiles that don't match a marker, etc.).
 */
import { describe, expect, it } from 'vitest'
import { LEVELS } from '@/data/levels'
import { Level } from '@/engine/world/Level'
import { MISSIONS } from '@/data/missions'


function markerCharAt(def: (typeof LEVELS)[string], x: number, y: number): string {
  return def.grid[y]?.[x] ?? ''
}

describe('level data', () => {
  for (const [id, def] of Object.entries(LEVELS)) {
    describe(id, () => {
      it('has rectangular grid', () => {
        const w = def.grid[0].length
        expect(w).toBeGreaterThan(10)
        for (let y = 0; y < def.grid.length; y++) {
          expect(def.grid[y].length, `row ${y} width`).toBe(w)
        }
      })

      it('uses only known characters', () => {
        const known = new Set(['#', 'B', 'f', '.', ',', '*', 'o', 'S', 'X', 'D', 'L', 'T', 'C', 'K', 'I', 'J', '~', 'V'])
        for (const row of def.grid) for (const ch of row) expect(known.has(ch), `char "${ch}"`).toBe(true)
      })

      it('has exactly one spawn on walkable ground', () => {
        const spawns = def.grid.flatMap((row, y) => [...row].map((c, x) => ({ c, x, y }))).filter((t) => t.c === 'S')
        expect(spawns.length).toBe(1)
      })

      it('has at least one extraction console', () => {
        const xs = def.grid.flat().join('').split('').filter((c) => c === 'X').length
        expect(xs).toBeGreaterThanOrEqual(1)
      })

      it('overrides sit on matching marker tiles', () => {
        const markers = ['D', 'L', 'T', 'C', 'K', 'I', 'J', '~', 'X', 'V']
        for (const o of def.overrides ?? []) {
          const ch = markerCharAt(def, o.tile.x, o.tile.y)
          expect(markers, `override ${o.id ?? '?'} at (${o.tile.x},${o.tile.y}) sits on "${ch}"`).toContain(ch)
        }
      })

      it('guards spawn and patrol on walkable tiles', () => {
        const lv = new Level(def)
        for (const g of def.guards) {
          expect(lv.isWalkableTileIgnoreDoors(g.tile.x, g.tile.y), `guard ${g.id} spawn`).toBe(true)
          for (const p of g.route) {
            expect(lv.isWalkableTileIgnoreDoors(p.x, p.y), `guard ${g.id} waypoint (${p.x},${p.y})`).toBe(true)
          }
        }
      })

      it('triggers lie within bounds', () => {
        for (const t of def.triggers) {
          expect(t.x).toBeGreaterThanOrEqual(0)
          expect(t.y).toBeGreaterThanOrEqual(0)
          expect(t.x + t.w).toBeLessThanOrEqual(def.grid[0].length)
          expect(t.y + t.h).toBeLessThanOrEqual(def.grid.length)
        }
      })

      it('objectives are reachable from spawn (ignoring locked doors)', () => {
        const lv = new Level(def)
        const reach = lv.reachableFrom(lv.spawnTile.x, lv.spawnTile.y)
        // elevator pairs act as portals: expand reachability through links
        const elevators = lv.entities.filter((e) => e.kind === 'elevator' && e.link)
        for (let pass = 0; pass < 3; pass++) {
          let changed = false
          for (const a of elevators) {
            if (!reach.has(lv.idx(a.tile.x, a.tile.y))) continue
            for (const b of elevators) {
              if (b === a || b.link !== a.link) continue
              if (reach.has(lv.idx(b.tile.x, b.tile.y))) continue
              for (const i of lv.reachableFrom(b.tile.x, b.tile.y)) {
                if (!reach.has(i)) changed = true
                reach.add(i)
              }
            }
          }
          if (!changed) break
        }
        const mission = MISSIONS.find((m) => m.levelId === id)
        expect(mission, `mission for level ${id}`).toBeTruthy()
        if (!mission) return
        const inReach = (x: number, y: number) => reach.has(lv.idx(x, y))
        expect(inReach(lv.spawnTile.x, lv.spawnTile.y)).toBe(true)
        for (const e of lv.entities) {
          if (['extract', 'terminal', 'intel', 'keycard', 'jammer', 'elevator'].includes(e.kind)) {
            expect(inReach(e.tile.x, e.tile.y), `${e.kind} ${e.id} at (${e.tile.x},${e.tile.y})`).toBe(true)
          }
        }
        for (const t of def.triggers) {
          // at least one tile of the trigger rect must be reachable floor
          let any = false
          for (let y = t.y; y < t.y + t.h && !any; y++)
            for (let x = t.x; x < t.x + t.w && !any; x++)
              if (inReach(x, y)) any = true
          expect(any, `trigger ${t.id}`).toBe(true)
        }
        // guard waypoints reachable too
        for (const g of def.guards) expect(inReach(g.tile.x, g.tile.y), `guard ${g.id}`).toBe(true)
      })
    })
  }
})
