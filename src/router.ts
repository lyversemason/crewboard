// Hash routes: #/<userId>/<view>?key=value
// Every screen has a shareable link, e.g. #/tm-lou/calendar or #/u-lou-k1/shifts.

import { useSyncExternalStore } from 'react'

export interface Route {
  userId?: string
  view?: string
  params: URLSearchParams
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  const [userId, view] = path.split('/').filter(Boolean)
  return { userId, view, params: new URLSearchParams(query) }
}

let current = parse()
let currentHash = window.location.hash

// One listener tells every screen about a new address in the same moment. If
// each screen listened on its own, React could redraw an inner screen with the
// new address while the outer one still had the old person.
const listeners = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse()
  currentHash = window.location.hash
  listeners.forEach((l) => l())
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): Route {
  if (window.location.hash !== currentHash) {
    current = parse()
    currentHash = window.location.hash
  }
  return current
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot)
}

export function href(userId?: string, view?: string, params: Record<string, string | undefined> = {}): string {
  if (!userId) return '#/'
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const qs = q.toString()
  return `#/${userId}${view ? `/${view}` : ''}${qs ? `?${qs}` : ''}`
}

export function go(userId?: string, view?: string, params: Record<string, string | undefined> = {}) {
  window.location.hash = href(userId, view, params)
}

/** Change some query params on the current route, keeping the rest. */
export function setParams(route: Route, changes: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = Object.fromEntries(route.params.entries())
  Object.assign(merged, changes)
  go(route.userId, route.view, merged)
}
