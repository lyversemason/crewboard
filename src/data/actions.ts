// Every change the app can make, as a pure function: the current state and
// who is asking go in, the next state and a result come out. Nothing here
// knows where data is stored, so the same actions can run against the
// browser's demo copy or, later, on a server in front of a real database.
// Each action re-checks permissions and rules itself: no screen can skip them.

import {
  LifecycleError,
  cancelSession,
  coachConfirm,
  confirmSession,
  canAssign,
  canChangeAccess,
  canChangeSettings,
  canEditAvailability,
  canEditCoach,
  canEditIntake,
  canEditTerms,
  canInvite,
  canManageAccount,
  canSubmitIntake,
  checkProgramCoverage,
  dayProblems,
  hasBlock,
  isValidEmail,
  plannedSessions,
  termsFromDays,
  pendingSessionsLike,
  planBulk,
  rescheduleSession,
  slotLabel,
  validateCrew,
} from '../engine'
import type {
  BulkScope,
  CancelReason,
  Center,
  Coach,
  CoachLevel,
  CycleWeeks,
  Intake,
  PlannedSession,
  ProgramDay,
  ProgramTerms,
  Role,
  Session,
  Settings,
  TimeOff,
  User,
  Violation,
  Weekday,
  World,
} from '../engine'
import type { DemoData } from './seed'

export interface State extends DemoData {
  today: string
}

/** What every action gets: the data, who is asking, and the time of the change. */
export interface Ctx {
  state: State
  user: User
  at: string
}

/** The next state (the same object when nothing changed) and the action's answer. */
export interface Outcome<R> {
  state: State
  result: R
}

const done = <R>(state: State, result: R): Outcome<R> => ({ state, result })

export function worldOf(s: State): World {
  return { sessions: s.sessions, coaches: s.coaches, centers: s.centers, settings: s.settings }
}

const RULE_LABEL: Record<string, string> = {
  travel: 'travel time between centers',
  ratio: '1:12 ratio',
  no_lead: 'no lead coach',
  unavailable: 'coach availability',
}

const coachName = (state: State, id: string) => state.coaches.find((c) => c.id === id)?.name ?? id

/** Next id in the same style as the demo data: s144, s145, … */
function idMaker(prefix: string, existing: { id: string }[]) {
  let n = Math.max(0, ...existing.map((x) => Number(x.id.match(new RegExp(`^${prefix}(\\d+)$`))?.[1] ?? 0)))
  return () => `${prefix}${++n}`
}

function replaceSessions(state: State, updated: Session[], added: Session[] = []): State {
  const byId = new Map(updated.map((s) => [s.id, s]))
  return { ...state, sessions: [...state.sessions.map((s) => byId.get(s.id) ?? s), ...added] }
}

function findSession(state: State, id: string): Session {
  const s = state.sessions.find((x) => x.id === id)
  if (!s) throw new LifecycleError('Session not found.')
  return s
}

function requireManager(user: User, s: Session) {
  if (!canAssign(user, s.territoryId)) throw new LifecycleError('Only this territory’s managers can change sessions.')
}

// ---------------------------------------------------------------- sessions

export type SaveCrewResult =
  | { ok: true }
  | { ok: false; blocked: Violation[] }
  | { ok: false; needsConfirm: Violation[] }

/**
 * Saves a crew. Hard blocks always refuse. Overridable warnings refuse
 * unless `confirmed` is true, which is what the dialog sets.
 */
