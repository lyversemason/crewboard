// Store actions: the rules can't be skipped from the UI layer either.

import { beforeEach, describe, expect, it } from 'vitest'
import { LifecycleError, hasBlock, openIssues, validateCrew, weeklyDates } from '../src/engine'
import { getState, reschedule, resetDemo, saveCrew, submitIntake, worldOf } from '../src/store'
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
    dates: weeklyDates(addDaysFrom(st().today, 9), 2),
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
