import { useState } from 'react'
import { addDays, mondayOf, planningWeek, openIssues, prettyDate, prettyTime } from '../engine'
import type { Settings, User } from '../engine'
import { href } from '../router'
import { updateSettings, useStore, worldOf } from '../store'
import { shortWarning } from '../ui/format'

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
      unconfirmed: upcoming.filter((s) => s.assignments.some((a) => !a.confirmedByCoach)).length,
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

  return (
    <div className="dash">
      <p className="muted">
        This week and next ({prettyDate(week)} – {prettyDate(horizon)}). Click a territory to act as its manager.
      </p>
      <div className="kpi-grid">
        {rows.map((r) => (
          <a key={r.t.id} className="kpi-card" href={href(user.id, 'calendar', { t: r.t.id })}>
            <h3>
              {r.t.name}, {r.t.state}
            </h3>
            <dl>
              <div>
                <dt>Sessions</dt>
                <dd>{r.total}</dd>
              </div>
              <div className={r.unassigned ? 'warn' : ''}>
                <dt>Need a crew</dt>
                <dd>{r.unassigned}</dd>
              </div>
              <div className={r.issues ? 'bad' : ''}>
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
            <span className="muted small">{r.coaches} active coaches · Open as manager →</span>
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
        <SettingsCard user={user} settings={state.settings} />
      </div>
    </div>
  )
}

function SettingsCard({ user, settings }: { user: User; settings: Settings }) {
  const [draft, setDraft] = useState(settings)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const num = (k: keyof Settings, min: number, max: number) => (
    <input type="number" min={min} max={max} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })} />
  )
  return (
    <section className="card">
      <h3>Global rule settings</h3>
      <p className="small muted">Ops admins only. Changes re-check every session in every territory immediately.</p>
      <label className="field">
        Safety buffer between centers (minutes)
        {num('bufferMinutes', 0, 120)}
      </label>
      <label className="field">
        Average driving speed (mph)
        {num('avgSpeedMph', 5, 60)}
      </label>
      <p className="small muted">
        Ratio: 1 coach per {settings.ratio} children; managers may override up to {settings.maxOverrideRatio}. Set by policy.
      </p>
      <div className="actions">
        <button className="btn primary" disabled={!dirty} onClick={() => updateSettings(user, draft)}>
          Save settings
        </button>
        {dirty && (
          <button className="btn ghost" onClick={() => setDraft(settings)}>
            Undo
          </button>
        )}
      </div>
    </section>
  )
}