function saveCrew({ state, user, at }: Ctx, sessionId: string, crewIds: string[], confirmed: boolean): Outcome<SaveCrewResult> {
  const s = findSession(state, sessionId)
  if (!canAssign(user, s.territoryId)) throw new LifecycleError('You cannot assign coaches in this territory.')
  if (s.status === 'cancelled' || s.status === 'rescheduled') throw new LifecycleError('This session is closed.')
  const violations = crewIds.length ? validateCrew(s, crewIds, worldOf(state)) : []
  if (hasBlock(violations)) return done(state, { ok: false, blocked: violations.filter((v) => v.severity === 'block') })
  const warnings = violations.filter((v) => v.severity === 'override')
  if (warnings.length && !confirmed) return done(state, { ok: false, needsConfirm: warnings })

  const keep = new Map(s.assignments.map((a) => [a.coachId, a]))
  const codes = [...new Set(warnings.map((w) => w.code))]
  const names = (ids: string[]) => ids.map((id) => coachName(state, id)).join(', ')
  const history = [...s.history, { at, by: user.name, text: crewIds.length ? `Coaching staff set: ${names(crewIds)}` : 'Coaching staff cleared' }]
  for (const code of codes) history.push({ at, by: user.name, text: `Overrode: ${RULE_LABEL[code]}` })
  const next = replaceSessions(state, [
    {
      ...s,
      assignments: crewIds.map((id) => keep.get(id) ?? { coachId: id, confirmedByCoach: false }),
      overrides: warnings.map((w) => ({ code: w.code, message: w.message, by: user.name, at })),
      history,
    },
  ])
  return done(next, { ok: true })
}

export interface BulkResult {
  filled: string[]
  /** Sessions left open, with the reason in plain words. */
  skipped: { id: string; reason: string }[]
}

/**
 * Adds a saved coaching staff to every other open session of the same program
 * (or only one weekday's). Each session is checked with the full rules, one
 * after another, so the coaches never end up double-booked. Sessions that
 * would need an override, or break a hard rule, are left open.
 */
function staffOpenSessions({ state, user, at }: Ctx, fromId: string, scope: BulkScope = 'program'): Outcome<BulkResult> {
  const from = findSession(state, fromId)
  requireManager(user, from)
  const crewIds = from.assignments.map((a) => a.coachId)
  if (!crewIds.length) throw new LifecycleError('Save a coaching staff on this session first.')
  const names = crewIds.map((id) => coachName(state, id)).join(', ')
  const plan = planBulk(from, crewIds, worldOf(state), state.today, scope)
  const updated: Session[] = plan.fillable.map((s) => ({
    ...s,
    history: [...s.history, { at, by: user.name, text: `Coaching staff set: ${names} (added to the whole program from ${slotLabel(from.date, from.start, from.end)})` }],
  }))
  const next = updated.length ? replaceSessions(state, updated) : state
  return done(next, { filled: updated.map((s) => s.id), skipped: plan.left.map((l) => ({ id: l.session.id, reason: l.reason })) })
}

/** Marks every pending upcoming session of a program as confirmed with the facility. */
function confirmProgramWithFacility({ state, user, at }: Ctx, fromId: string): Outcome<number> {
  const from = findSession(state, fromId)
  requireManager(user, from)
  const targets = [...(from.status === 'pending' ? [from] : []), ...pendingSessionsLike(from, state.sessions, state.today)]
  return done(
    replaceSessions(
      state,
      targets.map((s) => confirmSession(s, user.name, at)),
    ),
    targets.length,
  )
}

function confirmWithFacility({ state, user, at }: Ctx, id: string): Outcome<void> {
  const s = findSession(state, id)
  requireManager(user, s)
  return done(replaceSessions(state, [confirmSession(s, user.name, at)]), undefined)
}

/** Moves a session. The coaching staff is told and has to re-confirm the new time. */
function reschedule({ state, user, at }: Ctx, id: string, newDate: string, newStart: string, newEnd: string, note = ''): Outcome<string> {
  const s = findSession(state, id)
  requireManager(user, s)
  const [old, moved] = rescheduleSession(s, { newDate, newStart, newEnd, newId: idMaker('s', state.sessions)(), by: user.name, at, note })
  if (moved.assignments.length) {
    const names = moved.assignments.map((a) => coachName(state, a.coachId)).join(', ')
    moved.history.push({ at, by: 'SoccerSessions', text: `Coaching staff notified by text to re-confirm: ${names}` })
  }
  return done(replaceSessions(state, [old], [moved]), moved.id)
}

