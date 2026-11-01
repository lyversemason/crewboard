// Hours × pay: what coaching costs and what programs earn, for any date range.
//
// - A coach is paid for the whole session block (start to end) at their hourly
//   rate. Only sessions that run count: pending and confirmed. Cancelled and
//   rescheduled-away sessions cost nothing (the make-up session counts instead).
// - A program's price is for the whole cycle, so each session of the cycle earns
//   an equal share: cycle price ÷ sessions in the cycle. Make-ups past the cycle's
//   count earn nothing extra.
// - Before today = delivered; today and later = scheduled.
// Management only (canSeeMoney): pay rates and prices are in here.

import { cycleStatus } from './program'
import { addDays, mondayOf, toMinutes } from './time'
import type { Center, Coach, Session } from './types'
import { isActive } from './validate'

/** Length of the session block in hours. */
export function sessionHours(s: Pick<Session, 'start' | 'end'>): number {
  return (toMinutes(s.end) - toMinutes(s.start)) / 60
}

/** Each running session's share of its center's cycle price, by session id. */
export function sessionPrices(centers: Center[], sessions: Session[]): Map<string, number> {
  const prices = new Map<string, number>()
  for (const c of centers) {
    if (!c.terms) continue
    const st = cycleStatus(c.terms, sessions.filter((s) => s.centerId === c.id), '')
    for (const s of st.sessions) prices.set(s.id, c.terms.cycleRate / st.total)
  }
  return prices
}

/** One coach on one session: a line on the payroll. */
export interface PayLine {
  sessionId: string
  date: string
  territoryId: string
  centerId: string
  coachId: string
  start: string
  end: string
  hours: number
  rate: number
  pay: number
  delivered: boolean
}

export interface PayTotals {
  /** Sessions that run in the range. */
  sessions: number
  /** Paid coach-hours (two coaches on a 1-hour session = 2). */
  hours: number
  pay: number
  revenue: number
  /** revenue − pay */
  margin: number
  /** Running sessions with nobody assigned: their pay isn't counted yet. */
  unstaffed: number
}

export interface CoachPay {
  coachId: string
  sessions: number
  hours: number
  rate: number
  pay: number
  deliveredHours: number
  scheduledHours: number
}

export interface CenterPay extends PayTotals {
  centerId: string
  territoryId: string
}

export interface WeekPay {
  monday: string
  pay: number
  revenue: number
  margin: number
  hours: number
}

export interface PayReport {
  from: string
  to: string
  totals: PayTotals
  delivered: PayTotals
  scheduled: PayTotals
  byTerritory: (PayTotals & { territoryId: string })[]
  byCoach: CoachPay[]
  byCenter: CenterPay[]
  lines: PayLine[]
}

export interface PayInput {
  sessions: Session[]
  coaches: Coach[]
  centers: Center[]
}

const empty = (): PayTotals => ({ sessions: 0, hours: 0, pay: 0, revenue: 0, margin: 0, unstaffed: 0 })

function add(t: PayTotals, s: Session, lines: PayLine[], price: number) {
  t.sessions++
  t.revenue += price
  if (!s.assignments.length) t.unstaffed++
  for (const l of lines) {
    t.hours += l.hours
    t.pay += l.pay
  }
  t.margin = t.revenue - t.pay
}

/** Payroll lines for running sessions in [from, to] (inclusive). */
export function payLines(input: Pick<PayInput, 'sessions' | 'coaches'>, from: string, to: string, today: string): PayLine[] {
  const out: PayLine[] = []
  for (const s of input.sessions) {
    if (!isActive(s) || s.date < from || s.date > to) continue
    const hours = sessionHours(s)
    for (const a of s.assignments) {
      const rate = input.coaches.find((c) => c.id === a.coachId)?.payRate ?? 0
      out.push({
        sessionId: s.id,
        date: s.date,
        territoryId: s.territoryId,
        centerId: s.centerId,
        coachId: a.coachId,
        start: s.start,
        end: s.end,
        hours,
        rate,
        pay: hours * rate,
        delivered: s.date < today,
      })
    }
  }
  return out.sort((a, b) => (a.date + a.start + a.coachId).localeCompare(b.date + b.start + b.coachId))
}

/**
 * Hours, pay, revenue and margin for [from, to]. `input.sessions` should
 * already be limited to what the viewer may see; prices need every session of
 * a center (to place each one in its cycle), so pass `allSessions` when the
 * list has been filtered further (e.g. to one territory).
 */
