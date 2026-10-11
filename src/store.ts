// App state. The only place data changes, and every change goes through an
// engine function or permission check so the rules can't be skipped. Saved to
// localStorage so a visitor's edits survive a reload; "Reset demo" rebuilds
// the fictional company.

import { useSyncExternalStore } from 'react'
import {
  LifecycleError,
  cancelSession,
  coachConfirm,
  confirmSession,
  canAssign,
  canChangeSettings,
  canEditAvailability,
  canEditCoach,
  canEditIntake,
  canEditTerms,
  canSubmitIntake,
  checkProgramCoverage,
  dayProblems,
  hasBlock,
  isValidEmail,
  plannedSessions,
  termsFromDays,
  mondayOf,
  openSessionsLike,
  pendingSessionsLike,
  rescheduleSession,
  slotLabel,
  todayLocal,
  validateCrew,
} from './engine'
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
  Session,
  Settings,
  TimeOff,
  User,
  Violation,
  Weekday,
  World,
} from './engine'
import { buildDemo } from './data/seed'
import type { DemoData } from './data/seed'

const KEY = 'soccersessions:v3'

const RULE_LABEL: Record<string, string> = {
  travel: 'travel time between centers',
  ratio: '1:12 ratio',
  no_lead: 'no lead coach',
  unavailable: 'coach availability',
}

export interface State extends DemoData {
  today: string
}

function fresh(): State {
  const today = todayLocal()
  return { ...buildDemo(today), today }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = JSON.parse(raw) as State
      // A saved demo from an older week would look stale: rebuild it.
      if (saved.seededForWeek === mondayOf(todayLocal())) return { ...saved, today: todayLocal() }
    }
  } catch {
    /* storage blocked or corrupt: fall through to a fresh demo */
  }
  return fresh()
}

let state: State = load()
const listeners = new Set<() => void>()

function commit(next: State) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode: the demo still works for this visit */
  }
  listeners.forEach((l) => l())
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const getState = () => state

export function worldOf(s: State): World {
  return { sessions: s.sessions, coaches: s.coaches, centers: s.centers, settings: s.settings }
}

const coachName = (id: string) => state.coaches.find((c) => c.id === id)?.name ?? id

export function resetDemo() {
  commit(fresh())
}

const now = () => new Date().toISOString()
/** Next id in the same style as the demo data: s144, s145, … */
function idMaker(prefix: string, existing: { id: string }[]) {
  let n = Math.max(0, ...existing.map((x) => Number(x.id.match(new RegExp(`^${prefix}(\\d+)$`))?.[1] ?? 0)))
  return () => `${prefix}${++n}`
}

function replaceSessions(updated: Session[], added: Session[] = []) {
  const byId = new Map(updated.map((s) => [s.id, s]))
  commit({ ...state, sessions: [...state.sessions.map((s) => byId.get(s.id) ?? s), ...added] })
}

function findSession(id: string): Session {
  const s = state.sessions.find((x) => x.id === id)
  if (!s) throw new LifecycleError('Session not found.')
  return s
}

export type SaveCrewResult =
  | { ok: true }
  | { ok: false; blocked: Violation[] }
  | { ok: false; needsConfirm: Violation[] }

/**
 * Saves a crew. Hard blocks always refuse. Overridable warnings refuse
 * unless `confirmed` is true, which is what the dialog sets.
 */