function cancel({ state, user, at }: Ctx, id: string, reason: CancelReason, note: string): Outcome<void> {
  const s = findSession(state, id)
  requireManager(user, s)
  return done(replaceSessions(state, [cancelSession(s, reason, note, user.name, at)]), undefined)
}

function coachConfirmMany({ state, user, at }: Ctx, ids: string[]): Outcome<void> {
  if (user.role !== 'coach' || !user.coachId) throw new LifecycleError('Only coaches confirm their own shifts.')
  return done(
    replaceSessions(
      state,
      ids.map((id) => coachConfirm(findSession(state, id), user.coachId!, at, state.today)),
    ),
    undefined,
  )
}

// ---------------------------------------------------------------- coaches

function findCoach(state: State, id: string): Coach {
  const c = state.coaches.find((x) => x.id === id)
  if (!c) throw new LifecycleError('Coach not found.')
  return c
}

function updateCoachRecord(state: State, id: string, change: (c: Coach) => Coach): State {
  return { ...state, coaches: state.coaches.map((c) => (c.id === id ? change(c) : c)) }
}

/** Finds the coach and checks the user is that coach: availability is theirs alone. */
function ownCoach(state: State, user: User, coachId: string): Coach {
  const coach = findCoach(state, coachId)
  if (!canEditAvailability(user, coach)) throw new LifecycleError('Only the coach can change their own availability.')
  return coach
}

/** The coach's usual week (a long-term change). */
function setAvailability({ state, user }: Ctx, coachId: string, availability: Record<Weekday, number[]>): Outcome<void> {
  ownCoach(state, user, coachId)
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, availability })),
    undefined,
  )
}

/** A change for one week only; it replaces the usual week for those days. */
function setWeekChange({ state, user }: Ctx, coachId: string, monday: string, hours: Record<Weekday, number[]> | null): Outcome<void> {
  const coach = ownCoach(state, user, coachId)
  const weekChanges = { ...coach.weekChanges }
  if (hours) weekChanges[monday] = hours
  else delete weekChanges[monday]
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, weekChanges })),
    undefined,
  )
}

function addTimeOff({ state, user }: Ctx, coachId: string, entry: Omit<TimeOff, 'id'>): Outcome<void> {
  ownCoach(state, user, coachId)
  if (!entry.from || !entry.to || entry.to < entry.from) throw new LifecycleError('Pick a first and last day off.')
  const id = idMaker('t', state.coaches.flatMap((c) => c.timeOff))()
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, timeOff: [...c.timeOff, { ...entry, id }] })),
    undefined,
  )
}

function removeTimeOff({ state, user }: Ctx, coachId: string, timeOffId: string): Outcome<void> {
  ownCoach(state, user, coachId)
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, timeOff: c.timeOff.filter((t) => t.id !== timeOffId) })),
    undefined,
  )
}

/** "My availability hasn't changed" for the week being planned. */
function confirmAvailability({ state, user }: Ctx, coachId: string, week: string): Outcome<void> {
  ownCoach(state, user, coachId)
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, availabilityConfirmedWeek: week })),
    undefined,
  )
}

export interface CoachEdit {
  level: CoachLevel
  payRate: number
  phone: string
  email: string
  active: boolean
}

const LEVEL_NAME: Record<CoachLevel, string> = { lead: 'Lead', assistant: 'Assistant', trainee: 'In training' }

