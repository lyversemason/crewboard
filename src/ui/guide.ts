// "Demo guide": optional explanations for visitors (e.g. someone reviewing this
// as a portfolio piece). Off by default so the app reads like a working tool.

import { useSyncExternalStore } from 'react'

const KEY = 'soccersessions:guide'
let on = false
try {
  on = localStorage.getItem(KEY) === '1'
} catch {
  /* storage blocked: guide stays off */
}
const listeners = new Set<() => void>()

export function useGuide(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on,
  )
}

export function setGuide(next: boolean) {
  on = next
  try {
    localStorage.setItem(KEY, next ? '1' : '0')
  } catch {
    /* fine */
  }
  listeners.forEach((l) => l())
}
