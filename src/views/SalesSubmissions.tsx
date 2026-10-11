import { canEditIntake, canSeePrice, intakeSessions, fullDate, prettyDate, prettyTime, sessionsInCycle, visibleIntakes, scheduleLabel } from '../engine'
import type { User } from '../engine'
import { href } from '../router'
import { useStore } from '../store'
import { Empty, Hint, StatusPill } from '../ui/bits'
import { money } from '../ui/format'

export function SalesSubmissions({ user }: { user: User }) {
  const state = useStore()
  const intakes = visibleIntakes(user, state.intakes).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  return (
    <>
      <Hint>Centers you signed. You can follow their status, and change a submission until the territory manager confirms it. Coach names and pay stay with management.</Hint>
      {intakes.length === 0 && (
        <Empty>
          Nothing yet. <a href={href(user.id, 'intake')}>Sign a new center →</a>
        </Empty>
      )}
      <div className="cards">
        {intakes.map((intake) => {
          const center = state.centers.find((c) => c.id === intake.centerId)!
          const sessions = intakeSessions(user, intake, state.sessions).sort((a, b) => a.date.localeCompare(b.date))
          const editable = canEditIntake(user, intake, state.sessions, state.today)
          const t = center.terms
          return (
            <article key={intake.id} className="card">
              <header className="card-head">
                <div>
                  <h3>{center.name}</h3>
                  <p className="muted small">
                    {center.address} · submitted {fullDate(intake.submittedAt.slice(0, 10))}
                  </p>
                  {t && (
                    <p className="small">
                      {t.cycleWeeks} weeks · {scheduleLabel(t)}
                      {canSeePrice(user, intake) && ` · ${money(t.cycleRate)} per cycle (${money(t.cycleRate / sessionsInCycle(t))}/session)`}
                    </p>
                  )}
                </div>
                {editable ? (
                  <a className="btn" href={href(user.id, 'intake', { edit: intake.id })}>
                    Edit submission
                  </a>
                ) : (
                  <span className="flag ok" title="A territory manager has confirmed it or it has started">
                    Locked
                  </span>
                )}
              </header>
              <table className="mini">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Coaching staff</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>{prettyDate(s.date)}</td>
                      <td>
                        {prettyTime(s.start)}–{prettyTime(s.end)}
                      </td>
                      <td>
                        <StatusPill status={s.status} />
                      </td>
                      <td>{s.status === 'cancelled' ? '—' : s.assignments.length ? 'Staffed ✓' : 'Waiting for the territory manager'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          )
        })}
      </div>
    </>
  )
}
