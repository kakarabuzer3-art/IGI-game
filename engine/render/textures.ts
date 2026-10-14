/**
 * Procedural textures — generated once into canvases at load time.
 * No image assets: the entire visual identity is synthesized, keeping the
 * bundle tiny and the look 100% original.
 */

import * as THREE from 'three'
import { makeRng } from '@/engine/core/math'

function canvas(size = 128): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  return [c, ctx]
}

function finish(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 2
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function noiseOverlay(ctx: CanvasRenderingContext2D, size: number, rng: () => number, amount: number, mono = true): void {
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount
    d[i] += n
    d[i + 1] += mono ? n : (rng() - 0.5) * amount
    d[i + 2] += mono ? n : (rng() - 0.5) * amount
  }
  ctx.putImageData(img, 0, 0)
}

export interface TextureSet {
  concrete: THREE.CanvasTexture
  panel: THREE.CanvasTexture
  floor: THREE.CanvasTexture
  ceiling: THREE.CanvasTexture
  crate: THREE.CanvasTexture
  fence: THREE.CanvasTexture
  screen: THREE.CanvasTexture
  metal: THREE.CanvasTexture
  helipad: THREE.CanvasTexture
}

let cached: TextureSet | null = null

export function getTextures(): TextureSet {
  if (cached) return cached
  const rng = makeRng(1337)

  /* concrete: mottled grey with form-tie holes and seams */
  const concrete = (() => {
    const [c, ctx] = canvas(128)
    ctx.fillStyle = '#6a6e73'
    ctx.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(${60 + rng() * 40 | 0},${62 + rng() * 40 | 0},${66 + rng() * 40 | 0},0.25)`
      const w = 10 + rng() * 40
      ctx.fillRect(rng() * 128, rng() * 128, w, w * (0.4 + rng() * 0.6))
    }
    ctx.strokeStyle = 'rgba(30,32,35,0.55)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, 126, 126)
    ctx.fillStyle = 'rgba(35,37,40,0.7)'
    for (const [x, y] of [[20, 20], [108, 20], [20, 108], [108, 108]]) {
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    noiseOverlay(ctx, 128, rng, 26)
    return finish(c)
  })()

  /* panel: ribbed metal wall panels */
  const panel = (() => {
    const [c, ctx] = canvas(128)
    ctx.fillStyle = '#565c63'
    ctx.fillRect(0, 0, 128, 128)
    for (let y = 0; y < 128; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)'
      ctx.fillRect(0, y, 128, 8)
      ctx.fillStyle = 'rgba(20,22,25,0.5)'
      ctx.fillRect(0, y + 15, 128, 1)
    }
    ctx.fillStyle = 'rgba(30,33,37,0.85)'
    ctx.fillRect(62, 0, 4, 128)
    ctx.fillStyle = 'rgba(150,155,160,0.25)'
    for (let y = 8; y < 128; y += 32) {
      ctx.beginPath(); ctx.arc(32, y, 1.6, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.arc(96, y, 1.6, 0, 7); ctx.fill()
    }
    noiseOverlay(ctx, 128, rng, 16)
    return finish(c)
  })()

  /* floor: dark polished concrete with expansion joints */
  const floor = (() => {
    const [c, ctx] = canvas(128)
    ctx.fillStyle = '#4c5056'
    ctx.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${40 + rng() * 50 | 0},${42 + rng() * 50 | 0},${46 + rng() * 50 | 0},0.18)`
      ctx.fillRect(rng() * 128, rng() * 128, 6 + rng() * 26, 6 + rng() * 26)
    }
    ctx.strokeStyle = 'rgba(25,27,30,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(128, 64); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.stroke()
    noiseOverlay(ctx, 128, rng, 20)
    return finish(c)
  })()

  /* ceiling */
  const ceiling = (() => {
    const [c, ctx] = canvas(64)
    ctx.fillStyle = '#2e3136'
    ctx.fillRect(0, 0, 64, 64)
    ctx.strokeStyle = 'rgba(18,20,22,0.7)'
    ctx.strokeRect(1, 1, 62, 62)
    noiseOverlay(ctx, 64, rng, 12)
    return finish(c)
  })()

  /* crate: stencil box (abstract markings, no logos) */
  const crate = (() => {
    const [c, ctx] = canvas(128)
    ctx.fillStyle = '#5a5344'
    ctx.fillRect(0, 0, 128, 128)
    ctx.strokeStyle = 'rgba(30,27,20,0.8)'
    ctx.lineWidth = 5
    ctx.strokeRect(6, 6, 116, 116)
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(122, 122); ctx.moveTo(122, 6); ctx.lineTo(6, 122); ctx.stroke()
    ctx.fillStyle = 'rgba(200,190,150,0.5)'
    ctx.fillRect(44, 56, 40, 6)
    ctx.fillRect(44, 68, 26, 6)
    noiseOverlay(ctx, 128, rng, 22)
    return finish(c)
  })()

  /* fence: chain-link with alpha */
  const fence = (() => {
    const [c, ctx] = canvas(64)
    ctx.clearRect(0, 0, 64, 64)
    ctx.strokeStyle = 'rgba(150,158,165,0.75)'
    ctx.lineWidth = 1.4
    for (let i = -64; i < 128; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(i + 64, 0); ctx.lineTo(i, 64); ctx.stroke()
    }
    const t = finish(c)
    t.repeat.set(2, 1)
    return t
  })()

  /* terminal screen: scanlines */
  const screen = (() => {
    const [c, ctx] = canvas(64)
    ctx.fillStyle = '#08130c'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = 'rgba(70,220,130,0.5)'
    for (let y = 4; y < 60; y += 8) ctx.fillRect(6, y, 20 + ((y * 7) % 30), 2)
    ctx.fillStyle = 'rgba(70,220,130,0.18)'
    for (let y = 0; y < 64; y += 3) ctx.fillRect(0, y, 64, 1)
    return finish(c)
  })()

  /* generic dark metal for props */
  const metal = (() => {
    const [c, ctx] = canvas(64)
    ctx.fillStyle = '#3a3e44'
    ctx.fillRect(0, 0, 64, 64)
    ctx.fillStyle = 'rgba(20,22,25,0.5)'
    for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 2)
    noiseOverlay(ctx, 64, rng, 14)
    return finish(c)
  })()

  /* helipad marking: circle + abstract glyph */
  const helipad = (() => {
    const [c, ctx] = canvas(256)
    ctx.clearRect(0, 0, 256, 256)
    ctx.strokeStyle = 'rgba(230,220,180,0.85)'
    ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(128, 128, 100, 0, 7); ctx.stroke()
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.moveTo(96, 84); ctx.lineTo(96, 172)
    ctx.moveTo(160, 84); ctx.lineTo(160, 172)
    ctx.moveTo(96, 128); ctx.lineTo(160, 128)
    ctx.stroke()
    const t = finish(c)
    t.wrapS = THREE.ClampToEdgeWrapping
    t.wrapT = THREE.ClampToEdgeWrapping
    return t
  })()

  cached = { concrete, panel, floor, ceiling, crate, fence, screen, metal, helipad }
  return cached
}

export function disposeTextures(): void {
  if (!cached) return
  for (const t of Object.values(cached)) t.dispose()
  cached = null
}
