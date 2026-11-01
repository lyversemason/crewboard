// Connection details for the local Supabase (Docker, started with `npm run db:start`).
// Local only: these keys are the CLI's fixed development keys and the database
// is only reachable from this computer.

import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Every local sign-in account uses this password. Never used outside this computer. */
export const LOCAL_PASSWORD = 'local-only-password'

export interface LocalDb {
  url: string
  anonKey: string
  serviceKey: string
}

export function localDb(): LocalDb {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    throw new Error('The local database is not running. Start it with `npm run db:start`.')
  }
  const s = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>
  const url = s.API_URL
  const anonKey = s.ANON_KEY ?? s.PUBLISHABLE_KEY
  const serviceKey = s.SERVICE_ROLE_KEY ?? s.SECRET_KEY
  if (!url || !anonKey || !serviceKey) throw new Error('Could not read the local database keys from `supabase status`.')
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error(`Refusing to use a non-local database: ${url}`)
  return { url, anonKey, serviceKey }
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Full access, bypassing the read rules. Seeding and test setup only. */
export const serverClient = (db: LocalDb) => createClient(db.url, db.serviceKey, options)

/** A browser-like client, signed out until signIn. */
export const browserClient = (db: LocalDb) => createClient(db.url, db.anonKey, options)

/** Reads every row of a table, past the API's per-request row limit. */
export async function readAll<T>(client: SupabaseClient, table: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data as T[]))
    if (data.length < 1000) return out
  }
}
