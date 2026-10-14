/**
 * Minimal typed event bus. Decouples engine systems from each other and from
 * the React UI layer (UI subscribes; engine emits). No dependencies.
 */

import type { GameEvents } from './types'

type Handler<T> = (payload: T) => void

export class EventBus {
  private handlers = new Map<string, Set<Handler<never>>>()

  on<K extends keyof GameEvents>(event: K, cb: Handler<GameEvents[K]>): () => void {
    const key = event as string
    let set = this.handlers.get(key)
    if (!set) {
      set = new Set()
      this.handlers.set(key, set)
    }
    set.add(cb as Handler<never>)
    return () => this.off(event, cb)
  }

  off<K extends keyof GameEvents>(event: K, cb: Handler<GameEvents[K]>): void {
    this.handlers.get(event as string)?.delete(cb as Handler<never>)
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event as string)
    if (!set) return
    // copy to allow unsubscribe during emit
    for (const cb of [...set]) (cb as Handler<GameEvents[K]>)(payload)
  }

  clear(): void {
    this.handlers.clear()
  }
}
