import { useCallback, useMemo, useState } from 'react'
import {
  CYCLE_WEEKS,
  addDays,
  canEditIntake,
  canSeeTerritory,
  checkProgramCoverage,
  dayOfWeek,
  dayProblems,
  daysLabel,
  emailProblem,
  firstDateFor,
  formatPhone,
  fromMinutes,
  fullDate,
  isValidPhone,
  plannedSessions,
  prettyDate,
  prettyTime,
  suggestSlots,
  toMinutes,
  weekdayOf,
  weeklyDates,
  WEEKDAY_LONG,
} from '../engine'
import type { CoverageRequest, CycleWeeks, Group, Intake, ProgramDay, SpaceProfile, User, Weekday } from '../engine'
import { CITY, ZIPS, standardizeAddress } from '../data/places'
import { href, useRoute } from '../router'
import { getState, submitIntake, updateIntake, useStore, worldOf } from '../store'
import type { IntakeInput } from '../store'
import { addressLine } from '../ui/address'
import type { PickedAddress } from '../ui/address'
import { AddressSearch } from '../ui/AddressSearch'
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

type DayDraft = ProgramDay & { endTyped: boolean }
type Field = 'name' | 'phone' | 'address' | 'pocName' | 'email' | 'pocPhone' | 'price' | 'backup'

const minutesOf = (groups: Group[]) => groups.reduce((m, g) => m + (g.minutes || 0), 0)
/** The end time follows the groups until the rep types one. */
const withEnd = (d: DayDraft): DayDraft => (d.endTyped ? d : { ...d, end: fromMinutes(toMinutes(d.start) + minutesOf(d.groups)) })

function pickedFrom(address: string, lat: number, lng: number): PickedAddress | null {
  const m = address.match(/^(.+?), (.+?), ([A-Z]{2}) (\d{5})$/)
  return m ? { street: m[1], city: m[2], state: m[3], zip: m[4], lat, lng } : null
}

function FieldError({ show, message }: { show: boolean; message: string | null | false }) {
  return show && message ? <span className="field-error">{message}</span> : null
}

