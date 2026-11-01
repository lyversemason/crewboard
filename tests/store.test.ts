// Store actions: the rules can't be skipped from the UI layer either.

import { beforeEach, describe, expect, it } from 'vitest'
import { LifecycleError, NOTE_MAX, canConfirmShift, hasBlock, planBulk, isAvailable, openIssues, validateCrew, weekdayOf } from '../src/engine'
import type { ProgramDay, Weekday } from '../src/engine'
import {
  addTimeOff,
  coachConfirmMany,
  confirmProgramWithFacility,
  confirmWithFacility,
  getState,
  reschedule,
  resetDemo,
  saveCrew,
  setAvailability,
  staffOpenSessions,
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
  it('asks for confirmation before saving an overridable violation, then logs it', async () => {
    const tm = user('tm-lou')
    const st = getState()
    // Find an upcoming session and an assistant who is free for it.
    const pairs = st.sessions
      .filter((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)
      .flatMap((x) => st.coaches.filter((c) => c.territoryId === 'lou' && c.level === 'assistant').map((c) => ({ s: x, assistant: c })))
    const { s, assistant } = pairs.find((p) => !hasBlock(validateCrew(p.s, [p.assistant.id], worldOf(st))))!

    // Assistant alone: no lead coach -> must confirm first.
    const first = await saveCrew(tm, s.id, [assistant.id], false)
    expect(first.ok).toBe(false)
    expect('needsConfirm' in first && first.needsConfirm.some((v) => v.code === 'no_lead')).toBe(true)

    expect(await saveCrew(tm, s.id, [assistant.id], true)).toEqual({ ok: true })
    const saved = getState().sessions.find((x) => x.id === s.id)!
    expect(saved.overrides.map((o) => o.code)).toContain('no_lead')
    expect(saved.overrides[0].by).toBe(tm.name)
    expect(saved.history.at(-1)?.text).toMatch(/Overrode/)
  })

  it('refuses a manager from another territory', async () => {
    const s = getState().sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed')!
    await expect(saveCrew(user('tm-knx'), s.id, [], false)).rejects.toThrow(LifecycleError)
  })

  it('refuses sales reps and coaches', async () => {
    const s = getState().sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed')!
    await expect(saveCrew(user('rep-east'), s.id, [], false)).rejects.toThrow(LifecycleError)
    await expect(saveCrew(user('u-lou-k1'), s.id, [], false)).rejects.toThrow(LifecycleError)
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
    cycleWeeks: 2,
    cycleRate: 400,
    days: [day(addDaysFrom(st().today, 9))],
    ...over,
  })
  const day = (firstDate: string, over: Partial<ProgramDay> = {}): ProgramDay => ({
    weekday: weekdayOf(firstDate),
    firstDate,
    start: '10:00',
    end: '10:30',
    groups: [{ players: 8, ageRange: '3', minutes: 30 }],
    ...over,
  })

  it('creates pending, unassigned sessions when the roster can cover it', async () => {
    const before = st().sessions.length
    const id = await submitIntake(user('rep-east'), input())
    const created = st().sessions.filter((s) => s.intakeId === id)
    expect(st().sessions.length).toBe(before + 2)
    expect(created.every((s) => s.status === 'pending' && s.assignments.length === 0)).toBe(true)
  })

  it('re-checks coverage and refuses an unstaffable slot even if the UI were bypassed', async () => {
    // 19-20h is outside everyone's availability.
    // With every Louisville lead coach inactive, nobody can lead the session.
    for (const c of st().coaches.filter((x) => x.territoryId === 'lou' && x.level === 'lead')) {
      await updateCoach(user('admin'), c.id, { level: c.level, payRate: c.payRate, phone: c.phone, email: c.email, active: false })
    }
    await expect(submitIntake(user('rep-east'), input())).rejects.toThrow(/can't be staffed/)
    await expect(submitIntake(user('rep-east'), input({ days: [day(addDaysFrom(st().today, 9), { start: '19:00', end: '19:30' })] }))).rejects.toThrow(/9am and 6pm/)
  })

  it('lets each day start on its own date, with its own groups', async () => {
    // Day one starts next week; the second day of the week only starts the week after.
    const first = addDaysFrom(st().today, 9)
    const second = addDaysFrom(first, 8)
    const id = await submitIntake(
      user('rep-east'),
      input({ days: [day(first), day(second, { start: '11:00', end: '11:45', groups: [{ players: 11, ageRange: '4-5', minutes: 45 }] })] }),
    )
    const created = st().sessions.filter((s) => s.intakeId === id)
    expect(created.length).toBe(4)
    const later = created.filter((s) => weekdayOf(s.date) === weekdayOf(second))
    expect(later.map((s) => s.date)[0]).toBe(second)
    expect(later.every((s) => s.start === '11:00' && s.groups[0].players === 11)).toBe(true)
    const terms = st().centers.find((c) => c.id === st().intakes.find((i) => i.id === id)!.centerId)!.terms!
    expect(terms.firstDates?.[weekdayOf(second)]).toBe(second)
  })

  it('refuses a first date that isn’t on the chosen weekday', async () => {
    const date = addDaysFrom(st().today, 9)
    const wrongDay = (weekdayOf(date) % 6) + 1
    await expect(submitIntake(user('rep-east'), input({ days: [day(date, { weekday: wrongDay as Weekday })] }))).rejects.toThrow(/is a .*day\. Pick a/)
  })

  it('refuses a misspelled contact email', async () => {
    const bad = input()
    bad.center.poc.email = 'candyqueen@gmail.con'
    await expect(submitIntake(user('rep-east'), bad)).rejects.toThrow(/valid contact email/)
  })

  it('refuses a rep outside the territory', async () => {
    await expect(submitIntake(user('rep-west'), input())).rejects.toThrow(LifecycleError)
  })
})

describe('demo data', () => {
  it('has no hard-rule violations and every override is real', async () => {
    const w = worldOf(getState())
    for (const s of w.sessions) {
      expect(openIssues(s, w).filter((v) => v.severity === 'block')).toEqual([])
    }
  })

  it('uses only fictional contact details', async () => {
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

  it('never gives a facility contact the same name as a coach', async () => {
    const { coaches, centers } = getState()
    const coachNames = new Set(coaches.map((c) => c.name))
    expect(centers.filter((c) => coachNames.has(c.poc.name))).toEqual([])
  })

  it('numbers a rescheduled session like the others (s145, not a random string)', async () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)!
    const before = Math.max(...st.sessions.map((x) => Number(x.id.slice(1)) || 0))
    const id = await reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45')
    expect(id).toBe(`s${before + 1}`)
  })

  it('has something to show on every screen', async () => {
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
    return { center: rest, cycleWeeks: terms!.cycleWeeks, cycleRate: terms!.cycleRate, ...clover().schedule, ...over }
  }
  // Clover Patch runs Thursdays + Fridays; move only the Thursday time.
  const thursdaysAt = (start: string, end: string) => clover().schedule.days.map((d) => (d.weekday === 4 ? { ...d, start, end } : d))

  it('moves the pending sessions in place and logs who changed what', async () => {
    await updateIntake(rep(), 'i1', input({ days: thursdaysAt('13:00', '14:15') }))
    const sessions = getState().sessions.filter((s) => s.intakeId === 'i1' && s.status === 'pending')
    expect(sessions.length).toBe(16)
    const thursdays = sessions.filter((s) => weekdayOf(s.date) === 4)
    expect(thursdays.every((s) => s.start === '13:00')).toBe(true)
    expect(sessions.filter((s) => weekdayOf(s.date) === 5).every((s) => s.start === '10:00')).toBe(true)
    expect(thursdays[0].history.at(-1)?.text).toMatch(/^Changed by sales: .* → .*1pm–2:15pm$/)
  })

  it('cancels (never deletes) sessions dropped by a shorter cycle', async () => {
    const before = getState().sessions.length
    await updateIntake(rep(), 'i1', input({ cycleWeeks: 4 }))
    const mine = getState().sessions.filter((s) => s.intakeId === 'i1')
    expect(getState().sessions.length).toBe(before)
    expect(mine.filter((s) => s.status === 'cancelled').every((s) => s.cancelReason === 'changed_by_sales')).toBe(true)
    expect(mine.filter((s) => s.status === 'pending').length).toBe(8)
  })

  it('is locked once a territory manager confirms a session', async () => {
    const first = getState().sessions.find((s) => s.intakeId === 'i1')!
    await confirmWithFacility(user('tm-lou'), first.id)
    await expect(updateIntake(rep(), 'i1', input({ days: thursdaysAt('13:00', '14:15') }))).rejects.toThrow(/can’t be changed/)
  })

  it('only the rep who signed it can edit it', async () => {
    await expect(updateIntake(user('rep-west'), 'i1', input())).rejects.toThrow(LifecycleError)
    await expect(updateIntake(user('tm-lou'), 'i1', input())).rejects.toThrow(LifecycleError)
  })
})

describe('program terms after signing', () => {
  it('only an ops admin can change the price, and it is logged', async () => {
    const center = getState().centers.find((c) => c.id === 'lou-c8')!
    await expect(updateTerms(user('tm-lou'), center.id, { ...center.terms!, cycleRate: 1500 })).rejects.toThrow(LifecycleError)
    await updateTerms(user('admin'), center.id, { ...center.terms!, cycleRate: 1500 })
    const after = getState().centers.find((c) => c.id === 'lou-c8')!
    expect(after.terms!.cycleRate).toBe(1500)
    expect(after.history?.at(-1)?.text).toBe('Cycle price: $2720 → $1500')
  })
})

describe('coaches', () => {
  const coachOf = (id: string) => getState().coaches.find((c) => c.id === id)!

  it('territory managers and ops admins can edit level and pay rate; each change is logged', async () => {
    const c = coachOf('lou-k1')
    await updateCoach(user('tm-lou'), c.id, { level: 'assistant', payRate: c.payRate + 2, phone: c.phone, email: c.email, active: true })
    const after = coachOf('lou-k1')
    expect(after.level).toBe('assistant')
    expect(after.history.map((h) => h.text)).toEqual(['Level: Lead → Assistant', `Pay rate: $${c.payRate}/hr → $${c.payRate + 2}/hr`])
    expect(after.history[0].by).toBe('Priya Raman')
    await expect(updateCoach(user('tm-knx'), c.id, { ...after, level: 'lead' })).rejects.toThrow(LifecycleError)
    await expect(updateCoach(user('rep-east'), c.id, { ...after, level: 'lead' })).rejects.toThrow(LifecycleError)
  })

  it('availability belongs to the coach: managers can read it but not change it', async () => {
    const c = coachOf('lou-k2')
    await expect(setAvailability(user('tm-lou'), c.id, c.availability)).rejects.toThrow(LifecycleError)
    await expect(setAvailability(user('admin'), c.id, c.availability)).rejects.toThrow(LifecycleError)
    await setAvailability(user('u-lou-k2'), c.id, { ...c.availability, 6: [] })
    expect(coachOf('lou-k2').availability[6]).toEqual([])
  })

  it('a day off makes the coach unavailable that day only', async () => {
    const c = coachOf('lou-k2')
    const day = addDaysFrom(getState().today, 20)
    const hours = c.availability[weekdayOf(day)]
    await addTimeOff(user('u-lou-k2'), c.id, { from: day, to: day, note: 'Exam' })
    const after = coachOf('lou-k2')
    expect(isAvailable(after, day, '10:00', '11:00')).toBe(false)
    if (hours.includes(10)) expect(isAvailable(after, addDaysFrom(day, 7), '10:00', '11:00')).toBe(true)
  })
})

describe('reschedule', () => {
  it('notifies the coaching staff in the history', async () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today && x.assignments.length)!
    const id = await reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45')
    const moved = getState().sessions.find((x) => x.id === id)!
    expect(moved.history.at(-1)?.text).toMatch(/^Coaching staff notified by text to re-confirm: /)
  })

  it('keeps the reason note on both the original and the new session', async () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)!
    const id = await reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45', 'Field trip that morning')
    const old = getState().sessions.find((x) => x.id === s.id)!
    const moved = getState().sessions.find((x) => x.id === id)!
    expect(old.history.at(-1)?.text).toMatch(/\(Field trip that morning\)$/)
    expect(moved.history[0].text).toMatch(/\(Field trip that morning\)$/)
  })

  it('refuses a note over the limit', async () => {
    const st = getState()
    const s = st.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= st.today)!
    await expect(reschedule(user('tm-lou'), s.id, s.date, '17:00', '17:45', 'x'.repeat(NOTE_MAX + 1))).rejects.toThrow(/under 300 characters/)
  })
})

