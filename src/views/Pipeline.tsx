// Management's view of what sales has signed: each intake, its sessions'
// status, and the management-only program terms used for profitability.

import { useState } from 'react'
import { canSeeMoney, prettyDate, prettyTime, toMinutes, visibleIntakes } from '../engine'
import type { ProgramTerms, User } from '../engine'
import { updateTerms } from '../store'
import { Empty, StatusPill } from '../ui/bits'
import { money } from '../ui/format'
import { openSession, useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

const CYCLES = [1, 2, 4, 8, 12, 20] as const

export function Pipeline({ user }: { user: User }) {
  const { state, route, inScope } = useScope(user)
  const intakes = visibleIntakes(user, state.intakes)
    .filter((i) => inScope(i.territoryId))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <span className="muted small">Centers signed through sales intake. Every one passed the live coverage check before it could be submitted.</span>
      </div>
      {intakes.length === 0 && <Empty>No intakes in this territory yet. Open the sales rep demo user to submit one.</Empty>}
      <div className="cards">
        {intakes.map((intake) => {
          const center = state.centers.find((c) => c.id === intake.centerId)!
          const rep = state.users.find((u) => u.id === intake.salesRepId)
          const sessions = state.sessions.filter((s) => s.intakeId === intake.id).sort((a, b) => a.date.localeCompare(b.date))
          const unstaffed = sessions.filter((s) => !s.assignments.length && (s.status === 'pending' || s.status === 'confirmed')).length
          return (
            <article key={intake.id} className="card">
              <header className="card-head">
                <div>
                  <h3>{center.name}</h3>
                  <p className="muted small">
                    {center.address} · signed by {rep?.name ?? 'unknown'} · {new Date(intake.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
                {unstaffed > 0 ? <span className="flag pending">{unstaffed} need a crew</span> : <span className="flag ok">Staffed</span>}
              </header>
              <ul className="session-chips">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button className="chip-btn" onClick={() => openSession(route, s.id)}>
                      {prettyDate(s.date)} {prettyTime(s.start)} <StatusPill status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
              {canSeeMoney(user) && (
                <Terms
                  user={user}
                  centerId={center.id}
                  terms={center.terms}
                  minutesPerSession={sessions[0] ? toMinutes(sessions[0].end) - toMinutes(sessions[0].start) : 60}
                  avgRate={avgCrewRate(sessions[0]?.assignments.map((a) => a.coachId) ?? [], state.coaches, center.territoryId)}
                />
              )}
            </article>
          )
        })}
      </div>
    </>
  )
}

/** Hourly cost of the current crew, or of a typical lead if nobody is assigned yet. */
function avgCrewRate(crew: string[], coaches: { id: string; payRate: number; level: string; territoryId: string }[], territoryId: string): { rate: number; estimated: boolean } {
  if (crew.length) return { rate: crew.reduce((sum, id) => sum + (coaches.find((c) => c.id === id)?.payRate ?? 0), 0), estimated: false }
  const leads = coaches.filter((c) => c.territoryId === territoryId && c.level === 'lead')
  return { rate: leads.reduce((s, c) => s + c.payRate, 0) / Math.max(1, leads.length), estimated: true }
}

function Terms({ user, centerId, terms, minutesPerSession, avgRate }: { user: User; centerId: string; terms?: ProgramTerms; minutesPerSession: number; avgRate: { rate: number; estimated: boolean } }) {
  const [draft, setDraft] = useState<ProgramTerms>(terms ?? { cycleWeeks: 8, sessionsPerWeek: 1, cycleRate: 0 })
  const sessions = draft.cycleWeeks * draft.sessionsPerWeek
  const perSession = sessions ? draft.cycleRate / sessions : 0
  // Coaches are paid for the session plus an assumed 30 minutes of setup and travel.
  const cost = ((minutesPerSession + 30) / 60) * avgRate.rate
  const margin = perSession - cost
  const dirty = JSON.stringify(draft) !== JSON.stringify(terms)

  return (
    <div className="terms">
      <h4>
        Program terms <span className="tag">Management only</span>
      </h4>
      <div className="terms-row">
        <label className="field">
          Cycle
          <select value={draft.cycleWeeks} onChange={(e) => setDraft({ ...draft, cycleWeeks: Number(e.target.value) as ProgramTerms['cycleWeeks'] })}>
            {CYCLES.map((w) => (
              <option key={w} value={w}>
                {w} week{w > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Sessions / week
          <select value={draft.sessionsPerWeek} onChange={(e) => setDraft({ ...draft, sessionsPerWeek: Number(e.target.value) as ProgramTerms['sessionsPerWeek'] })}>
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Cycle rate ($)
          <input type="number" min={0} step={10} value={draft.cycleRate} onChange={(e) => setDraft({ ...draft, cycleRate: Math.max(0, Number(e.target.value)) })} />
        </label>
        <button className="btn" disabled={!dirty} onClick={() => updateTerms(user, centerId, draft)}>
          Save terms
        </button>
      </div>
      <p className="small">
        {money(perSession)} revenue per session · {money(cost)} coach cost ({avgRate.estimated ? 'typical lead, ' : ''}session + 30 min setup) ·{' '}
        <strong className={margin < 0 ? 'bad' : 'ok'}>{money(margin)} margin per session</strong>
      </p>
    </div>
  )
}
