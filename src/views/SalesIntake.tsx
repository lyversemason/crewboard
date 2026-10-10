import { useMemo, useState } from 'react'
import { addDays, canSeeTerritory, checkCoverage, dayOfWeek, fromMinutes, prettyDate, prettyTime, suggestSlots, toMinutes, weeklyDates, WEEKDAY_LONG } from '../engine'
import type { CoverageRequest, Group, SpaceProfile, User } from '../engine'
import { CITY, ZIPS, standardizeAddress } from '../data/places'
import { href } from '../router'
import { submitIntake, useStore, worldOf } from '../store'

const WEEKS = [1, 2, 4, 8, 12, 20]
const OBSTACLES = ['Playground structures', 'Swings', 'Seesaws', 'Park/picnic benches', 'Gazebos', 'Loose toy storage areas']
const FLOORS = ['Carpet', 'Tile', 'Linoleum', 'Hardwood']

type Space = Omit<SpaceProfile, 'backupIndoorSpace'> & { backupIndoorSpace: boolean | null }

function nextMonday(today: string) {
  const d = dayOfWeek(today)
  return addDays(today, d === 0 ? 1 : 8 - d)
}

export function SalesIntake({ user }: { user: User }) {
  const state = useStore()
  const territories = state.territories.filter((t) => canSeeTerritory(user, t.id))
  const [territoryId, setTerritoryId] = useState(territories[0]?.id ?? '')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [poc, setPoc] = useState({ name: '', title: 'Center Director', email: '', phone: '', ext: '' })
  const [firstDate, setFirstDate] = useState(addDays(nextMonday(state.today), 1))
  const [weeks, setWeeks] = useState(8)
  const [start, setStart] = useState('10:00')
  const [groups, setGroups] = useState<Group[]>([{ players: 10, ageRange: '3-4', minutes: 30 }])
  const [space, setSpace] = useState<Space>({ category: 'indoor', indoorSize: 'larger', floor: 'Carpet', grade: 'flat', obstacles: [], backupIndoorSpace: null })
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')

  const place = ZIPS[territoryId]?.find((z) => z.zip === zip)
  const address = standardizeAddress(street, territoryId, zip)
  const minutes = groups.reduce((m, g) => m + (g.minutes || 0), 0)
  const end = fromMinutes(toMinutes(start) + minutes)
  const dates = useMemo(() => (firstDate ? weeklyDates(firstDate, weeks) : []), [firstDate, weeks])
  const sunday = firstDate && dayOfWeek(firstDate) === 0
  const pastDate = firstDate && firstDate < state.today
  const lateEnd = toMinutes(end) > 18 * 60
  const earlyStart = toMinutes(start) < 9 * 60

  const world = useMemo(() => worldOf(state), [state])
  const valid = !!place && !sunday && !pastDate && !lateEnd && !earlyStart && groups.every((g) => g.players > 0 && g.minutes > 0)
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
    space.backupIndoorSpace === null && 'weather backup answer',
  ].filter(Boolean) as string[]

  const canSubmit = !!coverage?.ok && missing.length === 0

  const submit = () => {
    setError('')
    try {
      const { backupIndoorSpace, ...rest } = space
      const id = submitIntake(user, {
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
        dates,
        start,
        end,
        groups: groups.map((g) => ({ ...g, supportNotes: g.supportNotes?.trim() || undefined })),
        notes: notes.trim() || undefined,
      })
      setDone(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (done) {
    return (
      <div className="card success">
        <h2>Submitted ✓</h2>
        <p>
          {name} is on the {state.territories.find((t) => t.id === territoryId)?.name} calendar as {dates.length} pending, unassigned session{dates.length > 1 ? 's' : ''}. The territory manager assigns coaches next.
        </p>
        <div className="actions">
          <a className="btn primary" href={href(user.id, 'submissions')}>
            See my submissions
          </a>
          <button className="btn ghost" onClick={() => window.location.reload()}>
            Start another
          </button>
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

        <fieldset className="locked">
          <legend>Program terms</legend>
          <p className="small muted">🔒 Cycle length, frequency and price are entered by management after submission. Sales doesn’t see contract money.</p>
        </fieldset>

        <fieldset>
          <legend>Proposed cadence and groups</legend>
          <div className="row">
            <label className="field">
              First session
              <input type="date" value={firstDate} min={state.today} onChange={(e) => setFirstDate(e.target.value)} />
            </label>
            <label className="field">
              Weeks
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
                {WEEKS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Start time
              <input type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <div className="field">
              Block
              <span className="readout">
                {firstDate && !sunday ? `${WEEKDAY_LONG[dayOfWeek(firstDate)]}s` : '—'} {prettyTime(start)}–{prettyTime(end)}
              </span>
            </div>
          </div>
          {sunday && <p className="bad small">Sessions run Monday to Saturday.</p>}
          {pastDate && <p className="bad small">The first session can’t be in the past.</p>}
          {(lateEnd || earlyStart) && <p className="bad small">Sessions must fit between 9am and 6pm.</p>}

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
          <button type="button" className="btn ghost" onClick={() => setGroups([...groups, { players: 10, ageRange: '4-5', minutes: 45 }])} disabled={groups.length >= 4}>
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
        <h3>Can our roster cover this?</h3>
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
            <p className="small muted">
              Uses the scheduling rules (availability, existing sessions, drive time + {state.settings.bufferMinutes} min buffer, lead coach, 1:{state.settings.ratio}) with no overrides. It only proves a crew exists; the manager assigns coaches.
            </p>
            {!coverage.ok && (
              <div className="suggest">
                <h4>Open slots to offer instead</h4>
                {suggestions.length === 0 && <p className="small muted">No open slot of this length in the next {weeks} weeks. Try fewer kids per group or a shorter block.</p>}
                {suggestions.map((s) => (
                  <button
                    key={`${s.firstDate}${s.start}`}
                    type="button"
                    className="btn ghost suggestion"
                    onClick={() => {
                      setFirstDate(s.firstDate)
                      setStart(s.start)
                    }}
                  >
                    {WEEKDAY_LONG[s.weekday]}s {prettyTime(s.start)}–{prettyTime(s.end)} <small>from {prettyDate(s.firstDate)}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button className="btn primary block" disabled={!canSubmit} onClick={submit}>
          Submit center
        </button>
        {!coverage?.ok && place && <p className="small bad">Submit stays locked until the roster can cover every date.</p>}
        {coverage?.ok && missing.length > 0 && <p className="small muted">Still needed: {missing.join(', ')}.</p>}
        {error && <p className="error">{error}</p>}
      </aside>
    </div>
  )
}
