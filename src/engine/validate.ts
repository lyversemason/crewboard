// The constraint validation engine. Given a session and a proposed crew, it
// returns every rule the crew breaks. Managers' assignment screen and the
// sales intake coverage check both call this same code.

import { transitMinutes } from './geo'
import { overlaps, prettyTime, toMinutes, weekdayOf } from './time'
import type { Center, Coach, Session, Settings, Violation, World } from './types'

export const OVERRIDE_PREFIX = 'Are you sure you want to override this constraint?'

export const WARNINGS = {
  travel: `${OVERRIDE_PREFIX} Warning: This assignment violates calculated travel time between centers.`,
  ratio: `${OVERRIDE_PREFIX} Warning: This group size violates the 1:12 capacity ratio without an additional coach.`,
  no_lead: `${OVERRIDE_PREFIX} Warning: No certified Lead Coach is assigned to this session block.`,
  unavailable: `${OVERRIDE_PREFIX} Warning: This coach has not marked themselves available for this time block.`,
} as const

/** Sessions that still occupy a coach's time. */
export function isActive(s: Session): boolean {
  return s.status === 'pending' || s.status === 'confirmed'
}

export function largestGroup(session: Pick<Session, 'groups'>): number {
  return session.groups.reduce((max, g) => Math.max(max, g.players), 0)
}

/** Trainees shadow; they don't count toward the coach-to-child ratio. */
export function countsTowardRatio(c: Coach): boolean {
  return c.level === 'lead' || c.level === 'assistant'
}

export function coachesNeeded(players: number, perCoach: number): number {
  return Math.max(1, Math.ceil(players / perCoach))
}

/** True when the coach's weekly availability covers the whole block. */
export function isAvailable(coach: Coach, date: string, start: string, end: string): boolean {
  const hours = coach.availability[weekdayOf(date)] ?? []
  const from = Math.floor(toMinutes(start) / 60)
  const to = Math.ceil(toMinutes(end) / 60)
  for (let h = from; h < to; h++) if (!hours.includes(h)) return false
  return true
}

type Slot = Pick<Session, 'id' | 'territoryId' | 'date' | 'start' | 'end' | 'groups'> & {
  /** Where the slot happens. Sales intake has a location before a center record exists. */
  location: { lat: number; lng: number }
}

function slotOf(session: Session, centers: Center[]): Slot {
  const center = centers.find((c) => c.id === session.centerId)
  if (!center) throw new Error(`Session ${session.id} points at unknown center ${session.centerId}`)
  return { ...session, location: center }
}

/**
 * Rules that depend on one coach's own calendar: overlap, travel, availability.
 * `others` are the coach's other active sessions.
 */
export function checkCoachTime(coach: Coach, slot: Slot, world: World): Violation[] {
  const out: Violation[] = []
  const { settings } = world

  if (coach.territoryId !== slot.territoryId) {
    out.push({
      code: 'wrong_territory',
      severity: 'block',
      message: `${coach.name} is on a different territory's roster.`,
      detail: 'Coaches can only work sessions in their own territory.',
      coachId: coach.id,
    })
  }
  if (!coach.active) {
    out.push({
      code: 'inactive',
      severity: 'block',
      message: `${coach.name} is not an active coach.`,
      detail: 'Reactivate them on the roster first.',
      coachId: coach.id,
    })
  }

  const start = toMinutes(slot.start)
  const end = toMinutes(slot.end)
  const sameDay = world.sessions.filter(
    (s) =>
      s.id !== slot.id &&
      s.date === slot.date &&
      isActive(s) &&
      s.assignments.some((a) => a.coachId === coach.id),
  )

  for (const other of sameDay) {
    const oStart = toMinutes(other.start)
    const oEnd = toMinutes(other.end)
    const otherCenter = world.centers.find((c) => c.id === other.centerId)
    const otherName = otherCenter?.name ?? 'another center'

    if (overlaps(start, end, oStart, oEnd)) {
      out.push({
        code: 'overlap',
        severity: 'block',
        message: `${coach.name} is already booked at that time.`,
        detail: `Overlaps ${otherName}, ${prettyTime(other.start)}-${prettyTime(other.end)}.`,
        coachId: coach.id,
        otherSessionId: other.id,
      })
      continue
    }
    if (!otherCenter) continue
    const drive = transitMinutes(otherCenter, slot.location, settings.avgSpeedMph)
    if (drive === 0) continue // same building: no travel rule
    const needed = drive + settings.bufferMinutes
    const gap = oEnd <= start ? start - oEnd : oStart - end
    if (gap < needed) {
      out.push({
        code: 'travel',
        severity: 'override',
        message: WARNINGS.travel,
        detail: `${coach.name}: ${gap} min between ${otherName} (${prettyTime(other.start)}-${prettyTime(other.end)}) and this session; needs ${needed} (${drive} drive + ${settings.bufferMinutes} buffer).`,
        coachId: coach.id,
        otherSessionId: other.id,
      })
    }
  }

  if (!isAvailable(coach, slot.date, slot.start, slot.end)) {
    out.push({
      code: 'unavailable',
      severity: 'override',
      message: WARNINGS.unavailable,
      detail: `${coach.name} is not marked available ${prettyTime(slot.start)}-${prettyTime(slot.end)} on that weekday.`,
      coachId: coach.id,
    })
  }
  return out
}

