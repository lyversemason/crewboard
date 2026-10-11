// When a coach can work: their usual week, replaced by a one-week change if
// they made one, and nothing at all on a day off. Coaches own this data;
// managers only read it.

import { addDays, mondayOf, toMinutes, weekdayOf } from './time'
import type { Coach, TimeOff, Weekday } from './types'

export function timeOffOn(coach: Pick<Coach, 'timeOff'>, date: string): TimeOff | undefined {
  return coach.timeOff.find((t) => t.from <= date && date <= t.to)
}

/** The hours a coach is free on one date. */
export function hoursOn(coach: Pick<Coach, 'availability' | 'weekChanges' | 'timeOff'>, date: string): number[] {
  if (timeOffOn(coach, date)) return []
  const day = weekdayOf(date)
  const change = coach.weekChanges[mondayOf(date)]
  return (change ?? coach.availability)[day] ?? []
}

/** True when the coach is free for the whole block on that date. */
export function isAvailable(coach: Pick<Coach, 'availability' | 'weekChanges' | 'timeOff'>, date: string, start: string, end: string): boolean {
  const hours = hoursOn(coach, date)
  const from = Math.floor(toMinutes(start) / 60)
  const to = Math.ceil(toMinutes(end) / 60)
  for (let h = from; h < to; h++) if (!hours.includes(h)) return false
  return true
}

/** Coaches confirm their availability once a week, for the week being planned. */
export function hasConfirmedWeek(coach: Pick<Coach, 'availabilityConfirmedWeek'>, week: string): boolean {
  return !!coach.availabilityConfirmedWeek && coach.availabilityConfirmedWeek >= week
}

/** Days off and one-week changes that are still ahead (older ones expire on their own). */
export function upcomingTimeOff(coach: Pick<Coach, 'timeOff'>, today: string): TimeOff[] {
  return coach.timeOff.filter((t) => t.to >= today).sort((a, b) => a.from.localeCompare(b.from))
}

/** The hours a coach can actually work each day of one week (changes and days off applied). */
export function weekHours(coach: Pick<Coach, 'availability' | 'weekChanges' | 'timeOff'>, monday: string): Record<Weekday, number[]> {
  const out = {} as Record<Weekday, number[]>
  for (let d = 1; d <= 6; d++) out[d as Weekday] = hoursOn(coach, addDays(monday, d - 1))
  return out
}
