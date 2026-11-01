import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role, User } from './engine'
import { ROLE_LABEL } from './ui/format'
import { go, href, useRoute } from './router'
import { READ_ONLY_MESSAGE } from './data/live'
import { auth, mode, resetDemo, useAuth, useStore } from './store'
import { setGuide, useGuide } from './ui/guide'
import { AdminDashboard } from './views/AdminDashboard'
import { CalendarView } from './views/CalendarView'
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
    { view: 'pipeline', label: 'Sales pipeline' },
  ],
  territory_manager: [
    { view: 'calendar', label: 'Calendar' },
    { view: 'table', label: 'Table' },
    { view: 'staff', label: 'Coaching Staff' },
    { view: 'pipeline', label: 'Sales pipeline' },
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
  return <Shell user={user} />
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
  return <Shell user={me} />
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
        {view === 'pipeline' && <Pipeline user={user} />}
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
      {mode === 'live' && <p className="callout live-note">{READ_ONLY_MESSAGE}</p>}
      {children}
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
