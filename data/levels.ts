/**
 * SHADOW PROTOCOL — level content (ORIGINAL maps; tile-grid authored).
 *
 * Grid legend (terrain):
 *   '#' concrete wall   'B' paneled wall    'f' chain-link fence (blocks move, not sight)
 *   '.' interior floor  ',' exterior floor  '*' lit floor        'o' crate
 * Markers (parsed into entities; tile underneath is floor):
 *   'S' spawn  'X' extraction console  'D' door  'L' locked door  'T' terminal
 *   'C' camera (wall-mounted)  'K' keycard  'I' intel  'J' jammer  '~' light switch
 *   'V' elevator (paired via override.link)
 *
 * Rows are composed with R() so widths are exact by construction.
 */

import type { LevelDef } from '@/engine/core/types'

type Part = [char: string, count: number]
const R = (...parts: Part[]): string =>
  parts.map(([c, n]) => c.repeat(n)).join('')

/* ================================================================== */
/* M01 — GREYLINE STATION: PERIMETER & WAREHOUSE                       */
/* ================================================================== */

const M01_GRID: string[] = [
  R(['#', 44]),                                                                     // y0
  R(['#', 1], ['B', 42], ['#', 1]),                                                 // y1  warehouse north wall
  R(['#', 1], ['B', 1], ['.', 28], ['B', 1], ['.', 11], ['B', 1], ['#', 1]),        // y2
  R(['#', 1], ['B', 1], ['.', 3], ['o', 2], ['.', 6], ['o', 2], ['.', 15],
    ['B', 1], ['.', 3], ['T', 1], ['.', 7], ['B', 1], ['#', 1]),                    // y3  comms terminal (34,3)
  R(['#', 1], ['B', 1], ['.', 28], ['D', 1], ['.', 11], ['B', 1], ['#', 1]),        // y4  comms door (30,4)
  R(['#', 1], ['B', 1], ['.', 4], ['o', 2], ['.', 8], ['o', 2], ['.', 12],
    ['B', 1], ['.', 11], ['B', 1], ['#', 1]),                                       // y5
  R(['#', 1], ['B', 1], ['.', 28], ['B', 12], ['B', 1], ['#', 1]),                  // y6  office divider
  R(['#', 1], ['B', 1], ['.', 28], ['L', 1], ['.', 11], ['B', 1], ['#', 1]),        // y7  office maglock (30,7)
  R(['#', 1], ['B', 1], ['.', 6], ['o', 2], ['.', 20],
    ['B', 1], ['.', 4], ['I', 1], ['.', 6], ['B', 1], ['#', 1]),                    // y8  intel (35,8)
  R(['#', 1], ['B', 1], ['.', 28], ['B', 1], ['.', 11], ['B', 1], ['#', 1]),        // y9
  R(['#', 1], ['B', 1], ['B', 6], ['D', 1], ['B', 10], ['C', 1], ['B', 13],
    ['D', 1], ['B', 9], ['#', 1]),                                                  // y10 south wall: bays (8),(33); cam (19)
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y11 yard
  R(['#', 1], [',', 10], ['~', 1], [',', 31], ['#', 1]),                            // y12 floodlight switch (11,12)
  R(['#', 1], [',', 9], ['*', 3], [',', 16], ['*', 3], [',', 11], ['#', 1]),        // y13 lamp pools
  R(['#', 1], [',', 9], ['*', 3], [',', 16], ['*', 3], [',', 11], ['#', 1]),        // y14
  R(['#', 1], [',', 9], ['*', 3], [',', 16], ['*', 3], [',', 11], ['#', 1]),        // y15
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y16
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y17
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y18
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y19
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y20
  R(['#', 1], ['f', 4], [',', 2], ['f', 13], ['B', 7], ['f', 16], ['#', 1]),        // y21 fence: breach (5-6), checkpoint (20-26)
  R(['#', 1], [',', 18], ['B', 1], ['.', 5], ['B', 1], [',', 17], ['#', 1]),        // y22 checkpoint
  R(['#', 1], [',', 18], ['B', 1], ['.', 2], ['D', 1], ['.', 2], ['B', 1],
    [',', 17], ['#', 1]),                                                           // y23 checkpoint door (22,23)
  R(['#', 1], [',', 18], ['B', 3], [',', 1], ['B', 3], [',', 17], ['#', 1]),         // y24 checkpoint step-out
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y25
  R(['#', 1], [',', 10], ['#', 2], [',', 21], ['#', 3], [',', 6], ['#', 1]),        // y26 rocks
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y27
  R(['#', 1], [',', 4], ['S', 1], [',', 30], ['X', 1], [',', 6], ['#', 1]),         // y28 spawn (5,28) extract (36,28)
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y29
  R(['#', 1], [',', 42], ['#', 1]),                                                 // y30
  R(['#', 44]),                                                                     // y31
]

