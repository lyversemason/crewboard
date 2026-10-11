// The demo company is rebuilt for whatever week a visitor opens it, so check
// that it's valid and has every showcase case across a year of dates.

import { describe, expect, it } from 'vitest'
import { buildDemo } from '../src/data/seed'
import { addDays, cycleStatus, hasConfirmedWeek, openIssues, planningWeek, weekdayOf } from '../src/engine'

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
      // The Thursday + Friday program: three Thursdays cancelled, all made up, so it ends three weeks late.
      const skipped = d.centers.find((c) => c.terms?.weekdays.join() === '4,5' && c.id === 'lou-c1')!
      const mine = d.sessions.filter((s) => s.centerId === skipped.id)
      expect(mine.filter((s) => s.status === 'cancelled' && s.cancelReason === 'facility_closed' && weekdayOf(s.date) === 4).length).toBe(3)
      const st = cycleStatus(skipped.terms!, mine, day)
      expect(st.needsMakeUp).toBe(0)
      expect(st.endsOn).toBe(addDays(st.plannedEnd!, 20))
      // Clover Patch (the open sales intake) starts Fridays a week after Thursdays.
      const clover = d.centers.find((c) => c.id === 'lou-c8')!
      expect(clover.terms!.firstDates![5]).toBe(addDays(clover.terms!.firstDates![4]!, 8))
    })
  }
})
