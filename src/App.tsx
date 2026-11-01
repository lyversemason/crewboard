import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { canSeeMoney } from './engine'
import type { Role, User } from './engine'
import { ROLE_LABEL } from './ui/format'
import { go, href, useRoute } from './router'
import { auth, mode, resetDemo, useAuth, useSaving, useStore } from './store'
import { clearProblem, useProblem } from './ui/problems'
import { setGuide, useGuide } from './ui/guide'
import { Accounts } from './views/Accounts'
import { AdminDashboard } from './views/AdminDashboard'
import { AuditLog } from './views/AuditLog'
import { CalendarView } from './views/CalendarView'
import { HoursPay } from './views/HoursPay'
import { CoachApp } from './views/CoachApp'
import { Login } from './views/Login'
import { NoAccess, SignIn } from './views/SignIn'
import { Pipeline } from './views/Pipeline'
import { CoachingStaff } from './views/CoachingStaff'
import { SalesIntake } from './views/SalesIntake'
import { SalesSubmissions } from './views/SalesSubmissions'
import { SessionPanel } from './views/SessionPanel'
import { TableView } from './views/TableView'

const NAV: Record<Role, { view: string; label: string }[]> = {
  ops_admin: [
    { view: 'dashboard', label: 'Dashboard' },
    { view: 'calendar', label: 'Calendar' },
    { view: 'table', label: 'Table' },
    { view: 'staff', label: 'Coaching Staff' },
    { view: 'pay', label: 'Hours & pay' },
    { view: 'pipeline', label: 'Sales pipeline' },
    { view: 'accounts', label: 'Accounts' },
    { view: 'audit', label: 'Audit log' },
  ],
  territory_manager: [
    { view: 'calendar', label: 'Calendar' },
    { view: 'table', label: 'Table' },
    { view: 'staff', label: 'Coaching Staff' },
    { view: 'pay', label: 'Hours & pay' },
    { view: 'pipeline', label: 'Sales pipeline' },
    { view: 'accounts', label: 'Accounts' },
  ],
  sales_rep: [
    { view: 'intake', label: 'New center' },
    { view: 'submissions', label: 'My submissions' },
  ],
  coach: [
    { view: 'shifts', label: 'My shifts' },
    { view: 'directory', label: 'Directory' },
    { view: 'availability', label: 'Availability' },
  ],
}


export default function App() {
  return mode === 'live' ? <LiveApp /> : <DemoApp />
}

/** The public demo: whoever is picked on the first screen, named in the address. */
function DemoApp() {
  const state = useStore()
  const route = useRoute()
  const user = state.users.find((u) => u.id === route.userId)
  if (!user) return <Login />
  if (user.status !== 'active') return <DemoNoAccess user={user} />
  return <Shell key={user.id} user={user} />
}

/** Live mode: whoever is signed in. The address can't change who you are. */
function LiveApp() {
  const state = useAuth()!
  const route = useRoute()
  const me = state.status === 'ready' ? state.me : undefined

  useEffect(() => {
    if (me && route.userId !== me.id) go(me.id)
  }, [me, route.userId])

  if (state.status === 'loading') return <p className="loading">Loading…</p>
  if (state.status === 'signed-out') return <SignIn auth={auth!} />
  if (state.status === 'no-access') return <NoAccess auth={auth!} state={state} />
  if (!me || route.userId !== me.id) return <p className="loading">Loading…</p>
  return <Shell key={me.id} user={me} />
}

/** The demo's version of "you can't sign in": someone's invite is pending, or their access was turned off. */
function DemoNoAccess({ user }: { user: User }) {
  return (
    <div className="login signin">
      <section className="card signin-card">
        <h2>{user.name} can’t sign in</h2>
        <p>{user.status === 'invited' ? 'Their invitation hasn’t been accepted yet.' : 'Their access has been turned off. Their history is kept.'}</p>
        <div className="actions">
          <a className="btn" href="#/">
            Switch user
          </a>
        </div>
      </section>
    </div>
  )
}

