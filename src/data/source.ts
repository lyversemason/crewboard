// Where the app's data lives. Screens never talk to a source directly: they
// go through src/store.ts, which picks one. Today there is only the demo
// source (this browser's copy of the fictional company). A live source backed
// by a shared database is planned in docs/accounts-plan.md; it will run the
// same named actions on a server, which is why `run` is async.

import { mondayOf, todayLocal } from '../engine'
import type { User } from '../engine'
import { ACTIONS } from './actions'
import type { ActionArgs, ActionName, ActionResult, State } from './actions'
import { buildDemo } from './seed'

export interface DataSource {
  readonly kind: 'demo' | 'live'
  /** The latest copy of the data this browser may see. */
  getState(): State
  /** Called after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Runs one action as `user`. Refusals (no permission, broken rule) reject with a LifecycleError. */
  run<N extends ActionName>(name: N, user: User, args: ActionArgs<N>): Promise<ActionResult<N>>
  /** Demo only: rebuild the fictional company and discard every change. */
  reset?(): void
}

// v4: people gained an email, account status and history (v2.7.0); older saves are rebuilt.
const KEY = 'soccersessions:v4'

function fresh(): State {
  const today = todayLocal()
  return { ...buildDemo(today), today }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as State
      // A saved demo from an older week would look stale: rebuild it.
      if (saved.seededForWeek === mondayOf(todayLocal())) return { ...saved, today: todayLocal() }
    }
  } catch {
    /* storage blocked or corrupt: fall through to a fresh demo */
  }
  return fresh()
}

/** The fictional company, kept in this browser's localStorage so edits survive a reload. */
export function demoSource(): DataSource {
  let state = load()
  const listeners = new Set<() => void>()

  function commit(next: State) {
    state = next
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* private mode: the demo still works for this visit */
    }
    listeners.forEach((l) => l())
  }

  return {
    kind: 'demo',
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async run(name, user, args) {
      const action = ACTIONS[name] as (...a: unknown[]) => { state: State; result: ActionResult<typeof name> }
      const outcome = action({ state, user, at: new Date().toISOString() }, ...args)
      if (outcome.state !== state) commit(outcome.state)
      return outcome.result
    },
    reset: () => commit(fresh()),
  }
}
