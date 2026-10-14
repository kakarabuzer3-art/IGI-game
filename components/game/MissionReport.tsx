'use client'

/**
 * MissionReport — tactical after-action report: grade, objectives, stats.
 * Professional tone, no arcade scoring.
 */

import { useEffect, useRef } from 'react'
import type { MissionGrade, MissionReportData } from '@/engine/core/types'
import { formatTime } from '@/engine/core/math'

const GRADE_META: Record<MissionGrade, { text: string; sub: string; color: string }> = {
  ghost: { text: 'GHOST', sub: 'Never seen. Never heard. Perfect infiltration.', color: '#43d67f' },
  shadow: { text: 'SHADOW', sub: 'They sensed something. They never confirmed you.', color: '#53c8ff' },
  operative: { text: 'OPERATIVE', sub: 'Mission accomplished under contact.', color: '#ffb43d' },
  compromised: { text: 'COMPROMISED', sub: 'You got the job done — but they know your face now.', color: '#ff6a4d' },
}

export default function MissionReport({
  report,
  hasNext,
  onRetry,
  onNext,
  onMenu,
}: {
  report: MissionReportData
  hasNext: boolean
  onRetry: () => void
  onNext: () => void
  onMenu: () => void
}) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  const grade = GRADE_META[report.grade]
  const completed = report.objectives.filter((o) => o.status === 'completed').length

  return (
    <div className="sp-fade-in fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[#04060a]/94 p-4" role="dialog" aria-label="Mission report">
      <div className="sp-slide-up w-full max-w-xl border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-6 md:p-9">
        <div className="text-center">
          <div className="sp-label">{report.success ? 'After-Action Report' : 'Operation Terminated'}</div>
          <h2 className={`mt-2 text-2xl tracking-[0.35em] md:text-3xl ${report.success ? 'text-[var(--sp-green)]' : 'text-[var(--sp-red)]'}`}>
            {report.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}
          </h2>
          {!report.success && (
            <p className="mt-2 text-[12px] text-[var(--sp-text-dim)]">Operative down. Command has scrubbed the insertion — try again.</p>
          )}
          {report.success && (
            <div className="mt-5 inline-block border px-8 py-3" style={{ borderColor: grade.color }}>
              <div className="sp-label">Performance Grade</div>
              <div className="text-xl tracking-[0.4em]" style={{ color: grade.color }}>{grade.text}</div>
              <div className="mt-1 text-[10px] text-[var(--sp-text-dim)]">{grade.sub}</div>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-[var(--sp-line)] pt-4">
          <div className="sp-label mb-2">Objectives — {completed}/{report.objectives.length}</div>
          <ul className="space-y-1 text-[12px]">
            {report.objectives.map((o) => (
              <li key={o.title} className="flex items-center gap-2">
                <span className={o.status === 'completed' ? 'text-[var(--sp-green)]' : 'text-[var(--sp-text-dim)]'}>
                  {o.status === 'completed' ? '✓' : '○'}
                </span>
                <span className={o.status === 'completed' ? 'text-[var(--sp-text)]' : 'text-[var(--sp-text-dim)]'}>{o.title}</span>
                {o.optional && <span className="sp-label ml-auto border border-[var(--sp-line)] px-1 text-[8px]">OPTIONAL</span>}
              </li>
            ))}
          </ul>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--sp-line)] pt-4 text-[11px] md:grid-cols-4">
          <div><dt className="sp-label">Time</dt><dd className="mt-0.5 text-[var(--sp-text)]">{formatTime(report.timeSeconds)}</dd></div>
          <div><dt className="sp-label">Times spotted</dt><dd className="mt-0.5 text-[var(--sp-text)]">{report.stats.timesSpotted}</dd></div>
          <div><dt className="sp-label">Neutralized</dt><dd className="mt-0.5 text-[var(--sp-text)]">{report.stats.neutralizations}</dd></div>
          <div><dt className="sp-label">Intel</dt><dd className="mt-0.5 text-[var(--sp-text)]">{report.stats.intelFound}</dd></div>
        </dl>

        {report.stats.detectedReasons.length > 0 && (
          <div className="mt-4 text-[10px] leading-4 text-[var(--sp-text-dim)]">
            <span className="sp-label mr-2">Detection log</span>
            {report.stats.detectedReasons.join(' · ')}
          </div>
        )}

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          {report.success && hasNext && (
            <button ref={primaryRef} className="sp-btn sp-btn-primary" onClick={onNext}>Next Mission ▸</button>
          )}
          <button className="sp-btn" ref={report.success && !hasNext ? primaryRef : undefined} onClick={onRetry}>
            ↻ {report.success ? 'Replay' : 'Retry'}
          </button>
          <button className="sp-btn" onClick={onMenu}>◂ Debrief (Missions)</button>
        </div>
      </div>
    </div>
  )
}
