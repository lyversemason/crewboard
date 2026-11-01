// Generates the fictional Bramblewood Youth Soccer company for SoccerSessions. The output is the
// same every time for a given week (seeded random numbers), and dates are
// relative to the current week so the demo always looks current.
//
// Coaches are assigned by the real rules engine, then a handful of realistic
// problems are planted so every screen has something to show.

import {
  DEFAULT_SETTINGS,
  canConfirmShift,
  addDays,
  checkCoverage,
  eligibleCoaches,
  fromMinutes,
  mondayOf,
  pickCrew,
  cycleStatus,
  planningWeek,
  plannedSessions,
  programDates,
  slotLabel,
  termsFromDays,
  toMinutes,
  transitMinutes,
  validateCrew,
  WARNINGS,
} from '../engine'
import type {
  Center,
  Coach,
  CoachLevel,
  Group,
  Intake,
  ProgramDay,
  Session,
  Settings,
  SpaceProfile,
  Territory,
  User,
  Weekday,
  World,
} from '../engine'
import type { Slot } from '../engine/validate'
import { CITY, ZIPS } from './places'

export interface DemoData {
  seededForWeek: string
  territories: Territory[]
  centers: Center[]
  coaches: Coach[]
  users: User[]
  sessions: Session[]
  intakes: Intake[]
  settings: Settings
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TERRITORIES: Territory[] = [
  { id: 'lou', name: 'Louisville', state: 'KY', center: { lat: 38.2527, lng: -85.7585 } },
  { id: 'knx', name: 'Knoxville', state: 'TN', center: { lat: 35.9606, lng: -83.9207 } },
  { id: 'oak', name: 'Oakland', state: 'CA', center: { lat: 37.8044, lng: -122.2712 } },
]

const CENTER_NAMES: Record<string, string[]> = {
  lou: ['Maple Sprout Early Learning', 'Bluebird Hill Preschool', 'Riverbend Kids Club', 'Tiny Acorns Academy', 'Sunny Meadow Child Care', 'Lantern Lane Montessori', 'Harbor Pines Day School'],
  knx: ['Smoky Ridge Learning Center', 'Dogwood Corner Preschool', 'Little Bear Creek Academy', 'Firefly Field Child Care', 'Cedar Hollow Day School', 'Pinecone Path Montessori', 'Riverstone Kids Campus'],
  oak: ['Redwood Sprouts Preschool', 'Lakeside Wonder Kids', 'Golden Poppy Child Center', 'Bayview Little Learners', 'Eucalyptus Grove Academy', 'Hilltop Hummingbirds', 'Fogbank Montessori'],
}

/** Runs Thursdays + Fridays; its first three Thursdays were cancelled and made up at the end. */
const SKIPPED_CENTER = 'lou-c1'

const STREETS = ['Maple Ridge Dr', 'Orchard Ave', 'Linden St', 'Willow Bend Rd', 'Cardinal Way', 'Briar Ln', 'Juniper Ct', 'Sycamore Blvd', 'Hawthorne Pl', 'Aspen Trail']

const FIRST = ['Jordan', 'Riley', 'Avery', 'Casey', 'Morgan', 'Quinn', 'Rowan', 'Skyler', 'Emerson', 'Hayden', 'Parker', 'Reese', 'Sawyer', 'Finley', 'Dakota', 'Kendall', 'Logan', 'Marley', 'Peyton', 'Blake', 'Cameron', 'Drew', 'Elliot', 'Frankie', 'Gray', 'Harper', 'Indy', 'Jules', 'Kai', 'Lennox', 'Micah', 'Noel', 'Oakes', 'Remy', 'Sage', 'Tatum']
// Facility contacts get their own names so they're never mistaken for a coach.
const CONTACT_FIRST = ['Robin', 'Leslie', 'Dana', 'Terry', 'Shannon', 'Jamie', 'Kerry', 'Lindsay', 'Merritt', 'Shelby', 'Courtney', 'Whitney']
const CONTACT_LAST = ['Sutter', 'Halvorsen', 'Pruitt', 'Castellano', 'Mabry', 'Okafor', 'Delacroix', 'Rennick', 'Satterfield', 'Ambrose', 'Lindqvist', 'Bancroft']
const LAST = ['Abernathy', 'Bellweather', 'Calloway', 'Dunmore', 'Ellsworth', 'Fairbanks', 'Galloway', 'Hollins', 'Ingram', 'Jessup', 'Kincaid', 'Lockhart', 'Merriweather', 'Northcutt', 'Oakley', 'Pemberton', 'Quarles', 'Ravenscroft', 'Stanhope', 'Thistlewood', 'Underhill', 'Vance', 'Whitlock', 'Yardley', 'Ashgrove', 'Brightwater', 'Coldwell', 'Dovecote', 'Everly', 'Foxworth']

const LEVELS: CoachLevel[] = ['lead', 'lead', 'lead', 'lead', 'lead', 'assistant', 'assistant', 'assistant', 'assistant', 'trainee', 'trainee', 'trainee']

const AGE_TIERS: { ageRange: string; minutes: number }[] = [
  { ageRange: '2-3', minutes: 30 },
  { ageRange: '3-4', minutes: 30 },
  { ageRange: '4-5', minutes: 45 },
  { ageRange: '5-6', minutes: 45 },
  { ageRange: '6-8', minutes: 60 },
]

const SUPPORT_NOTES = ['One child uses a wheelchair; keep drills seated-friendly.', 'Two kids are sensitive to whistles; use hand signals.', 'One child has a peanut allergy (no snacks from coaches).', 'Non-verbal child; teacher aide stays with the group.']

const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const phone = (area: string, n: number) => `${area}-555-01${pad(n % 100)}`
const slug = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(0, 2).join('')

function availabilityFor(r: () => number, level: CoachLevel): Record<Weekday, number[]> {
  const out = {} as Record<Weekday, number[]>
  for (let d = 1 as Weekday; d <= 6; d = (d + 1) as Weekday) {
    const saturday = d === 6
    const chance = saturday ? 0.35 : level === 'trainee' ? 0.65 : 0.88
    if (r() > chance) {
      out[d] = []
      continue
    }
    // Most coaches are students or part-timers: mornings, afternoons, or all day.
    const shape = r()
    const from = shape < 0.25 ? 9 : shape < 0.8 ? 9 : 12
    const to = shape < 0.25 ? 13 : 18
    out[d] = Array.from({ length: to - from }, (_, i) => from + i)
  }
  return out
}

function spaceFor(r: () => number): SpaceProfile {
  const indoor = r() < 0.55
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  return indoor
    ? {
        category: 'indoor',
        indoorSize: pick(['average_bedroom', 'large_master_bedroom', 'larger', 'larger']),
        floor: pick(['Carpet', 'Tile', 'Linoleum', 'Hardwood']),
        grade: 'flat',
        obstacles: r() < 0.5 ? ['Loose toy storage areas'] : [],
        backupIndoorSpace: true,
      }
    : {
        category: 'outdoor',
        outdoorSurface: pick(['short_grass', 'turf', 'rubber', 'blacktop', 'long_grass']),
        grade: r() < 0.75 ? 'flat' : 'sloped',
        obstacles: r() < 0.6 ? [pick(['Playground structures', 'Swings', 'Picnic benches', 'Gazebo'])] : [],
        backupIndoorSpace: r() < 0.7,
      }
}

function groupsFor(r: () => number, minGroups = 1): Group[] {
  const count = Math.max(minGroups, r() < 0.45 ? 1 : r() < 0.8 ? 2 : 3)
  const start = Math.floor(r() * 3)
  return Array.from({ length: count }, (_, i) => {
    const tier = AGE_TIERS[Math.min(AGE_TIERS.length - 1, start + i)]
    return {
      players: 6 + Math.floor(r() * 7), // 6-12
      ageRange: tier.ageRange,
      minutes: tier.minutes,
      supportNotes: r() < 0.12 ? SUPPORT_NOTES[Math.floor(r() * SUPPORT_NOTES.length)] : undefined,
    }
  })
}

const blockEnd = (start: string, groups: Group[]) => fromMinutes(toMinutes(start) + groups.reduce((m, g) => m + g.minutes, 0))

export function buildDemo(today: string): DemoData {
  const thisMonday = mondayOf(today)
  const r = rng(Number(thisMonday.replaceAll('-', '')))
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const nowIso = `${today}T12:00:00.000Z`

  const centers: Center[] = []
  const coaches: Coach[] = []
  // Everyone in the demo has already accepted their invitation.
  const active = () => ({ status: 'active' as const, activatedAt: `${addDays(thisMonday, -60)}T14:00:00.000Z`, history: [] })
  const users: User[] = [
    { id: 'admin', name: 'Dana Whitfield', email: 'admin@staff.bramblewood.example', role: 'ops_admin', territoryIds: TERRITORIES.map((t) => t.id), ...active() },
    { id: 'tm-lou', name: 'Priya Raman', email: 'tm-lou@staff.bramblewood.example', role: 'territory_manager', territoryIds: ['lou'], ...active() },
    { id: 'tm-knx', name: 'Caleb Odom', email: 'tm-knx@staff.bramblewood.example', role: 'territory_manager', territoryIds: ['knx'], ...active() },
    { id: 'tm-oak', name: 'Marisol Vega', email: 'tm-oak@staff.bramblewood.example', role: 'territory_manager', territoryIds: ['oak'], ...active() },
    { id: 'rep-east', name: 'Jamie Ellison', email: 'rep-east@staff.bramblewood.example', role: 'sales_rep', territoryIds: ['lou', 'knx'], ...active() },
    { id: 'rep-west', name: 'Theo Park', email: 'rep-west@staff.bramblewood.example', role: 'sales_rep', territoryIds: ['oak'], ...active() },
  ]

  let nameIdx = 0
  TERRITORIES.forEach((t, ti) => {
    const { areaCode } = CITY[t.id]
    CENTER_NAMES[t.id].forEach((name, i) => {
      const z = ZIPS[t.id][(i * 3 + ti) % ZIPS[t.id].length]
      const street = `${100 + Math.floor(r() * 8900)} ${pick(STREETS)}`
      centers.push({
        id: `${t.id}-c${i + 1}`,
        territoryId: t.id,
        name,
        phone: phone(areaCode, 10 + i),
        address: `${street}, ${CITY[t.id].city}, ${t.state} ${z.zip}`,
        lat: +(z.lat + (r() - 0.5) * 0.01).toFixed(5),
        lng: +(z.lng + (r() - 0.5) * 0.01).toFixed(5),
        poc: {
          name: `${pick(CONTACT_FIRST)} ${pick(CONTACT_LAST)}`,
          title: pick(['Center Director', 'Assistant Director', 'Program Coordinator', 'Owner']),
          email: `director@${slug(name)}.example.com`,
          phone: phone(areaCode, 40 + i),
          ext: r() < 0.4 ? String(100 + Math.floor(r() * 50)) : undefined,
        },
        space: spaceFor(r),
        terms: { startDate: '', cycleWeeks: pick([4, 8, 8, 10, 12, 16] as const), weekdays: [], cycleRate: 0 },
      })
    })
    LEVELS.forEach((level, i) => {
      const first = FIRST[nameIdx % FIRST.length]
      const last = LAST[(nameIdx * 7 + 3) % LAST.length]
      nameIdx++
      const id = `${t.id}-k${i + 1}`
      coaches.push({
        id,
        territoryId: t.id,
        name: `${first} ${last}`,
        phone: phone(areaCode, 60 + i),
        email: `${first}.${last}@example.com`.toLowerCase(),
        level,
        payRate: level === 'lead' ? 24 + Math.floor(r() * 5) : level === 'assistant' ? 19 + Math.floor(r() * 4) : 16 + Math.floor(r() * 2),
        active: true,
        availability: availabilityFor(r, level),
        timeOff: [],
        weekChanges: {},
        // Most coaches have already confirmed this week's availability; a few haven't.
        availabilityConfirmedWeek: r() < 0.7 ? planningWeek(today) : undefined,
        history: [],
      })
      users.push({ id: `u-${id}`, name: `${first} ${last}`, email: coaches.at(-1)!.email, role: 'coach', territoryIds: [t.id], coachId: id, ...active() })
    })
  })

  // Every center gets one or two weekly cadences.
  interface Cadence { centerId: string; territoryId: string; weekday: Weekday; start: string; groups: Group[] }
  const cadences: Cadence[] = []
  for (const c of centers) {
    // One center always runs Thursdays + Fridays for 8 weeks (see plantSkippedThursdays).
    const fixed = c.id === SKIPPED_CENTER ? ([4, 5] as Weekday[]) : null
    const slots = fixed ? 2 : pick([1, 1, 2])
    const used = new Set<number>()
    for (let k = 0; k < slots; k++) {
      // Try a few random times; keep the first one the roster could staff.
      let chosen: Cadence | undefined
      for (let attempt = 0; attempt < (fixed ? 30 : 12) && !chosen; attempt++) {
        const weekday = fixed ? fixed[k] : ((1 + Math.floor(r() * 5)) as Weekday)
        if (used.has(weekday)) continue
        const start = fromMinutes(9 * 60 + 30 * Math.floor(r() * 14)) // 9:00-15:30
        const cad = { centerId: c.id, territoryId: c.territoryId, weekday, start, groups: groupsFor(r) }
        const dates = [-1, 0, 1, 2, 3].map((w) => addDays(thisMonday, w * 7 + weekday - 1))
        const probe = { territoryId: c.territoryId, location: c, dates, start, end: blockEnd(start, cad.groups), groups: cad.groups }
        if (checkCoverage(probe, { sessions: [], coaches, centers, settings: DEFAULT_SETTINGS }).ok) chosen = cad
      }
      if (!chosen) continue
      used.add(chosen.weekday)
      cadences.push(chosen)
    }
    const terms = c.terms!
    terms.weekdays = ([...used] as Weekday[]).sort((a, b) => a - b)
    if (!terms.weekdays.length) {
      delete c.terms
      continue
    }
    if (fixed) terms.cycleWeeks = 8
    // Cycles started anywhere from this week to six weeks ago.
    const weeksAgo = fixed ? 4 : Math.floor(r() * Math.min(terms.cycleWeeks, 7))
    terms.startDate = addDays(thisMonday, -7 * weeksAgo + terms.weekdays[0] - 1)
    const perSession = 140 + Math.floor(r() * 9) * 10
    terms.cycleRate = perSession * terms.cycleWeeks * terms.weekdays.length
  }

  const settings: Settings = { ...DEFAULT_SETTINGS }
  const world: World = { sessions: [], coaches, centers, settings }
  let seq = 0
  const newId = () => `s${++seq}`

  // Every session of every center's current cycle.
  for (const c of centers) {
    if (!c.terms) continue
    for (const date of programDates(c.terms)) {
      const cad = cadences.find((k) => k.centerId === c.id && k.weekday === new Date(`${date}T00:00:00Z`).getUTCDay())!
      const status = date < addDays(thisMonday, 14) || r() < 0.7 ? 'confirmed' : 'pending'
      world.sessions.push({
        id: newId(),
        territoryId: cad.territoryId,
        centerId: cad.centerId,
        date,
        start: cad.start,
        end: blockEnd(cad.start, cad.groups),
        groups: cad.groups,
        status,
        assignments: [],
        overrides: [],
        history: [{ at: nowIso, by: 'Demo setup', text: 'Created from the program schedule' }],
      })
    }
  }

  // Staff sessions in date/time order with the engine, spreading work around.
  const load = new Map<string, number>()
  const ordered = [...world.sessions].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  for (const s of ordered) {
    if (s.status === 'pending' && r() < 0.5) continue // some future sessions still need a crew
    const center = centers.find((c) => c.id === s.centerId)!
    const slot: Slot = { ...s, location: center }
    const pool = eligibleCoaches(slot, world).sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || r() - 0.5)
    const crew = pickCrew(pool, s.groups, world)
    if (!crew) continue
    const withShadow = [...crew]
    const trainee = pool.find((c) => c.level === 'trainee')
    if (trainee && r() < 0.25) withShadow.push(trainee)
    s.assignments = withShadow.map((c) => ({
      coachId: c.id,
      confirmedByCoach: s.date < today || (canConfirmShift(s.date, today) && r() < 0.6),
      confirmedAt: nowIso,
    }))
    for (const c of withShadow) load.set(c.id, (load.get(c.id) ?? 0) + 1)
  }

