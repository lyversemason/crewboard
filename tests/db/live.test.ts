// Live mode against the running local database: signing in by email code (the
// email is read from the local catcher, Mailpit), reading through the access
// rules, and refusing everyone who shouldn't be in.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { visibleIntakes, visibleSessions } from '../../src/engine'
import type { User } from '../../src/engine'
import { READ_ONLY_MESSAGE, createLive } from '../../src/data/live'
import type { AuthState, Live } from '../../src/data/live'
import { TABLE_ORDER, fromRows } from '../../src/data/rows'
import type { Rows } from '../../src/data/rows'
import type { State } from '../../src/data/actions'
import { LOCAL_PASSWORD, localDb, readAll, serverClient } from '../../scripts/local-db'

const db = localDb()
const server = serverClient(db)
const MAILPIT = db.url.replace(':54321', ':54324')
let truth: State

beforeAll(async () => {
  const rows = Object.fromEntries(await Promise.all(TABLE_ORDER.map(async (t) => [t, await readAll(server, t)]))) as Rows
  if (!rows.territories.length) throw new Error('The local database is empty. Run `npm run db:reset` first.')
  truth = fromRows(rows, new Date().toISOString().slice(0, 10))
})

const person = (id: string): User => truth.users.find((u) => u.id === id)!
const email = (u: User) => u.email
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

/** Waits until sign-in has settled (loaded or refused). */
function settled(live: Live): Promise<AuthState> {
  return new Promise((resolve, reject) => {
    const done = () => {
      const a = live.auth.get()
      if (a.status === 'ready' || a.status === 'no-access') {
        stop()
        resolve(a)
      }
    }
    const stop = live.auth.subscribe(done)
    setTimeout(() => reject(new Error(`Sign-in didn't settle: ${JSON.stringify(live.auth.get())}`)), 20_000)
    done()
  })
}

const newLive = () => createLive(db.url, db.anonKey, { browser: false })

async function signInWithPassword(u: User) {
  const live = newLive()
  const { error } = await live.client.auth.signInWithPassword({ email: email(u), password: LOCAL_PASSWORD })
  if (error) throw new Error(error.message)
  return { live, auth: await settled(live) }
}

async function mailpitMessages(to: string): Promise<{ ID: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  return ((await res.json()) as { messages: { ID: string }[] }).messages
}

async function latestCode(to: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const [m] = await mailpitMessages(to)
    if (m) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { HTML: string; Subject: string }
      expect(msg.Subject).toBe('Your SoccerSessions sign-in')
      const code = msg.HTML.match(/<strong>(\d{6})<\/strong>/)?.[1]
      if (code) return code
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No sign-in email arrived for ${to}`)
}

const clearMail = () => fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })

describe('signing in by email', () => {
  beforeAll(clearMail)

  it('a territory manager gets a code by email, signs in, and sees only their territory', async () => {
    const tm = person('tm-lou')
    const live = newLive()
    await live.auth.sendLink(email(tm))
    await live.auth.verifyCode(email(tm), await latestCode(email(tm)))
    const auth = await settled(live)
    expect(auth).toEqual({ status: 'ready', me: tm })

    const state = live.source.getState()
    expect(ids(state.sessions)).toEqual(ids(visibleSessions(tm, truth.sessions)))
    expect(state.sessions.every((s) => s.territoryId === 'lou')).toBe(true)
    expect(state.coaches.every((c) => c.payRate > 0)).toBe(true) // management sees pay
    await live.auth.signOut()
    expect(live.auth.get().status).toBe('signed-out')
  })

  it('a wrong code is refused', async () => {
    const live = newLive()
    const rep = person('rep-west')
    await live.auth.sendLink(email(rep))
    await latestCode(email(rep))
    await expect(live.auth.verifyCode(email(rep), '000000')).rejects.toThrow(/didn’t work/)
    expect(live.auth.get().status).not.toBe('ready')
  })

  it('an unknown address gets the same answer but no email', async () => {
    const live = newLive()
    await expect(live.auth.sendLink('nobody@outside.example')).resolves.toBeUndefined()
    await new Promise((r) => setTimeout(r, 1000))
    expect(await mailpitMessages('nobody@outside.example')).toEqual([])
  })
})

describe('what each person gets in live mode', () => {
  it('a coach: only their own shifts, and no pay rates at all', async () => {
    const coach = truth.users.find((u) => u.role === 'coach' && truth.sessions.some((s) => s.assignments.some((a) => a.coachId === u.coachId)))!
    const { live, auth } = await signInWithPassword(coach)
    expect(auth).toEqual({ status: 'ready', me: coach })
    const state = live.source.getState()
    expect(ids(state.sessions)).toEqual(ids(visibleSessions(coach, truth.sessions)))
    expect(state.coaches.every((c) => c.payRate === 0 && c.history.length === 0)).toBe(true)
    expect(state.centers.every((c) => c.terms === undefined)).toBe(true)
    await live.auth.signOut()
  })

  it('a sales rep: their own submissions and the prices they signed, nothing else', async () => {
    const rep = person('rep-east')
    const { live } = await signInWithPassword(rep)
    const state = live.source.getState()
    expect(ids(state.intakes)).toEqual(ids(visibleIntakes(rep, truth.intakes)))
    const signed = new Set(state.intakes.map((i) => i.centerId))
    expect(state.centers.every((c) => signed.has(c.id))).toBe(true)
    expect(state.coaches.every((c) => c.payRate === 0)).toBe(true)
    await live.auth.signOut()
  })

  it('saving is refused with a plain explanation (read-only for now)', async () => {
    const { live } = await signInWithPassword(person('admin'))
    await expect(live.source.run('updateSettings', person('admin'), [truth.settings])).rejects.toThrow(READ_ONLY_MESSAGE)
    await live.auth.signOut()
  })
})

describe('a deactivated person', () => {
  beforeAll(async () => {
    const { error } = await server.from('profiles').update({ status: 'deactivated' }).eq('id', 'tm-oak')
    if (error) throw error
  })
  afterAll(async () => {
    await server.from('profiles').update({ status: 'active' }).eq('id', 'tm-oak')
  })

  it('is told their access is off and gets no data', async () => {
    const { live, auth } = await signInWithPassword(person('tm-oak'))
    expect(auth).toEqual({ status: 'no-access', email: email(person('tm-oak')), reason: 'deactivated' })
    expect(live.source.getState().sessions).toEqual([])
    await live.auth.signOut()
  })
})
