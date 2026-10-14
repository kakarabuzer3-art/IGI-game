/**
 * SHADOW PROTOCOL — shared engine types.
 * Single source of truth for game-state shapes used by systems and UI snapshots.
 * Pure types only — no runtime code, safe to import anywhere.
 */

export interface Vec2 {
  x: number
  y: number
}

/* ------------------------------------------------------------------ */
/* World / level data (authored in data/levels.ts)                     */
/* ------------------------------------------------------------------ */

export type AmbientPreset = 'night' | 'interior' | 'underground' | 'lab'

/** Grid legend (terrain only; interactive content comes from entities):
 *  '#' concrete wall   'B' paneled/metal wall   'f' chain-link fence (blocks move, NOT sight)
 *  '.' interior floor  ',' exterior/dark floor  '*' lit floor
 *  'o' crate (solid)   'S' player spawn marker  (parsed out as spawn point)
 */
export interface TriggerDef {
  id: string
  /** tile-space rect */
  x: number
  y: number
  w: number
  h: number
  once: boolean
  kind: 'objective' | 'radio' | 'reveal' | 'lockdown'
  /** radio dialogue lines */
  text?: string[]
  speaker?: string
  /** objective id for 'objective'/'reveal' kinds */
  objectiveId?: string
}

export interface TerminalEffect {
  disableCameras?: boolean
  unlockDoors?: string[]
  closeDoors?: string[]
  completeObjective?: string
  revealObjective?: string
  radio?: string[]
  /** broadcast a decoy: all non-combat guards investigate this tile-space position */
  decoyPos?: Vec2
}

export interface EntityOverride {
  /** tile coordinate — matches the marker char parsed from the grid */
  tile: Vec2
  id?: string
  label?: string
  /** facing 0=N 1=E 2=S 3=W (cameras, searchlights, terminals) */
  dir?: 0 | 1 | 2 | 3
  /** for terminals */
  effect?: TerminalEffect
  /** elevator pair link id */
  link?: string
  /** doors: auto-locks during lockdown events */
  lockdown?: boolean
  /** light switch radius (tiles) */
  radius?: number
  /** camera: fixed sweep vs rotating searchlight */
  variant?: 'fixed' | 'searchlight'
  /** hold duration override (seconds) */
  hold?: number
  /** jammer charges */
  charges?: number
  /** intel flavor text shown in log on pickup */
  intelText?: string
}

export interface GuardDef {
  id: string
  tile: Vec2
  /** patrol waypoints in tile space; empty = static post */
  route: Vec2[]
  type: 'grunt' | 'officer'
  /** only spawns when this wave index is active (0 = always; used for lockdown reinforcements) */
  wave?: number
}

export interface LevelDef {
  id: string
  name: string
  ambient: AmbientPreset
  grid: string[]
  guards: GuardDef[]
  triggers: TriggerDef[]
  overrides?: EntityOverride[]
  /** extra point lights (tile space) — kept few for performance */
  lamps?: { tile: Vec2; color?: number; intensity?: number }[]
}

/* ------------------------------------------------------------------ */
/* Mission data (authored in data/missions.ts)                         */
/* ------------------------------------------------------------------ */

export type ObjectiveType =
  | 'reach'
  | 'inspect'
  | 'interact'
  | 'retrieve'
  | 'disable'
  | 'escape'

export type ObjectiveStatus = 'locked' | 'active' | 'completed' | 'failed'

export interface ObjectiveDef {
  id: string
  type: ObjectiveType
  title: string
  description: string
  optional?: boolean
  /** hidden until revealed by a trigger/entity (progressive disclosure) */
  hidden?: boolean
  /** resolved by entering trigger volume with this id */
  triggerId?: string
  /** resolved by interacting with entity with this id */
  entityId?: string
  /** resolved when facility event fires (e.g. 'cameras-offline') */
  event?: string
}

export interface MissionDef {
  id: string
  index: number
  codeName: string
  title: string
  levelId: string
  difficulty: 1 | 2 | 3 | 4
  briefing: {
    location: string
    threatLevel: string
    insertion: string
    lines: string[]
  }
  /** what this mission teaches (shown in briefing) */
  newMechanic: string
  objectives: ObjectiveDef[]
  /** one-line radio on insertion */
  insertionRadio: { speaker: string; text: string }[]
  extraction: {
    label: string
    holdSeconds: number
  }
  /** multipliers applied when prior missions were compromised (difficulty carry-over) */
  carryOver?: {
    /** extra guard alertness when any previous grade === 'compromised' */
    alertnessBonus?: number
    /** start facility at this alert level when previous mission ended in combat */
    startAlert?: AlertLevel
  }
}