/** Management edits a coach's record. Each change is logged on the coach. */
function updateCoach({ state, user, at }: Ctx, coachId: string, edit: CoachEdit): Outcome<void> {
  const coach = findCoach(state, coachId)
  if (!canEditCoach(user, coach)) throw new LifecycleError('Only management in this territory can edit coaches.')
  if (!(edit.payRate > 0)) throw new LifecycleError('Pay rate must be more than $0.')
  if (!/^\S+@\S+\.\S+$/.test(edit.email)) throw new LifecycleError('Enter a valid email.')
  const changes: string[] = []
  if (edit.level !== coach.level) changes.push(`Level: ${LEVEL_NAME[coach.level]} → ${LEVEL_NAME[edit.level]}`)
  if (edit.payRate !== coach.payRate) changes.push(`Pay rate: $${coach.payRate}/hr → $${edit.payRate}/hr`)
  if (edit.phone !== coach.phone) changes.push(`Phone: ${coach.phone} → ${edit.phone}`)
  if (edit.email !== coach.email) changes.push(`Email: ${coach.email} → ${edit.email}`)
  if (edit.active !== coach.active) changes.push(edit.active ? 'Marked active' : 'Marked inactive')
  if (!changes.length) return done(state, undefined)
  return done(
    updateCoachRecord(state, coachId, (c) => ({ ...c, ...edit, history: [...c.history, ...changes.map((text) => ({ at, by: user.name, text }))] })),
    undefined,
  )
}

// ---------------------------------------------------------------- settings and terms

function updateSettings({ state, user }: Ctx, settings: Settings): Outcome<void> {
  if (!canChangeSettings(user)) throw new LifecycleError('Only operations admins change global settings.')
  return done({ ...state, settings }, undefined)
}

/** Price corrections after signing. Ops admins only; the change is logged. */
function updateTerms({ state, user, at }: Ctx, centerId: string, terms: ProgramTerms): Outcome<void> {
  const center = state.centers.find((c) => c.id === centerId)
  if (!center || !canEditTerms(user)) throw new LifecycleError('Only operations admins change program terms after signing.')
  if (!(terms.cycleRate >= 0)) throw new LifecycleError('Price can’t be negative.')
  const before = center.terms
  const text = before && before.cycleRate !== terms.cycleRate ? `Cycle price: $${before.cycleRate} → $${terms.cycleRate}` : 'Program terms updated'
  return done(
    {
      ...state,
      centers: state.centers.map((c) => (c.id === centerId ? { ...c, terms, history: [...(c.history ?? []), { at, by: user.name, text }] } : c)),
    },
    undefined,
  )
}

// ---------------------------------------------------------------- sales intake

export interface IntakeInput {
  center: Omit<Center, 'id' | 'terms' | 'history'>
  cycleWeeks: CycleWeeks
  /** Price for the whole cycle (all days together). */
  cycleRate: number
  /** Each weekday with its own first date, times and groups. */
  days: ProgramDay[]
  notes?: string
}

/** Re-checks everything the form checks: the UI can't skip a rule. */
function planFor(state: State, input: IntakeInput, ignoreIntakeId?: string): PlannedSession[] {
  if (input.days.length < 1 || input.days.length > 3) throw new LifecycleError('Pick 1 to 3 days a week.')
  if (new Set(input.days.map((d) => d.weekday)).size !== input.days.length) throw new LifecycleError('Each day can only be picked once.')
  const problem = input.days.flatMap((d) => dayProblems(d, state.today))[0]
  if (problem) throw new LifecycleError(problem)
  if (!(input.cycleRate > 0)) throw new LifecycleError('Enter the price for the cycle.')
  if (!isValidEmail(input.center.poc.email)) throw new LifecycleError('Enter a valid contact email.')
  // When editing, the intake's own sessions mustn't count as conflicts.
  const world = worldOf(state)
  const others = ignoreIntakeId ? { ...world, sessions: world.sessions.filter((s) => s.intakeId !== ignoreIntakeId) } : world
  const coverage = checkProgramCoverage(input.center.territoryId, input.center, input.days, input.cycleWeeks, others)
  if (!coverage.ok) throw new LifecycleError(coverage.reason ?? 'The coaching staff cannot cover this program.')
  return plannedSessions(input.days, input.cycleWeeks)
}

