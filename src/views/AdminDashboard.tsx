import { useState } from 'react'
import { addDays, cycleStatus, endingSoon, fullDate, mondayOf, dateSpan, planningWeek, openIssues, prettyDate, prettyTime, confirmOpensOn } from '../engine'
import type { Settings, User } from '../engine'
import { href } from '../router'
import { updateSettings, useStore, worldOf } from '../store'
import { Hint, Toast } from '../ui/bits'
import { money, shortWarning } from '../ui/format'

export function AdminDashboard({ user }: { user: User }) {
  const state = useStore()
  const world = worldOf(state)
  const week = planningWeek(state.today)
  const horizon = addDays(week, 12)

  const rows = state.territories.map((t) => {
    const sessions = state.sessions.filter((s) => s.territoryId === t.id && s.date >= week && s.date <= horizon)
    const live = sessions.filter((s) => s.status === 'pending' || s.status === 'confirmed')
    const upcoming = live.filter((s) => s.date >= state.today)
    return {
      t,
      total: live.length,
      unassigned: upcoming.filter((s) => !s.assignments.length).length,
      pending: upcoming.filter((s) => s.status === 'pending').length,
      unconfirmed: upcoming.filter((s) => state.today >= confirmOpensOn(s.date) && s.assignments.some((a) => !a.confirmedByCoach)).length,
      issues: upcoming.filter((s) => openIssues(s, world).length).length,
      overrides: live.filter((s) => s.overrides.length).length,
      coaches: state.coaches.filter((c) => c.territoryId === t.id && c.active).length,
    }
  })

  const problems = state.sessions
    .filter((s) => s.date >= state.today && s.date <= horizon)
    .map((s) => ({ s, issues: openIssues(s, world) }))
    .filter((r) => r.issues.length)
    .sort((a, b) => (a.s.date + a.s.start).localeCompare(b.s.date + b.s.start))

  // Programs whose last session is in the next two weeks: renewal conversations.
  const renewals = state.centers
    .filter((c) => c.terms)
    .map((c) => ({ c, st: cycleStatus(c.terms!, state.sessions.filter((s) => s.centerId === c.id), state.today) }))
    .filter(({ st }) => endingSoon(st, state.today))
    .sort((a, b) => a.st.endsOn!.localeCompare(b.st.endsOn!))

  return (
    <div className="dash">
      <p className="date-head">
        {dateSpan(week, horizon)}
      </p>
      <Hint>The two weeks being planned, across all three territories. Hover a territory and click it to work as its territory manager.</Hint>
      <div className="kpi-grid">
        {rows.map((r) => (
          <a key={r.t.id} className="kpi-card" href={href(user.id, 'calendar', { t: r.t.id })} data-tip="Click to act as territory manager">
            <h3>
              {r.t.name}, {r.t.state}
            </h3>
            <dl>
              <div>
                <dt>Sessions</dt>
                <dd>{r.total}</dd>
              </div>
              <div className={r.unassigned ? 'bad' : ''}>
                <dt>Need coaching staff</dt>
                <dd>{r.unassigned}</dd>
              </div>
              <div className={r.issues ? 'issue' : ''}>
                <dt>Rule issues</dt>
                <dd>{r.issues}</dd>
              </div>
              <div>
                <dt>Pending facility</dt>
                <dd>{r.pending}</dd>
              </div>
              <div>
                <dt>Coach unconfirmed</dt>
                <dd>{r.unconfirmed}</dd>
              </div>
              <div>
                <dt>Overrides used</dt>
                <dd>{r.overrides}</dd>
              </div>
            </dl>
            <span className="muted small">{r.coaches} active coaches</span>
          </a>
        ))}
      </div>

      <div className="dash-cols">
        <section className="card">
          <h3>Open rule issues</h3>
          {problems.length === 0 && <p className="ok-line">✓ Nothing needs attention.</p>}
          <ul className="problem-list">
            {problems.map(({ s, issues }) => (
              <li key={s.id}>
                <a href={href(user.id, 'calendar', { t: s.territoryId, s: s.id, w: mondayOf(s.date) })}>
                  <strong>{state.centers.find((c) => c.id === s.centerId)?.name}</strong> · {prettyDate(s.date)} {prettyTime(s.start)}
                </a>
                {issues.map((v, i) => (
                  <small key={i}>
                    {v.severity === 'block' ? 'Blocked: ' : ''}
                    {v.severity === 'block' ? v.message : shortWarning(v)} {v.detail}
                  </small>
                ))}
              </li>
            ))}
          </ul>
        </section>
        <div className="cards">
          <section className="card">
            <h3>Cycles ending soon</h3>
            <Hint>Programs whose last session is within two weeks, so sales can talk renewal. End dates include reschedules and make-up sessions.</Hint>
            {renewals.length === 0 && <p className="muted small">None in the next two weeks.</p>}
            <ul className="problem-list">
              {renewals.map(({ c, st }) => (
                <li key={c.id}>
                  <a href={href(user.id, 'calendar', { t: c.territoryId, s: st.sessions.at(-1)!.id, w: mondayOf(st.endsOn!) })}>
                    <strong>{c.name}</strong>
                  </a>
                  <small>
                    {state.territories.find((t) => t.id === c.territoryId)?.name} · ends {fullDate(st.endsOn!)} · {st.delivered} of {st.total} done · {money(c.terms!.cycleRate)} per cycle
                  </small>
                </li>
              ))}
            </ul>
          </section>
          <SettingsCard user={user} settings={state.settings} />
        </div>
      </div>
    </div>
  )
}

function SettingsCard({ user, settings }: { user: User; settings: Settings }) {
  const [draft, setDraft] = useState(settings)
  const [toast, setToast] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const num = (k: keyof Settings, min: number, max: number) => (
    <input type="number" min={min} max={max} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} />
  )
  return (
    <section className="card">
      <h3>Global rule settings</h3>
      <Hint>Ops admins only. Changes re-check every session in every territory immediately.</Hint>
      <label className="field">
        Safety buffer between centers (minutes)
        {num('bufferMinutes', 0, 120)}
      </label>
      <label className="field">
        Average driving speed (mph)
        {num('avgSpeedMph', 5, 60)}
      </label>
      <p className="small muted">
        Ratio: 1 coach per {settings.ratio} children in a group; territory managers may override up to {settings.maxOverrideRatio}. Set by policy.
      </p>
      <div className="actions">
        <button
          className={`btn ${dirty ? 'save-ready' : 'save-idle'}`}
          disabled={!dirty}
          onClick={() => {
            updateSettings(user, draft)
            setToast('Settings saved. Every session was re-checked.')
          }}
        >
          Save settings
        </button>
        {dirty && (
          <button className="btn ghost" onClick={() => setDraft(settings)}>
            Undo
          </button>
        )}
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </section>
  )
}