export function payReport(input: PayInput, from: string, to: string, today: string, allSessions = input.sessions): PayReport {
  const prices = sessionPrices(input.centers, allSessions)
  const lines = payLines(input, from, to, today)
  const linesBySession = new Map<string, PayLine[]>()
  for (const l of lines) linesBySession.set(l.sessionId, [...(linesBySession.get(l.sessionId) ?? []), l])

  const totals = empty()
  const delivered = empty()
  const scheduled = empty()
  const territories = new Map<string, PayTotals>()
  const centers = new Map<string, CenterPay>()

  for (const s of input.sessions) {
    if (!isActive(s) || s.date < from || s.date > to) continue
    const mine = linesBySession.get(s.id) ?? []
    const price = prices.get(s.id) ?? 0
    add(totals, s, mine, price)
    add(s.date < today ? delivered : scheduled, s, mine, price)
    if (!territories.has(s.territoryId)) territories.set(s.territoryId, empty())
    add(territories.get(s.territoryId)!, s, mine, price)
    if (!centers.has(s.centerId)) centers.set(s.centerId, { ...empty(), centerId: s.centerId, territoryId: s.territoryId })
    add(centers.get(s.centerId)!, s, mine, price)
  }

  const coaches = new Map<string, CoachPay>()
  for (const l of lines) {
    const c = coaches.get(l.coachId) ?? { coachId: l.coachId, sessions: 0, hours: 0, rate: l.rate, pay: 0, deliveredHours: 0, scheduledHours: 0 }
    c.sessions++
    c.hours += l.hours
    c.pay += l.pay
    if (l.delivered) c.deliveredHours += l.hours
    else c.scheduledHours += l.hours
    coaches.set(l.coachId, c)
  }

  return {
    from,
    to,
    totals,
    delivered,
    scheduled,
    byTerritory: [...territories].map(([territoryId, t]) => ({ ...t, territoryId })).sort((a, b) => b.pay - a.pay),
    byCoach: [...coaches.values()].sort((a, b) => b.pay - a.pay || a.coachId.localeCompare(b.coachId)),
    byCenter: [...centers.values()].sort((a, b) => a.margin - b.margin),
    lines,
  }
}

/** Week-by-week pay and revenue (Monday to Sunday), `weeks` weeks from `firstMonday`. */
export function weeklyPay(input: PayInput, firstMonday: string, weeks: number, today: string, allSessions = input.sessions): WeekPay[] {
  const out: WeekPay[] = []
  for (let w = 0; w < weeks; w++) {
    const monday = addDays(mondayOf(firstMonday), w * 7)
    const { totals } = payReport(input, monday, addDays(monday, 6), today, allSessions)
    out.push({ monday, pay: totals.pay, revenue: totals.revenue, margin: totals.margin, hours: totals.hours })
  }
  return out
}

/** Pay periods are 3 weeks, Monday to Sunday, counted from this Monday. */
export const PAY_CYCLE_START = '2026-01-05'
export const PAY_CYCLE_DAYS = 21

/** First and last day of the 3-week pay period a date falls in. */
export function payCycleRange(date: string): { from: string; to: string } {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${PAY_CYCLE_START}T00:00:00Z`)) / 864e5)
  const from = addDays(PAY_CYCLE_START, Math.floor(days / PAY_CYCLE_DAYS) * PAY_CYCLE_DAYS)
  return { from, to: addDays(from, PAY_CYCLE_DAYS - 1) }
}

/** First and last day of the month a date falls in. */
export function monthRange(date: string): { from: string; to: string } {
  const from = `${date.slice(0, 7)}-01`
  const [y, m] = from.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return { from, to: addDays(next, -1) }
}

/** Margin as a share of revenue, or undefined when nothing was earned. */
export function marginShare(t: Pick<PayTotals, 'revenue' | 'margin'>): number | undefined {
  return t.revenue > 0 ? t.margin / t.revenue : undefined
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** Payroll lines as CSV, one row per coach per session. */
export function payrollCsv(lines: PayLine[], names: { coach: (id: string) => string; level: (id: string) => string; center: (id: string) => string; territory: (id: string) => string }): string {
  const head = ['Date', 'Territory', 'Center', 'Coach', 'Level', 'Start', 'End', 'Hours', 'Rate', 'Pay', 'Delivered or scheduled']
  const rows = lines.map((l) => [
    l.date,
    names.territory(l.territoryId),
    names.center(l.centerId),
    names.coach(l.coachId),
    names.level(l.coachId),
    l.start,
    l.end,
    +l.hours.toFixed(2),
    l.rate.toFixed(2),
    l.pay.toFixed(2),
    l.delivered ? 'Delivered' : 'Scheduled',
  ])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n'
}
