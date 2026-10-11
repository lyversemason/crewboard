// Date and time helpers. Dates are plain 'YYYY-MM-DD' strings and times are
// 'HH:MM' strings so nothing shifts when the viewer's time zone differs.

import type { Weekday } from './types'

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function parse(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(date: string): number {
  return parse(date).getUTCDay()
}

export function isWorkday(date: string): boolean {
  return dayOfWeek(date) !== 0
}

export function weekdayOf(date: string): Weekday {
  const d = dayOfWeek(date)
  if (d === 0) throw new Error(`${date} is a Sunday; sessions run Monday-Saturday`)
  return d as Weekday
}

/** The Monday on or before the given date. */
export function mondayOf(date: string): string {
  const d = dayOfWeek(date)
  return addDays(date, d === 0 ? -6 : 1 - d)
}

/** The week a scheduler cares about: this week, or next week once it's the weekend. */
export function planningWeek(today: string): string {
  const d = dayOfWeek(today)
  return d === 0 || d === 6 ? addDays(mondayOf(today), 7) : mondayOf(today)
}

export function todayLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export function prettyTime(hhmm: string): string {
  const mins = toMinutes(hhmm)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

/** "Mon Oct 12, 11:30am–12:15pm" */
export function slotLabel(date: string, start: string, end: string): string {
  return `${prettyDate(date)}, ${prettyTime(start)}–${prettyTime(end)}`
}

export function prettyDate(date: string): string {
  const d = parse(date)
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`
}
