// Where the app's data lives. Screens never talk to a source directly: they
// go through src/store.ts, which picks one: the demo source (this browser's
// copy of the fictional company) or the live source (src/data/live.ts), which
// runs the same named actions and queries on a server, which is why they're async.

import { mondayOf, todayLocal } from '../engine'
import type { User } from '../engine'
import { ACTIONS } from './actions'
import type { ActionArgs, ActionName, ActionResult, State } from './actions'
import { auditEntries, auditFromHistory } from './audit'
import { QUERIES } from './queries'
import type { QueryArgs, QueryName, QueryResult } from './queries'
import { buildDemo } from './seed'

export interface DataSource {
  readonly kind: 'demo' | 'live'
  /** The latest copy of the data this browser may see. */
  getState(): State
  /** Called after every change; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
  /** Runs one action as `user`. Refusals (no permission, broken rule) reject with a LifecycleError. */
  run<N extends ActionName>(name: N, user: User, args: ActionArgs<N>): Promise<ActionResult<N>>
  /** Asks a question that changes nothing (see queries.ts). */
  query<N extends QueryName>(name: N, user: User, args: QueryArgs<N>): Promise<QueryResult<N>>
  /** Demo only: rebuild the fictional company and discard every change. */
  reset?(): void
}

// v4: people gained an email, account status and history (v2.7.0); older saves are rebuilt.
const KEY = 'soccersessions:v4'

function fresh(): State {
  const today = todayLocal()
  const company = { ...buildDemo(today), today, audit: [] }
  return { ...company, audit: auditFromHistory(company) }
}

/** The demo keeps the newest entries; a real log keeps everything. */
const DEMO_AUDIT_LIMIT = 2000

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as State
      // A saved demo from an older week would look stale: rebuild it.
      if (saved.seededForWeek === mondayOf(todayLocal()) && Array.isArray(saved.audit)) return { ...saved, today: todayLocal() }
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
      const at = new Date().toISOString()
      const action = ACTIONS[name] as (...a: unknown[]) => { state: State; result: ActionResult<typeof name> }
      const outcome = action({ state, user, at }, ...args)
      if (outcome.state !== state) {
        let n = state.audit.length ? Number(state.audit.at(-1)!.id.slice(1)) : 0
        const added = auditEntries(state, outcome.state, user, name, at).map((e) => ({ ...e, id: `a${++n}` }))
        commit({ ...outcome.state, audit: [...state.audit, ...added].slice(-DEMO_AUDIT_LIMIT) })
      }
      return outcome.result
    },
    async query(name, user, args) {
      const query = QUERIES[name] as (...a: unknown[]) => QueryResult<typeof name>
      return query({ state, user, at: new Date().toISOString() }, ...args)
    },
    reset: () => commit(fresh()),
  }
}
