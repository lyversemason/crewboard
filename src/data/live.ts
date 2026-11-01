// Live mode: data comes from the shared database, read through its access
// rules, and who you are comes from your sign-in, never from the page address.
// Sign-in is by email: a link, or the 6-digit code in the same email (for
// phones where the link opens in a different browser).
//
// Changes and queries run on the server (supabase/functions/run-action), as the
// signed-in person, with the same actions and rules as the demo.

import { createClient } from '@supabase/supabase-js'
import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_SETTINGS, LifecycleError, todayLocal } from '../engine'
import type { User } from '../engine'
import { DEMO_ONLY_ACTIONS } from './actions'
import type { State } from './actions'
import { TABLE_ORDER, fromRows } from './rows'
import type { AuditRow, ProfileRow, Rows } from './rows'
import type { DataSource } from './source'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, but there's no active profile behind the account. */
  | { status: 'no-access'; email: string; reason: 'deactivated' | 'invited' | 'unknown' }
  | { status: 'ready'; me: User }

export interface Auth {
  get(): AuthState
  subscribe(listener: () => void): () => void
  /** Emails a sign-in link and code. Only existing accounts get one: there is no sign-up. */
  sendLink(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>
}

export interface Live {
  source: DataSource
  auth: Auth
  /** For tests and server-side helpers. */
  client: SupabaseClient
}

/** How much of the audit log an ops admin's screen loads (newest first). */
const AUDIT_LOADED = 1000

/** Reads every row of a table the signed-in person may see, past the per-request row limit. */
async function readAll(client: SupabaseClient, table: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(`Couldn’t load ${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

const EMPTY: State = {
  today: todayLocal(),
  seededForWeek: '',
  territories: [],
  centers: [],
  coaches: [],
  users: [],
  sessions: [],
  intakes: [],
  settings: DEFAULT_SETTINGS,
  audit: [],
}

export function createLive(url: string, anonKey: string, options: { browser?: boolean } = { browser: true }): Live {
  const browser = options.browser ?? true
  const client = createClient(url, anonKey, {
    auth: {
      // PKCE puts the sign-in code in the query string (?code=…), which leaves the
      // app's #/ routes alone.
      flowType: 'pkce',
      persistSession: browser,
      autoRefreshToken: browser,
      detectSessionInUrl: browser,
    },
  })

  let state = EMPTY
  let auth: AuthState = { status: 'loading' }
  const dataListeners = new Set<() => void>()
  const authListeners = new Set<() => void>()
  const setState = (next: State) => {
    state = next
    dataListeners.forEach((l) => l())
  }
  const setAuth = (next: AuthState) => {
    auth = next
    authListeners.forEach((l) => l())
  }

  /** Who the account belongs to, then everything they may read. */
  async function load(session: AuthSession | null) {
    if (!session) {
      setState(EMPTY)
      setAuth({ status: 'signed-out' })
      return
    }
    const email = session.user.email ?? ''
    const { data: profile, error } = await client.from('profiles').select('*').eq('auth_user_id', session.user.id).maybeSingle<ProfileRow>()
    if (error) throw new Error(`Couldn’t load your profile: ${error.message}`)
    if (!profile || profile.status !== 'active') {
      setState(EMPTY)
      setAuth({ status: 'no-access', email, reason: profile ? (profile.status as 'deactivated' | 'invited') : 'unknown' })
      return
    }
    const [rows, audit] = await Promise.all([
      Promise.all(TABLE_ORDER.map(async (t) => [t, await readAll(client, t)])).then((pairs) => Object.fromEntries(pairs) as Rows),
      // Only ops admins may read the log; don't ask for it otherwise.
      profile.role === 'ops_admin' ? readAudit() : Promise.resolve([]),
    ])
    const next = fromRows(rows, todayLocal(), audit)
    setState(next)
    setAuth({ status: 'ready', me: next.users.find((u) => u.id === profile.id)! })
  }

  async function readAudit(): Promise<AuditRow[]> {
    const { data, error } = await client.from('audit_log').select('*').order('id', { ascending: false }).limit(AUDIT_LOADED)
    if (error) throw new Error(`Couldn’t load the audit log: ${error.message}`)
    return data as AuditRow[]
  }

  /** Calls the server function; a refusal comes back as a LifecycleError with the reason. */
  async function callServer<T>(body: object): Promise<T> {
    const { data, error } = await client.functions.invoke('run-action', { body })
    if (error) {
      // A refusal carries the server's reply; a network failure carries no reply at all.
      const context = (error as { context?: unknown }).context
      const reply = context instanceof Response ? ((await context.json().catch(() => null)) as { error?: string } | null) : null
      throw new LifecycleError(reply?.error ?? 'Couldn’t reach the server. Nothing was saved; try again.')
    }
    return data as T
  }

  const reload = async () => load((await client.auth.getSession()).data.session)

  // Coming back to the tab picks up other people's changes.
  if (browser) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && auth.status === 'ready') reload().catch((e: unknown) => console.error(e))
    })
  }

  let lastUser: string | undefined
  client.auth.onAuthStateChange((event, session) => {
    // Token refreshes keep the same person: nothing to reload.
    if (event === 'TOKEN_REFRESHED' && session?.user.id === lastUser) return
    lastUser = session?.user.id
    // Supabase asks that other calls wait until this callback has returned.
    setTimeout(() => {
      load(session)
        .then(() => {
          // Drop the one-time ?code=… from the address once it's been used.
          if (browser && session && window.location.search.includes('code=')) {
            window.history.replaceState(null, '', window.location.pathname + window.location.hash)
          }
        })
        .catch((e: unknown) => {
          console.error(e)
          setAuth({ status: 'signed-out' })
        })
    }, 0)
  })

  const source: DataSource = {
    kind: 'live',
    getState: () => state,
    subscribe(listener) {
      dataListeners.add(listener)
      return () => dataListeners.delete(listener)
    },
    async run(name, _user, args) {
      // The server works out who is asking from the sign-in; `_user` is only the screen's copy.
      if (DEMO_ONLY_ACTIONS.includes(name)) throw new LifecycleError('In live mode an invitation is accepted by signing in.')
      const { result, warning } = await callServer<{ result: never; warning?: string }>({ name, args })
      await reload()
      // Saved, but something after it (an email) didn't go: say so.
      if (warning) throw new LifecycleError(warning)
      return result
    },
    async query(name, _user, args) {
      const { result } = await callServer<{ result: never }>({ query: name, args })
      return result
    },
  }

  return {
    client,
    source,
    auth: {
      get: () => auth,
      subscribe(listener) {
        authListeners.add(listener)
        return () => authListeners.delete(listener)
      },
      async sendLink(email) {
        const { error } = await client.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: browser ? window.location.origin + window.location.pathname : undefined },
        })
        // Same answer whether or not the address has an account, so the form
        // can't be used to find out who works here.
        if (error && /only request this after/i.test(error.message)) throw new Error('A code was sent moments ago. Wait a minute, then ask again.')
        if (error && !/signups not allowed|user not found/i.test(error.message)) throw new Error(error.message)
      },
      async verifyCode(email, code) {
        const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
        if (error) throw new Error('That code didn’t work. Check it, or send a new one.')
      },
      async signOut() {
        await client.auth.signOut()
        // Clear the screen now rather than when Supabase reports it.
        setState(EMPTY)
        setAuth({ status: 'signed-out' })
      },
    },
  }
}
