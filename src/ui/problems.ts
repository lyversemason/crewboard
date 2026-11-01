// One place to show "that didn't work" for buttons that don't have their own
// error spot (a coach's Confirm, a bulk-staffing button…). In the demo these
// rarely fail; in live mode the server can refuse or be unreachable.

import { useSyncExternalStore } from 'react'

let message = ''
const listeners = new Set<() => void>()

function set(next: string) {
  message = next
  listeners.forEach((l) => l())
}

export function showProblem(e: unknown) {
  set(e instanceof Error ? e.message : String(e))
}

export const clearProblem = () => set('')

export function useProblem(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => message,
  )
}

/** Runs a change from a button; if it fails, says why instead of failing silently. */
export function attempt(fn: () => Promise<unknown>): Promise<void> {
  return fn().then(
    () => undefined,
    (e: unknown) => showProblem(e),
  )
}
