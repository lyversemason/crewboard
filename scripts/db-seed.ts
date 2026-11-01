// Loads the fictional company into the local database and gives every person a
// sign-in account. Run through `npm run db:reset`, which empties the database first.

import { todayLocal } from '../src/engine'
import { buildDemo } from '../src/data/seed'
import { auditFromHistory } from '../src/data/audit'
import { TABLE_ORDER, auditToRow, toRows } from '../src/data/rows'
import { LOCAL_PASSWORD, localDb, serverClient } from './local-db'

const db = localDb()
const server = serverClient(db)

const { count } = await server.from('territories').select('*', { count: 'exact', head: true })
if (count) throw new Error('The database already has data. Run `npm run db:reset` to start over.')

const today = todayLocal()
const company = { ...buildDemo(today), today, audit: [] }
const rows = toRows(company)
const audit = auditFromHistory(company).map(auditToRow)

// Sign-in accounts first, so each profile can point at its account.
const accounts = new Map<string, string>()
for (const p of rows.profiles) {
  const { data, error } = await server.auth.admin.createUser({ email: p.email, password: LOCAL_PASSWORD, email_confirm: true })
  if (error) throw new Error(`Account for ${p.email}: ${error.message}`)
  accounts.set(p.id, data.user.id)
}
const profiles = rows.profiles.map((p) => ({ ...p, auth_user_id: accounts.get(p.id)! }))

for (const table of TABLE_ORDER) {
  const all: object[] = table === 'profiles' ? profiles : rows[table]
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await server.from(table).insert(all.slice(i, i + 500))
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

{
  const { error } = await server.from('audit_log').insert(audit)
  if (error) throw new Error(`audit_log: ${error.message}`)
}

console.log(
  `Seeded the fictional company as of ${today}: ` +
    TABLE_ORDER.map((t) => `${rows[t].length} ${t.replaceAll('_', ' ')}`).join(', ') +
    `, ${audit.length} audit entries. ${accounts.size} sign-in accounts, password "${LOCAL_PASSWORD}".`,
)
