'use client'

/**
 * GameHUD — minimal tactical HUD. All mission-critical information exists
 * here as accessible HTML (never canvas-only). Discrete state comes from
 * GameSnapshot (<=10 Hz); continuous values (compass, bars, vignette, hold
 * ring) are written imperatively by the engine via FastHandles — zero
 * React re-renders per frame.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Game } from '@/engine/Game'
import type { AlertLevel, GameSettings, GameSnapshot } from '@/engine/core/types'
import { formatTime } from '@/engine/core/math'
import { HOLD_CIRCUMFERENCE } from '@/engine/core/fastLane'

const ALERT_META: Record<AlertLevel, { text: string; glyph: string; color: string; pulse: boolean }> = {
  undetected: { text: 'UNDETECTED', glyph: '◡', color: '#43d67f', pulse: false },
  suspicious: { text: 'SUSPICIOUS', glyph: '?', color: '#ffc247', pulse: false },
  alert: { text: 'ALERT', glyph: '!', color: '#ff8a3d', pulse: true },
  searching: { text: 'SEARCHING', glyph: '⌕', color: '#ff8a3d', pulse: true },
  combat: { text: 'COMBAT', glyph: '✕', color: '#ff4433', pulse: true },
  lockdown: { text: 'LOCKDOWN', glyph: '⛔', color: '#ff4433', pulse: true },
}

const COMPASS_STEPS = Array.from({ length: 24 }, (_, i) => i * 15)
const LABELS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }

export default function GameHUD({
  snapshot,
  game,
  settings,
}: {
  snapshot: GameSnapshot
  game: Game
  settings: GameSettings
}) {
  const flashRef = useRef<HTMLDivElement>(null)
  const vignetteRef = useRef<HTMLDivElement>(null)
  const staminaRef = useRef<HTMLDivElement>(null)
  const healthWrapRef = useRef<HTMLDivElement>(null)
  const healthRef = useRef<HTMLDivElement>(null)
  const suspicionRef = useRef<HTMLDivElement>(null)
  const holdWrapRef = useRef<HTMLDivElement>(null)
  const holdRingRef = useRef<SVGCircleElement>(null)
  const compassRefs = useRef<(HTMLDivElement | null)[]>([])

  // damage flash via engine events (no React state)
  useEffect(() => {
    const off = game.bus.on('player:damage', () => {
      const el = flashRef.current
      if (!el) return
      el.classList.remove('hit')
      void el.offsetWidth
      el.classList.add('hit')
    })
    return off
  }, [game])

  // publish element handles to the engine (commit phase; re-run when the
  // prompt mounts/unmounts so conditional nodes stay linked)
  const promptKind = snapshot.prompt?.kind ?? null
  useEffect(() => {
    game.setFastHandles({
      vignette: vignetteRef.current,
      compassTicks: compassRefs.current,
      staminaBar: staminaRef.current,
      healthWrap: healthWrapRef.current,
      healthBar: healthRef.current,
      suspicionFill: suspicionRef.current,
      holdWrap: holdWrapRef.current,
      holdRing: holdRingRef.current,
    })
  }, [game, promptKind])

  const objectives = useMemo(() => snapshot.objectives, [snapshot])
  const firstActive = objectives.find((o) => o.status === 'active')
  const alert = ALERT_META[snapshot.alert.level]
  const promptKey = snapshot.prompt?.kind === 'takedown' ? 'F' : 'E'

  return (
    <div
      className={`sp-hud select-none ${settings.highContrastHud ? 'sp-high-contrast' : ''} ${settings.reducedMotion ? 'sp-reduced-motion' : ''}`}
    >
      {/* detection vignette + damage flash */}
      <div ref={vignetteRef} className="sp-vignette" />
      <div ref={flashRef} className="sp-damage-flash" />

      {/* crosshair */}
      <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />

      {/* top-left: mission + timer */}
      <div className="absolute left-3 top-3 md:left-4 md:top-4">
        <div className="sp-panel px-3 py-2">
          <div className="sp-label">Mission</div>
          <div className="text-[13px] tracking-[0.18em] text-[var(--sp-amber)]">
            {snapshot.codeName}
          </div>
          <div className="sp-label mt-1">
            T+ <span className="text-[var(--sp-text)]">{formatTime(snapshot.timeSeconds)}</span>
          </div>
        </div>
      </div>

      {/* top-center: compass (engine-driven ticks) */}
      <div className="absolute left-1/2 top-3 hidden h-9 w-[260px] -translate-x-1/2 overflow-hidden md:block">
        <div className="sp-panel relative h-full w-full">
          {COMPASS_STEPS.map((d, i) => (
            <div
              key={d}
              ref={(el) => { compassRefs.current[i] = el }}
              className="absolute left-0 top-1 flex flex-col items-center will-change-transform"
              style={{ opacity: 0 }}
              data-deg={d}
            >
              <div className={LABELS[d] ? 'h-2.5 w-px bg-[var(--sp-line-strong)]' : 'h-1.5 w-px bg-[var(--sp-line)]'} />
              {LABELS[d] && (
                <span className={`text-[9px] leading-3 ${d % 90 === 0 ? 'text-[var(--sp-amber)]' : 'text-[var(--sp-text-dim)]'}`}>
                  {LABELS[d]}
                </span>
              )}
            </div>
          ))}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--sp-amber)]/70" />
        </div>
      </div>

      {/* left: objectives (full list on md+) */}
      <div className="absolute left-3 top-24 hidden w-64 md:left-4 md:top-28 md:block">
        <div className="sp-panel px-3 py-2.5">
          <div className="sp-label mb-1.5">Objectives</div>
          <ul className="space-y-1.5">
            {objectives.map((o) => (
              <li key={o.id} className="flex items-start gap-2 text-[11px] leading-4">
                <span
                  aria-hidden
                  className={
                    o.status === 'completed'
                      ? 'text-[var(--sp-green)]'
                      : o.status === 'failed'
                        ? 'text-[var(--sp-red)]'
                        : 'text-[var(--sp-amber)]'
                  }
                >
                  {o.status === 'completed' ? '✓' : o.status === 'failed' ? '✕' : '○'}
                </span>
                <span
                  className={
                    o.status === 'completed'
                      ? 'text-[var(--sp-text-dim)] line-through decoration-[var(--sp-green)]/50'
                      : 'text-[var(--sp-text)]'
                  }
                >
                  {o.title}
                  {o.optional && (
                    <span className="sp-label ml-1.5 border border-[var(--sp-line)] px-1 text-[8px]">OPT</span>
                  )}
                </span>
                <span className="sr-only">
                  {o.status === 'completed' ? '(completed)' : o.status === 'failed' ? '(failed)' : '(active)'}
                </span>
              </li>
            ))}
          </ul>
          {firstActive?.description && (
            <p className="mt-2 border-t border-[var(--sp-line)] pt-1.5 text-[10px] leading-4 text-[var(--sp-text-dim)]">
              {firstActive.description}
            </p>
          )}
        </div>
      </div>

      {/* mobile: compact single objective */}
      <div className="absolute left-3 top-20 w-56 md:hidden">
        <div className="sp-panel px-2.5 py-1.5 text-[10px]">
          <span className="text-[var(--sp-amber)]">○ </span>
          {firstActive ? firstActive.title : 'All objectives complete'}
        </div>
      </div>

      {/* bottom-left: radio log + alert status */}
      <div className="absolute bottom-3 left-3 w-[min(92vw,340px)] md:bottom-4 md:left-4">
        {snapshot.radioLog.length > 0 && (
          <div className="mb-2 space-y-1" aria-live="polite" aria-label="Radio traffic">
            {snapshot.radioLog.slice(-3).map((line) => (
              <div key={line.id} className="sp-radio-line sp-panel px-2.5 py-1.5 text-[10px] leading-4">
                <span className="text-[var(--sp-blue)]">{line.speaker}</span>
                <span className="text-[var(--sp-text-dim)]"> › </span>
                <span className="text-[var(--sp-text)]">{line.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="sp-panel px-3 py-2">
          <div className="flex items-center gap-2.5">
            <span
              className={`text-lg leading-none ${alert.pulse && !settings.reducedMotion ? 'sp-alert-pulse' : ''}`}
              style={{ color: alert.color }}
              aria-hidden
            >
              {alert.glyph}
            </span>
            <div className="min-w-0">
              <div className="sp-label">Status</div>
              <div
                className={`text-[12px] tracking-[0.2em] ${alert.pulse && !settings.reducedMotion ? 'sp-alert-pulse' : ''}`}
                style={{ color: alert.color }}
                role="status"
              >
                {alert.text}
              </div>
            </div>
          </div>
          {/* suspicion meter (the "eye") */}
          <div className="mt-2 h-1 w-full bg-white/10">
            <div ref={suspicionRef} className="h-full w-0 bg-[var(--sp-amber)]" />
          </div>
          {snapshot.alert.reason && (
            <div className="mt-1.5 truncate text-[10px] text-[var(--sp-text-dim)]">{snapshot.alert.reason}</div>
          )}
        </div>
      </div>

      {/* bottom-center: interaction prompt + hold ring */}
      <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-28">
        <div ref={holdWrapRef} className="relative hidden h-16 w-16 items-center justify-center">
          <svg width="64" height="64" viewBox="0 0 64 64" className="sp-hold-ring absolute inset-0">
            <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(140,160,180,0.25)" strokeWidth="2" />
            <circle
              ref={holdRingRef}
              cx="32" cy="32" r="26" fill="none" stroke="var(--sp-amber)" strokeWidth="2.5"
              strokeDasharray={HOLD_CIRCUMFERENCE} strokeDashoffset={HOLD_CIRCUMFERENCE}
            />
          </svg>
          <span className="sp-key z-10">{promptKey}</span>
        </div>
        {snapshot.prompt && (
          <div className="sp-panel px-3 py-1.5 text-[11px] tracking-[0.16em]">
            <span className="sp-key mr-2">{promptKey}</span>
            <span className={snapshot.prompt.kind === 'extract' && !snapshot.extractionArmed ? 'text-[var(--sp-red)]' : 'text-[var(--sp-text)]'}>
              {snapshot.prompt.label}
            </span>
          </div>
        )}
      </div>

      {/* bottom-right: posture / vitals / equipment */}
      <div className="absolute bottom-3 right-3 w-44 md:bottom-4 md:right-4 md:w-52">
        <div className="sp-panel px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="sp-label">Posture</span>
            <span className="text-[11px] tracking-[0.18em] text-[var(--sp-text)]">
              {snapshot.crouching ? 'CROUCHED' : snapshot.sprinting ? 'SPRINT' : 'STANDING'}
            </span>
          </div>
          <div className="mt-2">
            <div className="sp-label mb-0.5">Stamina</div>
            <div className="h-1 w-full bg-white/10">
              <div ref={staminaRef} className="h-full w-full bg-[var(--sp-blue)]" />
            </div>
          </div>
          <div
            ref={healthWrapRef}
            className="mt-2"
            style={{ display: snapshot.health < 100 ? 'block' : 'none' }}
          >
            <div className="sp-label mb-0.5">Vitals</div>
            <div className="h-1 w-full bg-white/10">
              <div ref={healthRef} className="h-full w-full bg-[var(--sp-green)]" />
            </div>
          </div>
          {snapshot.equipment.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--sp-line)] pt-2">
              {snapshot.equipment.includes('keycard') && (
                <span className="border border-[var(--sp-line-strong)] px-1.5 py-0.5 text-[9px] tracking-widest text-[var(--sp-amber)]">KEYCARD</span>
              )}
              {snapshot.equipment.includes('jammer') && (
                <span className={`border px-1.5 py-0.5 text-[9px] tracking-widest ${snapshot.jammerActive ? 'border-[var(--sp-blue)] text-[var(--sp-blue)]' : 'border-[var(--sp-line-strong)] text-[var(--sp-text)]'}`}>
                  JAMMER ×{snapshot.jammerCharges}{snapshot.jammerActive ? ' · ACTIVE' : ' · [G]'}
                </span>
              )}
              {snapshot.equipment.filter((e) => e === 'datacore' || e === 'intel').length > 0 && (
                <span className="border border-[var(--sp-line-strong)] px-1.5 py-0.5 text-[9px] tracking-widest text-[var(--sp-green)]">
                  DATA ×{snapshot.equipment.filter((e) => e === 'datacore' || e === 'intel').length}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* menu hint */}
      <div className="absolute right-3 top-3 hidden md:right-[212px] md:block">
        <div className="sp-panel px-2 py-1 text-[9px] tracking-widest text-[var(--sp-text-dim)]">
          ESC — MENU
        </div>
      </div>
    </div>
  )
}