  // Anything the greedy pass couldn't staff: past dates become a cancellation
  // with a reason code (that's what really happened), future ones need a crew.
  for (const s of world.sessions) {
    if (s.assignments.length) continue
    if (s.date < today) {
      s.status = 'cancelled'
      s.cancelReason = 'no_coach'
      s.history.push({ at: nowIso, by: 'Demo setup', text: 'Cancelled: No coach available' })
    } else s.status = 'pending'
  }

  plantDemoCases(world, today, thisMonday, nowIso, newId)
  plantMakeUp(world, today, nowIso, newId)
  plantSkippedThursdays(world, today, nowIso, newId)
  plantTimeOff(world, today)

  const intakes: Intake[] = []
  plantIntake(world, intakes, thisMonday, nowIso, newId)

  for (const s of world.sessions) {
    for (const a of s.assignments) if (!a.confirmedByCoach) delete a.confirmedAt
  }

  return {
    seededForWeek: thisMonday,
    territories: TERRITORIES,
    centers,
    coaches,
    users,
    sessions: world.sessions.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    intakes,
    settings,
  }
}

/** Realistic problems a manager would see on a normal week. */
function plantDemoCases(world: World, today: string, monday: string, at: string, newId: () => string) {
  const louFuture = world.sessions.filter((s) => s.territoryId === 'lou' && s.date >= today && s.status === 'confirmed' && s.assignments.length)

  // 1. Travel-time override: a lead finishes one center, then a make-up
  //    session across town starts too soon. Pick a lead/time with no hard block.
  planting: for (const first of louFuture.filter((s) => toMinutes(s.end) <= 15 * 60)) {
    const from = world.centers.find((c) => c.id === first.centerId)!
    const far = world.centers
      .filter((c) => c.territoryId === 'lou' && c.id !== from.id)
      .sort((x, y) => transitMinutes(from, y, 25) - transitMinutes(from, x, 25))[0]
    for (const a of first.assignments) {
      const lead = world.coaches.find((c) => c.id === a.coachId)
      if (lead?.level !== 'lead') continue
      const start = fromMinutes(toMinutes(first.end) + 20)
      const s: Session = {
        id: '',
        territoryId: 'lou',
        centerId: far.id,
        date: first.date,
        start,
        end: fromMinutes(toMinutes(start) + 45),
        groups: [{ players: 9, ageRange: '4-5', minutes: 45 }],
        status: 'confirmed',
        assignments: [{ coachId: lead.id, confirmedByCoach: false }],
        overrides: [{ code: 'travel', message: WARNINGS.travel, by: 'Priya Raman', at }],
        history: [
          { at, by: 'Priya Raman', text: 'Make-up session added' },
          { at, by: 'Priya Raman', text: 'Overrode: travel time between centers' },
        ],
        notes: 'Make-up session for a weather cancellation. Director agreed to a later start if the coach runs late.',
      }
      const codes = validateCrew(s, [lead.id], world).map((v) => v.code)
      if (codes.length === 1 && codes[0] === 'travel') {
        world.sessions.push({ ...s, id: newId() })
        break planting
      }
    }
  }

  // 2. Ratio override: a group of 14 with one lead.
  //    Keep just the session's lead so exactly the ratio rule is broken.
  const candidates = louFuture.filter((s) => !s.overrides.length).sort((a, b) => a.groups.length - b.groups.length)
  for (const big of candidates) {
    const lead = big.assignments.find((a) => world.coaches.find((c) => c.id === a.coachId)?.level === 'lead')
    if (!lead) continue
    const trial = { ...big, groups: big.groups.map((g, i) => (i === 0 ? { ...g, players: 14 } : g)), assignments: [lead] }
    const codes = validateCrew(trial, [lead.coachId], world).map((v) => v.code)
    if (codes.length !== 1 || codes[0] !== 'ratio') continue
    Object.assign(big, trial, {
      overrides: [{ code: 'ratio', message: WARNINGS.ratio, by: 'Priya Raman', at }],
      history: [...big.history, { at, by: 'Priya Raman', text: 'Overrode: 1:12 ratio (two teachers from the center will assist)' }],
    })
    break
  }

  // 3. A live problem nobody has fixed yet: a coach changed their availability.
  const knx = world.sessions.find((s) => s.territoryId === 'knx' && s.date > today && s.assignments.length && s.status === 'confirmed')
  if (knx) {
    const coach = world.coaches.find((c) => c.id === knx.assignments[0].coachId)!
    const day = (new Date(`${knx.date}T00:00:00Z`).getUTCDay()) as Weekday
    coach.availability[day] = []
  }

  // 4. Rescheduled and cancelled sessions, kept for the audit trail.
  //    Move a session to a nearby weekday its crew can still work.
  const movable = world.sessions.filter((s) => s.territoryId === 'lou' && s.centerId !== SKIPPED_CENTER && s.date >= addDays(monday, 7) && s.status === 'confirmed' && s.assignments.length && !s.overrides.length)
  moving: for (const toMove of movable) for (const offset of [1, -1, 2, -2, 3]) {
    const newDate = addDays(toMove.date, offset)
    const dow = new Date(`${newDate}T00:00:00Z`).getUTCDay()
    if (dow === 0 || dow === 6 || newDate < today) continue
    const moved: Session = {
      ...toMove,
      id: '',
      date: newDate,
      rescheduledFromId: toMove.id,
      assignments: toMove.assignments.map((a) => ({ coachId: a.coachId, confirmedByCoach: false })),
      overrides: [],
      history: [{ at, by: 'Priya Raman', text: `Moved here from ${slotLabel(toMove.date, toMove.start, toMove.end)}` }],
    }
    if (validateCrew(moved, moved.assignments.map((a) => a.coachId), world).length) continue
    moved.id = newId()
    Object.assign(toMove, {
      status: 'rescheduled',
      rescheduledDate: newDate,
      rescheduledToId: moved.id,
      history: [...toMove.history, { at, by: 'Priya Raman', text: `Rescheduled to ${slotLabel(newDate, toMove.start, toMove.end)} (center picture day)` }],
    })
    world.sessions.push(moved)
    break moving
  }
  const toCancel = world.sessions.find((s) => s.territoryId === 'oak' && s.date >= today && s.status === 'confirmed')
  if (toCancel) {
    Object.assign(toCancel, {
      status: 'cancelled',
      cancelReason: 'facility_closed',
      cancelNote: 'Center closed for a staff training day',
      history: [...toCancel.history, { at, by: 'Marisol Vega', text: 'Cancelled: Facility closed (Center closed for a staff training day)' }],
    })
  }

  // Sanity: nothing planted may break a hard rule.
  for (const s of world.sessions) {
    if (!s.assignments.length || s.status === 'cancelled' || s.status === 'rescheduled') continue
    const blocks = validateCrew(s, s.assignments.map((a) => a.coachId), world).filter((v) => v.severity === 'block')
    if (blocks.length) s.assignments = []
  }
}

