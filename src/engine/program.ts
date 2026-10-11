// Program cycles: what a center bought (N weeks x M days a week) and where
// it really stands. Reschedules and make-up sessions push the end date out,
// so the end is read from the sessions themselves, not from the calendar.

import { addDays, fullDate, mondayOf, monthDay, toMinutes, weekdayOf, WEEKDAY_LONG } from './time'
import type { CycleWeeks, Group, ProgramDay, ProgramTerms, Session, Weekday } from './types'
import { isActive } from './validate'

export const sessionsInCycle = (t: Pick<ProgramTerms, 'cycleWeeks' | 'weekdays'>) => t.cycleWeeks * t.weekdays.length

/** The first date a weekday runs: its own first date, or the first match on or after the start. */
export function firstDateFor(t: Pick<ProgramTerms, 'startDate' | 'firstDates'>, day: Weekday): string {
  const own = t.firstDates?.[day]
  if (own) return own
  const monday = mondayOf(t.startDate)
  const date = addDays(monday, day - 1)
  return date >= t.startDate ? date : addDays(date, 7)
}

/** Every planned date of a cycle, in order. Each chosen day runs `cycleWeeks` weeks from its first date. */
export function programDates(t: Pick<ProgramTerms, 'startDate' | 'cycleWeeks' | 'weekdays' | 'firstDates'>): string[] {
  if (!t.startDate || t.weekdays.length === 0) return []
  const out: string[] = []
  for (const d of t.weekdays) {
    const first = firstDateFor(t, d)
    for (let w = 0; w < t.cycleWeeks; w++) out.push(addDays(first, w * 7))
  }
  return out.sort()
}

/** Program terms from the per-day schedule a sales rep enters. */
export function termsFromDays(days: ProgramDay[], cycleWeeks: CycleWeeks, cycleRate: number): ProgramTerms {
  const sorted = [...days].sort((a, b) => a.weekday - b.weekday)
  const startDate = sorted.map((d) => d.firstDate).sort()[0] ?? ''
  return {
    startDate,
    cycleWeeks,
    weekdays: sorted.map((d) => d.weekday),
    firstDates: Object.fromEntries(sorted.map((d) => [d.weekday, d.firstDate])),
    cycleRate,
  }
}

export interface PlannedSession {
  date: string
  weekday: Weekday
  start: string
  end: string
  groups: Group[]
}

/** Every session a per-day schedule produces, in date and time order. */
export function plannedSessions(days: ProgramDay[], cycleWeeks: number): PlannedSession[] {
  const out: PlannedSession[] = []
  for (const d of days) {
    for (let w = 0; w < cycleWeeks; w++) {
      out.push({ date: addDays(d.firstDate, w * 7), weekday: d.weekday, start: d.start, end: d.end, groups: d.groups })
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}

/** "Thursdays & Fridays" */
export function daysLabel(weekdays: Weekday[]): string {
  return [...weekdays].sort((a, b) => a - b).map((d) => `${WEEKDAY_LONG[d]}s`).join(' & ')
}

/** "Thursdays & Fridays", or "Thursdays from October 15 & Fridays from October 23" when days start in different weeks. */
export function scheduleLabel(t: Pick<ProgramTerms, 'startDate' | 'weekdays' | 'firstDates'>): string {
  const days = [...t.weekdays].sort((a, b) => a - b)
  const firsts = days.map((d) => firstDateFor(t, d))
  if (new Set(firsts.map(mondayOf)).size <= 1) return daysLabel(days)
  return days.map((d, i) => `${WEEKDAY_LONG[d]}s from ${monthDay(firsts[i])}`).join(' & ')
}

/** Why one day of a program can't be submitted, in plain words. Empty when it's fine. */
export function dayProblems(day: ProgramDay, today: string): string[] {
  const out: string[] = []
  const name = WEEKDAY_LONG[day.weekday]
  if (!day.firstDate) out.push(`Pick the first ${name}.`)
  else {
    const actual = new Date(`${day.firstDate}T00:00:00Z`).getUTCDay()
    if (actual !== day.weekday) out.push(`${fullDate(day.firstDate)} is a ${WEEKDAY_LONG[actual]}. Pick a ${name}.`)
    if (day.firstDate < today) out.push(`The first ${name} can’t be in the past.`)
  }
  const start = toMinutes(day.start)
  const end = toMinutes(day.end)
  const minutes = day.groups.reduce((m, g) => m + (g.minutes || 0), 0)
  if (start < 9 * 60 || end > 18 * 60) out.push(`${name} sessions must fit between 9am and 6pm.`)
  if (end <= start) out.push(`${name}: the end time must be after the start time.`)
  else if (minutes > end - start) out.push(`${name}: the groups add up to ${minutes} minutes but the session is ${end - start}.`)
  if (day.groups.length === 0) out.push(`${name}: add at least one group.`)
  if (day.groups.some((g) => !(g.players > 0) || !(g.minutes > 0))) out.push(`${name}: every group needs kids and minutes.`)
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
