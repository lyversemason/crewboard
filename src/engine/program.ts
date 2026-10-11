// Program cycles: what a center bought (N weeks x M days a week) and where
// it really stands. Reschedules and make-up sessions push the end date out,
// so the end is read from the sessions themselves, not from the calendar.

import { addDays, mondayOf, weekdayOf } from './time'
import type { ProgramTerms, Session, Weekday } from './types'
import { isActive } from './validate'

export const sessionsInCycle = (t: Pick<ProgramTerms, 'cycleWeeks' | 'weekdays'>) => t.cycleWeeks * t.weekdays.length

/** Every planned date of a cycle, in order: each chosen weekday, week by week. */
export function programDates(t: Pick<ProgramTerms, 'startDate' | 'cycleWeeks' | 'weekdays'>): string[] {
  if (!t.startDate || t.weekdays.length === 0) return []
  const monday = mondayOf(t.startDate)
  const days = [...t.weekdays].sort((a, b) => a - b)
  const out: string[] = []
  for (let w = 0; out.length < sessionsInCycle(t) && w < t.cycleWeeks + 1; w++) {
    for (const d of days) {
      const date = addDays(monday, w * 7 + d - 1)
      if (date >= t.startDate && out.length < sessionsInCycle(t)) out.push(date)
    }
  }
  return out
}

export interface CycleStatus {
  total: number
  /** Sessions still counting toward the cycle, in order. */
  sessions: Session[]
  startedOn?: string
  /** When the last session of the cycle actually happens. */
  endsOn?: string
  /** When it would have ended with no changes. */
  plannedEnd?: string
  /** Sessions that were cancelled and still need a make-up date. */
  needsMakeUp: number
  delivered: number
}

/** The cycle a center is in, judged from its sessions on or after the start date. */
export function cycleStatus(terms: ProgramTerms, centerSessions: Session[], today: string): CycleStatus {
  const total = sessionsInCycle(terms)
  const sessions = centerSessions
    .filter((s) => s.date >= terms.startDate && isActive(s))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, total)
  const planned = programDates(terms)
  return {
    total,
    sessions,
    startedOn: sessions[0]?.date,
    endsOn: sessions.at(-1)?.date,
    plannedEnd: planned.at(-1),
    needsMakeUp: Math.max(0, total - sessions.length),
    delivered: sessions.filter((s) => s.date < today).length,
  }
}

/** "Session 3 of 8", or 0 if the session isn't part of the cycle. */
export function sessionNumber(status: CycleStatus, sessionId: string): number {
  return status.sessions.findIndex((s) => s.id === sessionId) + 1
}

/** Cycles whose last session is within `days` days: time to talk renewal. */
export function endingSoon(status: CycleStatus, today: string, days = 14): boolean {
  return !!status.endsOn && status.endsOn >= today && status.endsOn <= addDays(today, days) && status.needsMakeUp === 0
}

export function weekdaysOf(dates: string[]): Weekday[] {
  return [...new Set(dates.map(weekdayOf))].sort((a, b) => a - b)
}