describe('bulk staffing a program', () => {
  const tm = () => user('tm-lou')
  const clover = () => getState().sessions.filter((s) => s.intakeId === 'i1').sort((a, b) => a.date.localeCompare(b.date))
  const freeLead = (sessionId: string) => {
    const w = worldOf(getState())
    const s = getState().sessions.find((x) => x.id === sessionId)!
    return getState().coaches.find((c) => c.territoryId === 'lou' && c.level === 'lead' && c.active && validateCrew(s, [c.id], w).length === 0)!
  }

  it('adds the saved coaches to every open session they can work, and leaves the rest open with a reason', async () => {
    const first = clover()[0]
    const lead = freeLead(first.id)
    expect(await saveCrew(tm(), first.id, [lead.id], false)).toEqual({ ok: true })
    // The dry run the screen shows matches what the click does.
    const preview = planBulk(getState().sessions.find((x) => x.id === first.id)!, [lead.id], worldOf(getState()), getState().today)
    const r = await staffOpenSessions(tm(), first.id)
    expect(r.filled).toEqual(preview.fillable.map((s) => s.id))
    expect(r.filled.length + r.skipped.length).toBe(15)
    // A second click has nothing left to fill.
    expect((await staffOpenSessions(tm(), first.id)).filled).toEqual([])
    expect(r.filled.length).toBeGreaterThan(0)
    for (const id of r.filled) {
      const s = getState().sessions.find((x) => x.id === id)!
      expect(s.assignments.map((a) => a.coachId)).toEqual([lead.id])
      expect(s.history.at(-1)?.text).toMatch(/added to the whole program/)
    }
    for (const { id, reason } of r.skipped) {
      expect(getState().sessions.find((x) => x.id === id)!.assignments).toEqual([])
      expect(reason.length).toBeGreaterThan(0)
    }
    // Nothing it filled breaks a rule.
    const w = worldOf(getState())
    for (const id of r.filled) expect(openIssues(getState().sessions.find((x) => x.id === id)!, w)).toEqual([])
  })

  it('can fill just one weekday (Clover Patch: Thursdays only)', async () => {
    const first = clover()[0] // a Thursday
    await saveCrew(tm(), first.id, [freeLead(first.id).id], false)
    const r = await staffOpenSessions(tm(), first.id, 4)
    expect([...r.filled, ...r.skipped.map((x) => x.id)].every((id) => weekdayOf(getState().sessions.find((x) => x.id === id)!.date) === 4)).toBe(true)
    expect(clover().filter((s) => weekdayOf(s.date) === 5).every((s) => s.assignments.length === 0)).toBe(true)
  })

  it('confirms every pending session of the program with the facility', async () => {
    const n = await confirmProgramWithFacility(tm(), clover()[0].id)
    expect(n).toBe(16)
    expect(clover().every((s) => s.status === 'confirmed')).toBe(true)
  })

  it('only the territory’s managers can do it', async () => {
    await expect(confirmProgramWithFacility(user('tm-knx'), clover()[0].id)).rejects.toThrow(LifecycleError)
    await expect(staffOpenSessions(tm(), clover()[0].id)).rejects.toThrow(/Save a coaching staff/)
  })
})

describe('coach confirmations open the Sunday before', () => {
  it('a coach can’t confirm a shift weeks ahead, even by skipping the screen', async () => {
    const st = getState()
    const coachUser = st.users.find((u) => u.role === 'coach' && st.sessions.some((s) => s.date > addWeeks(st.today, 3) && s.assignments.some((a) => a.coachId === u.coachId && !a.confirmedByCoach)))!
    const far = st.sessions.find((s) => s.date > addWeeks(st.today, 3) && s.assignments.some((a) => a.coachId === coachUser.coachId && !a.confirmedByCoach))!
    await expect(coachConfirmMany(coachUser, [far.id])).rejects.toThrow(/the Sunday before its week/)
  })

  it('the demo data has no confirmations beyond the open window', async () => {
    const st = getState()
    for (const s of st.sessions) if (s.date >= st.today && !canConfirmShift(s.date, st.today)) expect(s.assignments.every((a) => !a.confirmedByCoach)).toBe(true)
  })
})

function addWeeks(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 7 * n)
  return d.toISOString().slice(0, 10)
}
