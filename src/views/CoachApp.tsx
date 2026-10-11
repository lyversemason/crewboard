// The coach's phone view: only their own shifts, plus a territory directory.

import { useState } from 'react'
import { addDays, hasConfirmedWeek, longDate, weekdayMonthDay, planningWeek, prettyTime, upcomingTimeOff, visibleRoster, visibleSessions, weekRange, dateSpan, dayOfWeek, canConfirmShift, confirmOpensOn, monthDay } from '../engine'
import type { Coach, Session, User, Weekday } from '../engine'
import { href, setParams, useRoute } from '../router'
import { addTimeOff, coachConfirmMany, confirmAvailability, removeTimeOff, setAvailability, setWeekChange, useStore } from '../store'
import { Empty, Hint, LevelTag, Phone, Toast } from '../ui/bits'
import { mapHref, movedTo } from '../ui/format'
import { AvailabilityGrid } from './AvailabilityGrid'

export function CoachApp({ user, view, nav }: { user: User; view: string; nav: { view: string; label: string }[] }) {
  const route = useRoute()
  const shiftId = route.params.get('s')
  return (
    <div className="phone-app">
      <div className="phone-body">
        {view === 'shifts' && (shiftId ? <ShiftPackage user={user} id={shiftId} /> : <Shifts user={user} />)}
        {view === 'directory' && <Directory user={user} />}
        {view === 'availability' && <Availability user={user} />}
      </div>
      <nav className="bottom-nav" aria-label="Coach views">
        {nav.map((n) => (
          <a key={n.view} href={href(user.id, n.view)} className={n.view === view ? 'active' : ''}>
            {n.label}
          </a>
        ))}
      </nav>
    </div>
  )
}

const live = (s: Session) => s.status === 'pending' || s.status === 'confirmed'

/** The weekly check-in: "Has your availability changed?" for the week being planned. */
function AvailabilityPrompt({ user, coach }: { user: User; coach: Coach }) {
  const state = useStore()
  const week = planningWeek(state.today)
  if (hasConfirmedWeek(coach, week)) return null
  return (
    <div className="prompt" role="region" aria-label="Weekly availability check">
      <p>Has your availability changed for {weekRange(week)}?</p>
      <div className="actions">
        <button className="btn primary" onClick={() => confirmAvailability(user, coach.id, week)}>
          No, it’s the same
        </button>
        <a className="btn" href={href(user.id, 'availability')}>
          Yes, update it
        </a>
      </div>
    </div>
  )
}

