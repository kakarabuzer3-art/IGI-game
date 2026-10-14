'use client'

/**
 * MissionSelect — campaign browser with progression state (locked missions,
 * best grades). Progress-style rewards only: no points, no coins.
 */

import type { MissionDef, MissionGrade, Progress } from '@/engine/core/types'

const GRADE_SHORT: Record<MissionGrade, { text: string; color: string }> = {
  ghost: { text: 'GHOST', color: '#43d67f' },
  shadow: { text: 'SHADOW', color: '#53c8ff' },
  operative: { text: 'OPERATIVE', color: '#ffb43d' },
  compromised: { text: 'COMPROMISED', color: '#ff6a4d' },
}

export default function MissionSelect({
  missions,
  progress,
  onSelect,
  onBack,
  onSettings,
}: {
  missions: MissionDef[]
  progress: Progress
  onSelect: (id: string) => void
  onBack: () => void
  onSettings: () => void
}) {
  return (
    <div className="sp-fade-in fixed inset-0 z-40 overflow-y-auto bg-[#05070b] p-4 md:p-8" role="dialog" aria-label="Mission selection">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between border-b border-[var(--sp-line)] pb-4">
          <div>
            <div className="sp-label">Campaign — Greyline Station</div>
            <h2 className="mt-1 text-xl tracking-[0.3em] text-[var(--sp-amber)] md:text-2xl">SELECT OPERATION</h2>
          </div>
          <div className="flex gap-2">
            <button className="sp-btn px-3 py-1.5" onClick={onSettings}>⚙ Settings</button>
            <button className="sp-btn px-3 py-1.5" onClick={onBack}>✕</button>
          </div>
        </div>

        <ol className="mt-6 space-y-3">
          {missions.map((m) => {
            const unlocked = progress.unlocked.includes(m.id)
            const grade = progress.grades[m.id]
            return (
              <li key={m.id}>
                <button
                  className={`sp-panel group flex w-full items-center gap-4 p-4 text-left transition-colors ${unlocked ? 'hover:border-[var(--sp-amber)]/60' : 'opacity-45'}`}
                  onClick={() => unlocked && onSelect(m.id)}
                  disabled={!unlocked}
                  aria-label={unlocked ? `Mission ${m.index}: ${m.title}` : `Mission ${m.index} locked`}
                >
                  <div className="text-2xl tracking-widest text-[var(--sp-text-dim)] group-hover:text-[var(--sp-amber)]">
                    {String(m.index).padStart(2, '0')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <h3 className="text-sm tracking-[0.22em] text-[var(--sp-text)]">OPERATION: {m.codeName}</h3>
                      <span className="text-[10px] tracking-widest text-[var(--sp-red)]">THREAT · {m.briefing.threatLevel}</span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-[var(--sp-text-dim)]">{m.newMechanic}</p>
                    <div className="mt-1.5 flex items-center gap-2" aria-label={`Difficulty ${m.difficulty} of 4`}>
                      {Array.from({ length: 4 }, (_, i) => (
                        <span key={i} className={`h-1.5 w-5 ${i < m.difficulty ? 'bg-[var(--sp-amber)]' : 'bg-white/10'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {grade ? (
                      <div>
                        <div className="sp-label">Best</div>
                        <div className="text-[11px] tracking-[0.2em]" style={{ color: GRADE_SHORT[grade].color }}>
                          {GRADE_SHORT[grade].text}
                        </div>
                      </div>
                    ) : unlocked ? (
                      <div className="text-[11px] tracking-[0.2em] text-[var(--sp-text-dim)]">▸ READY</div>
                    ) : (
                      <div className="text-[11px] tracking-[0.2em] text-[var(--sp-text-dim)]">🔒 LOCKED</div>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>

        <p className="mt-6 text-[10px] leading-5 text-[var(--sp-text-dim)]">
          Missions unlock in sequence. Choices carry over: end a operation compromised and
          Greyline will remember you in the next one. Grades are stored on this device only.
        </p>
      </div>
    </div>
  )
}
