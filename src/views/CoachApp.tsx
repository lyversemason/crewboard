// The coach's phone view: only their own shifts, plus a territory directory.

import { useState } from 'react'
import { addDays, planningWeek, prettyDate, prettyTime, visibleRoster, visibleSessions, WEEKDAY_LONG, dayOfWeek } from '../engine'
import type { Session, User, Weekday } from '../engine'
import { href, setParams, useRoute } from '../router'
import { coachConfirmMany, setAvailability, useStore } from '../store'
import { Empty, LevelTag, Phone } from '../ui/bits'
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

function Shifts({ user }: { user: User }) {
  const state = useStore()
  const route = useRoute()
  const week = route.params.get('w') ?? planningWeek(state.today)
  const weekEnd = addDays(week, 6)
  const mine = visibleSessions(user, state.sessions).filter((s) => s.date >= week && s.date <= weekEnd)
  const toConfirm = mine.filter((s) => live(s) && s.date >= state.today && !s.assignments.find((a) => a.coachId === user.coachId)?.confirmedByCoach)
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
      <div className="week-nav compact">
        <button className="btn" onClick={() => setParams(route, { w: addDays(week, -7) })} aria-label="Previous week">
          ←
        </button>
        <span>Week of {prettyDate(week).slice(4)}</span>
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
          Confirm all {toConfirm.length} shift{toConfirm.length > 1 ? 's' : ''} this week
        </button>
      )}
      {flash && <p className="notice">{flash}</p>}

      {byDay.size === 0 && <Empty>No shifts this week.</Empty>}
      {[...byDay.entries()].map(([date, sessions]) => (
        <section key={date} className={`phone-day day-${dayOfWeek(date)}`}>
          <h3>
            {WEEKDAY_LONG[dayOfWeek(date)]} <span className="muted">{prettyDate(date).slice(4)}</span>
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
                ) : s.date < state.today ? (
                  <span className="flag muted">Past</span>
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
        {prettyDate(s.date)} · {prettyTime(s.start)}–{prettyTime(s.end)}
      </p>
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
            <Phone phone={center.poc.phone} label={`Call ${center.poc.phone}${center.poc.ext ? ` x${center.poc.ext}` : ''}`} />
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
      <p className="muted small">For trading or covering shifts. Tap a number to call or text.</p>
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
  const [draft, setDraft] = useState<Record<Weekday, number[]>>(coach.availability)
  const [saved, setSaved] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(coach.availability)
  return (
    <>
      <header className="phone-head">
        <h2>My weekly availability</h2>
      </header>
      <p className="muted small">Tap the hours you can usually work, Monday to Saturday, 9am to 6pm. Tap a day name to toggle the whole day.</p>
      <AvailabilityGrid
        value={draft}
        onChange={(v) => {
          setDraft(v)
          setSaved(false)
        }}
      />
      <button
        className="btn primary block"
        disabled={!dirty}
        onClick={() => {
          setAvailability(user, coach.id, draft)
          setSaved(true)
        }}
      >
        Save availability
      </button>
      {saved && <p className="notice">Saved. Your manager will see any shifts that no longer fit.</p>}
      <p className="small muted">Coming later: date-specific exceptions (vacations, exams) and a weekly reminder to re-confirm.</p>
    </>
  )
}
