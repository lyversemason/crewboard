import { describe, expect, it } from 'vitest'
import { cycleStatus, endingSoon, programDates, sessionNumber } from '../src/engine'
import type { ProgramTerms } from '../src/engine'
import { session } from './fixtures'

// 2026-10-13 is a Tuesday.
const terms: ProgramTerms = { startDate: '2026-10-13', cycleWeeks: 4, weekdays: [2, 4], cycleRate: 1600 }

describe('program cycles', () => {
  it('lists every planned date: each chosen weekday, week by week', () => {
    expect(programDates(terms)).toEqual([
      '2026-10-13', '2026-10-15', '2026-10-20', '2026-10-22',
      '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05',
    ])
  })

  it('starts on the start date even when it falls mid-week', () => {
    // Starts on a Thursday with Tue+Thu: the first Tuesday is skipped, so the cycle runs a week longer.
    const dates = programDates({ ...terms, startDate: '2026-10-15' })
    expect(dates[0]).toBe('2026-10-15')
    expect(dates.length).toBe(8)
    expect(dates.at(-1)).toBe('2026-11-10')
  })

  const sessionsFor = (dates: string[]) => dates.map((date, i) => session(`s${i + 1}`, { date }))

  it('numbers sessions and reads the real end from the sessions', () => {
    const st = cycleStatus(terms, sessionsFor(programDates(terms)), '2026-10-21')
    expect(st.total).toBe(8)
    expect(sessionNumber(st, 's3')).toBe(3)
    expect(st.endsOn).toBe('2026-11-05')
    expect(st.plannedEnd).toBe('2026-11-05')
    expect(st.delivered).toBe(3)
  })

  it('a reschedule past the planned end pushes the cycle out', () => {
    const list = sessionsFor(programDates(terms))
    list[2] = { ...list[2], status: 'rescheduled', rescheduledToId: 's9' }
    list.push(session('s9', { date: '2026-11-10' }))
    const st = cycleStatus(terms, list, '2026-10-21')
    expect(st.endsOn).toBe('2026-11-10')
    expect(st.plannedEnd).toBe('2026-11-05')
    // The moved session is now the last one; the one after the original moves up.
    expect(sessionNumber(st, 's4')).toBe(3)
    expect(sessionNumber(st, 's9')).toBe(8)
  })

  it('a cancellation with no make-up is flagged', () => {
    const list = sessionsFor(programDates(terms))
    list[1] = { ...list[1], status: 'cancelled', cancelReason: 'weather' }
    const st = cycleStatus(terms, list, '2026-10-21')
    expect(st.needsMakeUp).toBe(1)
    expect(endingSoon(st, '2026-11-01')).toBe(false)
  })

  it('flags cycles ending within two weeks for renewal', () => {
    const st = cycleStatus(terms, sessionsFor(programDates(terms)), '2026-10-21')
    expect(endingSoon(st, '2026-10-21')).toBe(false)
    expect(endingSoon(st, '2026-10-26')).toBe(true)
  })
})
