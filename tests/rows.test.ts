// Database rows: the fictional company survives the trip into tables and back.

import { describe, expect, it } from 'vitest'
import { fromRows, toRows } from '../src/data/rows'
import { demoSource } from '../src/data/source'
import type { State } from '../src/data/actions'

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id))
const sorted = (s: State) => ({
  ...s,
  territories: byId(s.territories),
  coaches: byId(s.coaches),
  users: byId(s.users),
  centers: byId(s.centers),
  intakes: byId(s.intakes),
  sessions: byId(s.sessions),
})

describe('rows', () => {
  const state = demoSource().getState()

  it('turn the whole company into rows and back without losing anything', () => {
    // The database hands rows back in its own order; the app doesn't depend on order.
    const rows = toRows(state)
    const shuffled = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, [...v].reverse()])) as typeof rows
    expect(sorted(fromRows(shuffled, state.today))).toEqual(sorted(state))
  })

  it('read the database’s time and timestamp formats', () => {
    const rows = toRows(state)
    rows.sessions = rows.sessions.map((s) => ({ ...s, start_time: `${s.start_time}:00`, end_time: `${s.end_time}:00` }))
    rows.intakes = rows.intakes.map((i) => ({ ...i, submitted_at: i.submitted_at.replace('Z', '+00:00') }))
    expect(sorted(fromRows(rows, state.today))).toEqual(sorted(state))
  })

  it('keep pay and prices out of the tables everyone else can read', () => {
    const rows = toRows(state)
    for (const c of rows.coaches) expect(Object.keys(c)).not.toContain('pay_rate')
    for (const c of rows.centers) expect(Object.keys(c)).not.toContain('terms')
    expect(rows.coach_private.every((p) => p.pay_rate > 0)).toBe(true)
  })

  it('give every sign-in a unique email', () => {
    const emails = toRows(state).profiles.map((p) => p.email.toLowerCase())
    expect(new Set(emails).size).toBe(emails.length)
  })

  it('leave a reader without pay access with no pay rates or change logs', () => {
    const rows = { ...toRows(state), coach_private: [] }
    const back = fromRows(rows, state.today)
    expect(back.coaches.every((c) => c.payRate === 0 && c.history.length === 0)).toBe(true)
  })
})
