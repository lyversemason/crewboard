// Supabase Edge Function: runs one action for the signed-in person and saves
// what changed. Bundled into supabase/functions/run-action by
// scripts/build-functions.ts, so it uses the very same actions and rules as
// the demo (src/data/actions.ts, src/engine).
//
// Who is asking comes from their sign-in token, never from the request body.
// Saving goes through the database's apply_changes, in one transaction.

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, User as Account } from '@supabase/supabase-js'
import { LifecycleError } from '../src/engine'
import type { User } from '../src/engine'
import { ACTIONS, SERVER_ACTIONS } from '../src/data/actions'
import type { ActionName, State } from '../src/data/actions'
import { READ_ONLY_MESSAGE } from '../src/data/live'
import { TABLE_ORDER, diffRows, fromRows, toRows } from '../src/data/rows'
import type { Rows } from '../src/data/rows'

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

/** The company works in US time zones; the server's clock is UTC. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

async function readAll(client: SupabaseClient, table: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

/**
 * Invitations use a confirmed sign-in account marked "invited_by", and the
 * normal sign-in email, which reads as an invitation while that mark is there
 * (supabase/templates/magic_link.html). The database clears the mark on their
 * first sign-in. Supabase's own invite email isn't used: its accounts start
 * unconfirmed, which sign-up-off refuses codes for, and its link lasts an hour.
 */
async function markInvited(server: SupabaseClient, person: User, inviter: User, authId?: string): Promise<string> {
  const meta = { name: person.name, invited_by: inviter.name }
  if (authId) {
    const { error } = await server.auth.admin.updateUserById(authId, { user_metadata: meta })
    if (error) throw new Error(`Couldn’t set up their sign-in: ${error.message}`)
    return authId
  }
  const { data, error } = await server.auth.admin.createUser({ email: person.email, email_confirm: true, user_metadata: meta })
  if (error) throw new Error(`Couldn’t set up their sign-in: ${error.message}`)
  return data.user.id
}

/** Emails the invitation. Called after saving: a failure here leaves the change saved. */
async function emailInvite(anon: SupabaseClient, person: User): Promise<string | undefined> {
  const { error } = await anon.auth.signInWithOtp({ email: person.email, options: { shouldCreateUser: false } })
  if (!error) return undefined
  return /only request this after/i.test(error.message)
    ? `Saved, but the invitation email to ${person.email} was sent moments ago. Send it again in a minute if it doesn’t arrive.`
    : `Saved, but the invitation email couldn’t be sent (${error.message}). Try “Send invitation again”.`
}

async function setBanned(server: SupabaseClient, authUserId: string | undefined, banned: boolean) {
  if (!authUserId) return
  const { error } = await server.auth.admin.updateUserById(authUserId, { ban_duration: banned ? '876000h' : 'none' })
  if (error) throw new Error(`Couldn’t change their sign-in: ${error.message}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
    const { data: auth } = await server.auth.getUser(token)
    const account: Account | null = auth.user
    if (!account) return reply(401, { error: 'Your sign-in has expired. Sign in again.' })

    const { name, args } = (await req.json()) as { name: ActionName; args: unknown[] }
    if (!SERVER_ACTIONS.includes(name)) return reply(400, { error: READ_ONLY_MESSAGE })

    const rows = Object.fromEntries(await Promise.all(TABLE_ORDER.map(async (t) => [t, await readAll(server, t)]))) as Rows
    const authIds = new Map((rows.profiles as unknown as { id: string; auth_user_id: string | null }[]).map((p) => [p.id, p.auth_user_id ?? undefined]))
    const before = fromRows(rows, today())
    const me = before.users.find((u) => authIds.get(u.id) === account.id)
    if (!me || me.status !== 'active') return reply(403, { error: 'Your access is off.' })

    const action = ACTIONS[name] as (...a: unknown[]) => { state: State; result: unknown }
    const outcome = action({ state: before, user: me, at: new Date().toISOString() }, ...(Array.isArray(args) ? args : []))
    const changes = diffRows(toRows(before), toRows(outcome.state))
    const person = (id: string) => outcome.state.users.find((u) => u.id === id)!

    // Sign-in accounts change alongside the records.
    const targetId = (name === 'inviteUser' ? outcome.result : args[0]) as string
    const target = person(targetId)
    if (name === 'inviteUser') {
      const authId = await markInvited(server, target, me)
      changes.profiles = changes.profiles!.map((p) => (p.id === target.id ? { ...p, auth_user_id: authId } : p)) as typeof changes.profiles
    }
    const { error } = await server.rpc('apply_changes', { changes })
    if (error) throw new Error(`Couldn’t save: ${error.message}`)

    if (name === 'deactivateUser') await setBanned(server, authIds.get(targetId), true)
    if (name === 'reactivateUser') await setBanned(server, authIds.get(targetId), false)
    const invites = name === 'inviteUser' || name === 'resendInvite' || (name === 'reactivateUser' && target.status === 'invited')
    if (invites && name !== 'inviteUser') await markInvited(server, target, me, authIds.get(targetId))
    const warning = invites ? await emailInvite(anon, target) : undefined
    return reply(200, { result: outcome.result ?? null, warning })
  } catch (e) {
    if (e instanceof LifecycleError) return reply(400, { error: e.message })
    console.error(e)
    return reply(500, { error: 'Something went wrong on the server. Reload to see what was saved.' })
  }
})
