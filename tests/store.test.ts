// Store actions: the rules can't be skipped from the UI layer either.

import { beforeEach, describe, expect, it } from 'vitest'
import { LifecycleError, hasBlock, isAvailable, openIssues, validateCrew, weekdayOf } from '../src/engine'
import {
  addTimeOff,
  confirmWithFacility,
  getState,
  reschedule,
  resetDemo,
  saveCrew,
  setAvailability,
  submitIntake,
  updateCoach,
  updateIntake,
  updateTerms,
  worldOf,
} from '../src/store'
import type { IntakeInput } from '../src/store'

const user = (id: string) => getState().users.find((u) => u.id === id)!

beforeEach(() => resetDemo())

describe('saveCrew', () => {
  it('asks for confirmation before saving an overridable violation, then logs it', () => {
    const tm = user('tm-lou')
    const st = getState()
    // Find an upcoming session and an assistant who is free for it.
    const pairs = st.sessions
      .filter((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)
      .flatMap((x) => st.coaches.filter((c) => c.territoryId === 'lou' && c.level === 'assistant').map((c) => ({ s: x, assistant: c })))
    const { s, assistant } = pairs.find((p) => !hasBlock(validateCrew(p.s, [p.assistant.id], worldOf(st))))!

    // Assistant alone: no lead coach -> must confirm first.
    const first = saveCrew(tm, s.id, [assistant.id], false)
    expect(first.ok).toBe(false)
    expect('needsConfirm' in first && first.needsConfirm.some((v) => v.code === 'no_lead')).toBe(true)

    expect(saveCrew(tm, s.id, [assistant.id], true)).toEqual({ ok: true })
    const saved = getState().sessions.find((x) => x.id === s.id)!
    expect(saved.overrides.map((o) => o.code)).toContain('no_lead')
    expect(saved.overrides[0].by).toBe(tm.name)
    expect(saved.history.at(-1)?.text).toMatch(/Overrode/)
  })

  it('refuses a manager from another territory', () => {
    const s = getState().sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed')!
    expect(() => saveCrew(user('tm-knx'), s.id, [], false)).toThrow(LifecycleError)
  })

  it('refuses sales reps and coaches', () => {
    const s = getState().sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed')!
    expect(() => saveCrew(user('rep-east'), s.id, [], false)).toThrow(LifecycleError)
    expect(() => saveCrew(user('u-lou-k1'), s.id, [], false)).toThrow(LifecycleError)
  })
})

describe('submitIntake', () => {
  const st = () => getState()
  const input = (over: Partial<IntakeInput> = {}): IntakeInput => ({
    center: {
      territoryId: 'lou',
      name: 'Test Center',
      phone: '502-555-0199',
      address: '1 Test St, Louisville, KY 40205',
      lat: 38.222,
      lng: -85.688,
      poc: { name: 'A B', title: 'Director', email: 'a@example.com', phone: '502-555-0198' },
      space: { category: 'indoor', grade: 'flat', obstacles: [], backupIndoorSpace: true },
    },
    terms: { startDate: addDaysFrom(st().today, 9), cycleWeeks: 2, weekdays: [weekdayOf(addDaysFrom(st().today, 9))], cycleRate: 400 },
    start: '10:00',
    end: '10:30',
    groups: [{ players: 8, ageRange: '3', minutes: 30 }],
    ...over,
  })

  it('creates pending, unassigned sessions when the roster can cover it', () => {
    const before = st().sessions.length
    const id = submitIntake(user('rep-east'), input())
    const created = st().sessions.filter((s) => s.intakeId === id)
    expect(st().sessions.length).toBe(before + 2)
    expect(created.every((s) => s.status === 'pending' && s.assignments.length === 0)).toBe(true)
  })

  it('re-checks coverage and refuses an unstaffable slot even if the UI were bypassed', () => {
    // 19-20h is outside everyone's availability.
    expect(() => submitIntake(user('rep-east'), input({ start: '19:00', end: '19:30' }))).toThrow(LifecycleError)
  })

  it('refuses a rep outside the territory', () => {
    expect(() => submitIntake(user('rep-west'), input())).toThrow(LifecycleError)
  })
})

describe('demo data', () => {
  it('has no hard-rule violations and every override is real', () => {
    const w = worldOf(getState())
    for (const s of w.sessions) {
      expect(openIssues(s, w).filter((v) => v.severity === 'block')).toEqual([])
    }
  })

  it('uses only fictional contact details', () => {
    const { coaches, centers } = getState()
    for (const c of coaches) {
      expect(c.phone).toMatch(/^\d{3}-555-01\d{2}$/)
      expect(c.email).toMatch(/@example\.com$/)
    }
    for (const c of centers) {
      expect(c.phone).toMatch(/^\d{3}-555-01\d{2}$/)
      expect(c.poc.email).toMatch(/example\.com$/)
    }
  })

  it('never gives a facility contact the same name as a coach', () => {
    const { coaches, centers } = getState()
    const coachNames = new Set(coaches.map((c) => c.name))
    expect(centers.filter((c) => coachNames.has(c.poc.name))).toEqual([])
  })

  it('numbers a rescheduled session like the others (s145, not a random string)', () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)!
    const before = Math.max(...st.sessions.map((x) => Number(x.id.slice(1)) || 0))
    const id = reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45')
    expect(id).toBe(`s${before + 1}`)
  })

  it('has something to show on every screen', () => {
    const { sessions, intakes } = getState()
    expect(sessions.some((s) => s.status === 'rescheduled')).toBe(true)
    expect(sessions.some((s) => s.status === 'cancelled')).toBe(true)
    expect(sessions.some((s) => s.overrides.some((o) => o.code === 'travel'))).toBe(true)
    expect(sessions.some((s) => s.overrides.some((o) => o.code === 'ratio'))).toBe(true)
    expect(intakes.length).toBeGreaterThan(0)
  })
})

