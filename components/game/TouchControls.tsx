'use client'

/**
 * TouchControls — touch-first simplified tactical controls.
 * Left half: floating virtual stick. Right half: drag-look.
 * Oversized action buttons. Talks to the engine exclusively through
 * InputManager methods (no direct mutation of React-visible values).
 */

import { useEffect, useRef, useState } from 'react'
import type { Game } from '@/engine/Game'

export default function TouchControls({ game }: { game: Game }) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const stickId = useRef<number | null>(null)
  const lookId = useRef<number | null>(null)
  const origin = useRef({ x: 0, y: 0 })
  const lastLook = useRef({ x: 0, y: 0 })
  const [stickPos, setStickPos] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [crouch, setCrouch] = useState(false)
  const [sprint, setSprint] = useState(false)

  useEffect(() => {
    const input = game.input
    return () => input.clearTouch()
  }, [game])

  const onLeftDown = (e: React.PointerEvent) => {
    if (stickId.current !== null || !leftRef.current) return
    stickId.current = e.pointerId
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const rect = leftRef.current.getBoundingClientRect()
    origin.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setStickPos({ ...origin.current })
    setKnob({ ...origin.current })
  }
  const onLeftMove = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId || !leftRef.current) return
    const rect = leftRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left - origin.current.x
    const dy = e.clientY - rect.top - origin.current.y
    const len = Math.hypot(dx, dy)
    const max = 56
    const cl = len > max ? max / len : 1
    setKnob({ x: origin.current.x + dx * cl, y: origin.current.y + dy * cl })
    game.input.setTouchMove((dx * cl) / max, (dy * cl) / max)
  }
  const onLeftUp = (e: React.PointerEvent) => {
    if (stickId.current !== e.pointerId) return
    stickId.current = null
    setStickPos(null)
    game.input.setTouchMove(0, 0)
  }

  const onRightDown = (e: React.PointerEvent) => {
    if (lookId.current !== null) return
    lookId.current = e.pointerId
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    lastLook.current = { x: e.clientX, y: e.clientY }
  }
  const onRightMove = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return
    const dx = e.clientX - lastLook.current.x
    const dy = e.clientY - lastLook.current.y
    lastLook.current = { x: e.clientX, y: e.clientY }
    game.input.addTouchLook(dx * 2.4, dy * 2.4)
  }
  const onRightUp = (e: React.PointerEvent) => {
    if (lookId.current !== e.pointerId) return
    lookId.current = null
  }

  return (
    <div className="absolute inset-0 z-20 md:hidden" aria-hidden="true">
      {/* look zone (right) */}
      <div
        ref={rightRef}
        className="sp-touch-zone right-0 w-1/2"
        onPointerDown={onRightDown}
        onPointerMove={onRightMove}
        onPointerUp={onRightUp}
        onPointerCancel={onRightUp}
      />
      {/* move zone (left) */}
      <div
        ref={leftRef}
        className="sp-touch-zone left-0 w-1/2"
        onPointerDown={onLeftDown}
        onPointerMove={onLeftMove}
        onPointerUp={onLeftUp}
        onPointerCancel={onLeftUp}
      >
        {stickPos && (
          <>
            <div className="sp-stick-base" style={{ left: stickPos.x, top: stickPos.y }} />
            <div className="sp-stick-knob" style={{ left: knob.x, top: knob.y }} />
          </>
        )}
      </div>

      {/* posture toggles (left, above stick area) */}
      <div className="absolute bottom-44 left-3 flex flex-col gap-2">
        <button
          className={`sp-touch-btn h-14 w-14 rounded-full ${crouch ? 'active' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault()
            const next = !crouch
            setCrouch(next)
            game.input.setTouchCrouch(next)
          }}
          aria-label="Toggle crouch"
        >
          CROUCH
        </button>
        <button
          className={`sp-touch-btn h-14 w-14 rounded-full ${sprint ? 'active' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault()
            const next = !sprint
            setSprint(next)
            game.input.setTouchSprint(next)
          }}
          aria-label="Toggle sprint"
        >
          RUN
        </button>
      </div>

      {/* action cluster (right) */}
      <div className="absolute bottom-40 right-3 flex flex-col items-end gap-2.5">
        <button
          className="sp-touch-btn h-12 w-12 rounded-full"
          onPointerDown={(e) => { e.preventDefault(); game.input.pressJammer() }}
          aria-label="Activate jammer"
        >
          JAM
        </button>
        <button
          className="sp-touch-btn h-12 w-12 rounded-full"
          onPointerDown={(e) => { e.preventDefault(); game.input.pressTakedown() }}
          aria-label="Takedown"
        >
          T.K.
        </button>
        <button
          className="sp-touch-btn h-20 w-20 rounded-full text-[13px]"
          onPointerDown={(e) => { e.preventDefault(); game.input.setTouchInteract(true) }}
          onPointerUp={() => game.input.setTouchInteract(false)}
          onPointerCancel={() => game.input.setTouchInteract(false)}
          aria-label="Interact / hold to use"
        >
          USE
        </button>
      </div>

      {/* pause */}
      <button
        className="sp-touch-btn absolute right-3 top-3 h-11 w-11 rounded-sm"
        onPointerDown={(e) => { e.preventDefault(); game.pause() }}
        aria-label="Pause"
      >
        ❚❚
      </button>
    </div>
  )
}
