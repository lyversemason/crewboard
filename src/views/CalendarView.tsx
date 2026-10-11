import { addDays, dayOfWeek, longDate, mondayOf, monthDay, openIssues, planningWeek, prettyTime, weekRange, WEEKDAY_LONG } from '../engine'
import type { Session, User } from '../engine'
import { setParams } from '../router'
import { worldOf } from '../store'
import type { State } from '../store'
import { crewSummary, kids, movedTo } from '../ui/format'
import { openSession, useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

/** One workday forward or back (sessions never run on Sunday). */
function stepDay(date: string, by: 1 | -1): string {
  const next = addDays(date, by)
  return dayOfWeek(next) === 0 ? addDays(next, by) : next
}

export function CalendarView({ user }: { user: User }) {
  const { state, route, sessions, selected, territories } = useScope(user)
  const dayView = route.params.get('v') === 'day'
  const week = route.params.get('w') ?? planningWeek(state.today)
  const days = Array.from({ length: 6 }, (_, i) => addDays(week, i))
  const defaultDay = dayOfWeek(state.today) === 0 ? planningWeek(state.today) : state.today
  const day = route.params.get('d') ?? (week === planningWeek(state.today) ? defaultDay : week)
  const world = worldOf(state)
  const showTerritory = selected === 'all'

  const range = dayView ? [day] : days
  const inRange = sessions.filter((s) => s.date >= range[0] && s.date <= range.at(-1)!)
  const unassigned = inRange.filter((s) => s.status === 'pending' || s.status === 'confirmed').filter((s) => !s.assignments.length).length
  const issues = inRange.filter((s) => s.date >= state.today && openIssues(s, world).length).length
  const byTime = (list: Session[]) => [...list].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <div className="seg view-toggle" role="group" aria-label="Calendar view">
          <button className={dayView ? '' : 'on'} onClick={() => setParams(route, { v: undefined, d: undefined, w: mondayOf(day) === planningWeek(state.today) ? undefined : mondayOf(day) })}>
            Week
          </button>
          <button className={dayView ? 'on' : ''} onClick={() => setParams(route, { v: 'day', d: day })}>
            Day
          </button>
        </div>
        <div className="week-nav">
          <button
            className="btn"
            onClick={() => setParams(route, dayView ? { d: stepDay(day, -1) } : { w: addDays(week, -7) })}
            aria-label={dayView ? 'Previous day' : 'Previous week'}
          >
            ←
          </button>
          <span className="week-label">{dayView ? longDate(day) : weekRange(week)}</span>
          <button
            className="btn"
            onClick={() => setParams(route, dayView ? { d: stepDay(day, 1) } : { w: addDays(week, 7) })}
            aria-label={dayView ? 'Next day' : 'Next week'}
          >
            →
          </button>
          {dayView
            ? day !== defaultDay && (
                <button className="btn ghost" onClick={() => setParams(route, { d: defaultDay, w: undefined })}>
                  Today
                </button>
              )
            : week !== planningWeek(state.today) && (
                <button className="btn ghost" onClick={() => setParams(route, { w: undefined })}>
                  This week
                </button>
              )}
        </div>
        <div className="summary">
          <span>{inRange.filter((s) => s.status !== 'cancelled' && s.status !== 'rescheduled').length} sessions</span>
          <span className={unassigned ? 'bad' : ''}>
            {unassigned} need{unassigned === 1 ? 's' : ''} coaching staff
          </span>
          <span className={issues ? 'issue' : ''}>
            {issues} rule issue{issues === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {dayView ? (
        <div className={`calendar by-territory cols-${showTerritory ? territories.length : 1}`}>
          {(showTerritory ? territories : territories.filter((t) => t.id === selected)).map((t) => {
            const list = byTime(inRange.filter((s) => s.territoryId === t.id))
            return (
              <section key={t.id} className={`day ${showTerritory ? '' : 'single'}`}>
                <header>
                  <strong>
                    {t.name}, {t.state}
                  </strong>
                  <span>
                    {list.length} session{list.length === 1 ? '' : 's'}
                  </span>
                </header>
                {list.length === 0 && <p className="day-empty">No sessions</p>}
                <div className="events">
                  {list.map((s) => (
                    <EventCard key={s.id} s={s} state={state} showTerritory={false} onOpen={() => openSession(route, s.id)} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="calendar">
          {days.map((date, i) => {
            const daySessions = byTime(inRange.filter((s) => s.date === date))
            return (
              <section key={date} className={`day day-${i + 1} ${date === state.today ? 'today' : ''}`}>
                <header>
                  <button className="day-link" onClick={() => setParams(route, { v: 'day', d: date })} data-tip="Open this day for every territory">
                    <strong>{WEEKDAY_LONG[i + 1]}</strong>
                  </button>
                  <span>{monthDay(date)}</span>
                </header>
                {daySessions.length === 0 && <p className="day-empty">No sessions</p>}
                {daySessions.map((s) => (
                  <EventCard key={s.id} s={s} state={state} showTerritory={showTerritory} onOpen={() => openSession(route, s.id)} />
                ))}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function EventCard({ s, state, showTerritory, onOpen }: { s: Session; state: State; showTerritory: boolean; onOpen: () => void }) {
  const center = state.centers.find((c) => c.id === s.centerId)!
  const open = s.date >= state.today ? openIssues(s, worldOf(state)) : []
  const closed = s.status === 'cancelled' || s.status === 'rescheduled'
  const unconfirmed = s.assignments.filter((a) => !a.confirmedByCoach).length
  const needsStaff = !closed && !s.assignments.length
  return (
    <button className={`event status-${s.status} ${closed ? 'closed' : ''} ${needsStaff ? 'needs-staff' : ''}`} onClick={onOpen}>
      <span className="event-time">
        {prettyTime(s.start)}–{prettyTime(s.end)}
        {showTerritory && <em className="terr">{s.territoryId.toUpperCase()}</em>}
      </span>
      <span className="event-center">{center.name}</span>
      <span className="event-meta">
        {kids(s)} kids · {s.groups.length} group{s.groups.length > 1 ? 's' : ''}
      </span>
      <span className={`event-crew ${needsStaff ? 'none' : ''}`}>{crewSummary(s, state.coaches)}</span>
      <span className="event-flags">
        {s.status === 'pending' && <span className="flag pending">Pending</span>}
        {s.status === 'rescheduled' && <span className="flag muted">Moved → {movedTo(s, state.sessions)}</span>}
        {s.status === 'cancelled' && <span className="flag muted">Cancelled</span>}
        {open.length > 0 && <span className="flag issue">⚠ {open.length}</span>}
        {s.overrides.length > 0 && !closed && <span className="flag override">Override</span>}
        {!closed && s.assignments.length > 0 && unconfirmed > 0 && (
          <span className="flag alert" title="Open the session to call or text them">
            <b>i</b>
            {unconfirmed === 1 ? 'Coach hasn’t confirmed' : `${unconfirmed} coaches haven’t confirmed`}
          </span>
        )}
      </span>
    </button>
  )
}
