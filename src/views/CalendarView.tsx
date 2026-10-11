import { addDays, planningWeek, openIssues, prettyTime, WEEKDAY_LONG } from '../engine'
import type { User } from '../engine'
import { setParams } from '../router'
import { worldOf } from '../store'
import { crewSummary, kids, movedTo } from '../ui/format'
import { openSession, useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

export function CalendarView({ user }: { user: User }) {
  const { state, route, sessions, selected } = useScope(user)
  const week = route.params.get('w') ?? planningWeek(state.today)
  const days = Array.from({ length: 6 }, (_, i) => addDays(week, i))
  const world = worldOf(state)
  const showTerritory = selected === 'all'

  const inWeek = sessions.filter((s) => s.date >= week && s.date <= days[5])
  const unassigned = inWeek.filter((s) => s.status === 'pending' || s.status === 'confirmed').filter((s) => !s.assignments.length).length
  const issues = inWeek.filter((s) => s.date >= state.today && openIssues(s, world).length).length

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <div className="week-nav">
          <button className="btn" onClick={() => setParams(route, { w: addDays(week, -7) })} aria-label="Previous week">
            ←
          </button>
          <span className="week-label">Week of {new Date(`${week}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}</span>
          <button className="btn" onClick={() => setParams(route, { w: addDays(week, 7) })} aria-label="Next week">
            →
          </button>
          {week !== planningWeek(state.today) && (
            <button className="btn ghost" onClick={() => setParams(route, { w: undefined })}>
              This week
            </button>
          )}
        </div>
        <div className="summary">
          <span>{inWeek.filter((s) => s.status !== 'cancelled' && s.status !== 'rescheduled').length} sessions</span>
          <span className={unassigned ? 'warn' : ''}>{unassigned} need{unassigned === 1 ? 's' : ''} a crew</span>
          <span className={issues ? 'bad' : ''}>{issues} rule issue{issues === 1 ? '' : 's'}</span>
        </div>
      </div>

      <div className="calendar">
        {days.map((date, i) => {
          const daySessions = inWeek.filter((s) => s.date === date).sort((a, b) => a.start.localeCompare(b.start))
          return (
            <section key={date} className={`day day-${i + 1} ${date === state.today ? 'today' : ''}`}>
              <header>
                <strong>{WEEKDAY_LONG[i + 1]}</strong>
                <span>{new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
              </header>
              {daySessions.length === 0 && <p className="day-empty">No sessions</p>}
              {daySessions.map((s) => {
                const center = state.centers.find((c) => c.id === s.centerId)!
                const open = s.date >= state.today ? openIssues(s, world) : []
                const closed = s.status === 'cancelled' || s.status === 'rescheduled'
                const unconfirmed = s.assignments.filter((a) => !a.confirmedByCoach).length
                return (
                  <button key={s.id} className={`event status-${s.status} ${closed ? 'closed' : ''}`} onClick={() => openSession(route, s.id)}>
                    <span className="event-time">
                      {prettyTime(s.start)}–{prettyTime(s.end)}
                      {showTerritory && <em className="terr">{s.territoryId.toUpperCase()}</em>}
                    </span>
                    <span className="event-center">{center.name}</span>
                    <span className="event-meta">
                      {kids(s)} kids · {s.groups.length} group{s.groups.length > 1 ? 's' : ''}
                    </span>
                    <span className={`event-crew ${!s.assignments.length && !closed ? 'none' : ''}`}>{crewSummary(s, state.coaches)}</span>
                    <span className="event-flags">
                      {s.status === 'pending' && <span className="flag pending">Pending</span>}
                      {s.status === 'rescheduled' && <span className="flag muted">Moved → {movedTo(s, state.sessions)}</span>}
                      {s.status === 'cancelled' && <span className="flag muted">Cancelled</span>}
                      {open.length > 0 && <span className="flag bad">⚠ {open.length}</span>}
                      {s.overrides.length > 0 && !closed && <span className="flag override">Override</span>}
                      {!closed && s.assignments.length > 0 && unconfirmed > 0 && <span className="flag soft">{unconfirmed} unconfirmed</span>}
                    </span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}
