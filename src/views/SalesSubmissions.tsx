import { intakeSessions, prettyDate, prettyTime, visibleIntakes } from '../engine'
import type { User } from '../engine'
import { href } from '../router'
import { useStore } from '../store'
import { Empty, StatusPill } from '../ui/bits'

export function SalesSubmissions({ user }: { user: User }) {
  const state = useStore()
  const intakes = visibleIntakes(user, state.intakes).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))

  return (
    <>
      <p className="muted">Centers you signed. You can follow their status; coach names and contract money stay with management.</p>
      {intakes.length === 0 && (
        <Empty>
          Nothing yet. <a href={href(user.id, 'intake')}>Sign a new center →</a>
        </Empty>
      )}
      <div className="cards">
        {intakes.map((intake) => {
          const center = state.centers.find((c) => c.id === intake.centerId)!
          const sessions = intakeSessions(user, intake, state.sessions).sort((a, b) => a.date.localeCompare(b.date))
          return (
            <article key={intake.id} className="card">
              <h3>{center.name}</h3>
              <p className="muted small">
                {center.address} · submitted {new Date(intake.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <table className="mini">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Coach staffing</th>
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
                      <td>{s.assignments.length ? 'Staffed ✓' : 'Waiting for manager'}</td>
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
