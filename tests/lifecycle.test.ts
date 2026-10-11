import { describe, expect, it } from 'vitest'
import * as engine from '../src/engine'
import { LifecycleError, cancelSession, coachConfirm, confirmSession, rescheduleSession } from '../src/engine'
import { crew, session } from './fixtures'

const AT = '2026-10-10T20:00:00Z'

describe('session lifecycle', () => {
  it('pending -> confirmed', () => {
    const s = confirmSession(session('s', { status: 'pending' }), 'tm', AT)
    expect(s.status).toBe('confirmed')
    expect(s.history.at(-1)?.text).toContain('Confirmed')
  })

  it('cannot confirm twice', () => {
    expect(() => confirmSession(session('s'), 'tm', AT)).toThrow(LifecycleError)
  })

  it('rescheduling keeps the original record and links a new one', () => {
    const original = session('s', { assignments: [{ coachId: 'lead1', confirmedByCoach: true, confirmedAt: AT }] })
    const [old, moved] = rescheduleSession(original, { newDate: '2026-10-14', newId: 's2', by: 'tm', at: AT })
    expect(old.id).toBe('s')
    expect(old.status).toBe('rescheduled')
    expect(old.rescheduledDate).toBe('2026-10-14')
    expect(old.rescheduledToId).toBe('s2')
    expect(moved.rescheduledFromId).toBe('s')
    expect(moved.date).toBe('2026-10-14')
    expect(moved.status).toBe('confirmed')
    // History reads like a person wrote it.
    expect(old.history.at(-1)?.text).toBe('Rescheduled to Wed Oct 14, 10am–11am')
    expect(moved.history[0].text).toMatch(/^Moved here from \w{3} \w{3} \d+, /)
    // Coaches have to re-confirm the new date.
    expect(moved.assignments).toEqual([{ coachId: 'lead1', confirmedByCoach: false }])
  })

  it('rescheduling requires a Rescheduled Date', () => {
    expect(() => rescheduleSession(session('s'), { newDate: '', newId: 'x', by: 'tm', at: AT })).toThrow('Rescheduled Date is required.')
  })

  it('cancelling keeps the record with a reason code', () => {
    const s = cancelSession(session('s'), 'weather', '', 'tm', AT)
    expect(s.status).toBe('cancelled')
    expect(s.cancelReason).toBe('weather')
  })

  it('"Other" needs a written reason', () => {
    expect(() => cancelSession(session('s'), 'other', '  ', 'tm', AT)).toThrow(LifecycleError)
    expect(cancelSession(session('s'), 'other', 'Gym floor refinishing', 'tm', AT).cancelNote).toBe('Gym floor refinishing')
  })

  it('a cancelled or rescheduled session cannot change again', () => {
    const cancelled = cancelSession(session('s'), 'weather', '', 'tm', AT)
    expect(() => rescheduleSession(cancelled, { newDate: '2026-10-20', newId: 'x', by: 'tm', at: AT })).toThrow(LifecycleError)
    const [old] = rescheduleSession(session('t'), { newDate: '2026-10-20', newId: 'u', by: 'tm', at: AT })
    expect(() => cancelSession(old, 'weather', '', 'tm', AT)).toThrow(LifecycleError)
  })

  it('there is no delete operation anywhere in the engine', () => {
    const names = Object.keys(engine).filter((k) => /delete|remove|destroy/i.test(k))
    expect(names).toEqual([])
  })
})

describe('coach confirmation', () => {
  it('marks only that coach confirmed', () => {
    const s = coachConfirm(session('s', { assignments: crew('lead1', 'asst1') }), 'asst1', AT)
    expect(s.assignments.map((a) => a.confirmedByCoach)).toEqual([false, true])
  })

  it('refuses a coach who is not assigned', () => {
    expect(() => coachConfirm(session('s', { assignments: crew('lead1') }), 'asst1', AT)).toThrow(LifecycleError)
  })
})
