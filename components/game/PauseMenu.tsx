'use client'

/**
 * PauseMenu — keyboard-accessible pause overlay. Important game information
 * (objectives, controls) is duplicated here in HTML for accessibility.
 */

import { useEffect, useRef } from 'react'
import type { GameSnapshot } from '@/engine/core/types'

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint (drains stamina, loud)'],
  ['Ctrl / C', 'Crouch (hold / toggle — quiet, low profile)'],
  ['E', 'Interact — doors, terminals, pickups, extraction'],
  ['F', 'Neutralize sentry from behind'],
  ['G', 'Activate signal jammer (when carried)'],
  ['Esc', 'Pause / menu'],
]

export default function PauseMenu({
  snapshot,
  onResume,
  onRestart,
  onSettings,
  onAbort,
}: {
  snapshot: GameSnapshot | null
  onResume: () => void
  onRestart: () => void
  onSettings: () => void
  onAbort: () => void
}) {
  const resumeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    resumeRef.current?.focus()
  }, [])

  return (
    <div className="sp-fade-in fixed inset-0 z-40 flex items-center justify-center bg-[#04060a]/80 p-4" role="dialog" aria-label="Paused">
      <div className="sp-slide-up grid w-full max-w-3xl gap-4 md:grid-cols-2">
        <div className="border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-6">
          <div className="sp-label">Operation paused</div>
          <h2 className="mt-1 text-xl tracking-[0.3em] text-[var(--sp-amber)]">{snapshot?.codeName ?? ''}</h2>
          <div className="mt-5 flex flex-col gap-2.5">
            <button ref={resumeRef} className="sp-btn sp-btn-primary justify-center" onClick={onResume}>▶ Resume</button>
            <button className="sp-btn justify-center" onClick={onRestart}>↻ Restart Mission</button>
            <button className="sp-btn justify-center" onClick={onSettings}>⚙ Settings</button>
            <button className="sp-btn justify-center" onClick={onAbort}>◂ Abort to Debrief</button>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-5">
            <div className="sp-label mb-2">Objectives</div>
            <ul className="space-y-1 text-[12px]">
              {(snapshot?.objectives ?? []).map((o) => (
                <li key={o.id} className="flex gap-2">
                  <span className={o.status === 'completed' ? 'text-[var(--sp-green)]' : 'text-[var(--sp-amber)]'}>
                    {o.status === 'completed' ? '✓' : '○'}
                  </span>
                  <span className={o.status === 'completed' ? 'text-[var(--sp-text-dim)]' : 'text-[var(--sp-text)]'}>{o.title}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-5">
            <div className="sp-label mb-2">Controls</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11px]">
              {CONTROLS.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt><span className="sp-key">{k}</span></dt>
                  <dd className="self-center text-[var(--sp-text-dim)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
