// Generates the fictional Bramblewood Youth Soccer company. The output is the
// same every time for a given week (seeded random numbers), and dates are
// relative to the current week so the demo always looks current.
//
// Coaches are assigned by the real rules engine, then a handful of realistic
// problems are planted so every screen has something to show.

import {
  DEFAULT_SETTINGS,
  addDays,
  checkCoverage,
  eligibleCoaches,
  fromMinutes,
  mondayOf,
  pickCrew,
  planningWeek,
  slotLabel,
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
  const users: User[] = [
    { id: 'admin', name: 'Dana Whitfield', role: 'ops_admin', territoryIds: TERRITORIES.map((t) => t.id) },
    { id: 'tm-lou', name: 'Priya Raman', role: 'territory_manager', territoryIds: ['lou'] },
    { id: 'tm-knx', name: 'Caleb Odom', role: 'territory_manager', territoryIds: ['knx'] },
    { id: 'tm-oak', name: 'Marisol Vega', role: 'territory_manager', territoryIds: ['oak'] },
    { id: 'rep-east', name: 'Jamie Ellison', role: 'sales_rep', territoryIds: ['lou', 'knx'] },
    { id: 'rep-west', name: 'Theo Park', role: 'sales_rep', territoryIds: ['oak'] },
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
        terms: {
          cycleWeeks: pick([4, 8, 8, 12, 20] as const),
          sessionsPerWeek: pick([1, 1, 2] as const),
          cycleRate: 0,
        },
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
      })
      users.push({ id: `u-${id}`, name: `${first} ${last}`, role: 'coach', territoryIds: [t.id], coachId: id })
    })
  })

  // Every center gets one or two weekly cadences.
  interface Cadence { centerId: string; territoryId: string; weekday: Weekday; start: string; groups: Group[] }
  const cadences: Cadence[] = []
  for (const c of centers) {
    const slots = c.terms!.sessionsPerWeek
    const used = new Set<number>()
    for (let k = 0; k < slots; k++) {
      // Try a few random times; keep the first one the roster could staff.
      let chosen: Cadence | undefined
      for (let attempt = 0; attempt < 12 && !chosen; attempt++) {
        const weekday = (1 + Math.floor(r() * 5)) as Weekday
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
    const perSession = 140 + Math.floor(r() * 9) * 10
    c.terms!.cycleRate = perSession * c.terms!.cycleWeeks * c.terms!.sessionsPerWeek
  }

  const settings: Settings = { ...DEFAULT_SETTINGS }
  const world: World = { sessions: [], coaches, centers, settings }
  let seq = 0
  const newId = () => `s${++seq}`

  // Last week through three weeks out.
  for (let w = -1; w <= 3; w++) {
    const monday = addDays(thisMonday, w * 7)
    for (const cad of cadences) {
      const date = addDays(monday, cad.weekday - 1)
      const past = date < today
      const status = past || w <= 1 || r() < 0.7 ? 'confirmed' : 'pending'
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
        history: [{ at: nowIso, by: 'Demo setup', text: 'Created from the center cadence' }],
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
      confirmedByCoach: s.date < today || (s.date < addDays(planningWeek(today), 7) && r() < 0.6),
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
  const big = louFuture.find((s) => s.assignments.length === 1 && s.groups.length === 1)
  if (big) {
    big.groups = [{ ...big.groups[0], players: 14 }]
    big.overrides = [{ code: 'ratio', message: WARNINGS.ratio, by: 'Priya Raman', at }]
    big.history.push({ at, by: 'Priya Raman', text: 'Overrode: 1:12 ratio (two teachers from the center will assist)' })
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
  const movable = world.sessions.filter((s) => s.territoryId === 'lou' && s.date >= addDays(monday, 7) && s.status === 'confirmed' && s.assignments.length && !s.overrides.length)
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
    terms: { cycleWeeks: 8, sessionsPerWeek: 1, cycleRate: 1360 },
  }
  world.centers.push(center)
  const intake: Intake = { id: 'i1', salesRepId: 'rep-east', territoryId: 'lou', centerId: center.id, submittedAt: at, sessionIds: [] }
  const groups: Group[] = [
    { players: 10, ageRange: '3-4', minutes: 30 },
    { players: 12, ageRange: '4-5', minutes: 45 },
  ]
  for (let w = 1; w <= 3; w++) {
    const id = newId()
    intake.sessionIds.push(id)
    world.sessions.push({
      id,
      territoryId: 'lou',
      centerId: center.id,
      date: addDays(monday, w * 7 + 3), // Thursdays
      start: '10:30',
      end: blockEnd('10:30', groups),
      groups,
      status: 'pending',
      assignments: [],
      overrides: [],
      history: [{ at, by: 'Jamie Ellison', text: 'Submitted through sales intake (coverage check passed)' }],
      intakeId: intake.id,
    })
  }
  intakes.push(intake)
}