const scheduleOf = (input: IntakeInput) => ({ days: input.days, notes: input.notes })

/** Returns the new intake's id. */
function submitIntake({ state, user, at }: Ctx, input: IntakeInput): Outcome<string> {
  if (!canSubmitIntake(user, input.center.territoryId)) throw new LifecycleError('You cannot submit intakes for this territory.')
  const plan = planFor(state, input)

  const centerId = idMaker('c', state.centers)()
  const intakeId = idMaker('i', state.intakes)()
  const nextSession = idMaker('s', state.sessions)
  const sessions: Session[] = plan.map((p) => ({
    id: nextSession(),
    territoryId: input.center.territoryId,
    centerId,
    date: p.date,
    start: p.start,
    end: p.end,
    groups: p.groups,
    status: 'pending',
    assignments: [],
    overrides: [],
    history: [{ at, by: user.name, text: 'Submitted through sales intake (coverage check passed)' }],
    intakeId,
    notes: input.notes,
  }))
  const intake: Intake = {
    id: intakeId,
    salesRepId: user.id,
    territoryId: input.center.territoryId,
    centerId,
    submittedAt: at,
    sessionIds: sessions.map((s) => s.id),
    schedule: scheduleOf(input),
    history: [{ at, by: user.name, text: 'Submitted' }],
  }
  return done(
    {
      ...state,
      centers: [...state.centers, { ...input.center, id: centerId, terms: termsFromDays(input.days, input.cycleWeeks, input.cycleRate) }],
      sessions: [...state.sessions, ...sessions],
      intakes: [...state.intakes, intake],
    },
    intakeId,
  )
}

/**
 * The rep changes a submission before it's confirmed (e.g. the director calls
 * back with a new time). Sessions are updated in place, extra ones are
 * cancelled with a reason, never deleted, and everything is logged.
 */
function updateIntake({ state, user, at }: Ctx, intakeId: string, input: IntakeInput): Outcome<void> {
  const intake = state.intakes.find((i) => i.id === intakeId)
  if (!intake) throw new LifecycleError('Submission not found.')
  if (!canEditIntake(user, intake, state.sessions, state.today)) {
    throw new LifecycleError('This submission can’t be changed anymore: a territory manager has confirmed it or it has started.')
  }
  const plan = planFor(state, input, intakeId)

  const log = (text: string) => ({ at, by: user.name, text })
  const current = state.sessions
    .filter((s) => s.intakeId === intakeId && s.status === 'pending')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
  const nextSession = idMaker('s', state.sessions)
  const updated: Session[] = []
  const added: Session[] = []
  plan.forEach((p, i) => {
    const old = current[i]
    if (!old) {
      added.push({
        id: nextSession(),
        territoryId: intake.territoryId,
        centerId: intake.centerId,
        date: p.date,
        start: p.start,
        end: p.end,
        groups: p.groups,
        status: 'pending',
        assignments: [],
        overrides: [],
        history: [log('Added when sales changed the program')],
        intakeId,
        notes: input.notes,
      })
      return
    }
    const moved = old.date !== p.date || old.start !== p.start || old.end !== p.end
    const regrouped = JSON.stringify(old.groups) !== JSON.stringify(p.groups)
    if (!moved && !regrouped && old.notes === input.notes) return
    const history = [...old.history]
    if (moved) history.push(log(`Changed by sales: ${slotLabel(old.date, old.start, old.end)} → ${slotLabel(p.date, p.start, p.end)}`))
    if (regrouped) history.push(log('Groups changed by sales'))
    if (moved && old.assignments.length) history.push(log('Coaching staff cleared because the time changed'))
    updated.push({ ...old, date: p.date, start: p.start, end: p.end, groups: p.groups, notes: input.notes, assignments: moved ? [] : old.assignments, overrides: moved ? [] : old.overrides, history })
  })
  for (const extra of current.slice(plan.length)) {
    updated.push(cancelSession(extra, 'changed_by_sales', 'Fewer sessions after the program was changed', user.name, at))
  }

  const center = state.centers.find((c) => c.id === intake.centerId)!
  const nextIntake: Intake = {
    ...intake,
    sessionIds: [...intake.sessionIds, ...added.map((s) => s.id)],
    schedule: scheduleOf(input),
    history: [...intake.history, log('Edited by sales before confirmation')],
  }
  const withSessions = replaceSessions(state, updated, added)
  return done(
    {
      ...withSessions,
      centers: state.centers.map((c) => (c.id === center.id ? { ...c, ...input.center, id: c.id, terms: termsFromDays(input.days, input.cycleWeeks, input.cycleRate) } : c)),
      intakes: state.intakes.map((i) => (i.id === intakeId ? nextIntake : i)),
    },
    undefined,
  )
}

