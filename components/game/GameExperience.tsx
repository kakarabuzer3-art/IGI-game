'use client'

/**
 * GameExperience — React-side flow orchestrator.
 *   landing → mission select → briefing → gameplay → report → (loop)
 * Owns the Game instance, settings/progress persistence, and the imperative
 * fast lane (engine writes compass/bars directly to DOM each frame).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Game } from '@/engine/Game'
import {
  DEFAULT_SETTINGS,
  type FrameValues,
  type GamePhase,
  type GameSettings,
  type GameSnapshot,
  type MissionReportData,
  type Progress,
} from '@/engine/core/types'
import { COMPASS_HALF_WIDTH_DEG, HOLD_CIRCUMFERENCE } from '@/engine/core/fastLane'
import { MISSIONS, getMission, nextMissionId } from '@/data/missions'
import { loadProgress, loadSettings, recordGrade, saveProgress, saveSettings } from '@/lib/storage'
import GameCanvas from './GameCanvas'
import GameHUD from './GameHUD'
import MissionBriefing from './MissionBriefing'
import MissionReport from './MissionReport'
import MissionSelect from './MissionSelect'
import PauseMenu from './PauseMenu'
import SettingsPanel from './SettingsPanel'
import TouchControls from './TouchControls'

type View = 'idle' | 'select' | 'briefing' | 'game'
type StartOpts = { alertnessBonus?: number; startTense?: boolean }

export default function GameExperience() {
  const [view, setView] = useState<View>('idle')
  const [missionId, setMissionId] = useState<string>('nightfall')
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null)
  const [report, setReport] = useState<{ data: MissionReportData; success: boolean } | null>(null)
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS)
  const [progress, setProgress] = useState<Progress>({ grades: {}, unlocked: ['nightfall'] })
  const [showSettings, setShowSettings] = useState(false)
  const [touchMode, setTouchMode] = useState(false)
  const [locked, setLocked] = useState(false)
  const [game, setGame] = useState<Game | null>(null)

  const gameRef = useRef<Game | null>(null)
  const settingsRef = useRef(settings)
  const progressRef = useRef(progress)
  const pendingStart = useRef<{ id: string; opts: StartOpts } | null>(null)

  /* keep latest-value refs for engine callbacks (commit phase only) */
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  /* load persisted state once (standard localStorage hydration pattern —
     these one-shot synchronous updates are intentional) */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings())
    setProgress(loadProgress())
    setTouchMode(typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  }, [])

  /* fast lane — direct DOM writes via handles the HUD published, zero renders */
  const onFrame = useCallback((f: FrameValues) => {
    const h = gameRef.current?.fast
    if (!h) return
    if (h.compassTicks) {
      const bearing = (((f.yaw * 180) / Math.PI + 450) % 360)
      const pxPerDeg = 130 / COMPASS_HALF_WIDTH_DEG
      for (const tick of h.compassTicks) {
        if (!tick) continue
        const d = Number(tick.dataset.deg)
        const delta = ((d - bearing + 540) % 360) - 180
        if (Math.abs(delta) > COMPASS_HALF_WIDTH_DEG) {
          tick.style.opacity = '0'
          continue
        }
        tick.style.opacity = String(1 - Math.abs(delta) / (COMPASS_HALF_WIDTH_DEG * 1.6))
        tick.style.transform = `translateX(${130 + delta * pxPerDeg}px)`
      }
    }
    if (h.staminaBar) h.staminaBar.style.width = `${f.stamina}%`
    if (h.healthBar) {
      h.healthBar.style.width = `${f.health}%`
      h.healthBar.style.background = f.health < 35 ? 'var(--sp-red)' : 'var(--sp-green)'
    }
    if (h.suspicionFill) {
      h.suspicionFill.style.width = `${f.suspicion * 100}%`
      h.suspicionFill.style.background = f.suspicion > 0.55 ? 'var(--sp-red)' : 'var(--sp-amber)'
    }
    if (h.vignette) {
      const s = f.suspicion
      const op = s > 0.55 ? Math.min(0.85, (s - 0.55) * 2.2) : s > 0.25 ? (s - 0.25) * 0.6 : 0
      h.vignette.style.opacity = String(op)
      const cls = s > 0.55 ? 'sp-vignette' : 'sp-vignette sp-vignette-amber'
      if (h.vignette.className !== cls) h.vignette.className = cls
    }
    if (h.holdRing) {
      h.holdRing.style.strokeDashoffset = String(HOLD_CIRCUMFERENCE * (1 - f.holdProgress))
    }
    if (h.holdWrap) {
      const want = f.holdProgress > 0.015
      if ((h.holdWrap.style.display === 'flex') !== want) h.holdWrap.style.display = want ? 'flex' : 'none'
    }
  }, [])

  /* lazily create the Game instance (called from event handlers only) */
  const ensureGame = useCallback((): Game => {
    if (!gameRef.current) {
      const g = new Game(settingsRef.current, {
        onSnapshot: setSnapshot,
        onFrame,
        onPhase: setPhase,
        onLockChange: setLocked,
        onReport: (data, success) => {
          setReport({ data, success })
          if (success) {
            const next = recordGrade(progressRef.current, data.missionId, data.grade)
            const nid = nextMissionId(data.missionId)
            if (nid && !next.unlocked.includes(nid)) next.unlocked.push(nid)
            setProgress(next)
            saveProgress(next)
          }
        },
      })
      gameRef.current = g
      setGame(g)
    }
    return gameRef.current
  }, [onFrame])

  /* dispose on unmount */
  useEffect(() => {
    return () => {
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [])

  const applySettings = useCallback((s: GameSettings) => {
    setSettings(s)
    saveSettings(s)
    gameRef.current?.setSettings(s)
  }, [])

  const startMission = useCallback((id: string) => {
    ensureGame()
    const def = getMission(id)
    setMissionId(id)
    setReport(null)
    setView('game')
    // carry-over consequences from prior grades
    let opts: StartOpts = {}
    if (def?.carryOver) {
      const priorCompromised = MISSIONS.filter((m) => m.index < def.index).some(
        (m) => progressRef.current.grades[m.id] === 'compromised',
      )
      if (priorCompromised) {
        opts = { alertnessBonus: def.carryOver.alertnessBonus, startTense: true }
      }
    }
    // GameCanvas.onMounted fires right after; the mission starts there so
    // WebGL is guaranteed live
    pendingStart.current = { id, opts }
  }, [ensureGame])

  const onCanvasMounted = useCallback(() => {
    const g = gameRef.current
    const pending = pendingStart.current
    if (!g) return
    g.setSettings(settingsRef.current)
    if (pending) {
      pendingStart.current = null
      g.startMission(pending.id, pending.opts)
    } else if (g.currentMissionId) {
      // canvas remounted (e.g. React StrictMode dev double-mount): rebuild
      // the current mission against the fresh renderer
      g.restart()
    }
  }, [])

  const mission = getMission(missionId)
  const inGame = view === 'game' && game !== null
  const showPause = inGame && phase === 'paused' && !report && !showSettings
  const nextId = report ? nextMissionId(report.data.missionId) : null

  return (
    <>
      {/* landing entry point */}
      {view === 'idle' && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="sp-btn sp-btn-primary px-6 py-3 text-[13px]" onClick={() => setView('select')}>
            ▶ Initialize Operation
          </button>
          <button className="sp-btn px-4 py-3" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
          <span className="text-[10px] tracking-widest text-[var(--sp-text-dim)]">
            {touchMode ? 'TOUCH CONTROLS DETECTED — SIMPLIFIED TACTICAL MODE' : 'KEYBOARD + MOUSE RECOMMENDED'}
          </span>
        </div>
      )}

      {view === 'select' && (
        <MissionSelect
          missions={MISSIONS}
          progress={progress}
          onSelect={(id) => {
            setMissionId(id)
            setView('briefing')
          }}
          onBack={() => setView('idle')}
          onSettings={() => setShowSettings(true)}
        />
      )}

      {view === 'briefing' && mission && (
        <MissionBriefing
          mission={mission}
          reducedMotion={settings.reducedMotion}
          onStart={() => startMission(mission.id)}
          onBack={() => setView('select')}
        />
      )}

      {inGame && game && (
        <div className="fixed inset-0 z-30 bg-black">
          <GameCanvas game={game} onMounted={onCanvasMounted} />
          {snapshot && <GameHUD snapshot={snapshot} game={game} settings={settings} />}
          {touchMode && phase === 'playing' && <TouchControls game={game} />}
          {!touchMode && phase === 'playing' && !locked && !report && (
            <button
              className="absolute inset-0 z-20 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/45 text-[var(--sp-text)]"
              onClick={() => game.requestLock()}
              aria-label="Click to capture mouse and resume control"
            >
              <span className="text-sm tracking-[0.35em] text-[var(--sp-amber)]">CLICK TO TAKE CONTROL</span>
              <span className="text-[10px] tracking-[0.2em] text-[var(--sp-text-dim)]">
                MOUSE LOOK REQUIRES POINTER CAPTURE — ESC OPENS THE MENU
              </span>
            </button>
          )}
          {showPause && (
            <PauseMenu
              snapshot={snapshot}
              onResume={() => game.resume()}
              onRestart={() => game.restart()}
              onSettings={() => setShowSettings(true)}
              onAbort={() => {
                game.abort()
                setReport(null)
                setView('select')
              }}
            />
          )}
          {report && (
            <MissionReport
              report={report.data}
              hasNext={!!nextId && progress.unlocked.includes(nextId)}
              onRetry={() => {
                setReport(null)
                game.restart()
              }}
              onNext={() => {
                const nid = nextId
                setReport(null)
                if (nid) {
                  setMissionId(nid)
                  setView('briefing')
                }
              }}
              onMenu={() => {
                game.abort()
                setReport(null)
                setView('select')
              }}
            />
          )}
        </div>
      )}

      {showSettings && (
        <SettingsPanel settings={settings} onChange={applySettings} onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}
