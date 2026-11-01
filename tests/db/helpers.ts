// Shared by the database tests: signing in, reading the whole database as the
// server sees it, and reading the local email catcher (Mailpit).

import { createLive } from '../../src/data/live'
import type { AuthState, Live } from '../../src/data/live'
import { TABLE_ORDER, fromRows } from '../../src/data/rows'
import type { AuditRow, Rows } from '../../src/data/rows'
import type { State } from '../../src/data/actions'
import { LOCAL_PASSWORD, localDb, readAll, serverClient } from '../../scripts/local-db'

export const db = localDb()
export const server = serverClient(db)
export const MAILPIT = db.url.replace(':54321', ':54324')

/** Everything in the database right now, as the app's State. */
export async function truth(): Promise<State> {
  const rows = Object.fromEntries(await Promise.all(TABLE_ORDER.map(async (t) => [t, await readAll(server, t)]))) as Rows
  if (!rows.territories.length) throw new Error('The local database is empty. Run `npm run db:reset` first.')
  return fromRows(rows, new Date().toISOString().slice(0, 10), await readAll<AuditRow>(server, 'audit_log'))
}

export const newLive = () => createLive(db.url, db.anonKey, { browser: false })

/** Waits until sign-in has settled (loaded, or refused). */
export function settled(live: Live): Promise<AuthState> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const a = live.auth.get()
      if (a.status === 'ready' || a.status === 'no-access') {
        stop()
        resolve(a)
      }
    }
    const stop = live.auth.subscribe(check)
    setTimeout(() => reject(new Error(`Sign-in didn't settle: ${JSON.stringify(live.auth.get())}`)), 20_000)
    check()
  })
}

/** Signs in a seeded person with the local password. */
export async function signInAs(email: string) {
  const live = newLive()
  const { error } = await live.client.auth.signInWithPassword({ email, password: LOCAL_PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return { live, auth: await settled(live) }
}

/** A seeded person, signed in and loaded. */
export async function asStaff(email: string) {
  const { live, auth } = await signInAs(email)
  if (auth.status !== 'ready') throw new Error(`${email}: ${auth.status}`)
  return { live, me: auth.me }
}

export type Mail = { ID: string; Subject: string; HTML: string }

export async function inbox(to: string): Promise<{ ID: string; Subject: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
  return ((await res.json()) as { messages: { ID: string; Subject: string }[] }).messages
}

/** Waits for an email to `to` that isn't one of `seen`, and returns it. */
export async function nextMail(to: string, seen: Set<string>): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const m = (await inbox(to)).find((x) => !seen.has(x.ID))
    if (m) return (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as Mail
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`No new email for ${to}`)
}

export const seenIds = async (to: string) => new Set((await inbox(to)).map((m) => m.ID))
export const codeIn = (m: Mail) => m.HTML.match(/<strong>(\d{6})<\/strong>/)![1]

/** Supabase sends one code per person per second: don't trip over the last email. */
export const pause = () => new Promise((r) => setTimeout(r, 1100))

/** Signs in the way a person does: email, then the code from the email that arrives. */
export async function signInByCode(email: string) {
  const live = newLive()
  const seen = await seenIds(email)
  await pause()
  await live.auth.sendLink(email)
  const mail = await nextMail(email, seen)
  await live.auth.verifyCode(email, codeIn(mail))
  return { live, auth: await settled(live), mail }
}
