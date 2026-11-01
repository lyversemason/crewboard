// Saving in live mode: every kind of change, made through the server function
// as the person who'd really make it, checked against what the database then
// holds, and against the audit log. Also the sales coverage question.

import { beforeAll, describe, expect, it } from 'vitest'
import { canConfirmShift, checkProgramCoverage, hasBlock, planningWeek, validateCrew } from '../../src/engine'
import type { ProgramDay, Session } from '../../src/engine'
import { worldOf } from '../../src/data/actions'
import type { IntakeInput, State } from '../../src/data/actions'
import type { CoverageInput } from '../../src/data/queries'
import { asStaff, server, truth } from './helpers'

type Signed = Awaited<ReturnType<typeof asStaff>>
let tm: Signed
let admin: Signed
let rep: Signed

beforeAll(async () => {
  ;[tm, admin, rep] = await Promise.all([
    asStaff('tm-lou@staff.bramblewood.example'),
    asStaff('admin@staff.bramblewood.example'),
    asStaff('rep-east@staff.bramblewood.example'),
  ])
})

const session = async (id: string) => (await truth()).sessions.find((s) => s.id === id)!
const latestAudit = async (n: number) => (await server.from('audit_log').select('*').order('id', { ascending: false }).limit(n)).data!

/** An upcoming Louisville session and an assistant who's free for it (assistant alone = no lead: needs an override). */
function overridePair(t: State) {
  return t.sessions
    .filter((s) => s.territoryId === 'lou' && s.status === 'confirmed' && s.date > t.today)
    .flatMap((s) => t.coaches.filter((c) => c.territoryId === 'lou' && c.level === 'assistant' && c.active).map((c) => ({ s, c })))
    .find((p) => !hasBlock(validateCrew(p.s, [p.c.id], worldOf(t))))!
}