export const LEVEL_M01: LevelDef = {
  id: 'greyline-perimeter',
  name: 'GREYLINE STATION — PERIMETER',
  ambient: 'night',
  grid: M01_GRID,
  lamps: [
    { tile: { x: 11, y: 14 }, intensity: 1.1 },
    { tile: { x: 30, y: 14 }, intensity: 1.1 },
    { tile: { x: 22, y: 22 }, intensity: 0.7 },
    { tile: { x: 16, y: 5 }, intensity: 0.8 },
    { tile: { x: 36, y: 4 }, intensity: 0.8 },
  ],
  guards: [
    { id: 'g-yard', tile: { x: 20, y: 17 }, type: 'grunt',
      route: [{ x: 5, y: 17 }, { x: 38, y: 17 }, { x: 38, y: 12 }, { x: 20, y: 12 }] },
    { id: 'g-bay', tile: { x: 10, y: 5 }, type: 'grunt',
      route: [{ x: 4, y: 4 }, { x: 26, y: 4 }, { x: 26, y: 8 }, { x: 4, y: 8 }] },
    { id: 'g-gate', tile: { x: 22, y: 22 }, type: 'grunt', route: [{ x: 21, y: 22 }, { x: 23, y: 22 }] },
    { id: 'g-east', tile: { x: 35, y: 20 }, type: 'grunt',
      route: [{ x: 32, y: 20 }, { x: 40, y: 14 }, { x: 32, y: 12 }] },
  ],
  triggers: [
    { id: 't-radio-insert', x: 2, y: 26, w: 12, h: 6, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['You are at the southern fence line. Greyline Station is dark except for the yard floods.',
             'Two sentries rotate the yard. Find the breach — west side of the fence.'] },
    { id: 't-infiltrate', x: 1, y: 11, w: 42, h: 10, once: true, kind: 'objective', objectiveId: 'infiltrate' },
    { id: 't-radio-yard', x: 14, y: 12, w: 16, h: 8, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['There is a camera on the warehouse face covering the yard.',
             'Comms room, north-east corner. Kill the network before you cross open ground.'] },
    { id: 't-radio-bay', x: 2, y: 2, w: 28, h: 9, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['You are inside the warehouse. Comms room is the north-east partition.',
             'The office next to it is maglocked — the comms terminal should release it.'] },
  ],
  overrides: [
    { tile: { x: 34, y: 3 }, id: 'comm-terminal', label: 'ACCESS COMMS TERMINAL',
      effect: {
        disableCameras: true,
        unlockDoors: ['office-door'],
        radio: ['Uplink established. Camera network offline — the yard is dark.',
                'Office maglock released.'],
      } },
    { tile: { x: 30, y: 4 }, id: 'comms-door', label: 'OPEN COMMS DOOR' },
    { tile: { x: 30, y: 7 }, id: 'office-door', label: 'OFFICE — MAGLOCK SEALED' },
    { tile: { x: 35, y: 8 }, id: 'mission-data', label: 'RETRIEVE ENCRYPTED DATA',
      intelText: 'Burst traffic logged from the Greyline array. Encrypted, but it is ours now.' },
    { tile: { x: 11, y: 12 }, id: 'yard-lights', label: 'TOGGLE YARD FLOODLIGHTS', radius: 3 },
    { tile: { x: 19, y: 10 }, id: 'cam-yard', dir: 2 },
    { tile: { x: 8, y: 10 }, id: 'bay-door-west', label: 'OPEN BAY DOOR' },
    { tile: { x: 33, y: 10 }, id: 'bay-door-east', label: 'OPEN BAY DOOR' },
    { tile: { x: 36, y: 28 }, id: 'extract-m1', label: 'SIGNAL EXTRACTION', hold: 4 },
  ],
}

/* ================================================================== */
/* M02 — CHECKPOINT & UNDERGROUND                                      */
/* ================================================================== */

const EAST_SOLID: Part[] = [['#', 2], ['#', 18], ['#', 1]]

