// The database's read rules, checked against the running local database
// (`npm run db:reset`, then `npm run test:db`). Signs in as every person in
// the fictional company and checks the database hands back exactly the rows
// src/engine/access.ts says they may see: no more, no less.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canAssign, canSeeMoney, intakeSessions, visibleIntakes, visibleRoster, visibleSessions } from '../../src/engine'
import type { User } from '../../src/engine'
import { TABLE_ORDER, fromRows } from '../../src/data/rows'
import type { ProfileRow, Rows } from '../../src/data/rows'
import type { State } from '../../src/data/actions'
import { LOCAL_PASSWORD, browserClient, localDb, readAll, serverClient } from '../../scripts/local-db'

const db = localDb()
const server = serverClient(db)
let truth: State
let profiles: ProfileRow[]

beforeAll(async () => {
  const rows = Object.fromEntries(await Promise.all(TABLE_ORDER.map(async (t) => [t, await readAll(server, t)]))) as Rows
  if (!rows.territories.length) throw new Error('The local database is empty. Run `npm run db:reset` first.')
  truth = fromRows(rows, new Date().toISOString().slice(0, 10))
  profiles = rows.profiles
})

async function signIn(user: User): Promise<SupabaseClient> {
  const client = browserClient(db)
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: LOCAL_PASSWORD })
  if (error) throw new Error(`${user.id}: ${error.message}`)
  return client
}

async function ids(client: SupabaseClient, table: string, column = 'id'): Promise<string[]> {
  const { data, error } = await client.from(table).select(column)
  if (error) throw new Error(`${table}: ${error.message}`)
  return (data as unknown as Record<string, string>[]).map((r) => r[column]).sort()
}

const sortedIds = (xs: { id: string }[]) => [...new Set(xs.map((x) => x.id))].sort()

/** What each person may read, from the app's own rules. */
function expected(user: User) {
  const t = truth
  const intakes = visibleIntakes(user, t.intakes)
  const sessions = [...visibleSessions(user, t.sessions), ...intakes.flatMap((i) => intakeSessions(user, i, t.sessions))]
  const me = t.coaches.filter((c) => c.id === user.coachId)
  // visibleRoster leaves out an inactive coach's own record; the database lets
  // everyone read their own record (the availability screen needs it).
  const roster = [...visibleRoster(user, t.coaches), ...me]
  const signed = new Set(intakes.filter((i) => i.salesRepId === user.id).map((i) => i.centerId))
  const onShift = new Set(sessions.filter((s) => s.assignments.some((a) => a.coachId === user.coachId)).map((s) => s.centerId))
  const centers = t.centers.filter((c) => canAssign(user, c.territoryId) || signed.has(c.id) || onShift.has(c.id))
  const unique = [...new Map(sessions.map((s) => [s.id, s])).values()]
  return {
    sessions: sortedIds(unique),
    assignments: unique.reduce((n, s) => n + s.assignments.length, 0),
    intakes: sortedIds(intakes),
    coaches: sortedIds(roster),
    pay: canSeeMoney(user) ? sortedIds(roster.filter((c) => canAssign(user, c.territoryId))) : [],
    centers: sortedIds(centers),
    terms: sortedIds(centers.filter((c) => (c.terms || c.history) && (canAssign(user, c.territoryId) || signed.has(c.id)))),
    profiles: profiles
      .filter((p) => p.id === user.id || user.role === 'ops_admin' || (user.role === 'territory_manager' && p.territory_ids.some((x) => user.territoryIds.includes(x))))
      .map((p) => p.id)
      .sort(),
  }
}