/** A center a sales rep just signed: pending, unassigned sessions. */
function plantIntake(world: World, intakes: Intake[], monday: string, at: string, newId: () => string) {
  const z = ZIPS.lou[4]
  const center: Center = {
    id: 'lou-c8',
    territoryId: 'lou',
    name: 'Clover Patch Learning Co-op',
    phone: '502-555-0118',
    address: `2210 Linden St, Louisville, KY ${z.zip}`,
    lat: z.lat + 0.002,
    lng: z.lng - 0.003,
    poc: { name: 'Robin Sutter', title: 'Center Director', email: 'robin@cloverpatch.example.com', phone: '502-555-0148', ext: '12' },
    space: { category: 'outdoor', outdoorSurface: 'short_grass', grade: 'flat', obstacles: ['Playground structures'], backupIndoorSpace: true },
    // Thursdays from next week; Fridays start a week later, with their own groups.
    terms: { startDate: '', cycleWeeks: 8, weekdays: [], cycleRate: 2720 },
  }
  const days: ProgramDay[] = [
    {
      weekday: 4,
      firstDate: addDays(monday, 7 + 3),
      start: '10:30',
      end: '',
      groups: [
        { players: 10, ageRange: '3-4', minutes: 30 },
        { players: 12, ageRange: '4-5', minutes: 45 },
      ],
    },
    { weekday: 5, firstDate: addDays(monday, 14 + 4), start: '10:00', end: '', groups: [{ players: 11, ageRange: '4-5', minutes: 45 }] },
  ]
  for (const d of days) d.end = blockEnd(d.start, d.groups)
  center.terms = termsFromDays(days, 8, 2720)
  world.centers.push(center)
  const intake: Intake = {
    id: 'i1',
    salesRepId: 'rep-east',
    territoryId: 'lou',
    centerId: center.id,
    submittedAt: at,
    sessionIds: [],
    schedule: { days },
    history: [{ at, by: 'Jamie Ellison', text: 'Submitted' }],
  }
  for (const p of plannedSessions(days, 8)) {
    const id = newId()
    intake.sessionIds.push(id)
    world.sessions.push({
      id,
      territoryId: 'lou',
      centerId: center.id,
      date: p.date,
      start: p.start,
      end: p.end,
      groups: p.groups,
      status: 'pending',
      assignments: [],
      overrides: [],
      history: [{ at, by: 'Jamie Ellison', text: 'Submitted through sales intake (coverage check passed)' }],
      intakeId: intake.id,
    })
  }
  intakes.push(intake)
}