const M02_GRID: string[] = [
  R(['#', 40]),                                                                     // y0
  R(['#', 1], [',', 5], ['#', 3], [',', 10], ['#', 2], ['#', 18], ['#', 1]),        // y1  rocks
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y2
  R(['#', 1], [',', 1], ['B', 9], [',', 8], ...EAST_SOLID),                         // y3  lift building x2..10
  R(['#', 1], [',', 1], ['B', 1], ['.', 7], ['B', 1], [',', 8], ...EAST_SOLID),     // y4
  R(['#', 1], [',', 1], ['B', 1], ['.', 3], ['V', 1], ['.', 3], ['B', 1], [',', 8], ...EAST_SOLID), // y5 elevator (6,5)
  R(['#', 1], [',', 1], ['B', 1], ['.', 7], ['C', 1], [',', 8], ...EAST_SOLID),     // y6  cam (10,6)→E
  R(['#', 1], [',', 1], ['B', 1], ['.', 7], ['B', 1], [',', 8], ...EAST_SOLID),     // y7
  R(['#', 1], [',', 1], ['B', 1], ['.', 7], ['B', 1], [',', 8], ...EAST_SOLID),     // y8
  R(['#', 1], [',', 1], ['B', 4], ['L', 1], ['B', 4], [',', 8], ...EAST_SOLID),     // y9  lift-door (6,9)
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y10 complex yard
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y11
  R(['#', 1], [',', 4], ['*', 3], [',', 11], ...EAST_SOLID),                        // y12 pool x5..7
  R(['#', 1], [',', 4], ['*', 3], [',', 11], ...EAST_SOLID),                        // y13
  R(['#', 1], [',', 4], ['*', 3], [',', 6], ['*', 3], [',', 2], ['#', 1], ['C', 1], ['#', 18], ['#', 1]), // y14 cam (20,14)→W
  R(['#', 1], [',', 13], ['*', 3], [',', 2], ...EAST_SOLID),                        // y15 pool x14..16
  R(['#', 1], [',', 13], ['*', 3], [',', 2], ...EAST_SOLID),                        // y16
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y17
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y18
  R(['#', 1], [',', 4], ['B', 5], ['D', 1], ['B', 3], [',', 5], ...EAST_SOLID),     // y19 checkpoint N door (10,19)
  R(['#', 1], [',', 4], ['B', 1], ['.', 3], ['B', 1], ['.', 3], ['B', 1], [',', 5], ...EAST_SOLID), // y20
  R(['#', 1], [',', 4], ['B', 1], ['.', 1], ['K', 1], ['.', 1], ['D', 1], ['.', 3], ['B', 1], [',', 5], ...EAST_SOLID), // y21 keycard (7,21)
  R(['#', 1], [',', 4], ['B', 1], ['.', 3], ['B', 1], ['.', 3], ['B', 1], [',', 5], ...EAST_SOLID), // y22
  R(['#', 1], [',', 4], ['B', 5], ['D', 1], ['B', 3], [',', 5], ...EAST_SOLID),     // y23 checkpoint S door (10,23)
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y24
  R(['#', 1], ['f', 7], [',', 3], ['f', 8], ...EAST_SOLID),                         // y25 fence, gap x8..10
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y26
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y27
  R(['#', 1], [',', 5], ['#', 2], [',', 11], ...EAST_SOLID),                        // y28 rocks
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y29
  R(['#', 1], [',', 7], ['*', 3], [',', 8], ...EAST_SOLID),                         // y30 lit path to gate
  R(['#', 1], [',', 4], ['S', 1], [',', 13], ...EAST_SOLID),                        // y31 spawn (5,31)
  R(['#', 1], [',', 18], ...EAST_SOLID),                                            // y32
  R(['#', 40]),                                                                     // y33
]

// underground (east half) overlays rows y5..y27
const UG_ROWS: Record<number, Part[]> = {
  5:  [['B', 8]],                                                   // hall top wall x21-28
  6:  [['B', 1], ['.', 5], ['C', 1], ['B', 1]],                     // x22-26 ., cam (27,6)→S
  7:  [['B', 1], ['.', 3], ['V', 1], ['.', 2], ['B', 1]],           // elevator (25,7)
  8:  [['B', 1], ['.', 6], ['B', 1]],
  9:  [['B', 4], ['D', 1], ['B', 3]],                               // hall S door (25,9)
  10: [['#', 3], ['.', 3]],                                         // corridor x24-26
  11: [['#', 3], ['.', 3]],
  12: [['#', 3], ['.', 3]],
  13: [['#', 3], ['.', 3]],
  14: [['B', 4], ['D', 1], ['B', 13]],                               // hub/ctrl top wall, hub door (25,14)
  15: [['B', 1], ['.', 2], ['T', 1], ['.', 5], ['B', 2], ['.', 6], ['B', 1]], // sec-hub T (24,15)
  16: [['B', 1], ['.', 8], ['B', 2], ['.', 2], ['T', 1], ['.', 3], ['B', 1]], // mainframe T (34,16)
  17: [['B', 1], ['.', 2], ['o', 2], ['.', 4], ['L', 1], ['.', 7], ['B', 1]],        // ctrl-door (30,17) + passage x31
  18: [['B', 1], ['.', 8], ['B', 2], ['.', 6], ['B', 1]],
  19: [['B', 4], ['.', 1], ['B', 13]],                              // hub S, drain mouth (25,19)
  20: [['#', 3], ['.', 3]],
  21: [['#', 3], ['.', 3]],
  22: [['#', 3], ['.', 3]],
  23: [['#', 3], ['.', 12]],                                        // drain turns E
  24: [['#', 3], ['.', 11], ['X', 1]],                              // extract (35,24)
  25: [['#', 3], ['B', 12]],
}

// splice underground into the east half (x21..38) of each row
const M02_GRID_FINAL: string[] = M02_GRID.map((row, y) => {
  const ug = UG_ROWS[y]
  if (!ug) return row
  const head = row.slice(0, 21)          // x0..20
  const body = R(...ug)                  // x21..
  const tail = '#'.repeat(39 - (21 + body.length)) + '#' // pad to x38 then border x39
  return head + body + tail
})

