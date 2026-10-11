// Coaching Staff (management): every coach in scope, who has confirmed this
// week's availability, hours booked and cost. Click a coach to edit their
// level, pay rate or contact details. Availability is the coach's own: shown
// here read-only.

import { useState } from 'react'
import { addDays, canEditCoach, canSeeMoney, hasConfirmedWeek, mediumDate, planningWeek, toMinutes, upcomingTimeOff, visibleRoster, weekHours, weekRange } from '../engine'
import type { Coach, CoachLevel, User } from '../engine'
import { updateCoach } from '../store'
import { Hint, LevelTag, Modal, Phone, Toast } from '../ui/bits'
import { LEVEL_LABEL, money } from '../ui/format'
import { AvailabilityGrid } from './AvailabilityGrid'
import { useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

const ORDER: CoachLevel[] = ['lead', 'assistant', 'trainee']

export function CoachingStaff({ user }: { user: User }) {
  const { state, inScope, selected } = useScope(user)
  const [open, setOpen] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const week = planningWeek(state.today)
  const weekEnd = addDays(week, 5)
  const showMoney = canSeeMoney(user)
  const roster = visibleRoster(user, state.coaches)
    .filter((c) => inScope(c.territoryId))
    .sort((a, b) => a.territoryId.localeCompare(b.territoryId) || ORDER.indexOf(a.level) - ORDER.indexOf(b.level) || a.name.localeCompare(b.name))
  const full = (id: string) => state.coaches.find((c) => c.id === id)!
  const notConfirmed = roster.filter((c) => c.active && !hasConfirmedWeek(full(c.id), week)).length

  const hoursThisWeek = (coachId: string) =>
    state.sessions
      .filter((s) => s.date >= week && s.date <= weekEnd && (s.status === 'confirmed' || s.status === 'pending'))
      .filter((s) => s.assignments.some((a) => a.coachId === coachId))
      .reduce((h, s) => h + (toMinutes(s.end) - toMinutes(s.start)) / 60, 0)

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <span className="week-label">{weekRange(week)}</span>
        <div className="summary">
          <span className={notConfirmed ? 'warn' : ''}>
            {notConfirmed} coach{notConfirmed === 1 ? ' hasn’t' : 'es haven’t'} confirmed availability this week
          </span>
        </div>
      </div>
      <Hint>
        Click a coach to change their level, pay rate or contact details (logged). Availability belongs to the coaches: they confirm it every week and add days off from their phones, so managers see it here but can’t change it.
      </Hint>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Coach</th>
              <th>Level</th>
              {selected === 'all' && <th>Territory</th>}
              <th>Phone</th>
              {showMoney && <th>Pay rate</th>}
              <th>Booked this week</th>
              {showMoney && <th>Est. cost</th>}
              <th>Availability this week</th>
              <th>Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((c) => {
              const coach = full(c.id)
              const h = hoursThisWeek(c.id)
              const off = upcomingTimeOff(coach, week).filter((t) => t.from <= weekEnd)
              return (
                <tr key={c.id} className={`row ${c.active ? '' : 'closed'}`} onClick={() => setOpen(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(c.id)}>
                  <td>
                    <strong>{c.name}</strong>
                    {!c.active && <span className="flag muted"> Inactive</span>}
                  </td>
                  <td>
                    <LevelTag level={c.level} />
                  </td>
                  {selected === 'all' && <td>{state.territories.find((t) => t.id === c.territoryId)?.name}</td>}
                  <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                    <Phone phone={c.phone} />
                  </td>
                  {showMoney && <td>{money(c.payRate!)}/hr</td>}
                  <td>{h ? `${h.toFixed(1)} h` : '—'}</td>
                  {showMoney && <td>{h ? money(h * c.payRate!) : '—'}</td>}
                  <td>
                    <AvailabilityGrid value={weekHours(coach, week)} mini />
                    {off.length > 0 && <small className="muted"> Day off</small>}
                  </td>
                  <td>{hasConfirmedWeek(coach, week) ? <span className="yes-mark">✓ Yes</span> : <span className="no-mark">Not yet</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <CoachEditor
          user={user}
          coach={full(open)}
          week={week}
          today={state.today}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setOpen(null)
            setToast(msg)
          }}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
}

function CoachEditor({ user, coach, week, today, onClose, onSaved }: { user: User; coach: Coach; week: string; today: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [draft, setDraft] = useState({ level: coach.level, payRate: coach.payRate, phone: coach.phone, email: coach.email, active: coach.active })
  const [error, setError] = useState('')
  const editable = canEditCoach(user, coach)
  const dirty = JSON.stringify(draft) !== JSON.stringify({ level: coach.level, payRate: coach.payRate, phone: coach.phone, email: coach.email, active: coach.active })
  const off = upcomingTimeOff(coach, today)
  const changedWeek = !!coach.weekChanges[week]

  return (
    <Modal title={coach.name} onClose={onClose}>
      <section className="sp-section" style={{ borderTop: 0 }}>
        <h3>Details</h3>
        <div className="terms-row">
          <label className="field">
            Level
            <select value={draft.level} disabled={!editable} onChange={(e) => setDraft({ ...draft, level: e.target.value as CoachLevel })}>
              {ORDER.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label className="field narrow">
            Pay rate ($/hr)
            <input type="number" min={1} step={0.5} value={draft.payRate} disabled={!editable} onChange={(e) => setDraft({ ...draft, payRate: Number(e.target.value) })} />
          </label>
          <label className="field">
            Phone
            <input value={draft.phone} disabled={!editable} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </label>
          <label className="field grow">
            Email
            <input type="email" value={draft.email} disabled={!editable} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={draft.active} disabled={!editable} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
          Active (inactive coaches can’t be scheduled)
        </label>
        {editable && (
          <div className="actions">
            <button
              className={`btn ${dirty ? 'save-ready' : 'save-idle'}`}
              disabled={!dirty}
              onClick={() => {
                try {
                  updateCoach(user, coach.id, draft)
                  onSaved(`Saved changes to ${coach.name}.`)
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Save changes
            </button>
            {dirty && (
              <button className="btn ghost" onClick={() => setDraft({ level: coach.level, payRate: coach.payRate, phone: coach.phone, email: coach.email, active: coach.active })}>
                Undo
              </button>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="sp-section">
        <h3>Availability (set by the coach)</h3>
        <p className="small">
          Week of {weekRange(week)}: {hasConfirmedWeek(coach, week) ? <span className="yes-mark">✓ confirmed by the coach</span> : <span className="no-mark">not confirmed yet</span>}
          {changedWeek && <span className="muted"> · changed for this week only</span>}
        </p>
        <AvailabilityGrid value={weekHours(coach, week)} />
        <h4>Days off</h4>
        {off.length === 0 ? (
          <p className="small muted">None coming up.</p>
        ) : (
          <ul className="timeoff-list">
            {off.map((t) => (
              <li key={t.id}>
                <span>
                  {mediumDate(t.from)}
                  {t.to !== t.from && ` – ${mediumDate(t.to)}`}
                </span>
                <small className="muted">{t.note}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      {coach.history.length > 0 && (
        <section className="sp-section">
          <details className="history-box" open>
            <summary>Change log ({coach.history.length})</summary>
            <ol className="history">
              {[...coach.history].reverse().map((h, i) => (
                <li key={i}>
                  <span>{h.text}</span>
                  <small>
                    {h.by} · {new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </small>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </Modal>
  )
}
