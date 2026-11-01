import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Auth, AuthState } from '../data/live'

/** Live mode's front door: email in, then a link or a 6-digit code. There is no sign-up. */
export function SignIn({ auth }: { auth: Auth }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const attempt = async (fn: () => Promise<void>) => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const send = (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your work email.')
    attempt(async () => {
      await auth.sendLink(email)
      setSentTo(email.trim())
    })
  }

  const verify = (e: FormEvent) => {
    e.preventDefault()
    attempt(() => auth.verifyCode(sentTo, code))
  }

  return (
    <div className="login signin">
      <header className="login-head">
        <span className="logo big" aria-hidden>
          ⚽
        </span>
        <h1>SoccerSessions</h1>
        <p className="lede">Sign in with your work email.</p>
      </header>
      <section className="card signin-card">
        {!sentTo ? (
          <form onSubmit={send}>
            <label className="field">
              Work email
              <input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <div className="actions">
              <button className="btn primary block" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </button>
            </div>
            <p className="small muted">No password. Accounts are created by invitation from your manager.</p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p>
              If <strong>{sentTo}</strong> has an account, a sign-in link is on its way. Open it on this device, or type the 6-digit code
              from the same email:
            </p>
            <label className="field">
              Code
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            <div className="actions">
              <button className="btn primary" disabled={busy || code.length !== 6}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSentTo('')
                  setCode('')
                  setError('')
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  )
}

const NO_ACCESS: Record<Extract<AuthState, { status: 'no-access' }>['reason'], string> = {
  deactivated: 'Your access has been turned off.',
  invited: 'Your invitation hasn’t been accepted yet. Open the invite email to finish setting up.',
  unknown: 'There’s no SoccerSessions profile for this account.',
}

/** Signed in, but not allowed in: deactivated, or no profile behind the account. */
export function NoAccess({ auth, state }: { auth: Auth; state: Extract<AuthState, { status: 'no-access' }> }) {
  return (
    <div className="login signin">
      <section className="card signin-card">
        <h2>No access</h2>
        <p>
          {NO_ACCESS[state.reason]} If that’s a mistake, contact your operations admin. (Signed in as <strong>{state.email}</strong>.)
        </p>
        <div className="actions">
          <button className="btn" onClick={() => auth.signOut()}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}
