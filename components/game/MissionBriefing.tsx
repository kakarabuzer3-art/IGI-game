'use client'

/**
 * MissionBriefing — cinematic pre-mission panel with progressive typed text
 * (skippable; instant under reduced motion). Original narrative only.
 */

import { useEffect, useRef, useState } from 'react'
import type { MissionDef } from '@/engine/core/types'

export default function MissionBriefing({
  mission,
  reducedMotion,
  onStart,
  onBack,
}: {
  mission: MissionDef
  reducedMotion: boolean
  onStart: () => void
  onBack: () => void
}) {
  const full = mission.briefing.lines.join('\n\n')
  const [count, setCount] = useState(reducedMotion ? full.length : 0)
  const [done, setDone] = useState(reducedMotion)
  const startRef = useRef<HTMLButtonElement>(null)
  const typedRef = useRef(0)

  useEffect(() => {
    if (reducedMotion) return
    const id = window.setInterval(() => {
      typedRef.current = Math.min(typedRef.current + 3, full.length)
      setCount(typedRef.current)
      if (typedRef.current >= full.length) {
        window.clearInterval(id)
        setDone(true)
      }
    }, 16)
    return () => window.clearInterval(id)
  }, [full, reducedMotion])

  useEffect(() => {
    if (done) startRef.current?.focus()
  }, [done])

  const skip = () => {
    typedRef.current = full.length
    setCount(full.length)
    setDone(true)
  }

  return (
    <div
      className="sp-fade-in fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#05070b] p-4"
      onPointerDown={() => !done && skip()}
      role="dialog"
      aria-label={`Mission briefing: ${mission.title}`}
    >
      <div className="sp-slide-up w-full max-w-2xl border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-6 md:p-10">
        <div className="flex items-baseline justify-between border-b border-[var(--sp-line)] pb-4">
          <div>
            <div className="sp-label">Mission {String(mission.index).padStart(2, '0')} — Classification: EYES ONLY</div>
            <h2 className="mt-1 text-2xl tracking-[0.3em] text-[var(--sp-amber)] md:text-3xl">
              OPERATION: {mission.codeName}
            </h2>
          </div>
          <div className="text-right">
            <div className="sp-label">Threat</div>
            <div className="text-sm tracking-widest text-[var(--sp-red)]">{mission.briefing.threatLevel}</div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-3 text-[11px] md:grid-cols-2">
          <div>
            <dt className="sp-label">Location</dt>
            <dd className="mt-0.5 tracking-wide text-[var(--sp-text)]">{mission.briefing.location}</dd>
          </div>
          <div>
            <dt className="sp-label">Insertion</dt>
            <dd className="mt-0.5 tracking-wide text-[var(--sp-text)]">{mission.briefing.insertion}</dd>
          </div>
        </dl>

        <div className="mt-6 min-h-[9rem] whitespace-pre-wrap text-[13px] leading-6 text-[var(--sp-text)]">
          {full.slice(0, count)}
          {!done && <span className="sp-caret" />}
        </div>

        {done && (
          <div className="sp-fade-in mt-4 border-t border-[var(--sp-line)] pt-4">
            <div className="sp-label mb-2">Objectives</div>
            <ul className="space-y-1 text-[12px]">
              {mission.objectives.filter((o) => !o.hidden).map((o) => (
                <li key={o.id} className="flex gap-2">
                  <span className="text-[var(--sp-amber)]">○</span>
                  <span>{o.title}</span>
                  {o.optional && <span className="sp-label ml-1 self-center border border-[var(--sp-line)] px-1 text-[8px]">OPTIONAL</span>}
                </li>
              ))}
              <li className="flex gap-2 text-[var(--sp-text-dim)]">
                <span className="text-[var(--sp-blue)]">◈</span>
                <span>Undisclosed objectives may surface in the field.</span>
              </li>
            </ul>
            <div className="mt-4 text-[11px] leading-5 text-[var(--sp-text-dim)]">
              <span className="sp-label mr-2">Field note</span>
              {mission.newMechanic}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button ref={startRef} className="sp-btn sp-btn-primary" onClick={onStart} disabled={!done}>
            ▶ Begin Mission
          </button>
          <button className="sp-btn" onClick={onBack}>
            ← Back
          </button>
          {!done && (
            <button className="sp-btn ml-auto opacity-60" onClick={skip}>
              Skip ▸▸
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
