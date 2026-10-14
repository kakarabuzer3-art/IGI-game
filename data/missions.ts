/**
 * SHADOW PROTOCOL — mission content. All narrative, codenames, characters and
 * dialogue are ORIGINAL creations for this game.
 *
 * The engine is data-driven: objectives resolve from triggers/entities/events,
 * never from hardcoded render logic.
 */

import type { MissionDef } from '@/engine/core/types'

export const MISSION_NIGHTFALL: MissionDef = {
  id: 'nightfall',
  index: 1,
  codeName: 'NIGHTFALL',
  title: 'Operation Nightfall',
  levelId: 'greyline-perimeter',
  difficulty: 1,
  newMechanic: 'Movement, noise discipline, light & shadow, line of sight, terminals.',
  briefing: {
    location: 'GREYLINE STATION — REMOTE SIGNALS FACILITY, VALLEY DISTRICT',
    threatLevel: 'MODERATE',
    insertion: 'FOOT PATROL — SOUTH RIDGE, 0200 HRS',
    lines: [
      'Greyline Station logs encrypted burst traffic every night at 0200. Nobody has ever asked who it is talking to.',
      'Tonight we ask. Cross the fence, reach the warehouse comms room, and take a copy of the traffic log.',
      'The yard is lit and watched. Darkness is your armor — stay out of the floodlight pools and move slow.',
      'A clean in-and-out. Nobody knows you were there.',
    ],
  },
  insertionRadio: [
    { speaker: 'HANDLER', text: 'You are dark and inside the valley. Greyline is ahead. Good hunting.' },
  ],
  objectives: [
    { id: 'infiltrate', type: 'reach', title: 'Breach the perimeter',
      description: 'Cross the fence line and enter the station yard.', triggerId: 't-infiltrate' },
    { id: 'terminal', type: 'interact', title: 'Access the comms terminal',
      description: 'Kill the camera network and release the office maglock.', entityId: 'comm-terminal' },
    { id: 'data', type: 'retrieve', title: 'Retrieve the encrypted data',
      description: 'Copy the burst-traffic log from the station office.', entityId: 'mission-data' },
    { id: 'extract', type: 'escape', title: 'Reach extraction',
      description: 'Signal extraction at the south-east tree line.' },
  ],
  extraction: { label: 'SIGNAL EXTRACTION', holdSeconds: 4 },
}

export const MISSION_DEEP_ENTRY: MissionDef = {
  id: 'deep-entry',
  index: 2,
  codeName: 'DEEP ENTRY',
  title: 'Operation Deep Entry',
  levelId: 'greyline-underground',
  difficulty: 2,
  newMechanic: 'Keycards, camera networks, elevators, surveillance hub disable chain.',
  briefing: {
    location: 'GREYLINE STATION — CHECKPOINT & SUBLEVEL',
    threatLevel: 'HIGH',
    insertion: 'FOOT PATROL — SOUTH APPROACH ROAD, 0130 HRS',
    lines: [
      'The traffic log pointed underground. Greyline runs its real operation from a sublevel beneath the checkpoint.',
      'The checkpoint is staffed around the clock. The duty office holds a master keycard — the lift building will not open without one.',
      'On the sublevel: a surveillance hub watches every door. Disable it before you touch the control room mainframe.',
      'Deployment manifests are what we need. Who Greyline is feeding, and where the shipments go.',
    ],
  },
  insertionRadio: [
    { speaker: 'HANDLER', text: 'Insertion clean. The checkpoint floodlights are on the north timer — you have shadow to work with.' },
  ],
  objectives: [
    { id: 'enter-complex', type: 'reach', title: 'Enter the complex',
      description: 'Get past the fence line into the station complex.', triggerId: 't-enter-complex' },
    { id: 'keycard', type: 'retrieve', title: 'Acquire the guard keycard',
      description: 'The checkpoint duty office holds a master keycard.', entityId: 'guard-keycard' },
    { id: 'descend', type: 'interact', title: 'Take the freight elevator down',
      description: 'The lift building on the ridge leads to the sublevel.', entityId: 'elev-a' },
    { id: 'cams', type: 'disable', title: 'Disable the surveillance hub',
      description: 'Kill the sublevel camera network and release the control room seal.', entityId: 'sec-hub' },
    { id: 'mainframe', type: 'interact', title: 'Pull the deployment manifests',
      description: 'Copy shipment data from the control room mainframe.', entityId: 'mainframe' },
    { id: 'extract', type: 'escape', title: 'Reach extraction',
      description: 'Slip out through the drainage outlet, east end of the sublevel.' },
  ],
  extraction: { label: 'REACH DRAINAGE OUTLET', holdSeconds: 3 },
}

