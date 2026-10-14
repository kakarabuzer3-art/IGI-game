/** localStorage persistence for settings + campaign progress. SSR-safe. */

import {
  DEFAULT_SETTINGS,
  type GameSettings,
  type MissionGrade,
  type Progress,
} from '@/engine/core/types'

const SETTINGS_KEY = 'sp_settings_v1'
const PROGRESS_KEY = 'sp_progress_v1'

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return { ...fallback, ...(JSON.parse(raw) as object) } as T
  } catch {
    return fallback
  }
}

export function loadSettings(): GameSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS }
  const s = safeParse<GameSettings>(
    localStorage.getItem(SETTINGS_KEY),
    DEFAULT_SETTINGS,
  )
  // respect OS reduced-motion as the default on first run
  if (localStorage.getItem(SETTINGS_KEY) === null) {
    s.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }
  return s
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable (private mode) — non-fatal */
  }
}

const EMPTY_PROGRESS: Progress = { grades: {}, unlocked: ['nightfall'] }

export function loadProgress(): Progress {
  if (typeof window === 'undefined') return { ...EMPTY_PROGRESS }
  return safeParse<Progress>(localStorage.getItem(PROGRESS_KEY), EMPTY_PROGRESS)
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    /* non-fatal */
  }
}

const GRADE_RANK: Record<MissionGrade, number> = {
  ghost: 0,
  shadow: 1,
  operative: 2,
  compromised: 3,
}

export function recordGrade(p: Progress, missionId: string, grade: MissionGrade): Progress {
  const prev = p.grades[missionId]
  const next: Progress = {
    grades: { ...p.grades },
    unlocked: [...p.unlocked],
  }
  if (!prev || GRADE_RANK[grade] < GRADE_RANK[prev]) next.grades[missionId] = grade
  return next
}
