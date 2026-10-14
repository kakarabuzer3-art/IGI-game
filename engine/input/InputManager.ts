/**
 * InputManager — unified keyboard/mouse/touch input sampling.
 * Owns raw listeners; exposes per-frame consumable state. No game logic here.
 */

export interface TouchState {
  moveX: number // -1..1 virtual stick
  moveY: number
  lookDX: number // accumulated look delta (consumed per frame)
  lookDY: number
  sprint: boolean
  crouch: boolean
  interactHeld: boolean
  interactPressed: boolean
  takedownPressed: boolean
  jammerPressed: boolean
}

export class InputManager {
  private keys = new Set<string>()
  private pressed = new Set<string>() // edge-triggered since last consume
  private mouseDX = 0
  private mouseDY = 0
  private mouseButtons = new Set<number>()

  pointerLocked = false
  touchMode = false

  touch: TouchState = {
    moveX: 0, moveY: 0, lookDX: 0, lookDY: 0,
    sprint: false, crouch: false,
    interactHeld: false, interactPressed: false, takedownPressed: false, jammerPressed: false,
  }

  private el: HTMLElement | null = null
  onLockChange?: (locked: boolean) => void
  onPauseRequest?: () => void

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      this.onPauseRequest?.()
      return
    }
    if (e.repeat) return
    this.keys.add(e.code)
    this.pressed.add(e.code)
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'Tab'].includes(e.code)) e.preventDefault()
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }
  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }
  private onMouseDown = (e: MouseEvent) => {
    this.mouseButtons.add(e.button)
    if (this.pointerLocked) {
      if (e.button === 0) this.pressed.add('Mouse0')
      if (e.button === 2) this.pressed.add('Mouse2')
    }
  }
  private onMouseUp = (e: MouseEvent) => this.mouseButtons.delete(e.button)
  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.el
    this.onLockChange?.(this.pointerLocked)
  }
  private onContextMenu = (e: Event) => e.preventDefault()
  private onBlur = () => {
    this.keys.clear()
    this.mouseButtons.clear()
  }

  attach(el: HTMLElement): void {
    this.el = el
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    el.addEventListener('contextmenu', this.onContextMenu)
  }

  requestLock(): void {
    if (!this.touchMode) this.el?.requestPointerLock?.()
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.el?.removeEventListener('contextmenu', this.onContextMenu)
    this.el = null
  }

  /* -------- per-frame sampling -------- */

  isDown(code: string): boolean {
    return this.keys.has(code)
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code)
  }

  /** consume edge-triggered presses (call once per frame after reading) */
  endFrame(): void {
    this.pressed.clear()
    this.mouseDX = 0
    this.mouseDY = 0
    this.touch.lookDX = 0
    this.touch.lookDY = 0
    this.touch.interactPressed = false
    this.touch.takedownPressed = false
    this.touch.jammerPressed = false
  }

  consumeLook(): { dx: number; dy: number } {
    const dx = this.mouseDX + this.touch.lookDX
    const dy = this.mouseDY + this.touch.lookDY
    this.mouseDX = 0
    this.mouseDY = 0
    this.touch.lookDX = 0
    this.touch.lookDY = 0
    return { dx, dy }
  }

  /** movement axes in [-1..1], x = strafe (+right), y = forward (+fwd) */
  moveAxis(): { x: number; y: number } {
    if (this.touchMode) {
      return { x: this.touch.moveX, y: -this.touch.moveY }
    }
    let x = 0
    let y = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    const l = Math.hypot(x, y)
    if (l > 1) {
      x /= l
      y /= l
    }
    return { x, y }
  }

  sprintHeld(): boolean {
    return this.touchMode ? this.touch.sprint : this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
  }

  crouchTogglePressed(): boolean {
    return this.wasPressed('KeyC')
  }

  crouchHeld(): boolean {
    return this.touchMode ? this.touch.crouch : this.keys.has('ControlLeft') || this.keys.has('ControlRight')
  }

  interactHeld(): boolean {
    return this.touchMode ? this.touch.interactHeld : this.keys.has('KeyE')
  }

  interactPressed(): boolean {
    return this.touchMode ? this.touch.interactPressed : this.wasPressed('KeyE')
  }

  takedownPressed(): boolean {
    return this.touchMode ? this.touch.takedownPressed : this.wasPressed('KeyF')
  }

  jammerPressed(): boolean {
    return this.touchMode ? this.touch.jammerPressed : this.wasPressed('KeyG')
  }

  /* -------- touch API (written by TouchControls component) -------- */

  setTouchMove(x: number, y: number): void {
    this.touch.moveX = x
    this.touch.moveY = y
  }

  addTouchLook(dx: number, dy: number): void {
    this.touch.lookDX += dx
    this.touch.lookDY += dy
  }

  setTouchSprint(v: boolean): void {
    this.touch.sprint = v
  }

  setTouchCrouch(v: boolean): void {
    this.touch.crouch = v
  }

  /** down = begin hold (also edge-trigger), up = release */
  setTouchInteract(down: boolean): void {
    this.touch.interactHeld = down
    if (down) this.touch.interactPressed = true
  }

  pressTakedown(): void {
    this.touch.takedownPressed = true
  }

  pressJammer(): void {
    this.touch.jammerPressed = true
  }

  clearTouch(): void {
    this.touch.moveX = 0
    this.touch.moveY = 0
    this.touch.sprint = false
    this.touch.crouch = false
    this.touch.interactHeld = false
  }
}
