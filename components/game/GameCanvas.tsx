'use client'

/**
 * GameCanvas — thin React wrapper that mounts the engine into a container
 * div. All gameplay renders here (WebGL + minimap 2D canvas). No React state.
 */

import { useEffect, useRef } from 'react'
import type { Game } from '@/engine/Game'

export default function GameCanvas({
  game,
  onMounted,
}: {
  game: Game
  onMounted: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const onMountedRef = useRef(onMounted)
  useEffect(() => {
    onMountedRef.current = onMounted
  }, [onMounted])

  useEffect(() => {
    const el = containerRef.current
    const mm = minimapRef.current
    if (!el || !mm) return
    game.mount(el, mm)
    onMountedRef.current()
    return () => {
      game.unmount()
    }
  }, [game])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden bg-[#04060a]"
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute right-2 top-14 z-10 md:right-3 md:top-3">
        <div className="sp-panel p-1 md:p-1.5">
          <canvas
            ref={minimapRef}
            width={182}
            height={182}
            className="block h-[96px] w-[96px] md:h-[182px] md:w-[182px]"
            role="img"
            aria-label="Tactical minimap — explored areas, known contacts and objectives"
          />
          <div className="sp-label mt-1 hidden text-center md:block">SECTOR MAP</div>
        </div>
      </div>
      <div className="sp-scanlines" />
    </div>
  )
}
