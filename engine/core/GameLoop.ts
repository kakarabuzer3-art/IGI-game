/**
 * Fixed-timestep game loop decoupled from rendering.
 *  - simulation advances in fixed 1/60 s steps (max 5 catch-up steps/frame)
 *  - render callback runs once per rAF with current interpolation alpha
 *  - auto-suspends when tab hidden (Visibility API) to save CPU/GPU
 *  - full teardown via dispose(): no zombie rAF handles
 */

export interface LoopHooks {
  update: (dt: number) => void
  render: (alpha: number) => void
}

const FIXED_DT = 1 / 60
const MAX_STEPS = 5

export class GameLoop {
  private raf = 0
  private last = 0
  private acc = 0
  private running = false
  private paused = false

  /** rolling fps estimate for the performance HUD */
  fps = 60

  constructor(private hooks: LoopHooks) {
    this.onVisibility = this.onVisibility.bind(this)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = 0 // first rAF frame initializes the clock (avoids epoch skew)
    this.acc = 0
    document.addEventListener('visibilitychange', this.onVisibility)
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.raf = 0
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  /** pause simulation+render (menu open). Loop keeps rAF but does no work. */
  setPaused(p: boolean): void {
    this.paused = p
    if (!p) {
      this.last = 0 // re-initialize clock on unpause
      this.acc = 0
    }
  }

  dispose(): void {
    this.stop()
  }

  private onVisibility(): void {
    if (document.hidden) {
      // simulate a pause while hidden; frame() early-returns via last-reset
      this.last = 0
    }
  }

  private frame = (now: number): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)

    if (document.hidden || this.last === 0) {
      this.last = now
      return
    }

    const frameTime = Math.min(Math.max(now - this.last, 0), 250) / 1000
    this.last = now
    if (frameTime > 0) this.fps = this.fps * 0.95 + (1 / frameTime) * 0.05

    if (this.paused) return

    this.acc += frameTime
    if (this.acc < 0) this.acc = 0 // clock-skew guard
    let steps = 0
    while (this.acc >= FIXED_DT && steps < MAX_STEPS) {
      this.hooks.update(FIXED_DT)
      this.acc -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS) this.acc = 0 // avoid spiral of death
    this.hooks.render(this.acc / FIXED_DT)
  }
}
