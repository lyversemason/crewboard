import { Fragment } from 'react'
import { addDays, dayOfWeek, numDate, planningWeek, openIssues, prettyTime, WEEKDAY_LONG } from '../engine'
import type { SessionStatus, User } from '../engine'
import { setParams } from '../router'
import { worldOf } from '../store'
import { Empty, StatusPill } from '../ui/bits'
import { crewSummary, kids, shortWarning } from '../ui/format'
import { openSession, useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

const STATUSES: (SessionStatus | 'all')[] = ['all', 'pending', 'confirmed', 'rescheduled', 'cancelled']

export function TableView({ user }: { user: User }) {
  const { state, route, sessions, selected } = useScope(user)
  const from = route.params.get('from') ?? planningWeek(state.today)
  const to = route.params.get('to') ?? addDays(from, 13)
  const status = (route.params.get('status') ?? 'all') as SessionStatus | 'all'
  const onlyIssues = route.params.get('issues') === '1'
  const world = worldOf(state)

  const rows = sessions
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) => status === 'all' || s.status === status)
    .map((s) => ({ s, issues: s.date >= state.today ? openIssues(s, world) : [] }))
    .filter((r) => !onlyIssues || r.issues.length > 0 || (!r.s.assignments.length && (r.s.status === 'pending' || r.s.status === 'confirmed')))
    .sort((a, b) => (a.s.date + a.s.start).localeCompare(b.s.date + b.s.start))

  const dates = [...new Set(rows.map((r) => r.s.date))]

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <label className="field inline">
          From
          <input type="date" value={from} onChange={(e) => e.target.value && setParams(route, { from: e.target.value })} />
        </label>
        <label className="field inline">
          To
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setParams(route, { to: e.target.value })} />
        </label>
        <label className="field inline">
          Status
          <select value={status} onChange={(e) => setParams(route, { status: e.target.value === 'all' ? undefined : e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setParams(route, { issues: e.target.checked ? '1' : undefined })} />
          Only problems (rule issues or no coaching staff)
        </label>
      </div>

      {rows.length === 0 ? (
        <Empty>No sessions match these filters.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Time</th>
                {selected === 'all' && <th>Territory</th>}
                <th>Center</th>
                <th>Kids</th>
                <th>Coaching staff</th>
                <th>Confirmed</th>
                <th>Status</th>
                <th>Rules</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <Fragment key={date}>
                  <tr className={`day-row day-${dayOfWeek(date)}`}>
                    <td colSpan={selected === 'all' ? 8 : 7}>
                      {WEEKDAY_LONG[dayOfWeek(date)]} · {numDate(date)}
                      {date === state.today && <span className="chip small">Today</span>}
                    </td>
                  </tr>
                  {rows
                    .filter((r) => r.s.date === date)
                    .map(({ s, issues }) => {
                      const center = state.centers.find((c) => c.id === s.centerId)!
                      const confirmed = s.assignments.filter((a) => a.confirmedByCoach).length
                      const closed = s.status === 'cancelled' || s.status === 'rescheduled'
                      return (
                        <tr key={s.id} className={`row ${closed ? 'closed' : ''}`} onClick={() => openSession(route, s.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openSession(route, s.id)}>
                          <td className="nowrap">
                            {prettyTime(s.start)}–{prettyTime(s.end)}
                          </td>
                          {selected === 'all' && <td>{state.territories.find((t) => t.id === s.territoryId)?.name}</td>}
                          <td>{center.name}</td>
                          <td>
                            {kids(s)} <small className="muted">({s.groups.map((g) => g.players).join('/')})</small>
                          </td>
                          <td className={!s.assignments.length && !closed ? 'none' : ''}>{crewSummary(s, state.coaches)}</td>
                          <td>{s.assignments.length ? `${confirmed}/${s.assignments.length}` : '—'}</td>
                          <td>
                            <StatusPill status={s.status} />
                          </td>
                          <td>
                            {issues.length ? (
                              <span className="flag bad" title={issues.map((v) => shortWarning(v)).join('\n')}>
                                ⚠ {issues.map((v) => v.code.replace('_', ' ')).join(', ')}
                              </span>
                            ) : s.overrides.length && !closed ? (
                              <span className="flag override">Overridden</span>
                            ) : closed ? (
                              ''
                            ) : (
                              <span className="ok">✓</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
