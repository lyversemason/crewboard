// Management's view of what sales has signed: each new center, where its
// cycle stands, its sessions, and the program terms the rep entered. Only an
// ops admin can correct the price after signing.

import { useState } from 'react'
import { canEditTerms, canSeeMoney, cycleStatus, mediumDate, prettyDate, prettyTime, sessionsInCycle, toMinutes, visibleIntakes, WEEKDAY_LONG } from '../engine'
import type { Center, User } from '../engine'
import { updateTerms } from '../store'
import { Empty, Hint, StatusPill, Toast } from '../ui/bits'
import { money } from '../ui/format'
import { openSession, useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

export function Pipeline({ user }: { user: User }) {
  const { state, route, inScope } = useScope(user)
  const [toast, setToast] = useState('')
  const intakes = visibleIntakes(user, state.intakes)
    .filter((i) => inScope(i.territoryId))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
      </div>
      <Hint>Centers signed through the sales intake. Every one passed the live coverage check before it could be submitted. Program terms are entered by the sales rep; only an ops admin can change the price afterwards.</Hint>
      {intakes.length === 0 && <Empty>No new centers in this territory yet.</Empty>}
      <div className="cards">
        {intakes.map((intake) => {
          const center = state.centers.find((c) => c.id === intake.centerId)!
          const rep = state.users.find((u) => u.id === intake.salesRepId)
          const sessions = state.sessions.filter((s) => s.intakeId === intake.id).sort((a, b) => a.date.localeCompare(b.date))
          const unstaffed = sessions.filter((s) => !s.assignments.length && (s.status === 'pending' || s.status === 'confirmed')).length
          const status = center.terms ? cycleStatus(center.terms, state.sessions.filter((s) => s.centerId === center.id), state.today) : null
          return (
            <article key={intake.id} className="card">
              <header className="card-head">
                <div>
                  <h3>{center.name}</h3>
                  <p className="muted small">
                    {center.address} · signed by {rep?.name ?? 'unknown'} on {mediumDate(intake.submittedAt.slice(0, 10))}
                  </p>
                </div>
                {unstaffed > 0 ? <span className="flag pending">{unstaffed} need coaching staff</span> : <span className="flag ok">Staffed</span>}
              </header>
              {status && (
                <p className="small">
                  <strong>
                    {status.delivered} of {status.total} sessions done
                  </strong>{' '}
                  · {status.startedOn ? `starts ${mediumDate(status.startedOn)}` : ''} · ends {status.endsOn ? mediumDate(status.endsOn) : '—'}
                  {status.needsMakeUp > 0 && <span className="warn"> · {status.needsMakeUp} need a make-up date</span>}
                </p>
              )}
              <ul className="session-chips">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button className="chip-btn" onClick={() => openSession(route, s.id)}>
                      {prettyDate(s.date)} {prettyTime(s.start)} <StatusPill status={s.status} />
                    </button>
                  </li>
                ))}
              </ul>
              {canSeeMoney(user) && center.terms && (
                <Terms
                  user={user}
                  center={center}
                  repName={rep?.name ?? 'sales'}
                  minutesPerSession={sessions[0] ? toMinutes(sessions[0].end) - toMinutes(sessions[0].start) : 60}
                  avgRate={avgCrewRate(sessions[0]?.assignments.map((a) => a.coachId) ?? [], state.coaches, center.territoryId)}
                  onSaved={setToast}
                />
              )}
            </article>
          )
        })}
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
}

/** Hourly cost of the current crew, or of a typical lead if nobody is assigned yet. */
function avgCrewRate(crew: string[], coaches: { id: string; payRate: number; level: string; territoryId: string }[], territoryId: string): { rate: number; estimated: boolean } {
  if (crew.length) return { rate: crew.reduce((sum, id) => sum + (coaches.find((c) => c.id === id)?.payRate ?? 0), 0), estimated: false }
  const leads = coaches.filter((c) => c.territoryId === territoryId && c.level === 'lead')
  return { rate: leads.reduce((s, c) => s + c.payRate, 0) / Math.max(1, leads.length), estimated: true }
}

function Terms({
  user,
  center,
  repName,
  minutesPerSession,
  avgRate,
  onSaved,
}: {
  user: User
  center: Center
  repName: string
  minutesPerSession: number
  avgRate: { rate: number; estimated: boolean }
  onSaved: (msg: string) => void
}) {
  const terms = center.terms!
  const [price, setPrice] = useState(terms.cycleRate)
  const total = sessionsInCycle(terms)
  const perSession = total ? price / total : 0
  // Coaches are paid for the session plus an assumed 30 minutes of setup and travel.
  const cost = ((minutesPerSession + 30) / 60) * avgRate.rate
  const margin = perSession - cost
  const editable = canEditTerms(user)
  const days = terms.weekdays.map((d) => `${WEEKDAY_LONG[d]}s`).join(' & ')

  return (
    <div className="terms">
      <h4>
        Program terms <span className="tag">Entered by {repName}</span>
      </h4>
      <p className="small">
        {terms.cycleWeeks} week{terms.cycleWeeks > 1 ? 's' : ''} · {days} · {total} sessions · first session {mediumDate(terms.startDate)}
      </p>
      <div className="terms-row">
        {editable ? (
          <>
            <label className="field narrow">
              Cycle price ($)
              <input type="number" min={0} step={10} value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} />
            </label>
            <button
              className={`btn ${price !== terms.cycleRate ? 'save-ready' : 'save-idle'}`}
              disabled={price === terms.cycleRate}
              onClick={() => {
                updateTerms(user, center.id, { ...terms, cycleRate: price })
                onSaved(`Price for ${center.name} updated.`)
              }}
            >
              Save price
            </button>
          </>
        ) : (
          <span className="readout">{money(terms.cycleRate)} per cycle</span>
        )}
      </div>
      <p className="small">
        {money(perSession)} revenue per session · {money(cost)} coach cost ({avgRate.estimated ? 'typical lead, ' : ''}session + 30 min setup) ·{' '}
        <strong className={margin < 0 ? 'bad' : 'ok'}>{money(margin)} margin per session</strong>
      </p>
      {!editable && <Hint>Only an operations admin can change the price after signing.</Hint>}
      {(center.history ?? []).length > 0 && (
        <p className="small muted">
          {center.history!.map((h) => `${h.text} (${h.by})`).join(' · ')}
        </p>
      )}
    </div>
  )
}
