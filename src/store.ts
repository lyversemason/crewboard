// App state. The only place data changes, and every change goes through an
// engine function so the rules can't be skipped. Saved to localStorage so a
// visitor's edits survive a reload; "Reset demo" rebuilds the fake company.

import { useSyncExternalStore } from 'react'
import {
  LifecycleError,
  cancelSession,
  checkCoverage,
  coachConfirm,
  confirmSession,
  canAssign,
  canChangeSettings,
  canSubmitIntake,
  hasBlock,
  mondayOf,
  rescheduleSession,
  todayLocal,
  validateCrew,
} from './engine'
import type { CancelReason, Center, CoverageRequest, Group, ProgramTerms, Session, Settings, User, Violation, Weekday, World } from './engine'
import { buildDemo } from './data/seed'
import type { DemoData } from './data/seed'

const KEY = 'crewboard:v1'

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

export function resetDemo() {
  commit(fresh())
}

const now = () => new Date().toISOString()
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

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
  const history = [...s.history, { at, by: user.name, text: crewIds.length ? `Crew set: ${names(crewIds)}` : 'Crew cleared' }]
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

function requireManager(user: User, s: Session) {
  if (!canAssign(user, s.territoryId)) throw new LifecycleError('Only this territory’s managers can change sessions.')
}

export function confirmWithFacility(user: User, id: string) {
  const s = findSession(id)
  requireManager(user, s)
  replaceSessions([confirmSession(s, user.name, now())])
}

export function reschedule(user: User, id: string, newDate: string, newStart: string, newEnd: string): string {
  const s = findSession(id)
  requireManager(user, s)
  const [old, moved] = rescheduleSession(s, { newDate, newStart, newEnd, newId: newId('s'), by: user.name, at: now() })
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

export function setAvailability(user: User, coachId: string, availability: Record<Weekday, number[]>) {
  const coach = state.coaches.find((c) => c.id === coachId)
  if (!coach) return
  const self = user.role === 'coach' && user.coachId === coachId
  if (!self && !canAssign(user, coach.territoryId)) throw new LifecycleError('Not allowed.')
  commit({ ...state, coaches: state.coaches.map((c) => (c.id === coachId ? { ...c, availability } : c)) })
}

export function updateSettings(user: User, settings: Settings) {
  if (!canChangeSettings(user)) throw new LifecycleError('Only operations admins change global settings.')
  commit({ ...state, settings })
}

export function updateTerms(user: User, centerId: string, terms: ProgramTerms) {
  const center = state.centers.find((c) => c.id === centerId)
  if (!center || !canAssign(user, center.territoryId)) throw new LifecycleError('Management only.')
  commit({ ...state, centers: state.centers.map((c) => (c.id === centerId ? { ...c, terms } : c)) })
}

export interface IntakeInput {
  center: Omit<Center, 'id' | 'terms'>
  dates: string[]
  start: string
  end: string
  groups: Group[]
  notes?: string
}

/** Re-runs the coverage check server-side style: the UI can't skip it. */
export function submitIntake(user: User, input: IntakeInput): string {
  if (!canSubmitIntake(user, input.center.territoryId)) throw new LifecycleError('You cannot submit intakes for this territory.')
  const req: CoverageRequest = {
    territoryId: input.center.territoryId,
    location: input.center,
    dates: input.dates,
    start: input.start,
    end: input.end,
    groups: input.groups,
  }
  const coverage = checkCoverage(req, worldOf(state))
  if (!coverage.ok) throw new LifecycleError(coverage.reason ?? 'The roster cannot cover this slot.')

  const at = now()
  const centerId = newId('c')
  const intakeId = newId('i')
  const sessions: Session[] = input.dates.map((date) => ({
    id: newId('s'),
    territoryId: input.center.territoryId,
    centerId,
    date,
    start: input.start,
    end: input.end,
    groups: input.groups,
    status: 'pending',
    assignments: [],
    overrides: [],
    history: [{ at, by: user.name, text: 'Submitted through sales intake (coverage check passed)' }],
    intakeId,
    notes: input.notes,
  }))
  commit({
    ...state,
    centers: [...state.centers, { ...input.center, id: centerId }],
    sessions: [...state.sessions, ...sessions],
    intakes: [...state.intakes, { id: intakeId, salesRepId: user.id, territoryId: input.center.territoryId, centerId, submittedAt: at, sessionIds: sessions.map((s) => s.id) }],
  })
  return intakeId
}