describe('session changes by a territory manager', () => {
  it('saving a coaching staff asks first, then saves it with the override and logs both', async () => {
    const { s, c } = overridePair(await truth())
    const first = await tm.live.source.run('saveCrew', tm.me, [s.id, [c.id], false])
    expect(first.ok).toBe(false)
    expect((await session(s.id)).assignments.map((a) => a.coachId)).not.toEqual([c.id]) // nothing saved yet

    expect(await tm.live.source.run('saveCrew', tm.me, [s.id, [c.id], true])).toEqual({ ok: true })
    const saved = await session(s.id)
    expect(saved.assignments.map((a) => a.coachId)).toEqual([c.id])
    expect(saved.overrides.map((o) => o.code)).toContain('no_lead')
    // One entry for the staff change, one per rule overridden.
    const codes = [...new Set(saved.overrides.map((o) => o.code))]
    const audit = await latestAudit(1 + codes.length)
    expect(audit.map((a) => a.text)).toContain(`Coaching staff set: ${c.name}`)
    expect(audit.map((a) => a.text)).toContain('Overrode: no lead coach')
    expect(audit.every((a) => a.actor_id === 'tm-lou' && a.action === 'saveCrew' && a.target_id === s.id)).toBe(true)
    // The manager's own screen shows it straight away.
    expect(tm.live.source.getState().sessions.find((x) => x.id === s.id)!.assignments.map((a) => a.coachId)).toEqual([c.id])
  })

  it('confirm, reschedule and cancel each land in the database and the log', async () => {
    const t = await truth()
    const pending = t.sessions.find((s) => s.territoryId === 'lou' && s.status === 'pending' && s.date > t.today)!
    await tm.live.source.run('confirmWithFacility', tm.me, [pending.id])
    expect((await session(pending.id)).status).toBe('confirmed')

    const movedId = await tm.live.source.run('reschedule', tm.me, [pending.id, pending.date, '17:00', '17:45', 'Field trip that morning'])
    const [old, moved] = [await session(pending.id), await session(movedId)]
    expect(old).toMatchObject({ status: 'rescheduled', rescheduledToId: movedId })
    expect(moved).toMatchObject({ rescheduledFromId: pending.id, start: '17:00', end: '17:45' })

    await tm.live.source.run('cancel', tm.me, [movedId, 'weather', ''])
    expect(await session(movedId)).toMatchObject({ status: 'cancelled', cancelReason: 'weather' })
    expect((await latestAudit(1))[0]).toMatchObject({ action: 'cancel', target_id: movedId, actor_name: 'Priya Raman' })
  })

  it('bulk staffing fills the program’s other open sessions', async () => {
    const t = await truth()
    const open = (s: Session) => s.status === 'pending' && s.date > t.today && s.assignments.length === 0 && !!s.intakeId
    const from = t.sessions.find((s) => s.territoryId === 'lou' && open(s))!
    expect(from, 'an open session of a submitted program').toBeDefined()
    const lead = t.coaches.find((c) => c.territoryId === 'lou' && c.level === 'lead' && c.active && validateCrew(from, [c.id], worldOf(t)).length === 0)!
    expect(lead, 'a lead coach free for it').toBeDefined()
    await tm.live.source.run('saveCrew', tm.me, [from.id, [lead.id], false])
    const r = await tm.live.source.run('staffOpenSessions', tm.me, [from.id, 'program'])
    expect(r.filled.length + r.skipped.length).toBeGreaterThan(0)
    const after = await truth()
    for (const id of r.filled) expect(after.sessions.find((s) => s.id === id)!.assignments.map((a) => a.coachId)).toEqual([lead.id])
  })

  it('a rule the manager can’t override is refused, with the reason, and nothing is saved', async () => {
    const t = await truth()
    const s = t.sessions.find((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date > t.today)!
    const knx = t.coaches.find((c) => c.territoryId === 'knx' && c.active)!
    const r = await tm.live.source.run('saveCrew', tm.me, [s.id, [knx.id], true])
    expect(r.ok).toBe(false)
    expect('blocked' in r && r.blocked.some((v) => v.code === 'wrong_territory')).toBe(true)
    expect((await session(s.id)).assignments.map((a) => a.coachId)).not.toContain(knx.id)
  })
})

describe('a coach’s own changes', () => {
  it('confirming a shift and changing availability', async () => {
    const t = await truth()
    const week = planningWeek(t.today)
    const pick = t.sessions
      .filter((s) => (s.status === 'pending' || s.status === 'confirmed') && s.date >= t.today && canConfirmShift(s.date, t.today))
      .flatMap((s) => s.assignments.filter((a) => !a.confirmedByCoach).map((a) => ({ s, coachId: a.coachId })))
      .find(({ coachId }) => t.users.some((u) => u.coachId === coachId && u.status === 'active' && !u.invitedBy))!
    expect(pick, 'an unconfirmed shift in the open week').toBeDefined()
    const coachUser = t.users.find((u) => u.coachId === pick.coachId)!
    const coach = await asStaff(coachUser.email)

    await coach.live.source.run('coachConfirmMany', coach.me, [[pick.s.id]])
    expect((await session(pick.s.id)).assignments.find((a) => a.coachId === pick.coachId)!.confirmedByCoach).toBe(true)

    await coach.live.source.run('confirmAvailability', coach.me, [pick.coachId, week])
    await coach.live.source.run('addTimeOff', coach.me, [pick.coachId, { from: addDays(t.today, 60), to: addDays(t.today, 61), note: 'Exam' }])
    const saved = (await truth()).coaches.find((c) => c.id === pick.coachId)!
    expect(saved.availabilityConfirmedWeek).toBe(week)
    expect(saved.timeOff.some((x) => x.note === 'Exam')).toBe(true)
  })

  it('a coach can’t change sessions, and the server says so', async () => {
    const t = await truth()
    const coachUser = t.users.find((u) => u.role === 'coach' && u.status === 'active' && !u.invitedBy)!
    const coach = await asStaff(coachUser.email)
    const s = coach.live.source.getState().sessions[0] ?? t.sessions[0]
    await expect(coach.live.source.run('cancel', coach.me, [s.id, 'weather', ''])).rejects.toThrow(/managers/)
  })
})

describe('management changes', () => {
  it('pay rate: saved where only management can read it, and logged', async () => {
    const t = await truth()
    const c = t.coaches.find((x) => x.territoryId === 'lou' && x.active)!
    await tm.live.source.run('updateCoach', tm.me, [c.id, { level: c.level, payRate: c.payRate + 1, phone: c.phone, email: c.email, active: c.active }])
    const pay = (await server.from('coach_private').select('pay_rate').eq('coach_id', c.id).single()).data!
    expect(Number(pay.pay_rate)).toBe(c.payRate + 1)
    expect((await latestAudit(1))[0].text).toBe(`Pay rate: $${c.payRate}/hr → $${c.payRate + 1}/hr`)
  })

  it('global settings: ops admin only, and logged even though settings have no history', async () => {
    const before = admin.live.source.getState().settings
    await expect(tm.live.source.run('updateSettings', tm.me, [{ ...before, bufferMinutes: 31 }])).rejects.toThrow(/Only operations admins/)
    await admin.live.source.run('updateSettings', admin.me, [{ ...before, bufferMinutes: before.bufferMinutes + 5 }])
    expect((await server.from('settings').select('buffer_minutes').single()).data!.buffer_minutes).toBe(before.bufferMinutes + 5)
    expect((await latestAudit(1))[0]).toMatchObject({ target_type: 'settings', text: `Travel buffer: ${before.bufferMinutes} min → ${before.bufferMinutes + 5} min` })
    await admin.live.source.run('updateSettings', admin.me, [before])
  })

  it('a center’s price after signing: ops admin only', async () => {
    const t = await truth()
    const center = t.centers.find((c) => c.terms && c.territoryId === 'lou')!
    await expect(tm.live.source.run('updateTerms', tm.me, [center.id, { ...center.terms!, cycleRate: 999 }])).rejects.toThrow(/Only operations admins/)
    await admin.live.source.run('updateTerms', admin.me, [center.id, { ...center.terms!, cycleRate: center.terms!.cycleRate + 10 }])
    const terms = (await server.from('center_terms').select('terms').eq('center_id', center.id).single()).data!
    expect(terms.terms.cycleRate).toBe(center.terms!.cycleRate + 10)
  })
})

describe('sales', () => {
  const day = (t: State, over: Partial<ProgramDay> = {}): ProgramDay => ({
    weekday: 2,
    firstDate: nextWeekday(t.today, 2, 14),
    start: '10:00',
    end: '10:45',
    groups: [{ players: 10, ageRange: '3-4', minutes: 45 }],
    ...over,
  })

  it('the coverage question gives a rep the full answer without the data behind it', async () => {
    const t = await truth()
    const center = t.centers.find((c) => c.territoryId === 'lou')!
    const input: CoverageInput = { territoryId: 'lou', location: { lat: center.lat, lng: center.lng }, days: [day(t)], cycleWeeks: 4 }
    const answer = await rep.live.source.query('salesCoverage', rep.me, [input])
    const direct = checkProgramCoverage('lou', input.location, input.days, 4, worldOf(t))
    expect(answer.coverage.dates.map((d) => [d.date, d.ok, d.freeCoaches])).toEqual(direct.dates.map((d) => [d.date, d.ok, d.freeCoaches]))
    expect(answer.coverage.dates.every((d) => d.exampleCrew.length === 0)).toBe(true)
    // The rep's own screen still has no sessions but their own.
    expect(rep.live.source.getState().sessions.every((s) => s.intakeId && rep.live.source.getState().intakes.some((i) => i.id === s.intakeId))).toBe(true)
    await expect(rep.live.source.query('salesCoverage', rep.me, [{ ...input, territoryId: 'oak' }])).rejects.toThrow(/can’t check coverage/)
  })

  it('a rep submits a new center and edits it before it’s confirmed', async () => {
    const t = await truth()
    const center = t.centers.find((c) => c.territoryId === 'lou')!
    const input: IntakeInput = {
      center: {
        territoryId: 'lou',
        name: `Test Center ${Date.now().toString(36)}`,
        phone: '502-555-0199',
        address: '1 Test St, Louisville, KY 40205',
        lat: center.lat,
        lng: center.lng,
        poc: { name: 'A B', title: 'Director', email: 'a@example.com', phone: '502-555-0198' },
        space: { category: 'indoor', grade: 'flat', obstacles: [], backupIndoorSpace: true },
      },
      cycleWeeks: 2,
      cycleRate: 400,
      days: [day(t)],
    }
    const covered = await rep.live.source.query('salesCoverage', rep.me, [{ territoryId: 'lou', location: { lat: center.lat, lng: center.lng }, days: input.days, cycleWeeks: 2 }])
    expect(covered.coverage.ok, 'the test program can be staffed').toBe(true)
    const id = await rep.live.source.run('submitIntake', rep.me, [input])
    let after = await truth()
    const intake = after.intakes.find((i) => i.id === id)!
    expect(intake.salesRepId).toBe('rep-east')
    expect(after.sessions.filter((s) => s.intakeId === id)).toHaveLength(2)
    expect(after.centers.find((c) => c.id === intake.centerId)!.terms!.cycleRate).toBe(400)
    // The rep sees their new submission and its sessions; managers see it on their calendar.
    expect(rep.live.source.getState().intakes.some((i) => i.id === id)).toBe(true)

    await rep.live.source.run('updateIntake', rep.me, [id, { ...input, days: [day(t, { start: '11:00', end: '11:45' })] }])
    after = await truth()
    expect(after.sessions.filter((s) => s.intakeId === id && s.status === 'pending').every((s) => s.start === '11:00')).toBe(true)
  })
})

describe('the audit log', () => {
  it('only ops admins read it', async () => {
    expect(admin.live.source.getState().audit.length).toBeGreaterThan(0)
    expect(tm.live.source.getState().audit).toEqual([])
    const { count } = await tm.live.client.from('audit_log').select('*', { count: 'exact', head: true })
    expect(count).toBe(0)
  })

  it('can only be added to: not even server code edits or deletes an entry', async () => {
    const [entry] = await latestAudit(1)
    const update = await server.from('audit_log').update({ text: 'changed' }).eq('id', entry.id)
    const remove = await server.from('audit_log').delete().eq('id', entry.id)
    // Refused twice over: server code isn't granted edits or deletes, and a database rule refuses them anyway.
    expect(update.error?.message).toMatch(/permission denied|only be added to/)
    expect(remove.error?.message).toMatch(/permission denied|only be added to/)
    expect((await latestAudit(1))[0].text).toBe(entry.text)
  })

  it('a browser can’t write to it directly', async () => {
    const { error } = await admin.live.client.from('audit_log').insert({ at: new Date().toISOString(), actor_name: 'x', action: 'x', target_type: 'settings', target_id: 'x', text: 'x' })
    expect(error?.code).toBe('42501')
  })
})

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The given weekday (1 = Monday) at least `minDays` from today. */
function nextWeekday(today: string, weekday: number, minDays: number) {
  let d = addDays(today, minDays)
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== weekday) d = addDays(d, 1)
  return d
}
