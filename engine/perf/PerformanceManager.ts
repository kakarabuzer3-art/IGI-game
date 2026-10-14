/**
 * PerformanceManager — quality presets and adaptive resolution.
 * 'auto' samples rolling FPS and steps quality down/up without hysteresis
 * thrash. Mobile/coarse-pointer devices start on the low preset.
 */

export interface PerformancePreset {
  dprCap: number
  renderScale: number
  antialias: boolean
  minimapHz: number
  stealthHz: number
}

export const PRESET_HIGH: PerformancePreset = {
  dprCap: 1.5, renderScale: 1, antialias: true, minimapHz: 12, stealthHz: 20,
}
export const PRESET_LOW: PerformancePreset = {
  dprCap: 1.25, renderScale: 0.78, antialias: false, minimapHz: 8, stealthHz: 15,
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export class PerformanceManager {
  preset: PerformancePreset
  private mode: 'auto' | 'low' | 'high'
  private lowStreak = 0
  private highStreak = 0
  private scaleFloor = 0.6

  onPresetChange?: (p: PerformancePreset) => void

  constructor(mode: 'auto' | 'low' | 'high') {
    this.mode = mode
    this.preset =
      mode === 'high' ? { ...PRESET_HIGH } :
      mode === 'low' ? { ...PRESET_LOW } :
      isTouchDevice() ? { ...PRESET_LOW } : { ...PRESET_HIGH }
  }

  setMode(mode: 'auto' | 'low' | 'high'): void {
    this.mode = mode
    this.applyBase()
  }

  private applyBase(): void {
    this.preset =
      this.mode === 'high' ? { ...PRESET_HIGH } :
      this.mode === 'low' ? { ...PRESET_LOW } :
      isTouchDevice() ? { ...PRESET_LOW } : { ...PRESET_HIGH }
    this.lowStreak = 0
    this.highStreak = 0
    this.onPresetChange?.(this.preset)
  }

  /** feed the loop FPS estimate once per second */
  sample(fps: number): void {
    if (this.mode !== 'auto') return
    if (fps < 38) {
      this.lowStreak++
      this.highStreak = 0
    } else if (fps > 56) {
      this.highStreak++
      this.lowStreak = 0
    } else {
      this.lowStreak = 0
      this.highStreak = 0
    }
    if (this.lowStreak >= 3) {
      this.lowStreak = 0
      if (this.preset.renderScale > this.scaleFloor) {
        this.preset = { ...this.preset, renderScale: Math.max(this.scaleFloor, this.preset.renderScale - 0.12), antialias: false }
        this.onPresetChange?.(this.preset)
      }
    } else if (this.highStreak >= 8) {
      this.highStreak = 0
      const base = isTouchDevice() ? PRESET_LOW : PRESET_HIGH
      if (this.preset.renderScale < base.renderScale) {
        this.preset = { ...this.preset, renderScale: Math.min(base.renderScale, this.preset.renderScale + 0.1) }
        this.onPresetChange?.(this.preset)
      }
    }
  }
}