export const MISSION_BLACK_SIGNAL: MissionDef = {
  id: 'black-signal',
  index: 3,
  codeName: 'BLACK SIGNAL',
  title: 'Operation Black Signal',
  levelId: 'greyline-research',
  difficulty: 3,
  newMechanic: 'Searchlights, signal jammer, hidden optional objectives, badge-locked labs.',
  briefing: {
    location: 'GREYLINE STATION — RESEARCH WING',
    threatLevel: 'SEVERE',
    insertion: 'FOOT PATROL — WEST FENCE BREACH, 0300 HRS',
    lines: [
      'The manifests named a project: BLACK SIGNAL. It lives in the research wing, behind a military sweep light and a badge-locked lab.',
      'A guard shack west of the yard feeds the sweep light. Cut its power and the yard goes blind.',
      'Dr. A. Voss runs the lab. Her badge opens everything — and her duty office is not empty at night.',
      'Recover the signal core. If you find her personal research notes... read them before you decide who we are working against.',
    ],
  },
  insertionRadio: [
    { speaker: 'HANDLER', text: 'You are at the breach. The sweep light rotates on a forty-second cycle. Time it.' },
  ],
  objectives: [
    { id: 'reach-wing', type: 'reach', title: 'Enter the research wing',
      description: 'Get inside the research building.', triggerId: 't-reach-wing' },
    { id: 'searchlight', type: 'disable', title: 'Kill the sweep light',
      description: 'Cut searchlight power at the guard shack.', entityId: 'sl-power' },
    { id: 'badge', type: 'retrieve', title: 'Find Dr. Voss\u2019s badge',
      description: 'Clearance 4 — it opens the main lab. Check the duty office.', entityId: 'research-badge' },
    { id: 'lab-terminal', type: 'interact', title: 'Archive the lab systems',
      description: 'Pull the lab terminal records before taking the core.', entityId: 'lab-terminal' },
    { id: 'signal', type: 'retrieve', title: 'Recover the signal core',
      description: 'The BLACK SIGNAL core is held in the main lab.', entityId: 'signal-core' },
    { id: 'notes', type: 'retrieve', title: 'Recover the research notes',
      description: 'Dr. Voss kept personal logs in the east annex.', entityId: 'research-notes',
      optional: true, hidden: true },
    { id: 'extract', type: 'escape', title: 'Reach extraction',
      description: 'Ridge line, north of the wing.' },
  ],
  extraction: { label: 'SIGNAL RIDGE EXTRACTION', holdSeconds: 4 },
  carryOver: { alertnessBonus: 0.2 },
}

export const MISSION_EXTRACTION: MissionDef = {
  id: 'extraction',
  index: 4,
  codeName: 'EXTRACTION',
  title: 'Operation Extraction',
  levelId: 'greyline-core',
  difficulty: 4,
  newMechanic: 'Lockdown events, route sealing, QRF waves, decoy broadcasts, carry-over consequences.',
  briefing: {
    location: 'GREYLINE STATION — CORE FACILITY',
    threatLevel: 'EXTREME',
    insertion: 'SUBLEVEL DRAINAGE INSERT, 0400 HRS',
    lines: [
      'The core answered. Whatever BLACK SIGNAL woke up, Greyline is packing it for shipment at first light.',
      'You are already inside — sublevel store room. The facility will not stay quiet for long.',
      'Reach the comms room and broadcast our decoy signal. Their quick-reaction force will chase a ghost across the east sector.',
      'Then take the north stair to the helipad and do not look back. Whatever you did on the way in, they will remember it tonight.',
    ],
  },
  insertionRadio: [
    { speaker: 'HANDLER', text: 'Insert complete. You are under their feet. Move quiet — this building is one bad sound from lockdown.' },
  ],
  objectives: [
    { id: 'reach-comms', type: 'reach', title: 'Reach the comms room',
      description: 'Center of the ground floor. The decoy rig is waiting.', triggerId: 't-reach-comms' },
    { id: 'decoy', type: 'interact', title: 'Broadcast the decoy signal',
      description: 'Send their QRF chasing a ghost in the east sector.', entityId: 'decoy' },
    { id: 'reach-helipad', type: 'reach', title: 'Reach the helipad',
      description: 'North stair, then the pad. Extraction is inbound.', triggerId: 't-reach-helipad' },
    { id: 'extract', type: 'escape', title: 'Board the extraction',
      description: 'Hold the pad until the rotors arrive.' },
  ],
  extraction: { label: 'BOARD EXTRACTION', holdSeconds: 6 },
  carryOver: { alertnessBonus: 0.25, startAlert: 'alert' },
}

export const MISSIONS: MissionDef[] = [
  MISSION_NIGHTFALL,
  MISSION_DEEP_ENTRY,
  MISSION_BLACK_SIGNAL,
  MISSION_EXTRACTION,
]

export const MISSION_ORDER: string[] = MISSIONS.map((m) => m.id)

export function getMission(id: string): MissionDef | undefined {
  return MISSIONS.find((m) => m.id === id)
}

export function nextMissionId(id: string): string | null {
  const i = MISSION_ORDER.indexOf(id)
  return i >= 0 && i < MISSION_ORDER.length - 1 ? MISSION_ORDER[i + 1] : null
}