export const LEVEL_M02: LevelDef = {
  id: 'greyline-underground',
  name: 'GREYLINE STATION — CHECKPOINT & SUBLEVEL',
  ambient: 'night',
  grid: M02_GRID_FINAL,
  lamps: [
    { tile: { x: 6, y: 13 }, intensity: 1.0 },
    { tile: { x: 15, y: 15 }, intensity: 1.0 },
    { tile: { x: 10, y: 30 }, intensity: 0.7 },
    { tile: { x: 9, y: 21 }, intensity: 0.6 },
    { tile: { x: 25, y: 7 }, intensity: 0.8, color: 0x9fd8c8 },
    { tile: { x: 26, y: 16 }, intensity: 0.9, color: 0x9fd8c8 },
    { tile: { x: 35, y: 16 }, intensity: 0.8, color: 0x8fb8d8 },
    { tile: { x: 30, y: 24 }, intensity: 0.4, color: 0x9fd8c8 },
  ],
  guards: [
    { id: 'g-cp', tile: { x: 11, y: 21 }, type: 'grunt', route: [{ x: 10, y: 20 }, { x: 12, y: 22 }] },
    { id: 'g-yard1', tile: { x: 8, y: 14 }, type: 'grunt',
      route: [{ x: 3, y: 11 }, { x: 16, y: 11 }, { x: 16, y: 17 }, { x: 3, y: 17 }] },
    { id: 'g-yard2', tile: { x: 14, y: 16 }, type: 'officer',
      route: [{ x: 12, y: 18 }, { x: 17, y: 12 }, { x: 8, y: 10 }] },
    { id: 'g-lift', tile: { x: 5, y: 6 }, type: 'grunt', route: [{ x: 4, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 5 }, { x: 4, y: 5 }] },
    { id: 'g-hall', tile: { x: 24, y: 8 }, type: 'grunt', route: [{ x: 23, y: 7 }, { x: 27, y: 8 }] },
    { id: 'g-hub', tile: { x: 26, y: 16 }, type: 'officer', route: [{ x: 23, y: 15 }, { x: 28, y: 18 }, { x: 23, y: 18 }] },
    { id: 'g-ctrl', tile: { x: 35, y: 16 }, type: 'grunt', route: [{ x: 33, y: 15 }, { x: 36, y: 18 }] },
    { id: 'g-drain', tile: { x: 25, y: 21 }, type: 'grunt', route: [{ x: 25, y: 20 }, { x: 25, y: 23 }, { x: 30, y: 23 }] },
  ],
  triggers: [
    { id: 't-radio-insert', x: 2, y: 28, w: 14, h: 5, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['Checkpoint ahead — staffed, lit, and watched. The duty office holds a master keycard.',
             'Or skip the gate: the lift building on the ridge takes you straight down. Your call.'] },
    { id: 't-enter-complex', x: 1, y: 10, w: 18, h: 9, once: true, kind: 'objective', objectiveId: 'enter-complex' },
    { id: 't-radio-yard', x: 2, y: 12, w: 16, h: 6, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['Surveillance hub is on the sublevel, off the elevator hall. Kill it before the control room.'] },
    { id: 't-radio-ug', x: 22, y: 6, w: 7, h: 4, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['Sublevel. Green lighting means the hub is running. Cameras are live down here.'] },
  ],
  overrides: [
    { tile: { x: 6, y: 5 }, id: 'elev-a', link: 'lift', label: 'USE FREIGHT ELEVATOR', hold: 2 },
    { tile: { x: 25, y: 7 }, id: 'elev-b', link: 'lift', label: 'USE FREIGHT ELEVATOR', hold: 2 },
    { tile: { x: 6, y: 9 }, id: 'lift-door', label: 'LIFT ROOM — KEYCARD REQUIRED' },
    { tile: { x: 30, y: 17 }, id: 'ctrl-door', label: 'CONTROL ROOM — SECURITY SEALED' },
    { tile: { x: 7, y: 21 }, id: 'guard-keycard', label: 'TAKE GUARD KEYCARD' },
    { tile: { x: 24, y: 15 }, id: 'sec-hub', label: 'DISABLE SURVEILLANCE HUB', hold: 4,
      effect: {
        disableCameras: true,
        unlockDoors: ['ctrl-door'],
        radio: ['Surveillance hub dark. Control room seal released.'],
      } },
    { tile: { x: 34, y: 16 }, id: 'mainframe', label: 'ACCESS MAINFRAME', hold: 4,
      effect: { completeObjective: 'mainframe', radio: ['Deployment manifests copied. Greyline is feeding someone else\u2019s war.'] } },
    { tile: { x: 10, y: 6 }, id: 'cam-lift', dir: 1 },
    { tile: { x: 20, y: 14 }, id: 'cam-yard2', dir: 3 },
    { tile: { x: 27, y: 6 }, id: 'cam-hall', dir: 2 },
    { tile: { x: 35, y: 24 }, id: 'extract-m2', label: 'REACH DRAINAGE OUTLET', hold: 3 },
    { tile: { x: 25, y: 9 }, id: 'hall-door', label: 'OPEN HALL DOOR' },
  ],
}

/* ================================================================== */
/* M03 — RESEARCH WING (BLACK SIGNAL)                                  */
/* ================================================================== */