function addDaysFrom(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  // Land on a weekday.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

describe('editing a submission (sales)', () => {
  const rep = () => user('rep-east')
  const clover = () => getState().intakes.find((i) => i.id === 'i1')!
  const input = (over: Partial<IntakeInput> = {}): IntakeInput => {
    const st = getState()
    const center = st.centers.find((c) => c.id === clover().centerId)!
    const { id: _id, terms, history: _h, ...rest } = center
    return { center: rest, terms: terms!, ...clover().schedule, ...over }
  }

  it('moves the pending sessions in place and logs who changed what', () => {
    updateIntake(rep(), 'i1', input({ start: '13:00', end: '14:15' }))
    const sessions = getState().sessions.filter((s) => s.intakeId === 'i1' && s.status === 'pending')
    expect(sessions.length).toBe(8)
    expect(sessions.every((s) => s.start === '13:00')).toBe(true)
    expect(sessions[0].history.at(-1)?.text).toMatch(/^Changed by sales: .* → .*1pm–2:15pm$/)
  })

  it('cancels (never deletes) sessions dropped by a shorter cycle', () => {
    const before = getState().sessions.length
    updateIntake(rep(), 'i1', input({ terms: { ...input().terms, cycleWeeks: 4 } }))
    const mine = getState().sessions.filter((s) => s.intakeId === 'i1')
    expect(getState().sessions.length).toBe(before)
    expect(mine.filter((s) => s.status === 'cancelled').every((s) => s.cancelReason === 'changed_by_sales')).toBe(true)
    expect(mine.filter((s) => s.status === 'pending').length).toBe(4)
  })

  it('is locked once a territory manager confirms a session', () => {
    const first = getState().sessions.find((s) => s.intakeId === 'i1')!
    confirmWithFacility(user('tm-lou'), first.id)
    expect(() => updateIntake(rep(), 'i1', input({ start: '13:00', end: '14:15' }))).toThrow(/can’t be changed/)
  })

  it('only the rep who signed it can edit it', () => {
    expect(() => updateIntake(user('rep-west'), 'i1', input())).toThrow(LifecycleError)
    expect(() => updateIntake(user('tm-lou'), 'i1', input())).toThrow(LifecycleError)
  })
})

describe('program terms after signing', () => {
  it('only an ops admin can change the price, and it is logged', () => {
    const center = getState().centers.find((c) => c.id === 'lou-c8')!
    expect(() => updateTerms(user('tm-lou'), center.id, { ...center.terms!, cycleRate: 1500 })).toThrow(LifecycleError)
    updateTerms(user('admin'), center.id, { ...center.terms!, cycleRate: 1500 })
    const after = getState().centers.find((c) => c.id === 'lou-c8')!
    expect(after.terms!.cycleRate).toBe(1500)
    expect(after.history?.at(-1)?.text).toBe('Cycle price: $1360 → $1500')
  })
})

describe('coaches', () => {
  const coachOf = (id: string) => getState().coaches.find((c) => c.id === id)!

  it('territory managers and ops admins can edit level and pay rate; each change is logged', () => {
    const c = coachOf('lou-k1')
    updateCoach(user('tm-lou'), c.id, { level: 'assistant', payRate: c.payRate + 2, phone: c.phone, email: c.email, active: true })
    const after = coachOf('lou-k1')
    expect(after.level).toBe('assistant')
    expect(after.history.map((h) => h.text)).toEqual(['Level: Lead → Assistant', `Pay rate: $${c.payRate}/hr → $${c.payRate + 2}/hr`])
    expect(after.history[0].by).toBe('Priya Raman')
    expect(() => updateCoach(user('tm-knx'), c.id, { ...after, level: 'lead' })).toThrow(LifecycleError)
    expect(() => updateCoach(user('rep-east'), c.id, { ...after, level: 'lead' })).toThrow(LifecycleError)
  })

  it('availability belongs to the coach: managers can read it but not change it', () => {
    const c = coachOf('lou-k2')
    expect(() => setAvailability(user('tm-lou'), c.id, c.availability)).toThrow(LifecycleError)
    expect(() => setAvailability(user('admin'), c.id, c.availability)).toThrow(LifecycleError)
    setAvailability(user('u-lou-k2'), c.id, { ...c.availability, 6: [] })
    expect(coachOf('lou-k2').availability[6]).toEqual([])
  })

  it('a day off makes the coach unavailable that day only', () => {
    const c = coachOf('lou-k2')
    const day = addDaysFrom(getState().today, 20)
    const hours = c.availability[weekdayOf(day)]
    addTimeOff(user('u-lou-k2'), c.id, { from: day, to: day, note: 'Exam' })
    const after = coachOf('lou-k2')
    expect(isAvailable(after, day, '10:00', '11:00')).toBe(false)
    if (hours.includes(10)) expect(isAvailable(after, addDaysFrom(day, 7), '10:00', '11:00')).toBe(true)
  })
})

describe('reschedule', () => {
  it('notifies the coaching staff in the history', () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today && x.assignments.length)!
    const id = reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45')
    const moved = getState().sessions.find((x) => x.id === id)!
    expect(moved.history.at(-1)?.text).toMatch(/^Coaching staff notified by text to re-confirm: /)
  })
})
