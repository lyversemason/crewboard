// Sales intake's live check: "can our current roster cover this slot?"
// It reuses the scheduling engine's rules with NO overrides allowed, and it
// never assigns anyone: it only proves a qualified crew exists on every date.

import { addDays, fromMinutes, toMinutes, weekdayOf } from './time'
import { checkCoachTime, checkCrewShape, coachesNeeded, countsTowardRatio, largestGroup } from './validate'
import type { Slot } from './validate'
import type { Coach, Group, Weekday, World } from './types'

export interface CoverageRequest {
  territoryId: string
  location: { lat: number; lng: number }
  dates: string[]
  start: string
  end: string
  groups: Group[]
}

export interface DateCoverage {
  date: string
  ok: boolean
  /** One example crew that would work. Not an assignment. */
  exampleCrew: string[]
  /** How many coaches passed the time rules that day. */
  freeCoaches: number
  reason?: string
}

export interface CoverageResult {
  ok: boolean
  dates: DateCoverage[]
  reason?: string
}

/** Coaches who could work this slot: right territory, free, and able to get there. */
export function eligibleCoaches(slot: Slot, world: World): Coach[] {
  return world.coaches.filter(
    (c) => c.territoryId === slot.territoryId && c.active && checkCoachTime(c, slot, world).length === 0,
  )
}

/** Smallest crew that satisfies lead + ratio from the eligible pool, or null. */
export function pickCrew(pool: Coach[], groups: Group[], world: World): Coach[] | null {
  const lead = pool.find((c) => c.level === 'lead')
  if (!lead) return null
  const needed = coachesNeeded(largestGroup({ groups }), world.settings.ratio)
  const others = pool.filter((c) => c.id !== lead.id && countsTowardRatio(c))
  // Prefer assistants as the extra coaches so leads stay free for other sites.
  others.sort((a, b) => (a.level === b.level ? 0 : a.level === 'assistant' ? -1 : 1))
  const crew = [lead, ...others.slice(0, needed - 1)]
  return checkCrewShape(crew, { groups }, world.settings).length === 0 ? crew : null
}

export function checkCoverage(req: CoverageRequest, world: World): CoverageResult {
  if (req.dates.length === 0) return { ok: false, dates: [], reason: 'Pick at least one date.' }
  if (req.groups.length === 0) return { ok: false, dates: [], reason: 'Add at least one group of kids.' }
  if (toMinutes(req.end) <= toMinutes(req.start)) return { ok: false, dates: [], reason: 'End time must be after start time.' }

  const dates = req.dates.map((date): DateCoverage => {
    const slot: Slot = { id: '__intake__', territoryId: req.territoryId, date, start: req.start, end: req.end, groups: req.groups, location: req.location }
    const pool = eligibleCoaches(slot, world)
    const crew = pickCrew(pool, req.groups, world)
    if (crew) return { date, ok: true, exampleCrew: crew.map((c) => c.id), freeCoaches: pool.length }
    const leads = pool.filter((c) => c.level === 'lead').length
    const reason =
      pool.length === 0
        ? 'No coach is free and able to get there.'
        : leads === 0
          ? 'No lead coach is free.'
          : `Not enough coaches for a group of ${largestGroup(req)} at 1:${world.settings.ratio}.`
    return { date, ok: false, exampleCrew: [], freeCoaches: pool.length, reason }
  })

  const bad = dates.filter((d) => !d.ok)
  return {
    ok: bad.length === 0,
    dates,
    reason: bad.length ? `${bad.length} of ${dates.length} dates can't be staffed.` : undefined,
  }
}

/** Weekly dates starting from `first`. */
export function weeklyDates(first: string, weeks: number): string[] {
  return Array.from({ length: weeks }, (_, i) => addDays(first, i * 7))
}

export interface SlotSuggestion {
  weekday: Weekday
  firstDate: string
  start: string
  end: string
}

/**
 * Open slots the rep can offer instead: same length, same number of weeks,
 * nearest times first on the requested weekday, then other weekdays.
 */
export function suggestSlots(req: CoverageRequest, world: World, limit = 5): SlotSuggestion[] {
  if (req.dates.length === 0) return []
  const length = toMinutes(req.end) - toMinutes(req.start)
  if (length <= 0) return []
  const first = req.dates[0]
  const weeks = req.dates.length
  const wanted = toMinutes(req.start)
  const baseDay = weekdayOf(first)

  const candidates: { s: SlotSuggestion; score: number }[] = []
  for (let offset = 0; offset < 6; offset++) {
    const day = (((baseDay - 1 + offset) % 6) + 1) as Weekday
    const firstDate = addDays(first, (day - baseDay + 7) % 7)
    for (let t = 9 * 60; t + length <= 18 * 60; t += 30) {
      const start = fromMinutes(t)
      const end = fromMinutes(t + length)
      if (offset === 0 && start === req.start) continue
      candidates.push({ s: { weekday: day, firstDate, start, end }, score: offset * 1000 + Math.abs(t - wanted) })
    }
  }
  candidates.sort((a, b) => a.score - b.score)

  const out: SlotSuggestion[] = []
  for (const { s } of candidates) {
    if (out.length >= limit) break
    const result = checkCoverage({ ...req, dates: weeklyDates(s.firstDate, weeks), start: s.start, end: s.end }, world)
    if (result.ok) out.push(s)
  }
  return out
}