const M03_GRID: string[] = [
  R(['#', 40]),                                                                      // y0
  R(['#', 1], [',', 15], ['#', 4], [',', 19], ['#', 1]),                             // y1  ridge rocks
  R(['#', 1], [',', 17], ['X', 1], [',', 20], ['#', 1]),                             // y2  ridge extract (18,2)
  R(['#', 1], [',', 17], ['.', 1], [',', 20], ['#', 1]),                             // y3  ridge path
  R(['#', 1], [',', 7], ['B', 24], [',', 7], ['#', 1]),                              // y4  wing north wall x8..31
  R(['#', 1], [',', 7], ['B', 4], ['.', 16], ['B', 4], [',', 7], ['#', 1]),          // y5  corridor x12..27
  R(['#', 1], [',', 7], ['B', 4], ['.', 16], ['B', 4], [',', 7], ['#', 1]),          // y6
  R(['#', 1], [',', 7], ['B', 4], ['.', 16], ['B', 4], [',', 7], ['#', 1]),          // y7
  R(['#', 1], [',', 7], ['B', 5], ['D', 1], ['B', 3], ['D', 1], ['B', 4], ['L', 1],
    ['B', 3], ['D', 1], ['B', 5], [',', 7], ['#', 1]),                               // y8  doors: store(13) duty(17) lab L(22) annex(26)
  R(['#', 1], [',', 7], ['B', 4], ['.', 3], ['B', 1], ['.', 3], ['B', 1], ['.', 5],
    ['B', 1], ['.', 2], ['B', 4], [',', 7], ['#', 1]),                                // y9  rooms
  R(['#', 1], ['B', 6], [',', 1], ['B', 4], ['.', 1], ['o', 1], ['.', 1], ['B', 1],
    ['.', 1], ['K', 1], ['.', 1], ['B', 1], ['.', 2], ['I', 1], ['.', 2], ['B', 1],
    ['I', 1], ['.', 1], ['B', 4], [',', 1], ['B', 6], ['#', 1]),                     // y10 badge(17) core(22) notes(26); shack+pool tops
  R(['#', 1], ['B', 1], ['.', 1], ['T', 1], ['.', 2], ['B', 1], [',', 1], ['B', 4],
    ['.', 3], ['B', 1], ['.', 3], ['B', 1], ['.', 2], ['T', 1], ['.', 2], ['B', 1],
    ['.', 2], ['B', 4], [',', 1], ['B', 1], ['J', 1], ['.', 3], ['B', 1], ['#', 1]), // y11 sl-power(3) lab-term(22) jammer(34)
  R(['#', 1], ['B', 1], ['.', 4], ['B', 1], [',', 1], ['B', 4], ['.', 3], ['B', 1],
    ['.', 3], ['B', 1], ['.', 5], ['B', 1], ['.', 2], ['B', 4], [',', 1], ['D', 1],
    ['J', 1], ['.', 3], ['B', 1], ['#', 1]),                                          // y12 sl-power(3) lab-T(22) pool door(33) jammer(34)
  R(['#', 1], ['B', 1], ['.', 4], ['B', 1], [',', 1], ['B', 4], ['.', 3], ['B', 1],
    ['.', 3], ['B', 1], ['.', 5], ['B', 1], ['.', 2], ['B', 4], [',', 1], ['B', 1],
    ['.', 4], ['B', 1], ['#', 1]),                                                   // y13
  R(['#', 1], ['B', 3], ['D', 1], ['B', 2], [',', 1], ['B', 10], ['D', 1], ['B', 13],
    [',', 1], ['B', 6], ['#', 1]),                                                    // y14 shack door(4); lobby door(18); pool
  R(['#', 1], [',', 4], ['*', 3], [',', 11], [',', 7], ['*', 3], [',', 10], ['#', 1]),  // y15 lamp pools
  R(['#', 1], [',', 17], ['*', 3], [',', 18], ['#', 1]),                             // y16 approach lights x18..20
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y17
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y18 yard
  R(['#', 1], [',', 17], ['#', 5], [',', 16], ['#', 1]),                             // y19 tower x18..22
  R(['#', 1], [',', 17], ['#', 2], ['C', 1], ['#', 2], [',', 16], ['#', 1]),         // y20 SEARCHLIGHT (20,20)
  R(['#', 1], [',', 17], ['#', 5], [',', 16], ['#', 1]),                             // y21
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y22
  R(['#', 1], [',', 6], ['#', 2], [',', 22], ['#', 2], [',', 6], ['#', 1]),          // y23 rocks
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y24
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y25
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y26
  R(['#', 1], ['f', 5], [',', 3], ['f', 21], [',', 2], ['f', 7], ['#', 1]),          // y27 breach x6-8, service x30-31
  R(['#', 1], [',', 38], ['#', 1]),                                                  // y28
  R(['#', 1], [',', 5], ['S', 1], [',', 32], ['#', 1]),                              // y29 spawn (6,29)
]

