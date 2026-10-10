import { useMemo, useState } from 'react'
import { CANCEL_REASONS, LifecycleError, canAssign, canSeeMoney, isWorkday, largestGroup, prettyDate, prettyTime, validateCrew } from '../engine'
import type { CancelReason, Session, User, Violation } from '../engine'
import { setParams, useRoute } from '../router'
import { cancel, confirmWithFacility, reschedule, saveCrew, useStore, worldOf } from '../store'
import { IssueList, LevelTag, Modal, Phone, StatusPill } from '../ui/bits'
import { mapHref, money } from '../ui/format'

export function SessionPanel({ user, sessionId }: { user: User; sessionId: string }) {
  const state = useStore()
  const route = useRoute()
  const session = state.sessions.find((s) => s.id === sessionId)
  const close = () => setParams(route, { s: undefined })
  if (!session || !(user.role === 'ops_admin' || user.territoryIds.includes(session.territoryId))) {
    return (
      <Modal title="Session" onClose={close}>
        <p>That session doesn’t exist or isn’t in your territory.</p>
      </Modal>
    )
  }
  return <Panel key={session.id} user={user} session={session} close={close} />
}

const SPACE_LABEL: Record<string, string> = {
  small_bedroom: 'Small bedroom',
  average_bedroom: 'Average bedroom',
  large_master_bedroom: 'Large master bedroom',
  larger: 'Larger than a bedroom',
  short_grass: 'Short grass',
  long_grass: 'Long grass',
  turf: 'Turf',
  mulch: 'Playground mulch',
  rubber: 'Playground rubber',
  blacktop: 'Blacktop / concrete',
}