describe('each person reads exactly what access.ts allows', () => {
  // Every office person, and every coach (each coach's shifts are different).
  it.each(['admin', 'tm-lou', 'tm-knx', 'tm-oak', 'rep-east', 'rep-west'])('%s', async (id) => {
    await check(truth.users.find((u) => u.id === id)!)
  })

  it('every coach', async () => {
    // People from the seed have a local password; anyone invited by another test signs in by code only.
    for (const user of truth.users.filter((u) => u.role === 'coach' && u.status === 'active' && !u.invitedBy)) await check(user)
  })

  async function check(user: User) {
    const client = await signIn(user)
    const want = expected(user)
    expect(await ids(client, 'sessions'), `${user.id} sessions`).toEqual(want.sessions)
    expect((await ids(client, 'session_assignments', 'coach_id')).length, `${user.id} assignments`).toBe(want.assignments)
    expect(await ids(client, 'intakes'), `${user.id} intakes`).toEqual(want.intakes)
    expect(await ids(client, 'coaches'), `${user.id} coaches`).toEqual(want.coaches)
    expect(await ids(client, 'coach_private', 'coach_id'), `${user.id} pay`).toEqual(want.pay)
    expect(await ids(client, 'centers'), `${user.id} centers`).toEqual(want.centers)
    expect(await ids(client, 'center_terms', 'center_id'), `${user.id} prices`).toEqual(want.terms)
    expect(await ids(client, 'profiles'), `${user.id} profiles`).toEqual(want.profiles)
    expect(await ids(client, 'territories'), `${user.id} territories`).toEqual(sortedIds(truth.territories))
    expect((await ids(client, 'settings')).length, `${user.id} settings`).toBe(1)
    await client.auth.signOut()
  }
})

describe('nobody else reads anything', () => {
  it('someone not signed in gets nothing', async () => {
    const client = browserClient(db)
    for (const table of TABLE_ORDER) {
      const { data } = await client.from(table).select('*')
      expect(data ?? [], table).toEqual([])
    }
  })

  describe('a deactivated person', () => {
    const who = () => truth.users.find((u) => u.id === 'tm-knx')!
    beforeAll(async () => {
      const { error } = await server.from('profiles').update({ status: 'deactivated' }).eq('id', 'tm-knx')
      if (error) throw error
    })
    afterAll(async () => {
      await server.from('profiles').update({ status: 'active' }).eq('id', 'tm-knx')
    })

    it('can still sign in to the account but sees nothing', async () => {
      const client = await signIn(who())
      for (const table of TABLE_ORDER) {
        if (table === 'profiles') continue
        const { data } = await client.from(table).select('*')
        expect(data ?? [], table).toEqual([])
      }
      // Only their own profile, so the app can say "your access was removed".
      expect(await ids(client, 'profiles')).toEqual(['tm-knx'])
    })
  })
})

describe('sign-up is invitation only', () => {
  it('a stranger can’t create an account, by password or by email link', async () => {
    const client = browserClient(db)
    const signUp = await client.auth.signUp({ email: 'stranger@outside.example', password: 'whatever-password-123' })
    expect(signUp.error?.message).toMatch(/signups not allowed/i)
    const link = await client.auth.signInWithOtp({ email: 'stranger@outside.example', options: { shouldCreateUser: true } })
    expect(link.error?.message).toMatch(/signups not allowed/i)
  })
})

describe('browsers can’t change anything', () => {
  it('not even the ops admin can insert, update or delete directly', async () => {
    const client = await signIn(truth.users.find((u) => u.id === 'admin')!)
    const s = truth.sessions[0]
    const insert = await client.from('territories').insert({ id: 'x', name: 'X', state: 'XX', center_lat: 0, center_lng: 0 })
    const update = await client.from('sessions').update({ notes: 'changed' }).eq('id', s.id)
    const remove = await client.from('sessions').delete().eq('id', s.id)
    for (const r of [insert, update, remove]) expect(r.error?.code).toBe('42501') // permission denied
    const { data } = await server.from('sessions').select('notes').eq('id', s.id).single()
    expect(data!.notes ?? undefined).toBe(s.notes)
  })
})

describe('records are never deleted', () => {
  it('even server code with full access can’t delete', async () => {
    const s = truth.sessions[0]
    const { error } = await server.from('sessions').delete().eq('id', s.id)
    expect(error?.message).toMatch(/never deleted/)
    const { count } = await server.from('sessions').select('*', { count: 'exact', head: true }).eq('id', s.id)
    expect(count).toBe(1)
  })
})