/**
 * A weather cancellation earlier in a Louisville cycle with a make-up session
 * added after the planned end, so that cycle visibly ends a week late.
 */
function plantMakeUp(world: World, today: string, at: string, newId: () => string) {
  for (const center of world.centers.filter((c) => c.territoryId === 'lou' && c.terms && c.id !== SKIPPED_CENTER)) {
    const mine = world.sessions.filter((s) => s.centerId === center.id)
    const status = cycleStatus(center.terms!, mine, today)
    if (!status.endsOn || status.endsOn < today || status.needsMakeUp) continue
    const lost = status.sessions.find((s) => s.date < today && s.assignments.length)
    if (!lost) continue
    const last = status.sessions.at(-1)!
    const makeUp: Session = {
      ...last,
      id: '',
      date: addDays(status.plannedEnd!, 7),
      status: 'confirmed',
      assignments: last.assignments.map((a) => ({ coachId: a.coachId, confirmedByCoach: false })),
      overrides: [],
      history: [{ at, by: 'Priya Raman', text: `Make-up for the weather cancellation on ${slotLabel(lost.date, lost.start, lost.end)}` }],
    }
    if (validateCrew(makeUp, makeUp.assignments.map((a) => a.coachId), world).length) {
      // The usual coaches can't do that date: staff the make-up like any other session.
      const crew = pickCrew(eligibleCoaches({ ...makeUp, location: center }, world), makeUp.groups, world)
      if (!crew) continue
      makeUp.assignments = crew.map((c) => ({ coachId: c.id, confirmedByCoach: false }))
    }
    Object.assign(lost, {
      status: 'cancelled',
      cancelReason: 'weather',
      cancelNote: 'Storms, and no indoor backup that day',
      history: [...lost.history, { at, by: 'Priya Raman', text: 'Cancelled: Weather (no backup space). Make-up added at the end of the cycle.' }],
    })
    world.sessions.push({ ...makeUp, id: newId() })
    return
  }
}

