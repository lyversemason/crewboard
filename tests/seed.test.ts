// The demo company is rebuilt for whatever week a visitor opens it, so check
// that it's valid and has every showcase case across a year of dates.

import { describe, expect, it } from 'vitest'
import { buildDemo } from '../src/data/seed'
import { addDays, openIssues } from '../src/engine'

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
    })
  }
})
