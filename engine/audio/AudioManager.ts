/**
 * AudioManager — fully procedural WebAudio synthesis.
 * Every sound is generated at runtime (noise bursts, oscillators, filters):
 * no audio assets, no copyright surface, tiny memory footprint.
 *
 * Sounds are INFORMATIONAL: footsteps mask/move, radio static means chatter,
 * the alert sting means the facility knows. Positional cues use distance gain,
 * stereo pan relative to view yaw, and an occlusion lowpass.
 */

import type { SfxName, GameSettings, DetectionLevel } from '@/engine/core/types'
import { clamp } from '@/engine/core/math'

export interface SfxOptions {
  x?: number // world units
  y?: number
  gain?: number
  playerX?: number
  playerY?: number
  playerYaw?: number
  occluded?: boolean
}

export class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private ambientBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private ambientNodes: AudioScheduledSourceNode[] = []
  private ambientPreset: string | null = null
  private heartbeatT = 0
  enabled = true

  private settings: GameSettings = {
    sensitivity: 1, invertY: false, reducedMotion: false,
    masterVolume: 0.8, sfxVolume: 0.9, ambientVolume: 0.7,
    highContrastHud: false, radioSubtitles: true, quality: 'auto',
  }

  /** must be called from a user gesture */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.sfxBus = this.ctx.createGain()
      this.ambientBus = this.ctx.createGain()
      this.sfxBus.connect(this.master)
      this.ambientBus.connect(this.master)
      this.master.connect(this.ctx.destination)
      // 1 s white-noise buffer reused by every noise-based sound
      const len = this.ctx.sampleRate
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this.applySettings(this.settings)
    } catch {
      this.enabled = false
    }
  }

  applySettings(s: GameSettings): void {
    this.settings = s
    if (!this.master || !this.sfxBus || !this.ambientBus) return
    this.master.gain.value = s.masterVolume
    this.sfxBus.gain.value = s.sfxVolume
    this.ambientBus.gain.value = s.ambientVolume
  }

  /* ---------------- ambient beds ---------------- */

  setAmbient(preset: string): void {
    if (!this.ctx || !this.ambientBus || this.ambientPreset === preset) return
    this.stopAmbient()
    if (preset === 'off') return
    this.ambientPreset = preset
    const ctx = this.ctx
    const bus = this.ambientBus

    const makeNoise = (filter: BiquadFilterNode, gainV: number): void => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuf
      src.loop = true
      const g = ctx.createGain()
      g.gain.value = gainV
      src.connect(filter).connect(g).connect(bus)
      src.start()
      this.ambientNodes.push(src)
    }
    const makeTone = (freq: number, gainV: number, type: OscillatorType = 'sine', detune = 0): void => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = detune
      const g = ctx.createGain()
      g.gain.value = gainV
      o.connect(g).connect(bus)
      o.start()
      this.ambientNodes.push(o)
    }

    if (preset === 'night') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240
      makeNoise(lp, 0.05) // wind
      makeTone(48, 0.02, 'sine') // distant generator
      makeTone(48.7, 0.015, 'sine')
    } else if (preset === 'underground') {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6
      makeNoise(bp, 0.03) // ventilation
      makeTone(55, 0.03, 'sine')
      makeTone(110.4, 0.012, 'triangle')
      makeTone(82, 0.008, 'sine', 6)
    } else {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350
      makeNoise(lp, 0.035)
      makeTone(60, 0.02, 'sine')
    }
  }

  private stopAmbient(): void {
    for (const n of this.ambientNodes) {
      try { n.stop() } catch { /* already stopped */ }
      n.disconnect()
    }
    this.ambientNodes = []
    this.ambientPreset = null
  }

  /* ---------------- one-shot sfx ---------------- */

  play(name: SfxName, opts: SfxOptions = {}): void {
    const ctx = this.ctx
    if (!ctx || !this.sfxBus || !this.enabled) return
    if (ctx.state === 'suspended') void ctx.resume()

    // positional mixing
    let gain = opts.gain ?? 1
    let pan = 0
    let cutoff = 8000
    if (opts.x !== undefined && opts.playerX !== undefined) {
      const dx = opts.x - opts.playerX
      const dy = opts.y! - opts.playerY!
      const d = Math.hypot(dx, dy)
      gain *= clamp(1.25 - d / 28, 0.04, 1)
      if (d > 0.3) {
        const ang = Math.atan2(dy, dx)
        const rel = ang - (opts.playerYaw ?? 0)
        pan = clamp(Math.sin(rel) * 0.8, -0.85, 0.85)
      }
      if (opts.occluded) cutoff = 480
    }

    const out = ctx.createGain()
    out.gain.value = gain
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = cutoff
    out.connect(lp).connect(panner).connect(this.sfxBus)

    const t = ctx.currentTime
    switch (name) {
      case 'step': this.noiseBurst(out, t, 0.07, 320, 0.5, 'lowpass'); break
      case 'stepMetal': this.noiseBurst(out, t, 0.06, 1400, 0.35, 'bandpass'); this.tone(out, t, 0.05, 2100, 0.02, 'square'); break
      case 'doorOpen': this.tone(out, t, 0.28, 85, 0.25, 'sawtooth', 60); this.noiseBurst(out, t, 0.3, 500, 0.15, 'lowpass'); break
      case 'doorLocked': this.tone(out, t, 0.035, 1900, 0.2, 'square'); this.tone(out, t + 0.07, 0.035, 1500, 0.2, 'square'); break
      case 'terminalStart': this.tone(out, t, 0.06, 880, 0.12, 'square'); break
      case 'terminalDone': this.tone(out, t, 0.08, 660, 0.14, 'square'); this.tone(out, t + 0.09, 0.08, 880, 0.14, 'square'); this.tone(out, t + 0.18, 0.12, 1320, 0.12, 'square'); break
      case 'objective': this.tone(out, t, 0.1, 523, 0.16, 'sine'); this.tone(out, t + 0.12, 0.22, 784, 0.16, 'sine'); break
      case 'pickup': this.tone(out, t, 0.05, 1150, 0.14, 'sine'); this.tone(out, t + 0.05, 0.09, 1550, 0.1, 'sine'); break
      case 'takedown': this.tone(out, t, 0.12, 85, 0.5, 'sine', 40); this.noiseBurst(out, t, 0.15, 700, 0.3, 'lowpass'); break
      case 'radioStatic': this.noiseBurst(out, t, 0.22, 1900, 0.16, 'bandpass'); this.noiseBurst(out, t + 0.24, 0.1, 2400, 0.08, 'bandpass'); break
      case 'alertSting': this.tone(out, t, 0.5, 300, 0.2, 'sawtooth', 900); this.tone(out, t, 0.5, 452, 0.12, 'sawtooth', 600); break
      case 'spotted': this.tone(out, t, 0.09, 1200, 0.22, 'square'); this.tone(out, t + 0.1, 0.14, 900, 0.22, 'square'); break
      case 'heartbeat': this.tone(out, t, 0.09, 52, 0.6, 'sine'); this.tone(out, t + 0.16, 0.07, 48, 0.45, 'sine'); break
      case 'damage': this.tone(out, t, 0.16, 70, 0.55, 'sine', 30); this.noiseBurst(out, t, 0.12, 400, 0.3, 'lowpass'); break
      case 'switch': this.tone(out, t, 0.025, 1000, 0.18, 'square'); break
      case 'cameraDown': this.tone(out, t, 0.6, 420, 0.16, 'sawtooth', -340); break
      case 'elevator': this.tone(out, t, 0.9, 46, 0.3, 'sawtooth', 8); this.noiseBurst(out, t, 0.9, 240, 0.1, 'lowpass'); break
      case 'extract': this.tone(out, t, 1.3, 58, 0.3, 'sawtooth', 24); this.noiseBurst(out, t, 1.3, 900, 0.14, 'bandpass'); break
      case 'uiClick': this.tone(out, t, 0.02, 620, 0.08, 'square'); break
      case 'jammer': this.tone(out, t, 0.35, 1500, 0.16, 'sawtooth', -1300); break
    }
  }

  private tone(
    out: AudioNode, t: number, dur: number, freq: number, vol: number,
    type: OscillatorType, freqEnd?: number,
  ): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.05)
  }

  private noiseBurst(
    out: AudioNode, t: number, dur: number, freq: number, vol: number,
    filterType: 'lowpass' | 'bandpass' | 'highpass',
  ): void {
    const ctx = this.ctx!
    if (!this.noiseBuf) return
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.value = freq
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t)
    src.stop(t + dur + 0.05)
  }

  /* ---------------- tension loop ---------------- */

  /** call every frame; plays heartbeat pulses when detection is high */
  update(dt: number, detection: DetectionLevel): void {
    if (!this.ctx) return
    const active = detection === 'spotted' || detection === 'engaged'
    if (!active) {
      this.heartbeatT = 0
      return
    }
    this.heartbeatT -= dt
    if (this.heartbeatT <= 0) {
      this.play('heartbeat', { gain: detection === 'engaged' ? 0.9 : 0.5 })
      this.heartbeatT = detection === 'engaged' ? 0.65 : 1.0
    }
  }

  dispose(): void {
    this.stopAmbient()
    try { void this.ctx?.close() } catch { /* noop */ }
    this.ctx = null
    this.master = null
    this.sfxBus = null
    this.ambientBus = null
  }
}
