import { useMemo, useState } from 'react'
import {
  CYCLE_WEEKS,
  addDays,
  canEditIntake,
  canSeeTerritory,
  checkCoverage,
  dayOfWeek,
  fromMinutes,
  mediumDate,
  prettyDate,
  prettyTime,
  programDates,
  suggestSlots,
  toMinutes,
  WEEKDAY_LONG,
} from '../engine'
import type { CoverageRequest, CycleWeeks, Group, Intake, SpaceProfile, User, Weekday } from '../engine'
import { CITY, ZIPS, standardizeAddress } from '../data/places'
import { href, useRoute } from '../router'
import { getState, submitIntake, updateIntake, useStore, worldOf } from '../store'
import { Hint } from '../ui/bits'
import { money } from '../ui/format'

const DAY_SHORT = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const OBSTACLES = ['Playground structures', 'Swings', 'Seesaws', 'Park/picnic benches', 'Gazebos', 'Loose toy storage areas']
const FLOORS = ['Carpet', 'Tile', 'Linoleum', 'Hardwood']

type Space = Omit<SpaceProfile, 'backupIndoorSpace'> & { backupIndoorSpace: boolean | null }

function nextMonday(today: string) {
  const d = dayOfWeek(today)
  return addDays(today, d === 0 ? 1 : 8 - d)
}

/** The intake form. With ?edit=<intake id> it changes an existing submission instead. */
export function SalesIntake({ user }: { user: User }) {
  const route = useRoute()
  const editId = route.params.get('edit')
  const intake = editId ? getState().intakes.find((i) => i.id === editId) : undefined
  if (editId && (!intake || !canEditIntake(user, intake, getState().sessions, getState().today))) {
    return (
      <div className="card success">
        <h2>This submission can’t be changed</h2>
        <p>A territory manager has confirmed it, or the program has already started. Call the territory manager to make changes.</p>
        <a className="btn" href={href(user.id, 'submissions')}>
          Back to my submissions
        </a>
      </div>
    )
  }
  return <IntakeForm key={editId ?? 'new'} user={user} editing={intake} />
}

