// @vitest-environment jsdom
// @vitest-environment-options {"pretendToBeVisual": true}
/**
 * Game integration test — runs the REAL Game orchestrator lifecycle in jsdom
 * with three.js and canvas surfaces stubbed: mount → startMission → insertion
 * fade → playing (sim loop stepping) → snapshots → pause/resume → abort →
 * dispose. Catches wiring/lifecycle errors that pure-logic tests cannot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ---------- stub browser surfaces BEFORE importing the engine ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeStub(): any {
  const fn = function () {
    return makeStub()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return new Proxy(fn, {
    construct: () => makeStub(),
    apply: () => makeStub(),
    get: (_t, p) => {
      if (p === Symbol.toPrimitive) return () => 0
      if (p === 'valueOf') return () => 0
      if (p === 'toString') return () => 'stub'
      if (p === 'then') return undefined
      if (p === Symbol.iterator) return undefined
      if (p === 'domElement') {
        const c = document.createElement('canvas')
        return c
      }
      return makeStub()
    },
    set: () => true,
  })
}

vi.mock('three', () => ({
  default: new Proxy({}, { get: () => makeStub() }),
  ...Object.fromEntries(
    [
      'Scene', 'PerspectiveCamera', 'WebGLRenderer', 'BufferGeometry',
      'Float32BufferAttribute', 'Mesh', 'Group', 'Sprite', 'SpriteMaterial',
      'MeshLambertMaterial', 'MeshBasicMaterial', 'BoxGeometry', 'SphereGeometry',
      'CylinderGeometry', 'PlaneGeometry', 'CircleGeometry', 'RingGeometry',
      'PointLight', 'HemisphereLight', 'AmbientLight', 'Color', 'FogExp2',
      'CanvasTexture', 'Vector3', 'Object3D',
    ].map((k) => [k, makeStub()]),
  ),
  RepeatWrapping: 1000,
  ClampToEdgeWrapping: 1001,
  SRGBColorSpace: 'srgb',
  ACESFilmicToneMapping: 4,
  DoubleSide: 2,
  AdditiveBlending: 2,
}))

vi.mock('@/engine/render/textures', () => ({
  getTextures: () =>
    new Proxy(
      {},
      { get: () => ({}) },
    ),
  disposeTextures: () => {},
}))

// 2D canvas context stub (jsdom has no canvas backend)
const ctx2d = (): unknown => makeStub()
HTMLCanvasElement.prototype.getContext = ((kind: string) => {
  if (kind === '2d') return ctx2d()
  return null
}) as unknown as typeof HTMLCanvasElement.prototype.getContext

if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {},
      onchange: null, dispatchEvent: () => false,
    }),
  })
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

// jsdom reports visibilityState 'prerender' → document.hidden true, which the
// loop's Visibility-API power-saving gate honors. Make the page "visible".
Object.defineProperty(document, 'hidden', { value: false, configurable: true })
Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })

/* ---------- imports after mocks ---------- */
import { Game } from '@/engine/Game'
import { DEFAULT_SETTINGS, type GamePhase, type GameSnapshot } from '@/engine/core/types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sizedDiv(w = 960, h = 540): HTMLDivElement {
  const d = document.createElement('div')
  Object.defineProperty(d, 'clientWidth', { value: w, configurable: true })
  Object.defineProperty(d, 'clientHeight', { value: h, configurable: true })
  return d
}

describe('Game lifecycle integration (jsdom)', () => {
  let game: Game
  let phases: GamePhase[] = []
  let snapshots: GameSnapshot[] = []

  beforeEach(() => {
    phases = []
    snapshots = []
  })

  it('runs the full mission lifecycle without errors', async () => {
    game = new Game(DEFAULT_SETTINGS, {
      onSnapshot: (s) => snapshots.push(s),
      onPhase: (p) => phases.push(p),
    })
    const container = sizedDiv()
    document.body.appendChild(container)
    const minimap = document.createElement('canvas')
    container.appendChild(minimap)

    game.mount(container, minimap)
    game.startMission('nightfall')
    expect(game.phase).toBe('insertion')

    // insertion fades into player control
    await wait(2300)
    expect(game.phase).toBe('playing')
    expect(phases).toContain('insertion')
    expect(phases).toContain('playing')

    // snapshots are flowing with correct mission shape
    expect(snapshots.length).toBeGreaterThan(5)
    const snap = snapshots[snapshots.length - 1]
    expect(snap.codeName).toBe('NIGHTFALL')
    expect(snap.objectives.length).toBe(4)
    expect(snap.objectives[0].id).toBe('infiltrate')
    expect(snap.alert.level).toBe('undetected')
    expect(snap.health).toBe(100)

    // simulate forward movement
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    await wait(400)
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
    expect(game.phase).toBe('playing')

    // pause / resume
    game.pause()
    expect(game.phase).toBe('paused')
    const snapCountAtPause = snapshots.length
    await wait(250)
    expect(snapshots.length).toBeLessThan(snapCountAtPause + 5) // sim halted
    game.resume()
    expect(game.phase).toBe('playing')

    // restart resets the mission
    game.restart()
    expect(game.phase).toBe('insertion')
    await wait(2000)
    expect(game.phase).toBe('playing')

    // abort + teardown
    game.abort()
    expect(game.phase).toBe('idle')
    game.dispose()
    await wait(120) // no zombie frames should throw
    document.body.removeChild(container)
  }, 30000)
})