function Shell({ user }: { user: User }) {
  const route = useRoute()

  useEffect(() => {
    if (!route.view) go(user.id, NAV[user.role][0].view)
  }, [user, route.view])

  const allowed = NAV[user.role].some((n) => n.view === route.view)
  const view = allowed ? route.view! : NAV[user.role][0].view

  if (user.role === 'coach') {
    return (
      <Frame user={user} compact>
        <CoachApp user={user} view={view} nav={NAV.coach} />
      </Frame>
    )
  }

  const sessionId = route.params.get('s')
  return (
    <Frame user={user}>
      <nav className="tabs" aria-label="Views">
        {NAV[user.role].map((n) => (
          <a key={n.view} href={href(user.id, n.view, territoryParam(route.params))} className={n.view === view ? 'active' : ''}>
            {n.label}
          </a>
        ))}
      </nav>
      <main className="page">
        {view === 'dashboard' && <AdminDashboard user={user} />}
        {view === 'calendar' && <CalendarView user={user} />}
        {view === 'table' && <TableView user={user} />}
        {view === 'staff' && <CoachingStaff user={user} />}
        {view === 'pay' && canSeeMoney(user) && <HoursPay user={user} />}
        {view === 'pipeline' && <Pipeline user={user} />}
        {view === 'accounts' && <Accounts user={user} />}
        {view === 'audit' && <AuditLog user={user} />}
        {view === 'intake' && <SalesIntake user={user} />}
        {view === 'submissions' && <SalesSubmissions user={user} />}
      </main>
      {sessionId && (user.role === 'ops_admin' || user.role === 'territory_manager') && <SessionPanel user={user} sessionId={sessionId} />}
    </Frame>
  )
}

const territoryParam = (p: URLSearchParams) => ({ t: p.get('t') ?? undefined })

function Frame({ user, children, compact }: { user: User; children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? 'app compact' : 'app'}>
      <header className="topbar">
        <a className="brand" href={href(user.id)}>
          <span className="logo" aria-hidden>
            ⚽
          </span>
          <span>
            <strong>SoccerSessions</strong>
            <small>Bramblewood Youth Soccer · {mode === 'live' ? 'live' : 'fictional demo'}</small>
          </span>
        </a>
        <div className="who">
          <SavingSign />
          <span className="who-name">
            {user.name}
            <small>{ROLE_LABEL[user.role]}</small>
          </span>
          <GuideToggle />
          {mode === 'live' ? (
            <button className="btn ghost" onClick={() => auth!.signOut()}>
              Sign out
            </button>
          ) : (
            <>
              <a className="btn ghost" href="#/">
                Switch user
              </a>
              {!compact && <ResetButton />}
            </>
          )}
        </div>
      </header>
      {children}
      <ProblemToast />
    </div>
  )
}

function SavingSign() {
  return useSaving() ? (
    <span className="saving" role="status">
      Saving…
    </span>
  ) : null
}

/** "That didn't work, because…" for buttons without their own error spot. */
function ProblemToast() {
  const message = useProblem()
  useEffect(() => {
    if (!message) return
    const t = setTimeout(clearProblem, 8000)
    return () => clearTimeout(t)
  }, [message])
  if (!message) return null
  return (
    <div className="toast problem" role="alert" onClick={clearProblem}>
      {message}
    </div>
  )
}

function GuideToggle() {
  const on = useGuide()
  return (
    <button className={`btn ghost guide-toggle ${on ? 'on' : ''}`} onClick={() => setGuide(!on)} aria-pressed={on} title="Show or hide explanations of what each screen does">
      Demo guide: {on ? 'on' : 'off'}
    </button>
  )
}

/** Two clicks instead of a browser confirm dialog. */
function ResetButton() {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={armed ? 'btn danger' : 'btn ghost'}
      onClick={() => {
        if (armed) {
          resetDemo()
          setArmed(false)
        } else setArmed(true)
      }}
      title="Rebuild the fictional company and discard your changes"
    >
      {armed ? 'Click again to reset' : 'Reset demo'}
    </button>
  )
}
