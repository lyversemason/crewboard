import { useMemo, useState } from 'react'
import {
  CANCEL_REASONS,
  LifecycleError,
  NOTE_MAX,
  canAssign,
  canSeeMoney,
  cycleStatus,
  endingSoon,
  isWorkday,
  largestGroup,
  longDate,
  fullDate,
  prettyTime,
  sessionNumber,
  sessionsInCycle,
  validateCrew,
  scheduleLabel,
  openSessionsLike,
  pendingSessionsLike,
  prettyDate,
  programWeekdays,
  WEEKDAY_LONG,
} from '../engine'
import type { BulkScope, CancelReason, Center, Coach, Session, User, Violation, ViolationCode } from '../engine'
import { setParams, useRoute } from '../router'
import { cancel, confirmProgramWithFacility, confirmWithFacility, reschedule, saveCrew, staffOpenSessions, useStore, worldOf } from '../store'
import type { BulkResult } from '../store'
import { Hint, IssueList, LevelTag, Modal, Phone, StatusPill, Toast, UnconfirmedAlert } from '../ui/bits'
import { mapHref, money, movedTo } from '../ui/format'

export function SessionPanel({ user, sessionId }: { user: User; sessionId: string }) {
  const state = useStore()
  const route = useRoute()
  const [toast, setToast] = useState('')
  const session = state.sessions.find((s) => s.id === sessionId)
  const close = () => setParams(route, { s: undefined })
  if (!session || !(user.role === 'ops_admin' || user.territoryIds.includes(session.territoryId))) {
    return (
      <Modal title="Session" onClose={close}>
        <p>That session doesn’t exist or isn’t in your territory.</p>
      </Modal>
    )
  }
  return (
    <>
      <Panel key={session.id} user={user} session={session} close={close} toast={setToast} />
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Panel({ user, session: s, close, toast }: { user: User; session: Session; close: () => void; toast: (msg: string) => void }) {
  const state = useStore()
  const route = useRoute()
  const world = worldOf(state)
  const center = state.centers.find((c) => c.id === s.centerId)!
  const editable = canAssign(user, s.territoryId) && (s.status === 'pending' || s.status === 'confirmed')
  const [draft, setDraft] = useState<string[]>(s.assignments.map((a) => a.coachId))
  const [confirming, setConfirming] = useState<Violation[] | null>(null)
  const [error, setError] = useState('')
  // Any change to the coaching staff clears an old error.
  const edit = (next: string[]) => {
    setError('')
    setDraft(next)
  }

  const violations = useMemo(() => (draft.length ? validateCrew(s, draft, world) : []), [draft, s, world])
  const dirty = draft.join() !== s.assignments.map((a) => a.coachId).join()
  const blocked = violations.some((v) => v.severity === 'block')
  const needsOverride = violations.some((v) => v.severity === 'override')
  const overriddenCodes = dirty ? [] : s.overrides.map((o) => o.code)

  const roster = state.coaches.filter((c) => c.territoryId === s.territoryId && c.active)
  const candidates = roster
    .filter((c) => !draft.includes(c.id))
    .map((c) => {
      const own = validateCrew(s, [c.id], world).filter((v) => v.coachId === c.id)
      const label = own.some((v) => v.severity === 'block') ? '⛔ busy' : own.some((v) => v.code === 'travel') ? '⚠ drive time' : own.length ? '⚠ not available' : '✓ free'
      return { c, label, rank: own.some((v) => v.severity === 'block') ? 3 : own.length ? 2 : 1 }
    })
    .sort((a, b) => a.rank - b.rank || (a.c.level === b.c.level ? a.c.name.localeCompare(b.c.name) : a.c.level === 'lead' ? -1 : 1))

  const run = (fn: () => void, done?: string) => {
    setError('')
    try {
      fn()
      if (done) toast(done)
    } catch (e) {
      setError(e instanceof LifecycleError ? e.message : String(e))
    }
  }

  const save = (confirmed: boolean) =>
    run(() => {
      const r = saveCrew(user, s.id, draft, confirmed)
      if (r.ok) {
        setConfirming(null)
        toast(confirmed ? 'Coaching staff saved with an override (logged in the history).' : 'Coaching staff saved.')
      } else if ('needsConfirm' in r) setConfirming(r.needsConfirm)
      else setError('Blocked: fix the red items first.')
    })

  const linked = (id?: string) => id && state.sessions.find((x) => x.id === id)
  const coachOf = (id: string) => state.coaches.find((x) => x.id === id)!
  const saveClass = !dirty ? 'save-idle' : blocked ? 'save-blocked' : needsOverride ? 'save-override' : 'save-ready'
  const saveLabel = !dirty ? 'Saved' : blocked ? 'Can’t save yet' : needsOverride ? 'Save with override…' : 'Save coaching staff'

  return (
    <Modal title={center.name} onClose={close} wide big>
      <div className="sp-head">
        <p className="sp-when">
          {longDate(s.date)} · {prettyTime(s.start)}–{prettyTime(s.end)}
        </p>
        <StatusPill status={s.status} />
      </div>

      {s.status === 'rescheduled' && (
        <div className="callout">
          Rescheduled to <strong>{movedTo(s, state.sessions, true)}</strong>. This record is kept for the audit trail.{' '}
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

      {canSeeMoney(user) && <ProgramBox center={center} session={s} />}

      <section className="sp-section">
        <h3>Facility</h3>
        <div className="two-col">
          <dl className="facts">
            <dt>Address</dt>
            <dd>
              <a href={mapHref(center.address)} target="_blank" rel="noreferrer">
                {center.address}
              </a>
            </dd>
            <dt>Front desk</dt>
            <dd>
              <Phone phone={center.phone} />
            </dd>
            <dt>Contact</dt>
            <dd>
              {center.poc.name}, {center.poc.title}
              <br />
              <Phone phone={center.poc.phone} label={`${center.poc.phone}${center.poc.ext ? ` x${center.poc.ext}` : ''}`} />
              <br />
              <a href={`mailto:${center.poc.email}`}>{center.poc.email}</a>
            </dd>
          </dl>
          <SpaceFacts center={center} />
        </div>
      </section>

      <section className="sp-section">
        <h3>Groups ({s.groups.length})</h3>
        <table className="mini">
          <thead>
            <tr>
              <th>Group</th>
              <th>Kids</th>
              <th>Ages</th>
              <th>Minutes</th>
              <th>Support notes</th>
            </tr>
          </thead>
          <tbody>
            {s.groups.map((g, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
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

      <section className="sp-section">
        <h3>Coaching staff</h3>
        {draft.length === 0 && <p className="muted">Nobody assigned yet.</p>}
        <ul className="staff-list">
          {draft.map((id) => {
            const c = coachOf(id)
            const a = s.assignments.find((x) => x.coachId === id)
            return (
              <li key={id}>
                <span>
                  <strong>{c.name}</strong> <LevelTag level={c.level} />
                </span>
                <span>
                  {!a ? (
                    <span className="confirm-new">Not saved yet</span>
                  ) : a.confirmedByCoach ? (
                    <span className="confirm-ok">✓ Coach confirmed</span>
                  ) : (
                    <UnconfirmedAlert name={c.name} phone={c.phone} />
                  )}
                </span>
                <Phone phone={c.phone} hideNumber />
                {editable ? (
                  <button className="icon-btn" onClick={() => edit(draft.filter((x) => x !== id))} aria-label={`Remove ${c.name}`}>
                    ×
                  </button>
                ) : (
                  <span />
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
                if (e.target.value) edit([...draft, e.target.value])
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
          </div>
        )}
        <Hint>The list only offers this territory’s coaches, labeled free, drive time, not available or busy. The checks below re-run on every change.</Hint>

        <RuleChecks session={s} crew={draft.map(coachOf)} violations={violations} overridden={overriddenCodes} />
        <IssueList issues={violations.filter((v) => !(v.severity === 'override' && overriddenCodes.includes(v.code)))} />

        {editable && (
          <div className="actions">
            <button className={`btn ${saveClass}`} disabled={!dirty || blocked} onClick={() => save(false)}>
              {saveLabel}
            </button>
            {dirty && (
              <button className="btn ghost" onClick={() => edit(s.assignments.map((a) => a.coachId))}>
                Undo changes
              </button>
            )}
            {blocked && <span className="bad small">Red items can’t be overridden.</span>}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {editable && !dirty && s.assignments.length > 0 && <BulkStaff user={user} s={s} toast={toast} />}
      </section>

      {editable && <Lifecycle user={user} s={s} run={run} />}

      <section className="sp-section">
        <details className="history-box">
          <summary>History ({s.history.length})</summary>
          <ol className="history">
            {[...s.history].reverse().map((h, i) => (
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

/** What the center bought and where this session falls in the cycle. */
function ProgramBox({ center, session }: { center: Center; session: Session }) {
  const state = useStore()
  const terms = center.terms
  if (!terms) return null
  const status = cycleStatus(terms, state.sessions.filter((x) => x.centerId === center.id), state.today)
  const n = sessionNumber(status, session.id)
  const days = scheduleLabel(terms)
  const pushed = status.endsOn && status.plannedEnd && status.endsOn > status.plannedEnd
  const perSession = terms.cycleRate / sessionsInCycle(terms)
  return (
    <div className="sp-terms">
      <div className="row">
        <span>
          <span className="k">Program</span>
          <span className="v">
            {plural(terms.cycleWeeks, 'week')} · {days}
          </span>
        </span>
        <span>
          <span className="k">This session</span>
          <span className="v">{n ? `${n} of ${status.total}` : 'Outside the current cycle'}</span>
        </span>
        <span>
          <span className="k">Started</span>
          <span className="v">{status.startedOn ? fullDate(status.startedOn) : fullDate(terms.startDate)}</span>
        </span>
        <span>
          <span className="k">Ends</span>
          <span className="v">{status.endsOn ? fullDate(status.endsOn) : '—'}</span>
        </span>
        <span>
          <span className="k">Price</span>
          <span className="v">
            {money(terms.cycleRate)} per cycle <small>({money(perSession)}/session)</small>
          </span>
        </span>
      </div>
      <div className="meter" aria-label={`${status.delivered} of ${status.total} sessions done`}>
        <i style={{ width: `${(100 * status.delivered) / status.total}%` }} />
      </div>
      <p className="sub">
        {status.delivered} of {status.total} sessions done
        {pushed && ` · pushed back from ${fullDate(status.plannedEnd!)} by changes`}
        {status.needsMakeUp > 0 && ` · ${plural(status.needsMakeUp, 'cancelled session')} still need${status.needsMakeUp === 1 ? 's' : ''} a make-up date`}
        {endingSoon(status, state.today) && ' · ending soon: time to talk renewal'}
      </p>
      <p className="sp-id">Session {session.id}</p>
    </div>
  )
}

function SpaceFacts({ center }: { center: Center }) {
  const sp = center.space
  return (
    <dl className="facts">
      <dt>Space</dt>
      <dd>{sp.category === 'indoor' ? 'Indoor' : 'Outdoor'}</dd>
      {sp.category === 'indoor' ? (
        <>
          <dt>Room size</dt>
          <dd>{SPACE_LABEL[sp.indoorSize ?? ''] ?? '—'}</dd>
          <dt>Floor</dt>
          <dd>{sp.floor ?? '—'}</dd>
        </>
      ) : (
        <>
          <dt>Surface</dt>
          <dd>{SPACE_LABEL[sp.outdoorSurface ?? ''] ?? '—'}</dd>
          <dt>Grade</dt>
          <dd>{sp.grade === 'flat' ? 'Flat' : 'Sloped'}</dd>
        </>
      )}
      <dt>Obstacles</dt>
      <dd>{sp.obstacles.length ? sp.obstacles.join(', ') : 'None'}</dd>
      {sp.category === 'outdoor' && (
        <>
          <dt>Weather backup</dt>
          <dd className={sp.backupIndoorSpace ? '' : 'bad'}>{sp.backupIndoorSpace ? 'Indoor room available' : 'None: cancel in bad weather'}</dd>
        </>
      )}
    </dl>
  )
}

const RULES: { key: string; label: string; codes: ViolationCode[] }[] = [
  { key: 'lead', label: 'Lead coach', codes: ['no_lead'] },
  { key: 'ratio', label: 'Ratio', codes: ['ratio', 'ratio_max'] },
  { key: 'travel', label: 'Drive time', codes: ['travel'] },
  { key: 'avail', label: 'Availability', codes: ['unavailable'] },
  { key: 'time', label: 'No double-booking', codes: ['overlap', 'wrong_territory', 'inactive'] },
]

/** One chip per staffing rule: green when met, amber when it needs an override, red when blocked. */
function RuleChecks({ session, crew, violations, overridden }: { session: Session; crew: Coach[]; violations: Violation[]; overridden: string[] }) {
  if (!crew.length) {
    return (
      <div className="rule-checks">
        <span className="rule idle">Not staffed yet</span>
      </div>
    )
  }
  const kids = largestGroup(session)
  const counted = crew.filter((c) => c.level !== 'trainee').length
  return (
    <div className="rule-checks">
      {RULES.map((r) => {
        const hit = violations.filter((v) => r.codes.includes(v.code))
        const state = hit.some((v) => v.severity === 'block') ? 'block' : hit.length ? (hit.every((v) => overridden.includes(v.code)) ? 'overridden' : 'override') : 'ok'
        const mark = state === 'ok' ? '✓' : state === 'block' ? '✕' : state === 'overridden' ? '✓' : '!'
        const extra = r.key === 'ratio' ? ` · ${kids} kids, ${counted} coach${counted === 1 ? '' : 'es'}` : ''
        return (
          <span key={r.key} className={`rule ${state}`} title={hit.map((v) => v.detail).join('\n') || 'Rule met'}>
            {mark} {r.label}
            {extra}
            {state === 'overridden' && ' (overridden)'}
          </span>
        )
      })}
    </div>
  )
}

function Lifecycle({ user, s, run }: { user: User; s: Session; run: (fn: () => void, done?: string) => void }) {
  const route = useRoute()
  const state = useStore()
  const pendingOthers = pendingSessionsLike(s, state.sessions, state.today).length
  const pendingAll = pendingOthers + (s.status === 'pending' ? 1 : 0)
  const [mode, setMode] = useState<'' | 'reschedule' | 'cancel'>('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState(s.start)
  const [end, setEnd] = useState(s.end)
  const [reason, setReason] = useState<CancelReason | ''>('')
  const [note, setNote] = useState('')

  return (
    <section className="sp-section lifecycle">
      <h3>Status</h3>
      <div className="actions">
        {s.status === 'pending' && (
          <button className="btn" onClick={() => run(() => confirmWithFacility(user, s.id), 'Confirmed with the facility.')}>
            Mark confirmed with facility
          </button>
        )}
        {pendingOthers > 0 && (
          <button className="btn" onClick={() => run(() => confirmProgramWithFacility(user, s.id), `Confirmed ${pendingAll} sessions with the facility.`)}>
            Confirm all {pendingAll} pending in this program
          </button>
        )}
        <button className={`btn ${mode === 'reschedule' ? 'on' : ''}`} onClick={() => setMode(mode === 'reschedule' ? '' : 'reschedule')}>
          Reschedule…
        </button>
        <button className={`btn ${mode === 'cancel' ? 'on' : ''}`} onClick={() => setMode(mode === 'cancel' ? '' : 'cancel')}>
          Cancel session…
        </button>
      </div>
      <Hint>Sessions are never deleted: a reschedule keeps the original on file and links a new session; a cancellation needs a reason code.</Hint>

      {mode === 'reschedule' && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => {
              if (date && !isWorkday(date)) throw new LifecycleError('Sessions run Monday to Saturday.')
              const newId = reschedule(user, s.id, date, start, end, note)
              setParams(route, { s: newId })
            }, s.assignments.length ? 'Rescheduled. The coaching staff was texted to re-confirm.' : 'Rescheduled.')
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
          <NoteBox value={note} onChange={setNote} label="Note (optional)" placeholder="Why it moved, e.g. field trip that day" />
          <button className="btn primary" disabled={!date}>
            Reschedule
          </button>
          <p className="small muted full">The original stays on file as “Rescheduled”. The coaching staff is notified and has to re-confirm the new time.</p>
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
          <NoteBox value={note} onChange={setNote} label={`Note ${reason === 'other' ? '(required)' : '(optional)'}`} required={reason === 'other'} />
          <button className="btn danger" disabled={!reason}>
            Cancel session
          </button>
        </form>
      )}
    </section>
  )
}

/** A note with its length limit shown as you type. */
function NoteBox({ value, onChange, label, placeholder, required }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="field note-box">
      {label}
      <textarea rows={2} maxLength={NOTE_MAX} value={value} placeholder={placeholder} required={required} onChange={(e) => onChange(e.target.value)} />
      <small className={`counter ${value.length > NOTE_MAX - 30 ? 'warn' : ''}`}>
        {value.length} / {NOTE_MAX} characters
      </small>
    </label>
  )
}

/**
 * After staffing one session: add the same coaches to every other open session
 * of the program they can work (or one weekday's). The rest stay open.
 */
function BulkStaff({ user, s, toast }: { user: User; s: Session; toast: (msg: string) => void }) {
  const state = useStore()
  const route = useRoute()
  const [result, setResult] = useState<BulkResult | null>(null)
  const open = openSessionsLike(s, state.sessions, state.today)
  const days = programWeekdays(s, state.sessions, state.today)
  const names = s.assignments.map((a) => state.coaches.find((c) => c.id === a.coachId)?.name.split(' ')[0]).join(' & ')
  const byId = (id: string) => state.sessions.find((x) => x.id === id)!

  const apply = (scope: BulkScope) => {
    const r = staffOpenSessions(user, s.id, scope)
    setResult(r)
    toast(`Added ${names} to ${r.filled.length} session${r.filled.length === 1 ? '' : 's'}.${r.skipped.length ? ` ${r.skipped.length} left open.` : ''}`)
  }

  if (!open.length && !result) return null
  return (
    <div className="bulk">
      {open.length > 0 && (
        <>
          <p>
            <strong>{open.length}</strong> other session{open.length === 1 ? '' : 's'} of this program {open.length === 1 ? 'has' : 'have'} no coaching staff. Add {names} wherever they’re free:
          </p>
          <div className="actions">
            <button className="btn primary" onClick={() => apply('program')}>
              All open sessions ({open.length})
            </button>
            {days.length > 1 &&
              days.map((d) => {
                const n = openSessionsLike(s, state.sessions, state.today, d).length
                return (
                  n > 0 && (
                    <button key={d} className="btn" onClick={() => apply(d)}>
                      {WEEKDAY_LONG[d]}s only ({n})
                    </button>
                  )
                )
              })}
          </div>
          <Hint>Every session is checked with the full rules. Nothing is overridden in bulk: a session that would need an override stays open for you to decide.</Hint>
        </>
      )}
      {result && result.skipped.length > 0 && (
        <div className="bulk-left">
          <p className="small">
            <strong>Left open ({result.skipped.length}):</strong> open one, pick other coaches, and add them to the rest the same way.
          </p>
          <ul>
            {result.skipped.map(({ id, reason }) => (
              <li key={id}>
                <button className="linklike" onClick={() => setParams(route, { s: id })}>
                  {prettyDate(byId(id).date)} {prettyTime(byId(id).start)}
                </button>{' '}
                <small className="muted">{reason}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
