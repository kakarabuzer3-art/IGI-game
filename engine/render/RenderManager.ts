/**
 * RenderManager — owns the WebGLRenderer, canvas sizing (ResizeObserver +
 * capped devicePixelRatio), the fade overlay, and quality presets.
 */

import * as THREE from 'three'
import type { PerformancePreset } from '@/engine/perf/PerformanceManager'

export class RenderManager {
  readonly renderer: THREE.WebGLRenderer
  private fadeEl: HTMLDivElement
  private ro: ResizeObserver | null = null
  private container: HTMLElement
  preset: PerformancePreset

  constructor(container: HTMLElement, preset: PerformancePreset) {
    this.container = container
    this.preset = preset
    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(0x05070d, 1)
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'

    this.fadeEl = document.createElement('div')
    this.fadeEl.style.cssText =
      'position:absolute;inset:0;background:#04060a;opacity:0;pointer-events:none;transition:opacity 0.45s ease;z-index:5;'
    container.appendChild(this.fadeEl)

    this.resize()
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
  }

  resize(): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.dprCap) * this.preset.renderScale
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
  }

  setFade(v: number, instant = false): void {
    if (instant) this.fadeEl.style.transition = 'none'
    else this.fadeEl.style.transition = 'opacity 0.45s ease'
    this.fadeEl.style.opacity = String(Math.max(0, Math.min(1, v)))
    if (instant) void this.fadeEl.offsetWidth // reflow to apply
  }

  applyPreset(p: PerformancePreset): void {
    this.preset = p
    this.resize()
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera)
  }

  dispose(): void {
    this.ro?.disconnect()
    this.ro = null
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.fadeEl.remove()
  }
}