function Panel({ user, session: s, close }: { user: User; session: Session; close: () => void }) {
  const state = useStore()
  const route = useRoute()
  const world = worldOf(state)
  const center = state.centers.find((c) => c.id === s.centerId)!
  const territory = state.territories.find((t) => t.id === s.territoryId)!
  const editable = canAssign(user, s.territoryId) && (s.status === 'pending' || s.status === 'confirmed')
  const [draft, setDraft] = useState<string[]>(s.assignments.map((a) => a.coachId))
  const [confirming, setConfirming] = useState<Violation[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const violations = useMemo(() => (draft.length ? validateCrew(s, draft, world) : []), [draft, s, world])
  const dirty = draft.join() !== s.assignments.map((a) => a.coachId).join()
  const blocked = violations.some((v) => v.severity === 'block')
  const overriddenCodes = dirty ? [] : s.overrides.map((o) => o.code)

  const roster = state.coaches.filter((c) => c.territoryId === s.territoryId && c.active)
  const candidates = roster
    .filter((c) => !draft.includes(c.id))
    .map((c) => {
      const own = validateCrew(s, [c.id], world).filter((v) => v.coachId === c.id)
      const label = own.some((v) => v.severity === 'block') ? '⛔ busy' : own.some((v) => v.code === 'travel') ? '⚠ travel' : own.length ? '⚠ not available' : '✓ free'
      return { c, label, rank: own.some((v) => v.severity === 'block') ? 3 : own.length ? 2 : 1 }
    })
    .sort((a, b) => a.rank - b.rank || (a.c.level === b.c.level ? a.c.name.localeCompare(b.c.name) : a.c.level === 'lead' ? -1 : 1))

  const run = (fn: () => void, done?: string) => {
    setError('')
    try {
      fn()
      if (done) setNotice(done)
    } catch (e) {
      setError(e instanceof LifecycleError ? e.message : String(e))
    }
  }

  const save = (confirmed: boolean) =>
    run(() => {
      const r = saveCrew(user, s.id, draft, confirmed)
      if (r.ok) {
        setConfirming(null)
        setNotice(confirmed ? 'Crew saved with override. The override is logged in the history.' : 'Crew saved.')
      } else if ('needsConfirm' in r) setConfirming(r.needsConfirm)
      else setError('Blocked: fix the red items first.')
    })

  const linked = (id?: string) => id && state.sessions.find((x) => x.id === id)

  return (
    <Modal title={center.name} onClose={close} wide>
      <div className="panel-head">
        <div>
          <p className="big-when">
            {prettyDate(s.date)} · {prettyTime(s.start)}–{prettyTime(s.end)}
          </p>
          <p className="muted">
            {territory.name}, {territory.state} · Session {s.id}
          </p>
        </div>
        <StatusPill status={s.status} />
      </div>

      {s.status === 'rescheduled' && (
        <div className="callout">
          Rescheduled to <strong>{s.rescheduledDate}</strong>. This record is kept for the audit trail.{' '}
          {linked(s.rescheduledToId) && (
            <button className="linklike" onClick={() => setParams(route, { s: s.rescheduledToId })}>
              Open the new session →
            </button>
          )}
        </div>
      )}
      {s.rescheduledFromId && (
        <div className="callout soft">
          Moved here from an earlier date.{' '}
          <button className="linklike" onClick={() => setParams(route, { s: s.rescheduledFromId })}>
            Open the original →
          </button>
        </div>
      )}
      {s.status === 'cancelled' && (
        <div className="callout">
          Cancelled: <strong>{CANCEL_REASONS[s.cancelReason!]}</strong>
          {s.cancelNote && ` (${s.cancelNote})`}. Kept on file with its reason code.
        </div>
      )}

      <div className="panel-grid">
        <section>
          <h3>Facility</h3>
          <p>
            <a href={mapHref(center.address)} target="_blank" rel="noreferrer">
              {center.address}
            </a>
          </p>
          <p>
            Front desk <Phone phone={center.phone} />
          </p>
          <p>
            {center.poc.name}, {center.poc.title}
            <br />
            <Phone phone={center.poc.phone} label={`${center.poc.phone}${center.poc.ext ? ` x${center.poc.ext}` : ''}`} /> ·{' '}
            <a href={`mailto:${center.poc.email}`}>{center.poc.email}</a>
          </p>
          <p className="muted">
            {center.space.category === 'indoor'
              ? `Indoor · ${SPACE_LABEL[center.space.indoorSize ?? ''] ?? ''} · ${center.space.floor ?? ''}`
              : `Outdoor · ${SPACE_LABEL[center.space.outdoorSurface ?? ''] ?? ''} · ${center.space.grade}`}
            {center.space.obstacles.length > 0 && ` · Watch for: ${center.space.obstacles.join(', ')}`}
            {center.space.category === 'outdoor' && ` · Weather backup room: ${center.space.backupIndoorSpace ? 'yes' : 'NO'}`}
          </p>
          {canSeeMoney(user) && center.terms && (
            <p className="money">
              Program terms: {center.terms.cycleWeeks}-week cycle · {center.terms.sessionsPerWeek}×/week · {money(center.terms.cycleRate)} per cycle
            </p>
          )}
        </section>

        <section>
          <h3>Groups (largest: {largestGroup(s)})</h3>
          <table className="mini">
            <thead>
              <tr>
                <th>Kids</th>
                <th>Ages</th>
                <th>Minutes</th>
                <th>Support notes</th>
              </tr>
            </thead>
            <tbody>
              {s.groups.map((g, i) => (
                <tr key={i}>
                  <td>{g.players}</td>
                  <td>{g.ageRange}</td>
                  <td>{g.minutes}</td>
                  <td>{g.supportNotes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.notes && <p className="note">{s.notes}</p>}
        </section>
      </div>

      <section className="crew">
        <h3>Crew</h3>
        {draft.length === 0 && <p className="muted">Nobody assigned yet.</p>}
        <ul className="crew-list">
          {draft.map((id) => {
            const c = state.coaches.find((x) => x.id === id)!
            const a = s.assignments.find((x) => x.coachId === id)
            return (
              <li key={id}>
                <span>
                  <strong>{c.name}</strong> <LevelTag level={c.level} />
                </span>
                <span className="muted">{a ? (a.confirmedByCoach ? 'Coach confirmed ✓' : 'Waiting for coach') : 'New'}</span>
                <Phone phone={c.phone} />
                {editable && (
                  <button className="icon-btn" onClick={() => setDraft(draft.filter((x) => x !== id))} aria-label={`Remove ${c.name}`}>
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {editable && (
          <div className="crew-add">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setDraft([...draft, e.target.value])
              }}
              aria-label="Add a coach"
            >
              <option value="">+ Add a coach…</option>
              {candidates.map(({ c, label }) => (
                <option key={c.id} value={c.id}>
                  {label} · {c.name} ({c.level})
                </option>
              ))}
            </select>
            <span className="muted small">Rules re-check on every change.</span>
          </div>
        )}

        <IssueList issues={violations} overridden={overriddenCodes} />
        {draft.length > 0 && violations.length === 0 && <p className="ok-line">✓ This crew passes every rule.</p>}

        {editable && (
          <div className="actions">
            <button className="btn primary" disabled={!dirty || blocked} onClick={() => save(false)}>
              Save crew
            </button>
            {dirty && (
              <button className="btn ghost" onClick={() => setDraft(s.assignments.map((a) => a.coachId))}>
                Undo changes
              </button>
            )}
            {blocked && <span className="bad small">Can’t save: red items can’t be overridden.</span>}
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {editable && <Lifecycle user={user} s={s} run={run} />}

      <section>
        <h3>History</h3>
        <ol className="history">
          {[...s.history].reverse().map((h, i) => (
            <li key={i}>
              <span>{h.text}</span>
              <small>
                {h.by} · {new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </small>
            </li>
          ))}
        </ol>
      </section>

      {confirming && (
        <Modal title="Override required" onClose={() => setConfirming(null)}>
          {confirming.map((v, i) => (
            <div key={i} className="override-warning">
              <p>
                <strong>{v.message}</strong>
              </p>
              <p className="muted">{v.detail}</p>
            </div>
          ))}
          <p className="small muted">Your name and the time will be saved on this session.</p>
          <div className="actions">
            <button className="btn danger" onClick={() => save(true)}>
              Yes, override and save
            </button>
            <button className="btn ghost" onClick={() => setConfirming(null)}>
              Go back
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}

function Lifecycle({ user, s, run }: { user: User; s: Session; run: (fn: () => void, done?: string) => void }) {
  const route = useRoute()
  const [mode, setMode] = useState<'' | 'reschedule' | 'cancel'>('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState(s.start)
  const [end, setEnd] = useState(s.end)
  const [reason, setReason] = useState<CancelReason | ''>('')
  const [note, setNote] = useState('')

  return (
    <section className="lifecycle">
      <h3>Status</h3>
      <div className="actions">
        {s.status === 'pending' && (
          <button className="btn" onClick={() => run(() => confirmWithFacility(user, s.id), 'Confirmed with the facility.')}>
            Mark confirmed with facility
          </button>
        )}
        <button className={`btn ${mode === 'reschedule' ? 'on' : ''}`} onClick={() => setMode(mode === 'reschedule' ? '' : 'reschedule')}>
          Reschedule…
        </button>
        <button className={`btn ${mode === 'cancel' ? 'on' : ''}`} onClick={() => setMode(mode === 'cancel' ? '' : 'cancel')}>
          Cancel session…
        </button>
        <span className="muted small">Sessions are never deleted.</span>
      </div>

      {mode === 'reschedule' && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => {
              if (date && !isWorkday(date)) throw new LifecycleError('Sessions run Monday to Saturday.')
              const newId = reschedule(user, s.id, date, start, end)
              setParams(route, { s: newId })
            })
          }}
        >
          <label className="field">
            Rescheduled date (required)
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            Start
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            End
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button className="btn primary" disabled={!date}>
            Reschedule
          </button>
          <p className="small muted full">The original stays on file as “Rescheduled”. A new linked session is created and coaches must re-confirm.</p>
        </form>
      )}

      {mode === 'cancel' && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason) run(() => cancel(user, s.id, reason, note), 'Session cancelled. It stays on file with its reason code.')
          }}
        >
          <label className="field">
            Reason code (required)
            <select required value={reason} onChange={(e) => setReason(e.target.value as CancelReason)}>
              <option value="">Choose…</option>
              {Object.entries(CANCEL_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            Note {reason === 'other' ? '(required)' : '(optional)'}
            <input value={note} onChange={(e) => setNote(e.target.value)} required={reason === 'other'} />
          </label>
          <button className="btn danger" disabled={!reason}>
            Cancel session
          </button>
        </form>
      )}
    </section>
  )
}