/** Rules about the crew as a whole: a lead coach on site, and enough coaches. */
export function checkCrewShape(crew: Coach[], slot: Pick<Slot, 'groups'>, settings: Settings): Violation[] {
  const out: Violation[] = []

  if (!crew.some((c) => c.level === 'lead')) {
    out.push({
      code: 'no_lead',
      severity: 'override',
      message: WARNINGS.no_lead,
      detail:
        crew.length === 0
          ? 'Nobody is assigned.'
          : 'Assistants and trainees cannot run a session without a lead coach.',
    })
  }

  const kids = largestGroup(slot)
  const counted = crew.filter(countsTowardRatio).length
  const needed = coachesNeeded(kids, settings.ratio)
  const floor = coachesNeeded(kids, settings.maxOverrideRatio)
  if (counted < floor) {
    out.push({
      code: 'ratio_max',
      severity: 'block',
      message:
        counted === 0
          ? `No coach here counts toward the 1:${settings.ratio} ratio. Trainees are extra hands, so this group of ${kids} needs a lead or assistant.`
          : `A group of ${kids} with ${counted} counted coach${counted > 1 ? 'es' : ''} is over ${settings.maxOverrideRatio} children per coach, even with an override.`,
      detail: `Needs at least ${floor} counted coach${floor > 1 ? 'es' : ''}; has ${counted}. Trainees don't count toward the ratio.`,
    })
  } else if (counted < needed) {
    out.push({
      code: 'ratio',
      severity: 'override',
      message: WARNINGS.ratio,
      detail: `Largest group is ${kids} children; 1:${settings.ratio} needs ${needed} counted coaches, has ${counted}.`,
    })
  }
  return out
}

/** Every violation for putting `crewIds` on `session`. Empty array = all clear. */
export function validateCrew(session: Session, crewIds: string[], world: World): Violation[] {
  const slot = slotOf(session, world.centers)
  const crew = crewIds.map((id) => {
    const coach = world.coaches.find((c) => c.id === id)
    if (!coach) throw new Error(`Unknown coach ${id}`)
    return coach
  })
  return [...crew.flatMap((c) => checkCoachTime(c, slot, world)), ...checkCrewShape(crew, slot, world.settings)]
}

export function hasBlock(violations: Violation[]): boolean {
  return violations.some((v) => v.severity === 'block')
}

/** Violations of the crew currently on a session, for warning badges. */
export function currentIssues(session: Session, world: World): Violation[] {
  if (!isActive(session) || session.assignments.length === 0) return []
  return validateCrew(
    session,
    session.assignments.map((a) => a.coachId),
    world,
  )
}

/**
 * Issues a manager still needs to look at: current issues minus the ones
 * already overridden. A travel override on either of the two sessions
 * involved covers that pair.
 */
export function openIssues(session: Session, world: World): Violation[] {
  const overridden = (s: Session | undefined, code: string) => !!s?.overrides.some((o) => o.code === code)
  return currentIssues(session, world).filter((v) => {
    if (v.severity === 'block') return true
    if (overridden(session, v.code)) return false
    if (v.code === 'travel' && overridden(world.sessions.find((s) => s.id === v.otherSessionId), 'travel')) return false
    return true
  })
}

export type { Slot }