// ---------------------------------------------------------------- accounts

/** How long an invitation can be accepted. */
export const INVITE_DAYS = 7

const ROLE_NAME: Record<Role, string> = { ops_admin: 'Operations admin', territory_manager: 'Territory manager', sales_rep: 'Sales rep', coach: 'Coach' }

export interface InviteInput {
  name: string
  email: string
  role: Role
  /** Ignored for ops admins, who see every territory. Exactly one for a coach. */
  territoryIds: string[]
  /** For a coach: their roster details. */
  coach?: { level: CoachLevel; payRate: number; phone: string }
}

function findUser(state: State, id: string): User {
  const u = state.users.find((x) => x.id === id)
  if (!u) throw new LifecycleError('Person not found.')
  return u
}

function updateUser(state: State, id: string, change: (u: User) => User): State {
  return { ...state, users: state.users.map((u) => (u.id === id ? change(u) : u)) }
}

const territoryNames = (state: State, ids: string[]) => ids.map((id) => state.territories.find((t) => t.id === id)?.name ?? id).join(' + ')

function cleanTerritories(state: State, role: Role, ids: string[]): string[] {
  if (role === 'ops_admin') return state.territories.map((t) => t.id)
  const known = [...new Set(ids)].filter((id) => state.territories.some((t) => t.id === id))
  if (!known.length) throw new LifecycleError('Pick a territory.')
  if (role === 'coach' && known.length !== 1) throw new LifecycleError('A coach belongs to exactly one territory.')
  return known
}

/** Nobody may remove the last active ops admin: the company would lock itself out. */
function requireAnotherAdmin(state: State, target: User) {
  const admins = state.users.filter((u) => u.role === 'ops_admin' && u.status === 'active')
  if (target.role === 'ops_admin' && target.status === 'active' && admins.length <= 1) {
    throw new LifecycleError('This is the only active operations admin. Make someone else an admin first.')
  }
}

