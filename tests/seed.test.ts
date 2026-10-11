// The demo company is rebuilt for whatever week a visitor opens it, so check
// that it's valid and has every showcase case across a year of dates.

import { describe, expect, it } from 'vitest'
import { buildDemo } from '../src/data/seed'
import { addDays, cycleStatus, hasConfirmedWeek, openIssues, planningWeek } from '../src/engine'

describe('demo data across a year', () => {
  for (let i = 0; i < 365; i += 5) {
    const day = addDays('2026-10-10', i)
    it(day, () => {
      const d = buildDemo(day)
      expect(d.sessions.some((s) => s.status === 'rescheduled')).toBe(true)
      expect(d.sessions.some((s) => s.status === 'cancelled')).toBe(true)
      expect(d.sessions.some((s) => s.overrides.some((o) => o.code === 'travel'))).toBe(true)
      expect(d.sessions.some((s) => s.overrides.some((o) => o.code === 'ratio'))).toBe(true)
      expect(d.sessions.flatMap((s) => openIssues(s, d)).filter((v) => v.severity === 'block')).toEqual([])
      // A cycle pushed back by a make-up session, a coach's vacation, and coaches
      // on both sides of the weekly availability check.
      const pushed = d.centers.filter((c) => c.terms).some((c) => {
        const st = cycleStatus(c.terms!, d.sessions.filter((s) => s.centerId === c.id), day)
        return st.endsOn! > st.plannedEnd!
      })
      expect(pushed).toBe(true)
      expect(d.coaches.some((c) => c.timeOff.length)).toBe(true)
      const week = planningWeek(day)
      expect(d.coaches.some((c) => hasConfirmedWeek(c, week)) && d.coaches.some((c) => !hasConfirmedWeek(c, week))).toBe(true)
    })
  }
})
