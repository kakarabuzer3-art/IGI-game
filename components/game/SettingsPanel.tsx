'use client'

/**
 * SettingsPanel — persisted settings: sensitivity, audio, quality, and
 * accessibility options (reduced motion, high-contrast HUD, radio subtitles).
 */

import { useEffect, useRef } from 'react'
import type { GameSettings } from '@/engine/core/types'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--sp-line)] py-2.5 last:border-0">
      <div>
        <div className="text-[11px] tracking-[0.14em] text-[var(--sp-text)]">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-[var(--sp-text-dim)]">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-12 border transition-colors ${on ? 'border-[var(--sp-amber)] bg-[var(--sp-amber)]/15' : 'border-[var(--sp-line-strong)] bg-black/30'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 transition-all ${on ? 'left-[26px] bg-[var(--sp-amber)]' : 'left-0.5 bg-[var(--sp-text-dim)]'}`}
      />
    </button>
  )
}

function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1 w-40 accent-[var(--sp-amber)]"
    />
  )
}

export default function SettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: GameSettings
  onChange: (s: GameSettings) => void
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
  }, [])
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) =>
    onChange({ ...settings, [k]: v })

  return (
    <div className="sp-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[#04060a]/85 p-4" role="dialog" aria-label="Settings">
      <div className="sp-slide-up max-h-[88vh] w-full max-w-lg overflow-y-auto border border-[var(--sp-line)] bg-[var(--sp-panel-solid)] p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm tracking-[0.3em] text-[var(--sp-amber)]">SETTINGS</h2>
          <button ref={closeRef} className="sp-btn px-3 py-1.5" onClick={onClose}>✕ Close</button>
        </div>

        <div className="mt-5">
          <div className="sp-label mb-1">Controls</div>
          <Row label="Mouse sensitivity" hint="Look speed">
            <Slider label="Mouse sensitivity" value={settings.sensitivity} min={0.3} max={2.5} step={0.1} onChange={(v) => set('sensitivity', v)} />
          </Row>
          <Row label="Invert vertical look">
            <Toggle label="Invert vertical look" on={settings.invertY} onChange={(v) => set('invertY', v)} />
          </Row>
        </div>

        <div className="mt-5">
          <div className="sp-label mb-1">Audio</div>
          <Row label="Master volume">
            <Slider label="Master volume" value={settings.masterVolume} min={0} max={1} step={0.05} onChange={(v) => set('masterVolume', v)} />
          </Row>
          <Row label="Effects volume">
            <Slider label="Effects volume" value={settings.sfxVolume} min={0} max={1} step={0.05} onChange={(v) => set('sfxVolume', v)} />
          </Row>
          <Row label="Ambience volume">
            <Slider label="Ambience volume" value={settings.ambientVolume} min={0} max={1} step={0.05} onChange={(v) => set('ambientVolume', v)} />
          </Row>
        </div>

        <div className="mt-5">
          <div className="sp-label mb-1">Display</div>
          <Row label="Quality" hint="Auto adapts resolution to hold framerate">
            <select
              aria-label="Quality"
              className="border border-[var(--sp-line-strong)] bg-black/40 px-2 py-1 text-[11px] text-[var(--sp-text)]"
              value={settings.quality}
              onChange={(e) => set('quality', e.target.value as GameSettings['quality'])}
            >
              <option value="auto">AUTO</option>
              <option value="high">HIGH</option>
              <option value="low">LOW</option>
            </select>
          </Row>
        </div>

        <div className="mt-5">
          <div className="sp-label mb-1">Accessibility</div>
          <Row label="Reduced motion" hint="Removes head-bob, shake and FOV punch; calms UI animation">
            <Toggle label="Reduced motion" on={settings.reducedMotion} onChange={(v) => set('reducedMotion', v)} />
          </Row>
          <Row label="High-contrast HUD" hint="Stronger panels and text for readability">
            <Toggle label="High-contrast HUD" on={settings.highContrastHud} onChange={(v) => set('highContrastHud', v)} />
          </Row>
          <Row label="Radio subtitles" hint="Show all radio traffic as text (recommended — audio is never the only channel)">
            <Toggle label="Radio subtitles" on={settings.radioSubtitles} onChange={(v) => set('radioSubtitles', v)} />
          </Row>
        </div>

        <p className="mt-5 text-[10px] leading-4 text-[var(--sp-text-dim)]">
          Settings are stored locally on this device. All gameplay-critical information is
          also presented as text in the HUD, menus and reports.
        </p>
      </div>
    </div>
  )
}
