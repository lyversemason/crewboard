// The audit log, and the sales coverage question.

import { describe, expect, it } from 'vitest'
import { LifecycleError, checkProgramCoverage, hasBlock, validateCrew } from '../src/engine'
import { ACTIONS, worldOf } from '../src/data/actions'
import type { State } from '../src/data/actions'
import { auditEntries, auditFromHistory } from '../src/data/audit'
import { QUERIES } from '../src/data/queries'
import type { CoverageInput } from '../src/data/queries'
import { demoSource } from '../src/data/source'

const person = (s: State, id: string) => s.users.find((u) => u.id === id)!
const AT = '2026-11-02T15:00:00.000Z'

describe('audit entries', () => {
  it('one per change note an action wrote, with who did it', () => {
    const before = demoSource().getState()
    const tm = person(before, 'tm-lou')
    const s = before.sessions.find((x) => x.territoryId === 'lou' && x.status === 'pending')!
    const { state: after } = ACTIONS.confirmWithFacility({ state: before, user: tm, at: AT }, s.id)
    const entries = auditEntries(before, after, tm, 'confirmWithFacility', AT)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ actorId: 'tm-lou', actorName: 'Priya Raman', action: 'confirmWithFacility', targetType: 'session', targetId: s.id })
    expect(entries[0].text).toBe(after.sessions.find((x) => x.id === s.id)!.history.at(-1)!.text)
  })

  it('spells out settings changes, which have no history of their own', () => {
    const before = demoSource().getState()
    const admin = person(before, 'admin')
    const { state: after } = ACTIONS.updateSettings({ state: before, user: admin, at: AT }, { ...before.settings, bufferMinutes: 45 })
    expect(auditEntries(before, after, admin, 'updateSettings', AT).map((e) => e.text)).toEqual([`Travel buffer: ${before.settings.bufferMinutes} min → 45 min`])
  })

  it('nothing changed, nothing logged', () => {
    const s = demoSource().getState()
    expect(auditEntries(s, s, person(s, 'admin'), 'updateSettings', AT)).toEqual([])
  })

  it('the demo starts with the fictional managers’ own changes, not the setup script', () => {
    const s = demoSource().getState()
    expect(s.audit.length).toBeGreaterThan(0)
    expect(s.audit.every((e) => s.users.some((u) => u.id === e.actorId))).toBe(true)
    expect(auditFromHistory(s).map((e) => e.text)).toContain('Submitted')
  })

  it('the demo adds entries as people make changes', async () => {
    const source = demoSource()
    const start = source.getState()
    const before = start.audit.length
    const tm = person(start, 'tm-lou')
    const s = start.sessions.find((x) => x.territoryId === 'lou' && x.status === 'pending')!
    await source.run('confirmWithFacility', tm, [s.id])
    const log = source.getState().audit
    expect(log).toHaveLength(before + 1)
    expect(log.at(-1)).toMatchObject({ actorId: 'tm-lou', targetId: s.id })
    expect(log.at(-1)!.id).not.toBe(log.at(-2)!.id)
  })

  it('an override shows up as its own entry', () => {
    const before = demoSource().getState()
    const tm = person(before, 'tm-lou')
    const pairs = before.sessions
      .filter((x) => x.territoryId === 'lou' && x.status === 'confirmed' && x.date >= before.today)
      .flatMap((x) => before.coaches.filter((c) => c.territoryId === 'lou' && c.level === 'assistant').map((c) => ({ s: x, c })))
    const { s, c } = pairs.find((p) => !hasBlock(validateCrew(p.s, [p.c.id], worldOf(before))))!
    const { state: after } = ACTIONS.saveCrew({ state: before, user: tm, at: AT }, s.id, [c.id], true)
    expect(auditEntries(before, after, tm, 'saveCrew', AT).map((e) => e.text)).toContain('Overrode: no lead coach')
  })
})

describe('the sales coverage question', () => {
  const state = demoSource().getState()
  const center = state.centers.find((c) => c.territoryId === 'lou')!
  const input: CoverageInput = {
    territoryId: 'lou',
    location: { lat: center.lat, lng: center.lng },
    days: [{ weekday: 2, firstDate: nextTuesday(state.today), start: '10:00', end: '10:45', groups: [{ players: 10, ageRange: '3-4', minutes: 45 }] }],
    cycleWeeks: 4,
  }
  const ask = (who: string, i = input) => QUERIES.salesCoverage({ state, user: person(state, who), at: AT }, i)

  it('gives a rep the same answer the rules give, without naming coaches', () => {
    const answer = ask('rep-east')
    const direct = checkProgramCoverage('lou', input.location, input.days, 4, worldOf(state))
    expect(answer.coverage.ok).toBe(direct.ok)
    expect(answer.coverage.dates.map((d) => [d.date, d.ok, d.freeCoaches])).toEqual(direct.dates.map((d) => [d.date, d.ok, d.freeCoaches]))
    expect(answer.coverage.dates.every((d) => d.exampleCrew.length === 0)).toBe(true)
  })

  it('suggests open slots when a day can’t be staffed', () => {
    const answer = ask('rep-east', { ...input, days: [{ ...input.days[0], groups: [{ players: 60, ageRange: '3-4', minutes: 45 }] }] })
    expect(answer.coverage.ok).toBe(false)
    expect(answer.stuckWeekday).toBe(2)
  })

  it('refuses a rep outside the territory, and coaches', () => {
    expect(() => ask('rep-west')).toThrow(LifecycleError)
    expect(() => ask('u-lou-k1')).toThrow(LifecycleError)
  })

  it('refuses to check against someone else’s submission', () => {
    const intake = state.intakes[0]
    expect(() => ask('rep-west', { ...input, territoryId: 'oak', editingIntakeId: intake.id })).toThrow(LifecycleError)
  })
})

function nextTuesday(today: string) {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7) + 7)
  return d.toISOString().slice(0, 10)
}