/** A coach with a vacation coming up (on days they aren't already booked). */
function plantTimeOff(world: World, today: string) {
  const from = addDays(planningWeek(today), 14)
  const to = addDays(from, 5)
  const free = world.coaches.find(
    (c) => c.territoryId === 'lou' && !world.sessions.some((s) => s.date >= from && s.date <= to && s.assignments.some((a) => a.coachId === c.id)),
  )
  if (free) free.timeOff.push({ id: 't1', from, to, note: 'Family vacation' })
}

/**
 * A Thursday + Friday program whose director cancelled the first three
 * Thursdays (building repairs). Each gets a make-up Thursday after the planned
 * end, so the cycle still delivers every session and visibly ends late.
 */
function plantSkippedThursdays(world: World, today: string, at: string, newId: () => string) {
  const center = world.centers.find((c) => c.id === SKIPPED_CENTER)
  if (!center?.terms || center.terms.weekdays.join() !== '4,5') return
  const thursdays = world.sessions
    .filter((s) => s.centerId === center.id && s.status === 'confirmed' && s.date < today && new Date(`${s.date}T00:00:00Z`).getUTCDay() === 4)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)
  const plannedEnd = cycleStatus(center.terms, world.sessions.filter((s) => s.centerId === center.id), today).plannedEnd!
  const lastThursday = programDates(center.terms).filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 4).at(-1)!
  thursdays.forEach((lost, i) => {
    Object.assign(lost, {
      status: 'cancelled',
      cancelReason: 'facility_closed',
      cancelNote: 'Building repairs; the director asked to skip Thursdays for three weeks',
      history: [...lost.history, { at, by: 'Priya Raman', text: 'Cancelled: Facility closed (Building repairs; the director asked to skip Thursdays for three weeks)' }],
    })
    const makeUp: Session = {
      ...lost,
      id: '',
      date: addDays(lastThursday, 7 * (i + 1)),
      status: 'confirmed',
      cancelReason: undefined,
      cancelNote: undefined,
      assignments: [],
      overrides: [],
      history: [{ at, by: 'Priya Raman', text: `Make-up for the cancelled ${slotLabel(lost.date, lost.start, lost.end)} (cycle extended past ${plannedEnd})` }],
    }
    const crew = pickCrew(eligibleCoaches({ ...makeUp, location: center }, world), makeUp.groups, world)
    makeUp.assignments = (crew ?? []).map((c) => ({ coachId: c.id, confirmedByCoach: false }))
    if (!crew) makeUp.status = 'pending'
    world.sessions.push({ ...makeUp, id: newId() })
  })
}