function Shifts({ user }: { user: User }) {
  const state = useStore()
  const route = useRoute()
  const week = route.params.get('w') ?? planningWeek(state.today)
  const weekEnd = addDays(week, 6)
  const mine = visibleSessions(user, state.sessions).filter((s) => s.date >= week && s.date <= weekEnd)
  const toConfirm = mine.filter((s) => live(s) && canConfirmShift(s.date, state.today) && !s.assignments.find((a) => a.coachId === user.coachId)?.confirmedByCoach)
  // Future weeks open for confirming on the Sunday before them.
  const opensOn = confirmOpensOn(week)
  const notYet = state.today < opensOn
  const coach = state.coaches.find((c) => c.id === user.coachId)!
  const [flash, setFlash] = useState('')

  const byDay = new Map<string, Session[]>()
  for (const s of mine.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s])

  return (
    <>
      <header className="phone-head">
        <h2>Hi {coach.name.split(' ')[0]}</h2>
        <LevelTag level={coach.level} />
      </header>
      <AvailabilityPrompt user={user} coach={coach} />
      <div className="week-nav compact">
        <button className="btn" onClick={() => setParams(route, { w: addDays(week, -7) })} aria-label="Previous week">
          ←
        </button>
        <span className="week-label">{weekRange(week)}</span>
        <button className="btn" onClick={() => setParams(route, { w: addDays(week, 7) })} aria-label="Next week">
          →
        </button>
      </div>

      {toConfirm.length > 0 && (
        <button
          className="btn primary block"
          onClick={() => {
            coachConfirmMany(user, toConfirm.map((s) => s.id))
            setFlash(`Confirmed ${toConfirm.length} shift${toConfirm.length > 1 ? 's' : ''}.`)
          }}
        >
          {toConfirm.length === 1 ? 'Confirm my 1 shift this week' : `Confirm all ${toConfirm.length} shifts this week`}
        </button>
      )}
      {flash && <p className="notice">{flash}</p>}
      {notYet && byDay.size > 0 && <p className="callout soft small">You can confirm this week’s shifts from {weekdayMonthDay(opensOn)}, the Sunday before. Plans change, so confirmations only open close to the week.</p>}

      {byDay.size === 0 && <Empty>No shifts this week.</Empty>}
      {[...byDay.entries()].map(([date, sessions]) => (
        <section key={date} className={`phone-day day-${dayOfWeek(date)}`}>
          <h3>
            {weekdayMonthDay(date)}
          </h3>
          {sessions.map((s) => {
            const center = state.centers.find((c) => c.id === s.centerId)!
            const me = s.assignments.find((a) => a.coachId === user.coachId)!
            return (
              <div key={s.id} className={`shift ${live(s) ? '' : 'closed'}`}>
                <a className="shift-main" href={href(user.id, 'shifts', { s: s.id, w: route.params.get('w') ?? undefined })}>
                  <strong>
                    {prettyTime(s.start)}–{prettyTime(s.end)}
                  </strong>
                  <span>{center.name}</span>
                  <small className="muted">
                    {s.groups.reduce((n, g) => n + g.players, 0)} kids · ages {s.groups.map((g) => g.ageRange).join(', ')}
                  </small>
                </a>
                {!live(s) ? (
                  <span className="flag muted">{s.status === 'cancelled' ? 'Cancelled' : 'Moved'}</span>
                ) : me.confirmedByCoach ? (
                  <span className="flag ok">Confirmed ✓</span>
                ) : s.rescheduledFromId && canConfirmShift(s.date, state.today) ? (
                  <button className="btn small save-override" onClick={() => coachConfirmMany(user, [s.id])} title="This session moved. Confirm the new time.">
                    Moved: confirm
                  </button>
                ) : s.date < state.today ? (
                  <span className="flag muted">Past</span>
                ) : !canConfirmShift(s.date, state.today) ? (
                  <span className="flag muted" title="Confirmations open the Sunday before the week">
                    Confirm from {monthDay(confirmOpensOn(s.date))}
                  </span>
                ) : (
                  <button className="btn small" onClick={() => coachConfirmMany(user, [s.id])}>
                    Confirm
                  </button>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}

function ShiftPackage({ user, id }: { user: User; id: string }) {
  const state = useStore()
  const route = useRoute()
  const s = visibleSessions(user, state.sessions).find((x) => x.id === id)
  const back = href(user.id, 'shifts', { w: route.params.get('w') ?? undefined })
  if (!s) {
    return (
      <Empty>
        That shift isn’t yours. <a href={back}>Back to my shifts</a>
      </Empty>
    )
  }
  const center = state.centers.find((c) => c.id === s.centerId)!
  const me = s.assignments.find((a) => a.coachId === user.coachId)!
  const mates = s.assignments.filter((a) => a.coachId !== user.coachId).map((a) => state.coaches.find((c) => c.id === a.coachId)!)

  return (
    <article className="package">
      <a className="back" href={back}>
        ← My shifts
      </a>
      <h2>{center.name}</h2>
      <p className="big-when">
        {longDate(s.date)} · {prettyTime(s.start)}–{prettyTime(s.end)}
      </p>
      {live(s) && s.rescheduledFromId && !me.confirmedByCoach && <p className="callout">This session was rescheduled. Please confirm the new time.</p>}
      {!live(s) && <p className="callout">{s.status === 'cancelled' ? 'This session was cancelled.' : `This session moved to ${movedTo(s, state.sessions, true)}.`}</p>}

      <a className="tap-row" href={mapHref(center.address)} target="_blank" rel="noreferrer">
        <span>📍</span>
        <span>
          {center.address}
          <small>Tap to open in Maps</small>
        </span>
      </a>
      <div className="tap-row">
        <span>👤</span>
        <span>
          {center.poc.name}, {center.poc.title}
          <small>
            <Phone phone={center.poc.phone} label={`${center.poc.phone}${center.poc.ext ? ` x${center.poc.ext}` : ''}`} />
          </small>
        </span>
      </div>
      <div className="tap-row">
        <span>☎️</span>
        <span>
          Front desk
          <small>
            <Phone phone={center.phone} />
          </small>
        </span>
      </div>

      <h3>Groups</h3>
      <ul className="group-list">
        {s.groups.map((g, i) => (
          <li key={i}>
            <strong>{g.players} kids</strong> · ages {g.ageRange} · {g.minutes} min
            {g.supportNotes && <small className="support">⚑ {g.supportNotes}</small>}
          </li>
        ))}
      </ul>
      <p className="muted small">
        {center.space.category === 'indoor' ? `Indoor, ${center.space.floor?.toLowerCase()} floor` : `Outdoor, ${center.space.outdoorSurface?.replace('_', ' ')}`}
        {center.space.obstacles.length > 0 && ` · watch for ${center.space.obstacles.join(', ').toLowerCase()}`}
      </p>
      {s.notes && <p className="note">{s.notes}</p>}

      <h3>Working with you</h3>
      {mates.length === 0 && <p className="muted">Just you on this one.</p>}
      <ul className="mates">
        {mates.map((c) => (
          <li key={c.id}>
            <span>
              {c.name} <LevelTag level={c.level} />
            </span>
            <Phone phone={c.phone} />
          </li>
        ))}
      </ul>

      {live(s) && s.date >= state.today && (
        <div className="sticky-action">
          {me.confirmedByCoach ? (
            <p className="ok-line">✓ You confirmed this shift</p>
          ) : !canConfirmShift(s.date, state.today) ? (
            <p className="muted small">You can confirm this shift from {weekdayMonthDay(confirmOpensOn(s.date))}, the Sunday before its week.</p>
          ) : (
            <button className="btn primary block" onClick={() => coachConfirmMany(user, [s.id])}>
              Confirm this shift
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function Directory({ user }: { user: User }) {
  const state = useStore()
  const peers = visibleRoster(user, state.coaches).filter((c) => c.id !== user.coachId)
  const territory = state.territories.find((t) => t.id === user.territoryIds[0])
  return (
    <>
      <header className="phone-head">
        <h2>{territory?.name} coaches</h2>
      </header>
      <Hint>Only coaches in your territory, for trading or covering shifts. The buttons call or text from your phone.</Hint>
      <ul className="directory">
        {peers.map((c) => (
          <li key={c.id}>
            <span>
              <strong>{c.name}</strong> <LevelTag level={c.level} />
            </span>
            <Phone phone={c.phone} />
          </li>
        ))}
      </ul>
    </>
  )
}

function Availability({ user }: { user: User }) {
  const state = useStore()
  const coach = state.coaches.find((c) => c.id === user.coachId)!
  const [tab, setTab] = useState<'usual' | 'week' | 'off'>('usual')
  const [toast, setToast] = useState('')
  const week = planningWeek(state.today)
  const done = (msg: string) => {
    // Reviewing and saving counts as this week's check-in.
    confirmAvailability(user, coach.id, week)
    setToast(msg)
  }
  return (
    <>
      <header className="phone-head">
        <h2>My availability</h2>
      </header>
      <AvailabilityPrompt user={user} coach={coach} />
      <div className="seg" role="tablist" aria-label="Availability">
        {(
          [
            ['usual', 'Usual week'],
            ['week', 'One week only'],
            ['off', 'Days off'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'usual' && <UsualWeek user={user} coach={coach} onSaved={() => done('Saved: this is your usual week from now on.')} />}
      {tab === 'week' && <OneWeek user={user} coach={coach} onSaved={done} />}
      {tab === 'off' && <DaysOff user={user} coach={coach} today={state.today} onSaved={setToast} />}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
}

/** A long-term change, e.g. a new semester schedule. */
function UsualWeek({ user, coach, onSaved }: { user: User; coach: Coach; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<Weekday, number[]>>(coach.availability)
  const dirty = JSON.stringify(draft) !== JSON.stringify(coach.availability)
  return (
    <>
      <p className="muted small">The hours you can usually work, Monday to Saturday, 9am to 6pm. Tap a day name to toggle the whole day.</p>
      <AvailabilityGrid value={draft} onChange={setDraft} />
      <button
        className="btn primary block"
        disabled={!dirty}
        onClick={() => {
          setAvailability(user, coach.id, draft)
          onSaved()
        }}
      >
        Save as my usual week
      </button>
    </>
  )
}

/** A short-term change for a single week; the usual week comes back after. */
function OneWeek({ user, coach, onSaved }: { user: User; coach: Coach; onSaved: (msg: string) => void }) {
  const state = useStore()
  const first = planningWeek(state.today)
  const weeks = [0, 1, 2, 3].map((i) => addDays(first, i * 7))
  const [monday, setMonday] = useState(first)
  return <OneWeekGrid key={monday} user={user} coach={coach} monday={monday} weeks={weeks} setMonday={setMonday} onSaved={onSaved} />
}

function OneWeekGrid({ user, coach, monday, weeks, setMonday, onSaved }: { user: User; coach: Coach; monday: string; weeks: string[]; setMonday: (m: string) => void; onSaved: (msg: string) => void }) {
  const base = coach.weekChanges[monday] ?? coach.availability
  const [draft, setDraft] = useState<Record<Weekday, number[]>>(base)
  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  return (
    <>
      <label className="field">
        Week
        <select value={monday} onChange={(e) => setMonday(e.target.value)}>
          {weeks.map((w) => (
            <option key={w} value={w}>
              {weekRange(w)}
              {coach.weekChanges[w] ? ' (changed)' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Changes here apply to this week only. Your usual week comes back after.</p>
      <AvailabilityGrid value={draft} onChange={setDraft} />
      <button
        className="btn primary block"
        disabled={!dirty}
        onClick={() => {
          setWeekChange(user, coach.id, monday, draft)
          onSaved(`Saved for ${weekRange(monday)} only.`)
        }}
      >
        Save for this week only
      </button>
      {coach.weekChanges[monday] && (
        <button
          className="btn ghost block"
          onClick={() => {
            setWeekChange(user, coach.id, monday, null)
            onSaved('Back to your usual week.')
          }}
        >
          Undo this week’s change
        </button>
      )}
    </>
  )
}

/** Vacations, exams: whole days off. Past ones drop off by themselves. */
function DaysOff({ user, coach, today, onSaved }: { user: User; coach: Coach; today: string; onSaved: (msg: string) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const off = upcomingTimeOff(coach, today)
  return (
    <>
      <p className="muted small">Days you can’t work at all. Your territory manager sees them, and you won’t be offered sessions those days.</p>
      {off.length === 0 ? (
        <p className="small muted">No days off coming up.</p>
      ) : (
        <ul className="timeoff-list">
          {off.map((t) => (
            <li key={t.id}>
              <span>
                <strong>
                  {dateSpan(t.from, t.to)}
                </strong>
                {t.note && <small className="muted"> · {t.note}</small>}
              </span>
              <button
                className="btn small ghost"
                onClick={() => {
                  removeTimeOff(user, coach.id, t.id)
                  onSaved('Day off removed.')
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          setError('')
          try {
            addTimeOff(user, coach.id, { from, to: to || from, note: note.trim() || undefined })
            setFrom('')
            setTo('')
            setNote('')
            onSaved('Days off saved.')
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <label className="field">
          First day off
          <input type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          Last day off
          <input type="date" min={from || today} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field grow">
          Reason (optional)
          <input value={note} placeholder="Vacation, exam…" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!from}>
          Add days off
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </>
  )
}
