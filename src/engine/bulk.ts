// Bulk actions for a whole program. Signing a center creates many sessions;
// a territory manager staffs one, then adds the same coaches to every other
// open session of that program they can legally work. Anything a coach
// can't do (busy, not available, too far to drive) is left open, never forced:
// overrides always need a person to confirm them one session at a time.

import { weekdayOf } from './time'
import type { Session, Weekday, World } from './types'
import { validateCrew } from './validate'

export type BulkScope = 'program' | Weekday

const live = (s: Session) => s.status === 'pending' || s.status === 'confirmed'

function inScope(s: Session, from: Session, today: string, scope: BulkScope): boolean {
  return s.id !== from.id && s.centerId === from.centerId && live(s) && s.date >= today && (scope === 'program' || weekdayOf(s.date) === scope)
}

/** Upcoming sessions of the same program that have nobody assigned yet. */
export function openSessionsLike(from: Session, sessions: Session[], today: string, scope: BulkScope = 'program'): Session[] {
  return sessions.filter((s) => inScope(s, from, today, scope) && s.assignments.length === 0).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}

/** Upcoming sessions of the same program still waiting on the facility to confirm. */
export function pendingSessionsLike(from: Session, sessions: Session[], today: string): Session[] {
  return sessions.filter((s) => inScope(s, from, today, 'program') && s.status === 'pending').sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}

/** The weekdays a program's upcoming sessions fall on, for "just the Mondays" buttons. */
export function programWeekdays(from: Session, sessions: Session[], today: string): Weekday[] {
  return [...new Set(sessions.filter((s) => s.centerId === from.centerId && live(s) && s.date >= today).map((s) => weekdayOf(s.date)))].sort((a, b) => a - b)
}

export interface BulkPlan {
  /** Sessions these coaches can take, in order. */
  fillable: Session[]
  /** Sessions they can't, with the first reason in plain words. */
  left: { session: Session; reason: string }[]
}

/**
 * What adding `crewIds` to the open sessions would do, checked one session
 * after another (so two sessions the same day can't both claim a coach).
 */
export function planBulk(from: Session, crewIds: string[], world: World, today: string, scope: BulkScope = 'program'): BulkPlan {
  const plan: BulkPlan = { fillable: [], left: [] }
  let w = world
  for (const s of openSessionsLike(from, world.sessions, today, scope)) {
    const problems = validateCrew(s, crewIds, w)
    if (problems.length) {
      plan.left.push({ session: s, reason: problems[0].detail || problems[0].message })
      continue
    }
    const next = { ...s, assignments: crewIds.map((id) => ({ coachId: id, confirmedByCoach: false })) }
    plan.fillable.push(next)
    w = { ...w, sessions: w.sessions.map((x) => (x.id === s.id ? next : x)) }
  }
  return plan
}