export function saveCrew(user: User, sessionId: string, crewIds: string[], confirmed: boolean): SaveCrewResult {
  const s = findSession(sessionId)
  if (!canAssign(user, s.territoryId)) throw new LifecycleError('You cannot assign coaches in this territory.')
  if (s.status === 'cancelled' || s.status === 'rescheduled') throw new LifecycleError('This session is closed.')
  const violations = crewIds.length ? validateCrew(s, crewIds, worldOf(state)) : []
  if (hasBlock(violations)) return { ok: false, blocked: violations.filter((v) => v.severity === 'block') }
  const warnings = violations.filter((v) => v.severity === 'override')
  if (warnings.length && !confirmed) return { ok: false, needsConfirm: warnings }

  const at = now()
  const keep = new Map(s.assignments.map((a) => [a.coachId, a]))
  const codes = [...new Set(warnings.map((w) => w.code))]
  const names = (ids: string[]) => ids.map((id) => state.coaches.find((c) => c.id === id)?.name ?? id).join(', ')
  const history = [...s.history, { at, by: user.name, text: crewIds.length ? `Coaching staff set: ${names(crewIds)}` : 'Coaching staff cleared' }]
  for (const code of codes) history.push({ at, by: user.name, text: `Overrode: ${RULE_LABEL[code]}` })
  replaceSessions([
    {
      ...s,
      assignments: crewIds.map((id) => keep.get(id) ?? { coachId: id, confirmedByCoach: false }),
      overrides: warnings.map((w) => ({ code: w.code, message: w.message, by: user.name, at })),
      history,
    },
  ])
  return { ok: true }
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
export function staffOpenSessions(user: User, fromId: string, scope: BulkScope = 'program'): BulkResult {
  const from = findSession(fromId)
  requireManager(user, from)
  const crewIds = from.assignments.map((a) => a.coachId)
  if (!crewIds.length) throw new LifecycleError('Save a coaching staff on this session first.')
  const at = now()
  const names = crewIds.map(coachName).join(', ')
  let world = worldOf(state)
  const result: BulkResult = { filled: [], skipped: [] }
  const updated: Session[] = []
  for (const s of openSessionsLike(from, state.sessions, state.today, scope)) {
    const problems = validateCrew(s, crewIds, world)
    if (problems.length) {
      result.skipped.push({ id: s.id, reason: problems[0].detail || problems[0].message })
      continue
    }
    const next: Session = {
      ...s,
      assignments: crewIds.map((id) => ({ coachId: id, confirmedByCoach: false })),
      history: [...s.history, { at, by: user.name, text: `Coaching staff set: ${names} (added to the whole program from ${slotLabel(from.date, from.start, from.end)})` }],
    }
    updated.push(next)
    result.filled.push(s.id)
    world = { ...world, sessions: world.sessions.map((x) => (x.id === s.id ? next : x)) }
  }
  if (updated.length) replaceSessions(updated)
  return result
}

/** Marks every pending upcoming session of a program as confirmed with the facility. */
export function confirmProgramWithFacility(user: User, fromId: string): number {
  const from = findSession(fromId)
  requireManager(user, from)
  const at = now()
  const targets = [...(from.status === 'pending' ? [from] : []), ...pendingSessionsLike(from, state.sessions, state.today)]
  replaceSessions(targets.map((s) => confirmSession(s, user.name, at)))
  return targets.length
}

function requireManager(user: User, s: Session) {
  if (!canAssign(user, s.territoryId)) throw new LifecycleError('Only this territory’s managers can change sessions.')
}

export function confirmWithFacility(user: User, id: string) {
  const s = findSession(id)
  requireManager(user, s)
  replaceSessions([confirmSession(s, user.name, now())])
}

/** Moves a session. The coaching staff is told and has to re-confirm the new time. */
export function reschedule(user: User, id: string, newDate: string, newStart: string, newEnd: string, note = ''): string {
  const s = findSession(id)
  requireManager(user, s)
  const at = now()
  const [old, moved] = rescheduleSession(s, { newDate, newStart, newEnd, newId: idMaker('s', state.sessions)(), by: user.name, at, note })
  if (moved.assignments.length) {
    const names = moved.assignments.map((a) => coachName(a.coachId)).join(', ')
    moved.history.push({ at, by: 'SoccerSessions', text: `Coaching staff notified by text to re-confirm: ${names}` })
  }
  replaceSessions([old], [moved])
  return moved.id
}

export function cancel(user: User, id: string, reason: CancelReason, note: string) {
  const s = findSession(id)
  requireManager(user, s)
  replaceSessions([cancelSession(s, reason, note, user.name, now())])
}

export function coachConfirmMany(user: User, ids: string[]) {
  if (user.role !== 'coach' || !user.coachId) throw new LifecycleError('Only coaches confirm their own shifts.')
  const at = now()
  replaceSessions(ids.map((id) => coachConfirm(findSession(id), user.coachId!, at)))
}

// ---------------------------------------------------------------- coaches

function findCoach(id: string): Coach {
  const c = state.coaches.find((x) => x.id === id)
  if (!c) throw new LifecycleError('Coach not found.')
  return c
}

function updateCoachRecord(id: string, change: (c: Coach) => Coach) {
  commit({ ...state, coaches: state.coaches.map((c) => (c.id === id ? change(c) : c)) })
}

function requireSelf(user: User, coach: Coach) {
  if (!canEditAvailability(user, coach)) throw new LifecycleError('Only the coach can change their own availability.')
}

/** The coach's usual week (a long-term change). */
export function setAvailability(user: User, coachId: string, availability: Record<Weekday, number[]>) {
  const coach = findCoach(coachId)
  requireSelf(user, coach)
  updateCoachRecord(coachId, (c) => ({ ...c, availability }))
}

/** A change for one week only; it replaces the usual week for those days. */
export function setWeekChange(user: User, coachId: string, monday: string, hours: Record<Weekday, number[]> | null) {
  const coach = findCoach(coachId)
  requireSelf(user, coach)
  const weekChanges = { ...coach.weekChanges }
  if (hours) weekChanges[monday] = hours
  else delete weekChanges[monday]
  updateCoachRecord(coachId, (c) => ({ ...c, weekChanges }))
}

export function addTimeOff(user: User, coachId: string, entry: Omit<TimeOff, 'id'>) {
  const coach = findCoach(coachId)
  requireSelf(user, coach)
  if (!entry.from || !entry.to || entry.to < entry.from) throw new LifecycleError('Pick a first and last day off.')
  const id = idMaker('t', state.coaches.flatMap((c) => c.timeOff))()
  updateCoachRecord(coachId, (c) => ({ ...c, timeOff: [...c.timeOff, { ...entry, id }] }))
}

export function removeTimeOff(user: User, coachId: string, timeOffId: string) {
  const coach = findCoach(coachId)
  requireSelf(user, coach)
  updateCoachRecord(coachId, (c) => ({ ...c, timeOff: c.timeOff.filter((t) => t.id !== timeOffId) }))
}

/** "My availability hasn't changed" for the week being planned. */
export function confirmAvailability(user: User, coachId: string, week: string) {
  const coach = findCoach(coachId)
  requireSelf(user, coach)
  updateCoachRecord(coachId, (c) => ({ ...c, availabilityConfirmedWeek: week }))
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
export function updateCoach(user: User, coachId: string, edit: CoachEdit) {
  const coach = findCoach(coachId)
  if (!canEditCoach(user, coach)) throw new LifecycleError('Only management in this territory can edit coaches.')
  if (!(edit.payRate > 0)) throw new LifecycleError('Pay rate must be more than $0.')
  if (!/^\S+@\S+\.\S+$/.test(edit.email)) throw new LifecycleError('Enter a valid email.')
  const at = now()
  const changes: string[] = []
  if (edit.level !== coach.level) changes.push(`Level: ${LEVEL_NAME[coach.level]} → ${LEVEL_NAME[edit.level]}`)
  if (edit.payRate !== coach.payRate) changes.push(`Pay rate: $${coach.payRate}/hr → $${edit.payRate}/hr`)
  if (edit.phone !== coach.phone) changes.push(`Phone: ${coach.phone} → ${edit.phone}`)
  if (edit.email !== coach.email) changes.push(`Email: ${coach.email} → ${edit.email}`)
  if (edit.active !== coach.active) changes.push(edit.active ? 'Marked active' : 'Marked inactive')
  if (!changes.length) return
  updateCoachRecord(coachId, (c) => ({ ...c, ...edit, history: [...c.history, ...changes.map((text) => ({ at, by: user.name, text }))] }))
}

// ---------------------------------------------------------------- settings and terms

export function updateSettings(user: User, settings: Settings) {
  if (!canChangeSettings(user)) throw new LifecycleError('Only operations admins change global settings.')
  commit({ ...state, settings })
}

/** Price corrections after signing. Ops admins only; the change is logged. */
export function updateTerms(user: User, centerId: string, terms: ProgramTerms) {
  const center = state.centers.find((c) => c.id === centerId)
  if (!center || !canEditTerms(user)) throw new LifecycleError('Only operations admins change program terms after signing.')
  if (!(terms.cycleRate >= 0)) throw new LifecycleError('Price can’t be negative.')
  const before = center.terms
  const text = before && before.cycleRate !== terms.cycleRate ? `Cycle price: $${before.cycleRate} → $${terms.cycleRate}` : 'Program terms updated'
  commit({
    ...state,
    centers: state.centers.map((c) => (c.id === centerId ? { ...c, terms, history: [...(c.history ?? []), { at: now(), by: user.name, text }] } : c)),
  })
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
function planFor(input: IntakeInput, ignoreIntakeId?: string): PlannedSession[] {
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

export function submitIntake(user: User, input: IntakeInput): string {
  if (!canSubmitIntake(user, input.center.territoryId)) throw new LifecycleError('You cannot submit intakes for this territory.')
  const plan = planFor(input)

  const at = now()
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
  commit({
    ...state,
    centers: [...state.centers, { ...input.center, id: centerId, terms: termsFromDays(input.days, input.cycleWeeks, input.cycleRate) }],
    sessions: [...state.sessions, ...sessions],
    intakes: [...state.intakes, intake],
  })
  return intakeId
}

/**
 * The rep changes a submission before it's confirmed (e.g. the director calls
 * back with a new time). Sessions are updated in place, extra ones are
 * cancelled with a reason, never deleted, and everything is logged.
 */
export function updateIntake(user: User, intakeId: string, input: IntakeInput) {
  const intake = state.intakes.find((i) => i.id === intakeId)
  if (!intake) throw new LifecycleError('Submission not found.')
  if (!canEditIntake(user, intake, state.sessions, state.today)) {
    throw new LifecycleError('This submission can’t be changed anymore: a territory manager has confirmed it or it has started.')
  }
  const plan = planFor(input, intakeId)

  const at = now()
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
  const byId = new Map(updated.map((s) => [s.id, s]))
  commit({
    ...state,
    centers: state.centers.map((c) => (c.id === center.id ? { ...c, ...input.center, id: c.id, terms: termsFromDays(input.days, input.cycleWeeks, input.cycleRate) } : c)),
    sessions: [...state.sessions.map((s) => byId.get(s.id) ?? s), ...added],
    intakes: state.intakes.map((i) => (i.id === intakeId ? nextIntake : i)),
  })
}