function IntakeForm({ user, editing }: { user: User; editing?: Intake }) {
  const state = useStore()
  const territories = state.territories.filter((t) => canSeeTerritory(user, t.id))
  const existing = editing ? state.centers.find((c) => c.id === editing.centerId) : undefined
  const [territoryId, setTerritoryId] = useState(existing?.territoryId ?? territories[0]?.id ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [street, setStreet] = useState(existing?.address.split(',')[0] ?? '')
  const [zip, setZip] = useState(existing?.address.split(' ').at(-1) ?? '')
  const [poc, setPoc] = useState({ name: '', title: 'Center Director', email: '', phone: '', ext: '', ...existing?.poc, ...(existing && { ext: existing.poc.ext ?? '' }) })
  const [firstDate, setFirstDate] = useState(existing?.terms?.startDate ?? addDays(nextMonday(state.today), 1))
  const [weeks, setWeeks] = useState<CycleWeeks>(existing?.terms?.cycleWeeks ?? 8)
  const [weekdays, setWeekdays] = useState<Weekday[]>(existing?.terms?.weekdays ?? [2])
  const [price, setPrice] = useState(existing?.terms?.cycleRate ?? 0)
  const [start, setStart] = useState(editing?.schedule.start ?? '10:00')
  const [groups, setGroups] = useState<Group[]>(editing?.schedule.groups ?? [{ players: 10, ageRange: '3-4', minutes: 30 }])
  // The end time follows the groups until the rep sets it by hand.
  const [endTyped, setEndTyped] = useState<string | null>(editing?.schedule.end ?? null)
  const [space, setSpace] = useState<Space>(existing?.space ?? { category: 'indoor', indoorSize: 'larger', floor: 'Carpet', grade: 'flat', obstacles: [], backupIndoorSpace: null })
  const [notes, setNotes] = useState(editing?.schedule.notes ?? '')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')

  const place = ZIPS[territoryId]?.find((z) => z.zip === zip)
  const address = standardizeAddress(street, territoryId, zip)
  const minutes = groups.reduce((m, g) => m + (g.minutes || 0), 0)
  const end = endTyped ?? fromMinutes(toMinutes(start) + minutes)
  const blockMinutes = toMinutes(end) - toMinutes(start)
  const terms = { startDate: firstDate, cycleWeeks: weeks, weekdays, cycleRate: price }
  const dates = useMemo(() => programDates({ startDate: firstDate, cycleWeeks: weeks, weekdays }), [firstDate, weeks, weekdays])
  const pastDate = firstDate && firstDate < state.today
  const lateEnd = toMinutes(end) > 18 * 60
  const earlyStart = toMinutes(start) < 9 * 60
  const badEnd = blockMinutes <= 0
  const groupsTooLong = !badEnd && minutes > blockMinutes

  // When editing, the submission's own sessions mustn't count as conflicts.
  const world = useMemo(() => {
    const w = worldOf(state)
    return editing ? { ...w, sessions: w.sessions.filter((s) => s.intakeId !== editing.id) } : w
  }, [state, editing])
  const valid = !!place && !!firstDate && dates.length > 0 && !pastDate && !lateEnd && !earlyStart && !badEnd && !groupsTooLong && weekdays.length > 0 && groups.every((g) => g.players > 0 && g.minutes > 0)
  // Memoized so the coverage check only re-runs when the request actually changes.
  const req = useMemo<CoverageRequest | null>(
    () => (valid && place ? { territoryId, location: place, dates, start, end, groups } : null),
    [valid, place, territoryId, dates, start, end, groups],
  )
  const coverage = useMemo(() => (req ? checkCoverage(req, world) : null), [req, world])
  const suggestions = useMemo(() => (req && coverage && !coverage.ok ? suggestSlots(req, world) : []), [req, coverage, world])

  const missing = [
    !name.trim() && 'center name',
    !/\d{3}.*\d{4}/.test(phone) && 'center phone',
    !address && 'a valid street address + ZIP',
    !poc.name.trim() && 'contact name',
    !/^\S+@\S+\.\S+$/.test(poc.email) && 'contact email',
    !(price > 0) && 'cycle price',
    space.backupIndoorSpace === null && 'weather backup answer',
  ].filter(Boolean) as string[]

  const canSubmit = !!coverage?.ok && missing.length === 0

  const submit = () => {
    setError('')
    try {
      const { backupIndoorSpace, ...rest } = space
      const input = {
        center: {
          territoryId,
          name: name.trim(),
          phone: phone.trim(),
          address: address!,
          lat: place!.lat,
          lng: place!.lng,
          poc: { ...poc, ext: poc.ext || undefined },
          space: { ...rest, backupIndoorSpace: !!backupIndoorSpace },
        },
        terms,
        start,
        end,
        groups: groups.map((g) => ({ ...g, supportNotes: g.supportNotes?.trim() || undefined })),
        notes: notes.trim() || undefined,
      }
      if (editing) {
        updateIntake(user, editing.id, input)
        setDone(editing.id)
      } else setDone(submitIntake(user, input))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (done) {
    return (
      <div className="card success">
        <h2>{editing ? 'Changes saved ✓' : 'Submitted ✓'}</h2>
        <p>
          {editing
            ? `${name} now has ${dates.length} pending session${dates.length > 1 ? 's' : ''}. Every change is logged on the sessions for the territory manager.`
            : `${name} is on the ${state.territories.find((t) => t.id === territoryId)?.name} calendar as ${dates.length} pending session${dates.length > 1 ? 's' : ''}. The territory manager assigns the coaching staff next.`}
        </p>
        <div className="actions">
          <a className="btn primary" href={href(user.id, 'submissions')}>
            See my submissions
          </a>
          <a className="btn ghost" href={href(user.id, 'intake')} onClick={() => setTimeout(() => window.location.reload(), 0)}>
            Start another
          </a>
        </div>
      </div>
    )
  }

  const setGroup = (i: number, patch: Partial<Group>) => setGroups(groups.map((g, j) => (i === j ? { ...g, ...patch } : g)))

  return (
    <div className="intake">
      <form className="intake-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Sales identification</legend>
          <div className="row">
            <label className="field">
              Sales rep
              <input value={user.name} disabled />
            </label>
            <label className="field">
              Territory
              <select value={territoryId} onChange={(e) => (setTerritoryId(e.target.value), setZip(''))}>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}, {t.state}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Facility</legend>
          <div className="row">
            <label className="field grow">
              Center / facility name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acorn Hill Preschool" />
            </label>
            <label className="field">
              Main phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={`${CITY[territoryId]?.areaCode}-555-0123`} inputMode="tel" />
            </label>
          </div>
          <div className="row">
            <label className="field grow">
              Street address
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="1234 maple ridge drive" />
            </label>
            <label className="field">
              ZIP
              <select value={zip} onChange={(e) => setZip(e.target.value)}>
                <option value="">Choose…</option>
                {ZIPS[territoryId]?.map((z) => (
                  <option key={z.zip} value={z.zip}>
                    {z.zip} · {z.area}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className={`small ${address ? 'ok' : 'muted'}`}>{address ? `Standardized: ${address}` : 'The address is standardized and located from the ZIP (a production build would call a geocoding API).'}</p>
        </fieldset>

        <fieldset>
          <legend>Point of contact</legend>
          <div className="row">
            <label className="field grow">
              Name
              <input value={poc.name} onChange={(e) => setPoc({ ...poc, name: e.target.value })} />
            </label>
            <label className="field grow">
              Title
              <input value={poc.title} onChange={(e) => setPoc({ ...poc, title: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="field grow">
              Email
              <input type="email" value={poc.email} onChange={(e) => setPoc({ ...poc, email: e.target.value })} />
            </label>
            <label className="field">
              Direct phone
              <input value={poc.phone} onChange={(e) => setPoc({ ...poc, phone: e.target.value })} inputMode="tel" />
            </label>
            <label className="field narrow">
              Ext.
              <input value={poc.ext} onChange={(e) => setPoc({ ...poc, ext: e.target.value })} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Program terms</legend>
          <div className="row">
            <label className="field">
              Cycle length
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value) as CycleWeeks)}>
                {CYCLE_WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {w} week{w > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              Days per week (up to 3)
              <div className="day-chips" role="group" aria-label="Days of the week">
                {([1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => {
                  const on = weekdays.includes(d)
                  return (
                    <button
                      type="button"
                      key={d}
                      className={on ? 'on' : ''}
                      aria-pressed={on}
                      disabled={!on && weekdays.length >= 3}
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort((a, b) => a - b))}
                    >
                      {DAY_SHORT[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="row">
            <label className="field">
              Starting
              <input type="date" value={firstDate} min={state.today} onChange={(e) => setFirstDate(e.target.value)} />
            </label>
            <label className="field">
              Start time
              <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              End time
              <input type="time" step={900} value={end} onChange={(e) => setEndTyped(e.target.value)} />
            </label>
            <label className="field narrow">
              Cycle price ($)
              <input type="number" min={0} step={10} value={price || ''} placeholder="0" onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} />
            </label>
          </div>
          <p className="readout big">
            {dates.length} session{dates.length === 1 ? '' : 's'}
            {weekdays.length > 0 && ` · ${weekdays.map((d) => `${WEEKDAY_LONG[d]}s`).join(' & ')} ${prettyTime(start)}–${prettyTime(end)}`}
            {dates.length > 0 && ` · first session ${mediumDate(dates[0])}, last ${mediumDate(dates.at(-1)!)}`}
          </p>
          {price > 0 && dates.length > 0 && (
            <p className="small">
              {money(price)} for the cycle = <strong>{money(price / dates.length)} per session</strong> · {money(price / weeks)} per week
            </p>
          )}
          <Hint>Centers pay for the whole cycle, not week to week. The territory manager confirms these terms; after that only an ops admin can change the price.</Hint>
          {weekdays.length === 0 && <p className="bad small">Pick at least one day.</p>}
          {pastDate && <p className="bad small">The first session can’t be in the past.</p>}
          {(lateEnd || earlyStart) && <p className="bad small">Sessions must fit between 9am and 6pm.</p>}
          {badEnd && <p className="bad small">The end time must be after the start time.</p>}
          {groupsTooLong && (
            <p className="bad small">
              The groups add up to {minutes} minutes but the session is {blockMinutes}. Make the session longer or the groups shorter.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>Groups</legend>
          <table className="groups">
            <thead>
              <tr>
                <th>Group</th>
                <th>Kids</th>
                <th>Ages</th>
                <th>Minutes</th>
                <th>Special needs / support notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <input type="number" min={1} max={30} value={g.players} onChange={(e) => setGroup(i, { players: Number(e.target.value) })} aria-label={`Group ${i + 1} kids`} />
                  </td>
                  <td>
                    <input value={g.ageRange} onChange={(e) => setGroup(i, { ageRange: e.target.value })} aria-label={`Group ${i + 1} ages`} />
                  </td>
                  <td>
                    <select value={g.minutes} onChange={(e) => setGroup(i, { minutes: Number(e.target.value) })} aria-label={`Group ${i + 1} minutes`}>
                      {[30, 45, 60].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={g.supportNotes ?? ''} onChange={(e) => setGroup(i, { supportNotes: e.target.value })} placeholder="Optional" aria-label={`Group ${i + 1} support notes`} />
                  </td>
                  <td>
                    {groups.length > 1 && (
                      <button type="button" className="icon-btn" onClick={() => setGroups(groups.filter((_, j) => j !== i))} aria-label={`Remove group ${i + 1}`}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn ghost" onClick={() => setGroups([...groups, { players: 10, ageRange: '4-5', minutes: 30 }])} disabled={groups.length >= 4}>
            + Add a group
          </button>
        </fieldset>

        <fieldset>
          <legend>Space</legend>
          <div className="row">
            <div className="seg" role="group" aria-label="Space category">
              {(['indoor', 'outdoor'] as const).map((c) => (
                <button type="button" key={c} className={space.category === c ? 'on' : ''} onClick={() => setSpace({ ...space, category: c, ...(c === 'outdoor' ? { outdoorSurface: 'short_grass' } : { indoorSize: 'larger', floor: 'Carpet', grade: 'flat' }) })}>
                  {c === 'indoor' ? 'Indoor' : 'Outdoor'}
                </button>
              ))}
            </div>
          </div>
          {space.category === 'indoor' ? (
            <div className="row">
              <label className="field">
                Room size
                <select value={space.indoorSize} onChange={(e) => setSpace({ ...space, indoorSize: e.target.value as Space['indoorSize'] })}>
                  <option value="small_bedroom">Small bedroom</option>
                  <option value="average_bedroom">Average bedroom</option>
                  <option value="large_master_bedroom">Large master bedroom</option>
                  <option value="larger">Larger</option>
                </select>
              </label>
              <label className="field">
                Floor
                <input list="floors" value={space.floor} onChange={(e) => setSpace({ ...space, floor: e.target.value })} />
                <datalist id="floors">
                  {FLOORS.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </label>
            </div>
          ) : (
            <div className="row">
              <label className="field">
                Surface
                <select value={space.outdoorSurface} onChange={(e) => setSpace({ ...space, outdoorSurface: e.target.value as Space['outdoorSurface'] })}>
                  <option value="short_grass">Short grass</option>
                  <option value="long_grass">Long grass</option>
                  <option value="turf">Turf</option>
                  <option value="mulch">Playground mulch</option>
                  <option value="rubber">Playground rubber</option>
                  <option value="blacktop">Blacktop / concrete</option>
                </select>
              </label>
              <label className="field">
                Grade
                <select value={space.grade} onChange={(e) => setSpace({ ...space, grade: e.target.value as Space['grade'] })}>
                  <option value="flat">Flat</option>
                  <option value="sloped">Sloped</option>
                </select>
              </label>
            </div>
          )}
          <p className="sub-legend">Obstacles on site</p>
          <div className="checks">
            {OBSTACLES.map((o) => (
              <label key={o} className="check">
                <input
                  type="checkbox"
                  checked={space.obstacles.includes(o)}
                  onChange={(e) => setSpace({ ...space, obstacles: e.target.checked ? [...space.obstacles, o] : space.obstacles.filter((x) => x !== o) })}
                />
                {o}
              </label>
            ))}
          </div>
          <div className="row">
            <span className="field-label">Is there a safe indoor backup space for bad weather or heat?</span>
            <div className="seg" role="group" aria-label="Weather backup">
              {[true, false].map((v) => (
                <button type="button" key={String(v)} className={space.backupIndoorSpace === v ? 'on' : ''} onClick={() => setSpace({ ...space, backupIndoorSpace: v })}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            Notes for the coaches (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </fieldset>
      </form>

      <aside className="coverage" aria-live="polite">
        <h3>Can our coaching staff cover this?</h3>
        {!place && <p className="muted">Pick the ZIP to start the live check.</p>}
        {place && !req && <p className="muted">Fix the date/time above to run the check.</p>}
        {coverage && (
          <>
            <div className={`verdict ${coverage.ok ? 'yes' : 'no'}`}>
              {coverage.ok ? `✓ Yes: all ${dates.length} dates can be staffed` : `✗ No: ${coverage.reason ?? 'not staffable'}`}
            </div>
            <ul className="date-checks">
              {coverage.dates.map((d) => (
                <li key={d.date} className={d.ok ? 'ok' : 'bad'}>
                  <span>{prettyDate(d.date)}</span>
                  <small>{d.ok ? `${d.freeCoaches} qualified coach${d.freeCoaches === 1 ? '' : 'es'} free` : d.reason}</small>
                </li>
              ))}
            </ul>
            <Hint>
              Uses the scheduling rules (availability, days off, existing sessions, drive time + {state.settings.bufferMinutes} min buffer, lead coach, 1:{state.settings.ratio}) with no overrides. It only proves qualified coaches exist; the territory manager assigns them.
            </Hint>
            {!coverage.ok && (
              <div className="suggest">
                <h4>Open slots to offer instead</h4>
                {suggestions.length === 0 && <p className="small muted">No open slot of this length over these weeks. Try fewer kids per group or a shorter session.</p>}
                {suggestions.map((sg) => (
                  <button
                    key={`${sg.firstDate}${sg.start}`}
                    type="button"
                    className="btn ghost suggestion"
                    onClick={() => {
                      setFirstDate(sg.firstDate)
                      setWeekdays(sg.weekdays)
                      setStart(sg.start)
                      setEndTyped(sg.end)
                    }}
                  >
                    {sg.weekdays.map((d) => `${WEEKDAY_LONG[d]}s`).join(' & ')} {prettyTime(sg.start)}–{prettyTime(sg.end)} <small>from {prettyDate(sg.firstDate)}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button className="btn primary block" disabled={!canSubmit} onClick={submit}>
          {editing ? 'Save changes' : 'Submit center'}
        </button>
        {!coverage?.ok && place && <p className="small bad">Submit stays locked until the coaching staff can cover every date.</p>}
        {coverage?.ok && missing.length > 0 && <p className="small muted">Still needed: {missing.join(', ')}.</p>}
        {error && <p className="error">{error}</p>}
      </aside>
    </div>
  )
}