/** Adds a person who can't sign in until they accept. Returns their id. */
function inviteUser({ state, user, at }: Ctx, input: InviteInput): Outcome<string> {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name) throw new LifecycleError('Enter their name.')
  if (!isValidEmail(email)) throw new LifecycleError('Enter a valid email.')
  if (state.users.some((u) => u.email.toLowerCase() === email)) throw new LifecycleError('Someone already has that email.')
  const territoryIds = cleanTerritories(state, input.role, input.territoryIds)
  if (!canInvite(user, input.role, territoryIds)) throw new LifecycleError('You can’t invite that role into that territory.')

  let coachId: string | undefined
  let coaches = state.coaches
  if (input.role === 'coach') {
    const c = input.coach
    if (!c) throw new LifecycleError('Enter the coach’s level, pay rate and phone.')
    if (!(c.payRate > 0)) throw new LifecycleError('Pay rate must be more than $0.')
    if (!c.phone.trim()) throw new LifecycleError('Enter their phone number.')
    const t = territoryIds[0]
    coachId = idMaker(`${t}-k`, state.coaches)()
    const none = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    coaches = [
      ...coaches,
      {
        id: coachId,
        territoryId: t,
        name,
        phone: c.phone.trim(),
        email,
        level: c.level,
        payRate: c.payRate,
        // Can't be scheduled until they accept and set their availability.
        active: false,
        availability: none,
        timeOff: [],
        weekChanges: {},
        history: [{ at, by: user.name, text: 'Added by invitation' }],
      },
    ]
  }
  const id = coachId ? `u-${coachId}` : idMaker('staff-', state.users)()
  const invited: User = {
    id,
    name,
    email,
    role: input.role,
    territoryIds,
    coachId,
    status: 'invited',
    invitedBy: user.id,
    invitedAt: at,
    history: [{ at, by: user.name, text: `Invited as ${ROLE_NAME[input.role]} (${territoryNames(state, territoryIds)})` }],
  }
  return done({ ...state, coaches, users: [...state.users, invited] }, id)
}

function resendInvite({ state, user, at }: Ctx, userId: string): Outcome<void> {
  const target = findUser(state, userId)
  if (!canManageAccount(user, target)) throw new LifecycleError('You can’t manage this person’s access.')
  if (target.status !== 'invited') throw new LifecycleError('Only a pending invitation can be sent again.')
  return done(
    updateUser(state, userId, (u) => ({ ...u, invitedAt: at, history: [...u.history, { at, by: user.name, text: 'Invitation sent again' }] })),
    undefined,
  )
}

/**
 * The invited person accepts (in the demo, the "open the invite" button; in
 * live mode the database does the same on their first sign-in).
 */
function acceptInvite({ state, user, at }: Ctx): Outcome<void> {
  const me = findUser(state, user.id)
  if (me.status !== 'invited') throw new LifecycleError('There’s no pending invitation for this person.')
  const age = new Date(at).getTime() - new Date(me.invitedAt ?? at).getTime()
  if (age > INVITE_DAYS * 24 * 3600 * 1000) throw new LifecycleError('This invitation has expired. Ask for a new one.')
  const next = updateUser(state, me.id, (u) => ({ ...u, status: 'active', activatedAt: at, history: [...u.history, { at, by: me.name, text: 'Accepted the invitation' }] }))
  return done(me.coachId ? updateCoachRecord(next, me.coachId, (c) => ({ ...c, active: true })) : next, undefined)
}

export interface DeactivateResult {
  /** Upcoming sessions this coach was on: the manager re-staffs them. */
  upcoming: string[]
}

/** Cancels an invitation or turns access off. Nothing is deleted. */
function deactivateUser({ state, user, at }: Ctx, userId: string): Outcome<DeactivateResult> {
  const target = findUser(state, userId)
  if (user.id === userId) throw new LifecycleError('You can’t turn off your own access.')
  if (!canManageAccount(user, target)) throw new LifecycleError('You can’t manage this person’s access.')
  if (target.status === 'deactivated') throw new LifecycleError('Their access is already off.')
  requireAnotherAdmin(state, target)
  const text = target.status === 'invited' ? 'Invitation cancelled' : 'Access turned off'
  let next = updateUser(state, userId, (u) => ({
    ...u,
    status: 'deactivated',
    deactivatedAt: at,
    deactivatedBy: user.id,
    history: [...u.history, { at, by: user.name, text }],
  }))
  let upcoming: string[] = []
  if (target.coachId) {
    next = updateCoachRecord(next, target.coachId, (c) => ({ ...c, active: false, history: [...c.history, { at, by: user.name, text: `Marked inactive (${text.toLowerCase()})` }] }))
    upcoming = state.sessions
      .filter((s) => s.date >= state.today && (s.status === 'pending' || s.status === 'confirmed') && s.assignments.some((a) => a.coachId === target.coachId))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .map((s) => s.id)
  }
  return done(next, { upcoming })
}

