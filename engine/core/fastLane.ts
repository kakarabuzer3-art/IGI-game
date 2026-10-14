/**
 * Fast lane contract — continuous per-frame values are written by the engine
 * directly to DOM nodes (no React re-renders). The HUD publishes element
 * handles to the Game instance; the Game's frame callback writes styles.
 */
export interface FastHandles {
  compassTicks?: (HTMLDivElement | null)[]
  staminaBar?: HTMLElement | null
  healthWrap?: HTMLElement | null
  healthBar?: HTMLElement | null
  suspicionFill?: HTMLElement | null
  vignette?: HTMLElement | null
  holdWrap?: HTMLElement | null
  holdRing?: SVGCircleElement | null
}

export const HOLD_CIRCUMFERENCE = 2 * Math.PI * 26
export const COMPASS_HALF_WIDTH_DEG = 70 // visible half-window in degrees
