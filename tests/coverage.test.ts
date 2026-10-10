import { describe, expect, it } from 'vitest'
import { checkCoverage, suggestSlots, weeklyDates } from '../src/engine'
import type { CoverageRequest } from '../src/engine'
import { MON, centerA, centerB, coach, crew, session, world } from './fixtures'

const req = (over: Partial<CoverageRequest> = {}): CoverageRequest => ({
  territoryId: 'lou',
  location: centerB,
  dates: [MON],
  start: '10:00',
  end: '11:00',
  groups: [{ players: 10, ageRange: '3-4', minutes: 60 }],
  ...over,
})

describe('sales intake coverage check', () => {
  it('passes when a free lead exists, and never assigns anyone', () => {
    const w = world()
    const before = JSON.stringify(w)
    const r = checkCoverage(req(), w)
    expect(r.ok).toBe(true)
    expect(r.dates[0].exampleCrew).toHaveLength(1)
    expect(JSON.stringify(w)).toBe(before)
  })

  it('fails when every lead is busy, even if assistants are free', () => {
    const w = world({
      sessions: [session('x', { assignments: crew('lead1') }), session('y', { assignments: crew('lead2') })],
    })
    const r = checkCoverage(req(), w)
    expect(r.ok).toBe(false)
    expect(r.dates[0].reason).toBe('No lead coach is free.')
  })

  it('needs two counted coaches for a group of 13', () => {
    const w = world({ coaches: [coach('lead1', 'lead'), coach('trainee1', 'trainee')] })
    const r = checkCoverage(req({ groups: [{ players: 13, ageRange: '5', minutes: 60 }] }), w)
    expect(r.ok).toBe(false)
    expect(r.dates[0].reason).toBe('Needs 2 coaches, 1 free.')
  })

  it('treats travel time as a hard rule (no overrides in sales)', () => {
    // Both leads finish at center A at 09:45; B starts at 10:00, too soon to drive.
    const w = world({
      coaches: [coach('lead1', 'lead'), coach('lead2', 'lead')],
      sessions: [session('x', { start: '09:00', end: '09:45', assignments: crew('lead1', 'lead2') })],
    })
    expect(checkCoverage(req(), w).ok).toBe(false)
    // The same request at center A itself is fine (no driving).
    expect(checkCoverage(req({ location: centerA }), w).ok).toBe(true)
  })

  it('treats availability as a hard rule', () => {
    const w = world({ coaches: [coach('lead1', 'lead', { availability: { 1: [], 2: [9, 10], 3: [], 4: [], 5: [], 6: [] } })] })
    expect(checkCoverage(req(), w).ok).toBe(false)
  })

  it('fails the whole request if any one week cannot be staffed', () => {
    const dates = weeklyDates(MON, 4)
    const w = world({
      coaches: [coach('lead1', 'lead')],
      sessions: [session('wk3', { date: dates[2], assignments: crew('lead1') })],
    })
    const r = checkCoverage(req({ dates }), w)
    expect(r.ok).toBe(false)
    expect(r.dates.map((d) => d.ok)).toEqual([true, true, false, true])
    expect(r.reason).toBe("1 of 4 dates can't be staffed.")
  })

  it('rejects an end time before the start time', () => {
    expect(checkCoverage(req({ start: '11:00', end: '10:00' }), world()).ok).toBe(false)
  })

  it('suggests open alternative slots that do pass', () => {
    const w = world({
      coaches: [coach('lead1', 'lead')],
      sessions: [session('x', { centerId: 'B', start: '10:00', end: '11:00', assignments: crew('lead1') })],
    })
    expect(checkCoverage(req(), w).ok).toBe(false)
    const s = suggestSlots(req(), w)
    expect(s.length).toBeGreaterThan(0)
    for (const alt of s) {
      expect(checkCoverage(req({ dates: weeklyDates(alt.firstDate, 1), start: alt.start, end: alt.end }), w).ok).toBe(true)
    }
    // Closest times on the same weekday come first.
    expect(s[0].firstDate).toBe(MON)
  })
})

describe('weeklyDates', () => {
  it('repeats every 7 days', () => {
    expect(weeklyDates('2026-10-12', 3)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
  })
})