function IntakeForm({ user, editing }: { user: User; editing?: Intake }) {
  const state = useStore()
  const territories = state.territories.filter((t) => canSeeTerritory(user, t.id))
  const existing = editing ? state.centers.find((c) => c.id === editing.centerId) : undefined
  const [territoryId, setTerritoryId] = useState(existing?.territoryId ?? territories[0]?.id ?? '')
  const territory = state.territories.find((t) => t.id === territoryId)!
  const [name, setName] = useState(existing?.name ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [picked, setPicked] = useState<PickedAddress | null>(existing ? pickedFrom(existing.address, existing.lat, existing.lng) : null)
  const [manual, setManual] = useState(false)
  const [street, setStreet] = useState('')
  const [zip, setZip] = useState('')
  const [poc, setPoc] = useState({ name: '', title: 'Center Director', email: '', phone: '', ext: '', ...existing?.poc, ...(existing && { ext: existing.poc.ext ?? '' }) })
  const [weeks, setWeeks] = useState<CycleWeeks>(existing?.terms?.cycleWeeks ?? 8)
  const [days, setDays] = useState<DayDraft[]>(
    editing?.schedule.days.map((d) => ({ ...d, endTyped: true })) ?? [withEnd({ weekday: 2, firstDate: addDays(nextMonday(state.today), 1), start: '10:00', end: '', groups: [{ players: 10, ageRange: '3-4', minutes: 30 }], endTyped: false })],
  )
  const [price, setPrice] = useState(existing?.terms?.cycleRate ?? 0)
  const [space, setSpace] = useState<Space>(existing?.space ?? { category: 'indoor', indoorSize: 'larger', floor: 'Carpet', grade: 'flat', obstacles: [], backupIndoorSpace: null })
  const [notes, setNotes] = useState(editing?.schedule.notes ?? '')
  const [touched, setTouched] = useState<Set<Field>>(new Set())
  const [tried, setTried] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState('')
  const goManual = useCallback(() => setManual(true), [setManual])

  const touch = (f: Field) => setTouched((t) => new Set(t).add(f))
  const show = (f: Field) => tried || touched.has(f)

  // Where the center is: from the address search, or typed by hand with a listed ZIP.
  const manualPlace = ZIPS[territoryId]?.find((z) => z.zip === zip)
  const manualAddress = standardizeAddress(street, territoryId, zip)
  const location = manual ? (manualAddress && manualPlace ? { address: manualAddress, lat: manualPlace.lat, lng: manualPlace.lng } : null) : picked ? { address: addressLine(picked), lat: picked.lat, lng: picked.lng } : null

  const sorted = useMemo(() => [...days].sort((a, b) => a.weekday - b.weekday), [days])
  const problems = useMemo(() => sorted.map((d) => dayProblems(d, state.today)), [sorted, state.today])
  const plan = useMemo(() => plannedSessions(sorted, weeks), [sorted, weeks])
  const daysOk = sorted.length > 0 && problems.every((p) => p.length === 0)

  // When editing, the submission's own sessions mustn't count as conflicts.
  const world = useMemo(() => {
    const w = worldOf(state)
    return editing ? { ...w, sessions: w.sessions.filter((s) => s.intakeId !== editing.id) } : w
  }, [state, editing])
  const lat = location?.lat
  const lng = location?.lng
  // Memoized so the coverage check only re-runs when the program actually changes.
  const coverage = useMemo(
    () => (daysOk && lat !== undefined && lng !== undefined ? checkProgramCoverage(territoryId, { lat, lng }, sorted, weeks, world) : null),
    [daysOk, lat, lng, territoryId, sorted, weeks, world],
  )
  // Open slots for the first day that can't be staffed.
  const stuck = coverage && !coverage.ok ? sorted.find((d) => coverage.dates.some((c) => !c.ok && weekdayOf(c.date) === d.weekday)) : undefined
  const suggestions = useMemo(() => {
    if (!stuck || lat === undefined || lng === undefined) return []
    const req: CoverageRequest = { territoryId, location: { lat, lng }, dates: weeklyDates(stuck.firstDate, weeks), start: stuck.start, end: stuck.end, groups: stuck.groups }
    return suggestSlots(req, world).filter((sg) => sg.weekdays[0] === stuck.weekday || !days.some((d) => d.weekday === sg.weekdays[0]))
  }, [stuck, lat, lng, territoryId, weeks, world, days])

  const errors: Record<Field, string | null> = {
    name: name.trim() ? null : 'Enter the center’s name.',
    phone: !phone.trim() ? 'Enter the center’s main phone.' : isValidPhone(phone) ? null : 'Enter a 10-digit phone number, like 502-555-0123.',
    address: location ? null : manual ? 'Enter the street address and pick its ZIP.' : 'Search for the address and pick it from the list.',
    pocName: poc.name.trim() ? null : 'Enter the contact’s name.',
    email: emailProblem(poc.email),
    pocPhone: !poc.phone.trim() || isValidPhone(poc.phone) ? null : 'Enter a 10-digit phone number, like 502-555-0148.',
    price: price > 0 ? null : 'Enter the price for the whole cycle.',
    backup: space.backupIndoorSpace === null ? 'Answer whether there’s a backup space.' : null,
  }
  const firstError = (Object.keys(errors) as Field[]).find((f) => errors[f])

  const submit = () => {
    setError('')
    setTried(true)
    if (firstError) {
      setTimeout(() => document.querySelector<HTMLElement>('.invalid')?.focus(), 0)
      return
    }
    try {
      const { backupIndoorSpace, ...rest } = space
      const input: IntakeInput = {
        center: {
          territoryId,
          name: name.trim(),
          phone: formatPhone(phone),
          address: location!.address,
          lat: location!.lat,
          lng: location!.lng,
          poc: { ...poc, phone: formatPhone(poc.phone), email: poc.email.trim(), ext: poc.ext || undefined },
          space: { ...rest, backupIndoorSpace: !!backupIndoorSpace },
        },
        cycleWeeks: weeks,
        cycleRate: price,
        days: sorted.map((d) => ({ weekday: d.weekday, firstDate: d.firstDate, start: d.start, end: d.end, groups: d.groups.map((g) => ({ ...g, supportNotes: g.supportNotes?.trim() || undefined })) })),
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
            ? `${name} now has ${plan.length} pending session${plan.length > 1 ? 's' : ''}. Every change is logged on the sessions for the territory manager.`
            : `${name} is on the ${territory.name} calendar as ${plan.length} pending session${plan.length > 1 ? 's' : ''}. The territory manager assigns the coaching staff next.`}
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

  const setDay = (weekday: Weekday, patch: Partial<DayDraft>) => setDays(days.map((d) => (d.weekday === weekday ? withEnd({ ...d, ...patch }) : d)))
  const toggleDay = (weekday: Weekday) => {
    if (days.some((d) => d.weekday === weekday)) return setDays(days.filter((d) => d.weekday !== weekday))
    const model = sorted[0]
    const from = model ? sorted.map((d) => d.firstDate).sort()[0] : addDays(nextMonday(state.today), 0)
    const firstDate = firstDateFor({ startDate: from || state.today }, weekday)
    setDays([...days, withEnd({ weekday, firstDate, start: model?.start ?? '10:00', end: '', groups: model?.groups ?? [{ players: 10, ageRange: '3-4', minutes: 30 }], endTyped: false })])
  }
  const cls = (f: Field) => (show(f) && errors[f] ? 'invalid' : '')

  return (
    <div className="intake">
      <form className="intake-form" onSubmit={(e) => e.preventDefault()} noValidate>
        <fieldset>
          <legend>Sales identification</legend>
          <div className="row">
            <label className="field">
              Sales rep
              <input value={user.name} disabled />
            </label>
            <label className="field">
              Territory
              <select value={territoryId} onChange={(e) => (setTerritoryId(e.target.value), setZip(''), setPicked(null))}>
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
              <input value={name} className={cls('name')} aria-invalid={!!cls('name') || undefined} onChange={(e) => setName(e.target.value)} onBlur={() => touch('name')} placeholder="e.g. Acorn Hill Preschool" />
              <FieldError show={show('name')} message={errors.name} />
            </label>
            <label className="field">
              Main phone
              <input
                value={phone}
                className={cls('phone')}
                aria-invalid={!!cls('phone') || undefined}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => (setPhone(formatPhone(phone)), touch('phone'))}
                placeholder={`${CITY[territoryId]?.areaCode}-555-0123`}
                inputMode="tel"
              />
              <FieldError show={show('phone')} message={errors.phone} />
            </label>
          </div>
          {!manual ? (
            <div className="field">
              Street address
              <AddressSearch key={territoryId} territory={territory} value={picked} onPick={(a) => (setPicked(a), a && touch('address'))} onOffline={goManual} invalid={!!cls('address')} />
              <FieldError show={show('address')} message={errors.address} />
              {picked && <span className="small ok">✓ {addressLine(picked)}</span>}
              <button type="button" className="linklike small" onClick={() => setManual(true)}>
                Can’t find it? Enter the address by hand
              </button>
            </div>
          ) : (
            <>
              <div className="row">
                <label className="field grow">
                  Street address
                  <input value={street} className={cls('address')} onChange={(e) => setStreet(e.target.value)} onBlur={() => touch('address')} placeholder="1234 maple ridge drive" />
                </label>
                <label className="field">
                  ZIP
                  <select value={zip} className={cls('address')} onChange={(e) => (setZip(e.target.value), touch('address'))}>
                    <option value="">Choose…</option>
                    {ZIPS[territoryId]?.map((z) => (
                      <option key={z.zip} value={z.zip}>
                        {z.zip} · {z.area}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <FieldError show={show('address')} message={errors.address} />
              <p className={`small ${manualAddress ? 'ok' : 'muted'}`}>{manualAddress ? `Standardized: ${manualAddress}` : 'Typed by hand: the center is placed at the middle of its ZIP code.'}</p>
              <button type="button" className="linklike small" onClick={() => setManual(false)}>
                Search for the address instead
              </button>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Point of contact</legend>
          <div className="row">
            <label className="field grow">
              Name
              <input value={poc.name} className={cls('pocName')} aria-invalid={!!cls('pocName') || undefined} onChange={(e) => setPoc({ ...poc, name: e.target.value })} onBlur={() => touch('pocName')} />
              <FieldError show={show('pocName')} message={errors.pocName} />
            </label>
            <label className="field grow">
              Title
              <input value={poc.title} onChange={(e) => setPoc({ ...poc, title: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label className="field grow">
              Email
              <input type="email" value={poc.email} className={cls('email')} aria-invalid={!!cls('email') || undefined} onChange={(e) => setPoc({ ...poc, email: e.target.value })} onBlur={() => (setPoc({ ...poc, email: poc.email.trim() }), touch('email'))} />
              <FieldError show={show('email')} message={errors.email} />
            </label>
            <label className="field">
              Direct phone
              <input value={poc.phone} className={cls('pocPhone')} aria-invalid={!!cls('pocPhone') || undefined} onChange={(e) => setPoc({ ...poc, phone: e.target.value })} onBlur={() => (setPoc({ ...poc, phone: formatPhone(poc.phone) }), touch('pocPhone'))} inputMode="tel" />
              <FieldError show={show('pocPhone')} message={errors.pocPhone} />
            </label>
            <label className="field narrow">
              Ext. (optional)
              <input value={poc.ext} onChange={(e) => setPoc({ ...poc, ext: e.target.value.replace(/\D/g, '') })} inputMode="numeric" />
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
                  const on = days.some((x) => x.weekday === d)
                  return (
                    <button type="button" key={d} className={on ? 'on' : ''} aria-pressed={on} disabled={!on && days.length >= 3} onClick={() => toggleDay(d)}>
                      {DAY_SHORT[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          {sorted.length === 0 && <p className="bad small">Pick at least one day.</p>}
          <div className="program-days">
            {sorted.map((d, i) => {
              const dayName = WEEKDAY_LONG[d.weekday]
              const dateBad = problems[i].some((p) => p.includes(' is a ') || p.includes('past') || p.startsWith('Pick the first'))
              const timeBad = problems[i].some((p) => p.includes('9am') || p.includes('end time') || p.includes('add up'))
              return (
                <div key={d.weekday} className={`program-day ${problems[i].length ? 'has-error' : ''}`}>
                  <h4>{dayName}s</h4>
                  <div className="row">
                    <label className="field">
                      First {dayName}
                      <input type="date" value={d.firstDate} min={state.today} className={dateBad ? 'invalid' : ''} aria-invalid={dateBad || undefined} onChange={(e) => setDay(d.weekday, { firstDate: e.target.value })} />
                    </label>
                    <label className="field">
                      Start time
                      <input type="time" step={900} value={d.start} className={timeBad ? 'invalid' : ''} onChange={(e) => setDay(d.weekday, { start: e.target.value })} />
                    </label>
                    <label className="field">
                      End time
                      <input type="time" step={900} value={d.end} className={timeBad ? 'invalid' : ''} onChange={(e) => setDay(d.weekday, { end: e.target.value, endTyped: true })} />
                    </label>
                    {problems[i].length === 0 && (
                      <p className="small muted day-span">
                        {weeks} session{weeks > 1 ? 's' : ''} · {fullDate(d.firstDate)} – {fullDate(addDays(d.firstDate, (weeks - 1) * 7))}
                      </p>
                    )}
                  </div>
                  {problems[i].map((p) => (
                    <span key={p} className="field-error">
                      {p}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
          <p className="readout big">
            {plan.length} session{plan.length === 1 ? '' : 's'}
            {sorted.length > 0 && ` · ${daysLabel(sorted.map((d) => d.weekday))}`}
            {plan.length > 0 && ` · first session ${fullDate(plan[0].date)}, last ${fullDate(plan.at(-1)!.date)}`}
          </p>
          <div className="row price-row">
            <label className="field narrow">
              Cycle price ($)
              <input type="number" min={0} step={10} value={price || ''} placeholder="0" className={cls('price')} aria-invalid={!!cls('price') || undefined} onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} onBlur={() => touch('price')} />
            </label>
            <p className="small">
              {price > 0 && plan.length > 0 ? (
                <>
                  {money(price)} for the whole cycle ({sorted.length > 1 ? 'all days together' : `${weeks} weeks`}) = <strong>{money(price / plan.length)} per session</strong> · {money(price / weeks)} per week
                </>
              ) : (
                <span className="muted">One price for the whole package, all days together.</span>
              )}
            </p>
          </div>
          <FieldError show={show('price')} message={errors.price} />
          <Hint>Each day runs {weeks} weeks from its own first date, so a day can start later (Thursdays from one week, Fridays from the next). Centers pay for the whole cycle; after a territory manager confirms, only an ops admin can change the price.</Hint>
        </fieldset>

        {sorted.map((d, di) => {
          const setGroups = (groups: Group[]) => setDay(d.weekday, { groups })
          const setGroup = (i: number, patch: Partial<Group>) => setGroups(d.groups.map((g, j) => (i === j ? { ...g, ...patch } : g)))
          return (
            <fieldset key={d.weekday}>
              <legend>{sorted.length > 1 ? `${WEEKDAY_LONG[d.weekday]} groups` : 'Groups'}</legend>
              {di > 0 && (
                <button type="button" className="btn ghost small same-as" onClick={() => setGroups(sorted[0].groups.map((g) => ({ ...g })))}>
                  Same as {WEEKDAY_LONG[sorted[0].weekday]}
                </button>
              )}
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
                  {d.groups.map((g, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <input type="number" min={1} max={30} value={g.players} onChange={(e) => setGroup(i, { players: Number(e.target.value) })} aria-label={`${WEEKDAY_LONG[d.weekday]} group ${i + 1} kids`} />
                      </td>
                      <td>
                        <input value={g.ageRange} onChange={(e) => setGroup(i, { ageRange: e.target.value })} aria-label={`${WEEKDAY_LONG[d.weekday]} group ${i + 1} ages`} />
                      </td>
                      <td>
                        <select value={g.minutes} onChange={(e) => setGroup(i, { minutes: Number(e.target.value) })} aria-label={`${WEEKDAY_LONG[d.weekday]} group ${i + 1} minutes`}>
                          {[30, 45, 60].map((m) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input value={g.supportNotes ?? ''} onChange={(e) => setGroup(i, { supportNotes: e.target.value })} placeholder="Optional" aria-label={`${WEEKDAY_LONG[d.weekday]} group ${i + 1} support notes`} />
                      </td>
                      <td>
                        {d.groups.length > 1 && (
                          <button type="button" className="icon-btn" onClick={() => setGroups(d.groups.filter((_, j) => j !== i))} aria-label={`Remove ${WEEKDAY_LONG[d.weekday]} group ${i + 1}`}>
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="btn ghost" onClick={() => setGroups([...d.groups, { players: 10, ageRange: '4-5', minutes: 30 }])} disabled={d.groups.length >= 4}>
                + Add a group
              </button>
            </fieldset>
          )
        })}

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
            <div className={`seg ${cls('backup')}`} role="group" aria-label="Weather backup" tabIndex={-1}>
              {[true, false].map((v) => (
                <button type="button" key={String(v)} className={space.backupIndoorSpace === v ? 'on' : ''} onClick={() => (setSpace({ ...space, backupIndoorSpace: v }), touch('backup'))}>
                  {v ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
          </div>
          <FieldError show={show('backup')} message={errors.backup} />
          <label className="field">
            Notes for the coaches (optional)
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </fieldset>
      </form>

      <aside className="coverage" aria-live="polite">
        <h3>Can our coaching staff cover this?</h3>
        {!location && <p className="muted">Pick the address to start the live check.</p>}
        {location && !daysOk && <p className="muted">Fix the program days above to run the check.</p>}
        {coverage && (
          <>
            <div className={`verdict ${coverage.ok ? 'yes' : 'no'}`}>
              {coverage.ok ? `✓ Yes: all ${plan.length} dates can be staffed` : `✗ No: ${coverage.reason ?? 'not staffable'}`}
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
            {stuck && (
              <div className="suggest">
                <h4>Open slots to offer instead of {WEEKDAY_LONG[stuck.weekday]}s {prettyTime(stuck.start)}</h4>
                {suggestions.length === 0 && <p className="small muted">No open slot of this length over these weeks. Try fewer kids per group or a shorter session.</p>}
                {suggestions.map((sg) => (
                  <button
                    key={`${sg.firstDate}${sg.start}`}
                    type="button"
                    className="btn ghost suggestion"
                    onClick={() => setDays(days.map((d) => (d.weekday === stuck.weekday ? { ...d, weekday: sg.weekdays[0], firstDate: sg.firstDate, start: sg.start, end: sg.end, endTyped: true } : d)))}
                  >
                    {daysLabel(sg.weekdays)} {prettyTime(sg.start)}–{prettyTime(sg.end)} <small>from {prettyDate(sg.firstDate)}</small>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <button className="btn primary block" disabled={!coverage?.ok} onClick={submit}>
          {editing ? 'Save changes' : 'Submit center'}
        </button>
        {!coverage?.ok && location && daysOk && <p className="small bad">Submit stays locked until the coaching staff can cover every date.</p>}
        {tried && firstError && <p className="small bad">Fix the fields highlighted in red.</p>}
        {error && <p className="error">{error}</p>}
      </aside>
    </div>
  )
}
