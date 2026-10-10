import { describe, expect, it } from 'vitest'
import { canAssign, canSeeMoney, intakeSessions, visibleIntakes, visibleRoster, visibleSessions } from '../src/engine'
import type { Intake, User } from '../src/engine'
import { coach, crew, session } from './fixtures'

const admin: User = { id: 'admin', name: 'Admin', role: 'ops_admin', territoryIds: [] }
const louTM: User = { id: 'tm', name: 'TM', role: 'territory_manager', territoryIds: ['lou'] }
const rep: User = { id: 'rep', name: 'Rep', role: 'sales_rep', territoryIds: ['lou'] }
const coachUser: User = { id: 'u-lead1', name: 'Lead', role: 'coach', territoryIds: ['lou'], coachId: 'lead1' }

const sessions = [
  session('lou1', { assignments: crew('lead1') }),
  session('lou2', { assignments: crew('lead2'), intakeId: 'i1' }),
  session('knx1', { territoryId: 'knx', centerId: 'K' }),
]
const coaches = [coach('lead1', 'lead'), coach('lead2', 'lead'), coach('k1', 'lead', { territoryId: 'knx' })]
const intakes: Intake[] = [
  { id: 'i1', salesRepId: 'rep', territoryId: 'lou', centerId: 'A', submittedAt: '', sessionIds: ['lou2'] },
  { id: 'i2', salesRepId: 'other', territoryId: 'lou', centerId: 'A', submittedAt: '', sessionIds: [] },
]

describe('role-based access', () => {
  it('ops admin sees every territory', () => {
    expect(visibleSessions(admin, sessions)).toHaveLength(3)
  })

  it('territory manager sees only their own territory', () => {
    expect(visibleSessions(louTM, sessions).map((s) => s.id)).toEqual(['lou1', 'lou2'])
    expect(canAssign(louTM, 'knx')).toBe(false)
    expect(canAssign(louTM, 'lou')).toBe(true)
  })

  it('coach sees only sessions they are assigned to', () => {
    expect(visibleSessions(coachUser, sessions).map((s) => s.id)).toEqual(['lou1'])
  })

  it('sales rep sees no calendar, only their own intakes and those sessions', () => {
    expect(visibleSessions(rep, sessions)).toEqual([])
    expect(visibleIntakes(rep, intakes).map((i) => i.id)).toEqual(['i1'])
    expect(intakeSessions(rep, intakes[0], sessions).map((s) => s.id)).toEqual(['lou2'])
    expect(intakeSessions(rep, intakes[1], sessions)).toEqual([])
  })

  it('pay rates are stripped for coaches and sales reps', () => {
    expect(canSeeMoney(rep)).toBe(false)
    expect(canSeeMoney(coachUser)).toBe(false)
    expect(visibleRoster(rep, coaches).every((c) => c.payRate === undefined)).toBe(true)
    expect(visibleRoster(louTM, coaches).every((c) => typeof c.payRate === 'number')).toBe(true)
  })

  it('coach directory lists only active peers in their own territory', () => {
    const roster = visibleRoster(coachUser, [...coaches, coach('gone', 'lead', { active: false })])
    expect(roster.map((c) => c.id)).toEqual(['lead1', 'lead2'])
  })
})