/* ------------------------------------------------------------------ */
/* Runtime state                                                       */
/* ------------------------------------------------------------------ */

export type AlertLevel =
  | 'undetected'
  | 'suspicious'
  | 'alert'
  | 'searching'
  | 'combat'
  | 'lockdown'

export const ALERT_ORDER: AlertLevel[] = [
  'undetected',
  'suspicious',
  'alert',
  'searching',
  'combat',
  'lockdown',
]

export type GuardMode =
  | 'patrol'
  | 'idle'
  | 'suspicious'
  | 'investigate'
  | 'search'
  | 'combat'
  | 'returning'
  | 'downed'

export type EquipmentId = 'keycard' | 'jammer' | 'datacore' | 'intel'

export type DetectionLevel = 'hidden' | 'suspect' | 'spotted' | 'engaged'

export type MissionGrade = 'ghost' | 'shadow' | 'operative' | 'compromised'

export type GamePhase =
  | 'idle'
  | 'briefing'
  | 'insertion'
  | 'playing'
  | 'paused'
  | 'complete'
  | 'failed'

export interface ObjectiveRuntime extends ObjectiveDef {
  status: ObjectiveStatus
}

export interface RadioLine {
  id: number
  speaker: string
  text: string
  /** seconds since mission start */
  t: number
}

export interface MissionReportData {
  missionId: string
  codeName: string
  grade: MissionGrade
  success: boolean
  timeSeconds: number
  objectives: { title: string; optional: boolean; status: ObjectiveStatus }[]
  stats: {
    timesSpotted: number
    neutralizations: number
    maxAlert: AlertLevel
    intelFound: number
    detectedReasons: string[]
  }
}

/** Discrete snapshot pushed to React at <= 10 Hz + on events. */
export interface GameSnapshot {
  phase: GamePhase
  missionId: string
  codeName: string
  objectives: ObjectiveRuntime[]
  alert: { level: AlertLevel; reason: string | null }
  detection: DetectionLevel
  health: number
  stamina: number
  crouching: boolean
  sprinting: boolean
  equipment: EquipmentId[]
  jammerCharges: number
  jammerActive: boolean
  radioLog: RadioLine[]
  prompt: { label: string; kind: string } | null
  timeSeconds: number
  stats: MissionReportData['stats']
  holdProgress: number
  extractionArmed: boolean
}

/** Continuous values written imperatively every frame (no React renders). */
export interface FrameValues {
  yaw: number
  stamina: number
  health: number
  suspicion: number
  holdProgress: number
  fps: number
  bobPhase: number
}

export interface GameSettings {
  sensitivity: number
  invertY: boolean
  reducedMotion: boolean
  masterVolume: number
  sfxVolume: number
  ambientVolume: number
  highContrastHud: boolean
  radioSubtitles: boolean
  quality: 'auto' | 'low' | 'high'
}

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  invertY: false,
  reducedMotion: false,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambientVolume: 0.7,
  highContrastHud: false,
  radioSubtitles: true,
  quality: 'auto',
}

/** Persisted campaign progress. */
export interface Progress {
  /** best grade per mission id */
  grades: Record<string, MissionGrade>
  unlocked: string[]
}

/* ------------------------------------------------------------------ */
/* Engine events (EventBus contract between systems and UI)            */
/* ------------------------------------------------------------------ */

export interface GameEvents {
  'phase:change': GamePhase
  'snapshot': GameSnapshot
  'objective:update': { id: string; status: ObjectiveStatus; title: string }
  'objective:reveal': { id: string; title: string }
  'alert:change': { level: AlertLevel; reason: string | null }
  'radio': RadioLine
  'interaction:prompt': { label: string; kind: string } | null
  'sfx': { name: SfxName; x?: number; y?: number; gain?: number }
  'mission:complete': MissionReportData
  'mission:failed': MissionReportData
  'detection:spike': DetectionLevel
  'player:damage': number
  'world:event': string
  'world:noise': { pos: Vec2; radius: number; kind: string }
  'world:teleport': { x: number; y: number }
  'interaction:done': { entityId: string; kind: string }
  'settings:change': GameSettings
}

export type SfxName =
  | 'step'
  | 'stepMetal'
  | 'doorOpen'
  | 'doorLocked'
  | 'terminalStart'
  | 'terminalDone'
  | 'objective'
  | 'pickup'
  | 'takedown'
  | 'radioStatic'
  | 'alertSting'
  | 'spotted'
  | 'heartbeat'
  | 'damage'
  | 'switch'
  | 'cameraDown'
  | 'elevator'
  | 'extract'
  | 'uiClick'
  | 'jammer'