export const LEVEL_M03: LevelDef = {
  id: 'greyline-research',
  name: 'GREYLINE STATION — RESEARCH WING',
  ambient: 'night',
  grid: M03_GRID,
  lamps: [
    { tile: { x: 6, y: 15 }, intensity: 0.9 },
    { tile: { x: 27, y: 15 }, intensity: 0.9 },
    { tile: { x: 20, y: 16 }, intensity: 0.8 },
    { tile: { x: 18, y: 6 }, intensity: 0.7, color: 0xd8c89f },
    { tile: { x: 22, y: 10 }, intensity: 0.8, color: 0xa8c8e8 },
    { tile: { x: 3, y: 12 }, intensity: 0.4 },
  ],
  guards: [
    { id: 'g-yard-w', tile: { x: 10, y: 20 }, type: 'grunt',
      route: [{ x: 4, y: 24 }, { x: 14, y: 24 }, { x: 14, y: 17 }, { x: 4, y: 17 }] },
    { id: 'g-yard-e', tile: { x: 28, y: 20 }, type: 'grunt',
      route: [{ x: 26, y: 24 }, { x: 35, y: 24 }, { x: 35, y: 17 }, { x: 26, y: 17 }] },
    { id: 'g-gate', tile: { x: 19, y: 25 }, type: 'grunt', route: [{ x: 12, y: 25 }, { x: 28, y: 25 }] },
    { id: 'g-corridor', tile: { x: 15, y: 6 }, type: 'officer',
      route: [{ x: 13, y: 5 }, { x: 27, y: 5 }, { x: 27, y: 7 }, { x: 13, y: 7 }] },
    { id: 'g-lab', tile: { x: 21, y: 10 }, type: 'grunt',
      route: [{ x: 21, y: 10 }, { x: 23, y: 10 }, { x: 23, y: 12 }, { x: 21, y: 12 }] },
    { id: 'g-lobby', tile: { x: 16, y: 13 }, type: 'grunt', route: [{ x: 13, y: 6 }, { x: 26, y: 6 }] },
  ],
  triggers: [
    { id: 't-radio-insert', x: 2, y: 27, w: 16, h: 3, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['The research wing. That sweep light is military grade — it will find you in the open.',
             'Guard shack, west of the yard. Cut its power at the source.'] },
    { id: 't-reach-wing', x: 12, y: 5, w: 16, h: 9, once: true, kind: 'objective', objectiveId: 'reach-wing' },
    { id: 't-reveal-notes', x: 20, y: 5, w: 8, h: 3, once: true, kind: 'reveal', objectiveId: 'notes' },
    { id: 't-radio-notes', x: 20, y: 5, w: 8, h: 3, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['Wait — the manifest mentions personal research logs in the east annex. Dr. Voss kept her own notes.',
             'Optional. But if BLACK SIGNAL has a conscience, it is in that room.'] },
    { id: 't-radio-lab', x: 20, y: 9, w: 5, h: 5, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['The core will be in the main lab — badge access only. Check the duty office.'] },
  ],
  overrides: [
    { tile: { x: 20, y: 20 }, id: 'searchlight', variant: 'searchlight', dir: 2 },
    { tile: { x: 3, y: 11 }, id: 'sl-power', label: 'CUT SEARCHLIGHT POWER', hold: 3,
      effect: { disableCameras: true, completeObjective: 'searchlight',
        radio: ['Searchlight dark. The yard is yours — move before someone resets the breaker.'] } },
    { tile: { x: 17, y: 10 }, id: 'research-badge', label: 'TAKE RESEARCH BADGE',
      intelText: 'DR. A. VOSS — CLEARANCE 4. Someone left in a hurry.' },
    { tile: { x: 22, y: 10 }, id: 'signal-core', label: 'RECOVER SIGNAL CORE',
      intelText: 'The BLACK SIGNAL core. Cold, heavy, humming at a frequency you feel in your teeth.' },
    { tile: { x: 26, y: 10 }, id: 'research-notes', label: 'RECOVER RESEARCH NOTES',
      intelText: 'Voss\u2019s notes: \u201CIt is not a beacon. It is an answer. God help us — something replied.\u201D' },
    { tile: { x: 22, y: 11 }, id: 'lab-terminal', label: 'ACCESS LAB TERMINAL', hold: 3,
      effect: { completeObjective: 'lab-terminal', revealObjective: 'notes',
        radio: ['Lab systems archived. Whatever BLACK SIGNAL is, it woke up three weeks ago.'] } },
    { tile: { x: 34, y: 11 }, id: 'jammer', label: 'TAKE SIGNAL JAMMER', charges: 2 },
    { tile: { x: 22, y: 8 }, id: 'lab-door', label: 'MAIN LAB — BADGE REQUIRED' },
    { tile: { x: 13, y: 8 }, id: 'store-door', label: 'OPEN STORE ROOM' },
    { tile: { x: 17, y: 8 }, id: 'duty-door', label: 'OPEN DUTY OFFICE' },
    { tile: { x: 26, y: 8 }, id: 'annex-door', label: 'OPEN EAST ANNEX' },
    { tile: { x: 4, y: 14 }, id: 'shack-door', label: 'OPEN SHACK DOOR' },
    { tile: { x: 33, y: 12 }, id: 'pool-door', label: 'OPEN MOTOR POOL' },
    { tile: { x: 18, y: 14 }, id: 'lobby-door', label: 'OPEN LOBBY DOOR' },
    { tile: { x: 18, y: 2 }, id: 'extract-m3', label: 'SIGNAL RIDGE EXTRACTION', hold: 4 },
  ],
}