/** Turns access back on, or invites again if they never accepted. */
function reactivateUser({ state, user, at }: Ctx, userId: string): Outcome<void> {
  const target = findUser(state, userId)
  if (!canManageAccount(user, target)) throw new LifecycleError('You can’t manage this person’s access.')
  if (target.status !== 'deactivated') throw new LifecycleError('Their access isn’t off.')
  const accepted = !!target.activatedAt
  let next = updateUser(state, userId, (u) => ({
    ...u,
    status: accepted ? 'active' : 'invited',
    invitedAt: accepted ? u.invitedAt : at,
    deactivatedAt: undefined,
    deactivatedBy: undefined,
    history: [...u.history, { at, by: user.name, text: accepted ? 'Access turned back on' : 'Invited again' }],
  }))
  if (accepted && target.coachId) {
    next = updateCoachRecord(next, target.coachId, (c) => ({ ...c, active: true, history: [...c.history, { at, by: user.name, text: 'Marked active (access turned back on)' }] }))
  }
  return done(next, undefined)
}

/** Role and territories for office staff. Ops admins only; logged. */
function changeAccess({ state, user, at }: Ctx, userId: string, role: Role, territoryIds: string[]): Outcome<void> {
  if (!canChangeAccess(user)) throw new LifecycleError('Only operations admins change roles and territories.')
  const target = findUser(state, userId)
  if (target.role === 'coach' || role === 'coach') throw new LifecycleError('Coaches can’t be moved to or from office roles here. Invite them separately.')
  const territories = cleanTerritories(state, role, territoryIds)
  if (role !== 'ops_admin') requireAnotherAdmin(state, target)
  const changes: string[] = []
  if (role !== target.role) changes.push(`Role: ${ROLE_NAME[target.role]} → ${ROLE_NAME[role]}`)
  const before = [...target.territoryIds].sort().join(',')
  if ([...territories].sort().join(',') !== before) changes.push(`Territories: ${territoryNames(state, target.territoryIds)} → ${territoryNames(state, territories)}`)
  if (!changes.length) return done(state, undefined)
  return done(
    updateUser(state, userId, (u) => ({ ...u, role, territoryIds: territories, history: [...u.history, ...changes.map((text) => ({ at, by: user.name, text }))] })),
    undefined,
  )
}

// ---------------------------------------------------------------- registry

/**
 * Every action by name. A data source runs them by name with plain arguments,
 * which is also the shape a server call takes.
 */
export const ACTIONS = {
  saveCrew,
  staffOpenSessions,
  confirmProgramWithFacility,
  confirmWithFacility,
  reschedule,
  cancel,
  coachConfirmMany,
  setAvailability,
  setWeekChange,
  addTimeOff,
  removeTimeOff,
  confirmAvailability,
  updateCoach,
  updateSettings,
  updateTerms,
  submitIntake,
  updateIntake,
  inviteUser,
  resendInvite,
  acceptInvite,
  deactivateUser,
  reactivateUser,
  changeAccess,
}

export type ActionName = keyof typeof ACTIONS
/** An action's arguments after the context. */
export type ActionArgs<N extends ActionName> = (typeof ACTIONS)[N] extends (ctx: Ctx, ...args: infer A) => unknown ? A : never
export type ActionResult<N extends ActionName> = ReturnType<(typeof ACTIONS)[N]>['result']

/**
 * Actions live mode can run so far (on the server, supabase/functions/run-action).
 * The rest arrive with the audit log (docs/accounts-plan.md, phase 5).
 * acceptInvite isn't here: in live mode the database accepts on first sign-in.
 */
export const SERVER_ACTIONS: readonly ActionName[] = ['inviteUser', 'resendInvite', 'deactivateUser', 'reactivateUser', 'changeAccess']
