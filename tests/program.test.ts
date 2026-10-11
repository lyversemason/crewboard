import { describe, expect, it } from 'vitest'
import { addDays, cycleStatus, dayProblems, endingSoon, plannedSessions, programDates, scheduleLabel, sessionNumber, termsFromDays, weekdayOf } from '../src/engine'
import type { CycleWeeks, ProgramDay, ProgramTerms, Session } from '../src/engine'
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

// Programs that run more than one day a week, the way centers really buy them.
describe('multi-day programs', () => {
  const thu = '2026-10-15' // a Thursday
  const fri = '2026-10-16'
  const groups = [{ players: 10, ageRange: '3-4', minutes: 30 }]
  const day = (firstDate: string, over: Partial<ProgramDay> = {}): ProgramDay => ({ weekday: weekdayOf(firstDate), firstDate, start: '10:00', end: '10:30', groups, ...over })
  const sessionsFor = (dates: string[]) => dates.map((date, i) => session(`s${i + 1}`, { date }))
  const status = (t: ProgramTerms, list: Session[], today = '2026-10-14') => cycleStatus(t, list, today)

  it('16 weeks, twice a week: 32 sessions, each day 16 weeks from its first date', () => {
    const t = termsFromDays([day(thu), day(fri)], 16, 4800)
    const dates = programDates(t)
    expect(dates.length).toBe(32)
    expect(dates.filter((d) => weekdayOf(d) === 4).length).toBe(16)
    expect(dates.at(-1)).toBe(addDays(fri, 15 * 7))
    expect(scheduleLabel(t)).toBe('Thursdays & Fridays')
  })

  it('a day can start a week later: Thursdays from the 15th, Fridays from the 23rd', () => {
    const t = termsFromDays([day(thu), day('2026-10-23')], 8, 2720)
    const dates = programDates(t)
    expect(dates.slice(0, 4)).toEqual(['2026-10-15', '2026-10-22', '2026-10-23', '2026-10-29'])
    expect(dates.length).toBe(16)
    expect(dates.at(-1)).toBe('2026-12-11') // the eighth Friday
    expect(scheduleLabel(t)).toBe('Thursdays from October 15 & Fridays from October 23')
  })

  it('each day keeps its own times and groups', () => {
    const plan = plannedSessions([day(thu), day(fri, { start: '13:00', end: '13:45', groups: [{ players: 12, ageRange: '4-5', minutes: 45 }] })], 2)
    expect(plan.map((p) => `${p.date} ${p.start}`)).toEqual(['2026-10-15 10:00', '2026-10-16 13:00', '2026-10-22 10:00', '2026-10-23 13:00'])
    expect(plan[1].groups[0].players).toBe(12)
  })

  for (const weeks of [8, 10, 12, 16] as CycleWeeks[]) {
    it(`${weeks} weeks, Thu + Fri, with a history of reschedules: the end moves out, the count stays`, () => {
      const t = termsFromDays([day(thu), day(fri)], weeks, 200 * weeks * 2)
      const list = sessionsFor(programDates(t))
      // Two sessions moved: one to a later date inside the cycle, one past the planned end.
      list[1] = { ...list[1], status: 'rescheduled', rescheduledToId: 'm1' }
      list.push(session('m1', { date: addDays(list[1].date, 1) }))
      list[4] = { ...list[4], status: 'rescheduled', rescheduledToId: 'm2' }
      const plannedEnd = programDates(t).at(-1)!
      list.push(session('m2', { date: addDays(plannedEnd, 7) }))
      const st = status(t, list)
      expect(st.total).toBe(weeks * 2)
      expect(st.sessions.length).toBe(weeks * 2)
      expect(st.needsMakeUp).toBe(0)
      expect(st.plannedEnd).toBe(plannedEnd)
      expect(st.endsOn).toBe(addDays(plannedEnd, 7))
      expect(sessionNumber(st, 'm2')).toBe(weeks * 2)
    })
  }

  it('first three Thursdays cancelled: three make-ups owed, then the cycle runs three weeks late', () => {
    const t = termsFromDays([day(thu), day(fri)], 8, 2720)
    const list = sessionsFor(programDates(t))
    const thursdays = list.filter((s) => weekdayOf(s.date) === 4).slice(0, 3)
    for (const s of thursdays) Object.assign(s, { status: 'cancelled', cancelReason: 'facility_closed' })
    let st = status(t, list, '2026-11-02')
    expect(st.needsMakeUp).toBe(3)
    expect(endingSoon(st, '2026-11-30')).toBe(false) // not up for renewal while sessions are owed

    const lastThursday = programDates(t).filter((d) => weekdayOf(d) === 4).at(-1)!
    ;[1, 2, 3].forEach((w) => list.push(session(`mu${w}`, { date: addDays(lastThursday, 7 * w) })))
    st = status(t, list, '2026-11-02')
    expect(st.needsMakeUp).toBe(0)
    expect(st.sessions.length).toBe(16)
    expect(st.plannedEnd).toBe('2026-12-04')
    expect(st.endsOn).toBe(addDays(lastThursday, 21))
    expect(st.delivered).toBe(3) // only the Fridays (Oct 16, 23, 30) happened before Nov 2
  })
})

describe('checking a program day', () => {
  const ok: ProgramDay = { weekday: 4, firstDate: '2026-10-15', start: '10:00', end: '10:30', groups: [{ players: 10, ageRange: '3-4', minutes: 30 }] }

  it('accepts a correct day', () => {
    expect(dayProblems(ok, '2026-10-11')).toEqual([])
  })

  it('refuses a first date on the wrong weekday', () => {
    // Thursday picked, but October 13, 2026 is a Tuesday.
    expect(dayProblems({ ...ok, firstDate: '2026-10-13' }, '2026-10-11')).toEqual(['October 13, 2026 is a Tuesday. Pick a Thursday.'])
  })

  it('refuses past dates, times outside 9-6, and groups longer than the session', () => {
    expect(dayProblems({ ...ok, firstDate: '2026-10-08' }, '2026-10-11')[0]).toMatch(/can’t be in the past/)
    expect(dayProblems({ ...ok, start: '17:45', end: '18:15' }, '2026-10-11')[0]).toMatch(/between 9am and 6pm/)
    expect(dayProblems({ ...ok, end: '10:15' }, '2026-10-11')[0]).toMatch(/add up to 30 minutes but the session is 15/)
  })
})