/* ================================================================== */
/* M04 — CORE FACILITY / LOCKDOWN EXTRACTION                           */
/* ================================================================== */

const M04_GRID: string[] = [
  R(['#', 44]),                                                                      // y0
  R(['#', 1], [',', 26], ['#', 16], ['#', 1]),                                       // y1
  R(['#', 1], [',', 26], ['B', 1], ['*', 8], ['B', 1], [',', 6], ['#', 1]),          // y2  helipad rim x28..36
  R(['#', 1], [',', 26], ['B', 1], ['*', 2], ['X', 1], ['*', 5], ['B', 1], [',', 6], ['#', 1]), // y3 extract (31,3)
  R(['#', 1], [',', 26], ['B', 1], ['*', 8], ['B', 1], [',', 6], ['#', 1]),          // y4
  R(['#', 1], [',', 26], ['B', 3], ['D', 1], ['B', 6], [',', 6], ['#', 1]),          // y5  helipad door (30,5)
  R(['#', 1], [',', 42], ['#', 1]),                                                  // y6
  R(['#', 1], [',', 6], ['B', 23], ['D', 1], ['B', 4], [',', 8], ['#', 1]),          // y7  north stair door (30,7)
  R(['#', 1], [',', 6], ['B', 1], ['.', 26], ['B', 1], [',', 8], ['#', 1]),          // y8  corridor x8..33
  R(['#', 1], [',', 6], ['B', 1], ['.', 5], ['B', 1], ['.', 3], ['B', 1], ['.', 10],
    ['B', 1], ['.', 5], ['B', 1], [',', 8], ['#', 1]),                               // y9  partitions x13,x17,x28
  R(['#', 1], [',', 6], ['B', 1], ['.', 5], ['D', 1], ['.', 3], ['D', 1], ['.', 4],
    ['T', 1], ['.', 5], ['D', 1], ['.', 5], ['B', 1], [',', 8], ['#', 1]),           // y10 decoy terminal (22,10)
  R(['#', 1], [',', 6], ['B', 1], ['.', 5], ['B', 1], ['.', 3], ['B', 1], ['.', 10],
    ['B', 1], ['.', 5], ['B', 1], [',', 8], ['#', 1]),                               // y11
  R(['#', 1], [',', 6], ['B', 1], ['.', 26], ['B', 1], [',', 8], ['#', 1]),          // y12 main corridor
  R(['#', 1], [',', 6], ['B', 1], ['.', 26], ['B', 1], [',', 8], ['#', 1]),          // y13
  R(['#', 1], [',', 6], ['B', 12], ['D', 1], ['B', 1], ['C', 1], ['B', 6], ['D', 1],
    ['B', 6], [',', 8], ['#', 1]),                                                   // y14 airlock (19), cam (21), E door (28)
  R(['#', 1], [',', 6], ['B', 12], ['.', 1], [',', 23], ['#', 1]),                   // y15 stairwell x19
  R(['#', 1], [',', 6], ['B', 12], ['.', 1], [',', 23], ['#', 1]),                   // y16
  R(['#', 1], [',', 6], ['B', 12], ['.', 3], [',', 21], ['#', 1]),                   // y17 stair+drain x19..21
  R(['#', 1], [',', 6], ['B', 12], ['.', 2], ['D', 1], [',', 21], ['#', 1]),        // y18 drain door (21,18)
  R(['#', 1], [',', 6], ['B', 12], ['.', 3], [',', 21], ['#', 1]),                   // y19
  R(['#', 1], [',', 6], ['B', 1], ['.', 9], ['B', 1], ['.', 4], ['B', 21], ['#', 1]), // y20 sublevel top; drain x18..21
  R(['#', 1], [',', 6], ['B', 1], ['.', 9], ['B', 1], ['.', 4], ['B', 21], ['#', 1]), // y21
  R(['#', 1], [',', 6], ['B', 1], ['.', 9], ['D', 1], ['.', 1], ['o', 1], ['.', 2],
    ['B', 21], ['#', 1]),                                                            // y22 store door (17,22)
  R(['#', 1], [',', 6], ['B', 1], ['.', 3], ['o', 2], ['.', 4], ['B', 1], ['.', 4],
    ['B', 21], ['#', 1]),                                                            // y23 start room
  R(['#', 1], [',', 6], ['B', 1], ['S', 1], ['.', 8], ['B', 1], ['.', 4], ['B', 21], ['#', 1]), // y24 spawn (8,24)
  R(['#', 1], [',', 6], ['B', 1], ['.', 9], ['B', 1], ['.', 4], ['B', 21], ['#', 1]), // y25
  R(['#', 1], [',', 6], ['B', 11], ['.', 4], ['B', 21], ['#', 1]),                   // y26 sublevel bottom
  R(['#', 1], [',', 42], ['#', 1]),                                                  // y27
  R(['#', 1], [',', 42], ['#', 1]),                                                  // y28
  R(['#', 44]),                                                                      // y29
]

