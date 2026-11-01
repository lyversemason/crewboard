// Runs the app in live mode against the local database (npm run db:start first).
// The keys are passed to Vite for this run only; nothing is written to disk.

import { spawn } from 'node:child_process'
import { localDb } from './local-db'

const db = localDb()
const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: db.url, VITE_SUPABASE_ANON_KEY: db.anonKey },
})
vite.on('exit', (code) => process.exit(code ?? 0))
