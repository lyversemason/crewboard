import { describe, expect, it } from 'vitest'
import { hasConfirmedWeek, hoursOn, isAvailable, validateCrew } from '../src/engine'
import { MON, coach, session, world } from './fixtures'

describe('coach availability', () => {
  it('a one-week change replaces the usual week for that week only', () => {
    const c = coach('lead1', 'lead', { weekChanges: { [MON]: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } } })
    expect(hoursOn(c, MON)).toEqual([])
    expect(hoursOn(c, '2026-10-19')).toContain(10)
  })

  it('days off block the whole day, inclusive of both ends', () => {
    const c = coach('lead1', 'lead', { timeOff: [{ id: 't1', from: MON, to: '2026-10-14', note: 'Vacation' }] })
    expect(isAvailable(c, MON, '10:00', '11:00')).toBe(false)
    expect(isAvailable(c, '2026-10-14', '10:00', '11:00')).toBe(false)
    expect(isAvailable(c, '2026-10-15', '10:00', '11:00')).toBe(true)
  })

  it('the rules engine says why: a day off, with its note', () => {
    const w = world({ coaches: [coach('lead1', 'lead', { timeOff: [{ id: 't1', from: MON, to: MON, note: 'Vacation' }] })] })
    const v = validateCrew(session('s'), ['lead1'], w)
    expect(v.map((x) => x.code)).toEqual(['unavailable'])
    expect(v[0].detail).toBe('lead1 has that day off (Vacation).')
  })

  it('weekly confirmation counts for the week being planned (or later)', () => {
    expect(hasConfirmedWeek(coach('a', 'lead', { availabilityConfirmedWeek: MON }), MON)).toBe(true)
    expect(hasConfirmedWeek(coach('a', 'lead', { availabilityConfirmedWeek: '2026-10-05' }), MON)).toBe(false)
    expect(hasConfirmedWeek(coach('a', 'lead'), MON)).toBe(false)
  })
})