export const LEVEL_M04: LevelDef = {
  id: 'greyline-core',
  name: 'GREYLINE STATION — CORE FACILITY',
  ambient: 'underground',
  grid: M04_GRID,
  lamps: [
    { tile: { x: 31, y: 3 }, intensity: 1.2, color: 0xffd8a8 },
    { tile: { x: 14, y: 8 }, intensity: 0.8 },
    { tile: { x: 28, y: 12 }, intensity: 0.8 },
    { tile: { x: 22, y: 10 }, intensity: 0.6, color: 0x9fd8c8 },
    { tile: { x: 19, y: 17 }, intensity: 0.35, color: 0x9fd8c8 },
    { tile: { x: 12, y: 23 }, intensity: 0.6, color: 0x9fd8c8 },
  ],
  guards: [
    { id: 'g-sub1', tile: { x: 20, y: 17 }, type: 'grunt', route: [{ x: 20, y: 16 }, { x: 20, y: 19 }] },
    { id: 'g-corridor-w', tile: { x: 12, y: 12 }, type: 'grunt',
      route: [{ x: 10, y: 12 }, { x: 19, y: 12 }, { x: 19, y: 8 }, { x: 10, y: 8 }] },
    { id: 'g-corridor-e', tile: { x: 30, y: 12 }, type: 'officer',
      route: [{ x: 24, y: 13 }, { x: 33, y: 13 }, { x: 33, y: 8 }, { x: 24, y: 8 }] },
    { id: 'g-start', tile: { x: 10, y: 23 }, type: 'grunt',
      route: [{ x: 9, y: 21 }, { x: 16, y: 21 }, { x: 16, y: 25 }, { x: 9, y: 25 }] },
    { id: 'g-comms', tile: { x: 23, y: 11 }, type: 'grunt', route: [{ x: 19, y: 10 }, { x: 26, y: 10 }] },
    { id: 'g-heli', tile: { x: 31, y: 6 }, type: 'officer',
      route: [{ x: 29, y: 6 }, { x: 34, y: 6 }, { x: 34, y: 2 }, { x: 29, y: 2 }] },
    { id: 'g-qrf1', tile: { x: 29, y: 6 }, type: 'officer', wave: 1,
      route: [{ x: 24, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 13 }] },
    { id: 'g-qrf2', tile: { x: 33, y: 8 }, type: 'grunt', wave: 1,
      route: [{ x: 30, y: 13 }, { x: 20, y: 13 }, { x: 12, y: 8 }] },
    { id: 'g-qrf3', tile: { x: 10, y: 8 }, type: 'grunt', wave: 1,
      route: [{ x: 12, y: 13 }, { x: 24, y: 13 }, { x: 30, y: 8 }] },
  ],
  triggers: [
    { id: 't-radio-insert', x: 7, y: 20, w: 11, h: 7, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['You are in the sublevel. Whatever you did on the way in, Greyline is nervous tonight.',
             'Comms room, center of the ground floor. Broadcast the decoy, then get to the helipad.'] },
    { id: 't-reach-comms', x: 18, y: 9, w: 10, h: 3, once: true, kind: 'objective', objectiveId: 'reach-comms' },
    { id: 't-lockdown', x: 8, y: 12, w: 26, h: 2, once: true, kind: 'lockdown' },
    { id: 't-reach-helipad', x: 28, y: 2, w: 9, h: 3, once: true, kind: 'objective', objectiveId: 'reach-helipad' },
    { id: 't-radio-heli', x: 28, y: 2, w: 9, h: 3, once: true, kind: 'radio', speaker: 'HANDLER',
      text: ['Rotors two minutes out. Hold the pad. Do not let them pin you on it.'] },
  ],
  overrides: [
    { tile: { x: 19, y: 14 }, id: 'airlock-mid', lockdown: true, label: 'MAIN STAIRWELL — AIRLOCK' },
    { tile: { x: 28, y: 14 }, id: 'door-east', lockdown: true, label: 'EAST STAIR DOOR' },
    { tile: { x: 21, y: 18 }, id: 'drain-door', label: 'DRAINAGE ACCESS' },
    { tile: { x: 17, y: 22 }, id: 'start-door', label: 'OPEN STORE DOOR' },
    { tile: { x: 22, y: 10 }, id: 'decoy', label: 'BROADCAST DECOY SIGNAL', hold: 4,
      effect: { completeObjective: 'decoy',
        radio: ['Decoy broadcast live — every radio in the valley just heard a ghost in the east sector.',
                'Their quick-reaction force will chase it. You have a window. Go.'] } },
    { tile: { x: 21, y: 14 }, id: 'cam-comms', dir: 0 },
    { tile: { x: 30, y: 7 }, id: 'north-door', label: 'NORTH STAIR DOOR' },
    { tile: { x: 30, y: 5 }, id: 'heli-door', label: 'HELIPAD ACCESS' },
    { tile: { x: 30, y: 3 }, id: 'extract-m4', label: 'BOARD EXTRACTION', hold: 6 },
  ],
}

/* ================================================================== */

export const LEVELS: Record<string, LevelDef> = {
  [LEVEL_M01.id]: LEVEL_M01,
  [LEVEL_M02.id]: LEVEL_M02,
  [LEVEL_M03.id]: LEVEL_M03,
  [LEVEL_M04.id]: LEVEL_M04,
}
