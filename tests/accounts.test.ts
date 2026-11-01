// Accounts: inviting, accepting, turning access off and on, changing roles,
// and the guard rails that stop a company locking itself out.

import { describe, expect, it } from 'vitest'
import { LifecycleError, canInvite, canManageAccount, visibleAccounts } from '../src/engine'
import { ACTIONS, INVITE_DAYS } from '../src/data/actions'
import type { ActionArgs, ActionName, InviteInput, State } from '../src/data/actions'
import { demoSource } from '../src/data/source'

const base = () => demoSource().getState()
const person = (s: State, id: string) => s.users.find((u) => u.id === id)!
const AT = '2026-11-02T15:00:00.000Z'

/** Runs an action as `who` and returns the next state and result. */
function act<N extends ActionName>(state: State, who: string, name: N, ...args: ActionArgs<N>) {
  const fn = ACTIONS[name] as (...a: unknown[]) => { state: State; result: unknown }
  return fn({ state, user: person(state, who), at: AT }, ...args)
}

const coachInvite = (over: Partial<InviteInput> = {}): InviteInput => ({
  name: 'Jordan Reyes',
  email: 'Jordan.Reyes@Example.com',
  role: 'coach',
  territoryIds: ['lou'],
  coach: { level: 'assistant', payRate: 20, phone: '502-555-0177' },
  ...over,
})

describe('who may invite whom', () => {
  const s = base()
  it('ops admins invite anyone, anywhere', () => {
    for (const role of ['ops_admin', 'territory_manager', 'sales_rep', 'coach'] as const) expect(canInvite(person(s, 'admin'), role, ['oak'])).toBe(true)
  })
  it('territory managers invite only coaches, only into their own territory', () => {
    const tm = person(s, 'tm-lou')
    expect(canInvite(tm, 'coach', ['lou'])).toBe(true)
    expect(canInvite(tm, 'coach', ['knx'])).toBe(false)
    expect(canInvite(tm, 'sales_rep', ['lou'])).toBe(false)
    expect(canInvite(tm, 'territory_manager', ['lou'])).toBe(false)
  })
  it('reps and coaches invite nobody', () => {
    expect(canInvite(person(s, 'rep-east'), 'coach', ['lou'])).toBe(false)
    expect(canInvite(person(s, 'u-lou-k1'), 'coach', ['lou'])).toBe(false)
  })
  it('managers manage their coaches’ access, never their own or office staff', () => {
    const tm = person(s, 'tm-lou')
    expect(canManageAccount(tm, person(s, 'u-lou-k1'))).toBe(true)
    expect(canManageAccount(tm, person(s, 'u-knx-k1'))).toBe(false)
    expect(canManageAccount(tm, person(s, 'rep-east'))).toBe(false)
    expect(canManageAccount(tm, tm)).toBe(false)
    expect(canManageAccount(person(s, 'admin'), person(s, 'admin'))).toBe(false)
  })
  it('the Accounts screen shows managers only people in their territories', () => {
    const seen = visibleAccounts(person(s, 'tm-oak'), s.users)
    expect(seen.every((u) => u.territoryIds.includes('oak'))).toBe(true)
    expect(seen.map((u) => u.id)).toContain('rep-west')
    expect(visibleAccounts(person(s, 'rep-east'), s.users)).toEqual([])
  })
})

describe('inviting', () => {
  it('adds an invited coach who can’t be scheduled until they accept', () => {
    const { state, result: id } = act(base(), 'tm-lou', 'inviteUser', coachInvite())
    const u = person(state, id as string)
    expect(u).toMatchObject({ name: 'Jordan Reyes', email: 'jordan.reyes@example.com', role: 'coach', status: 'invited', invitedBy: 'tm-lou', invitedAt: AT, territoryIds: ['lou'] })
    const coach = state.coaches.find((c) => c.id === u.coachId)!
    expect(coach).toMatchObject({ territoryId: 'lou', level: 'assistant', payRate: 20, active: false })
    expect(u.history.at(-1)!.text).toBe('Invited as Coach (Louisville)')
  })

  it('refuses a duplicate email, a bad email, a missing name and missing coach details', () => {
    const s = base()
    const taken = person(s, 'u-lou-k1').email.toUpperCase()
    expect(() => act(s, 'admin', 'inviteUser', coachInvite({ email: taken }))).toThrow(/already has that email/)
    expect(() => act(s, 'admin', 'inviteUser', coachInvite({ email: 'jordan@gmail.con' }))).toThrow(/valid email/)
    expect(() => act(s, 'admin', 'inviteUser', coachInvite({ name: '  ' }))).toThrow(/name/)
    expect(() => act(s, 'admin', 'inviteUser', coachInvite({ coach: undefined }))).toThrow(/level, pay rate/)
    expect(() => act(s, 'admin', 'inviteUser', coachInvite({ territoryIds: ['lou', 'knx'] }))).toThrow(/exactly one territory/)
  })

  it('refuses a manager inviting outside their rights', () => {
    const s = base()
    expect(() => act(s, 'tm-lou', 'inviteUser', coachInvite({ territoryIds: ['knx'] }))).toThrow(LifecycleError)
    expect(() => act(s, 'tm-lou', 'inviteUser', { name: 'New Rep', email: 'new.rep@example.com', role: 'sales_rep', territoryIds: ['lou'] })).toThrow(LifecycleError)
  })

  it('an ops admin invited sees every territory', () => {
    const { state, result: id } = act(base(), 'admin', 'inviteUser', { name: 'Ops Two', email: 'ops2@example.com', role: 'ops_admin', territoryIds: [] })
    expect(person(state, id as string).territoryIds).toEqual(state.territories.map((t) => t.id))
  })
})

describe('accepting', () => {
  it('turns the account and the coach on', () => {
    const invited = act(base(), 'tm-lou', 'inviteUser', coachInvite())
    const id = invited.result as string
    const { state } = act(invited.state, id, 'acceptInvite')
    const u = person(state, id)
    expect(u.status).toBe('active')
    expect(state.coaches.find((c) => c.id === u.coachId)!.active).toBe(true)
  })

  it('refuses an invitation older than the limit', () => {
    const invited = act(base(), 'tm-lou', 'inviteUser', coachInvite())
    const id = invited.result as string
    const old = { ...invited.state, users: invited.state.users.map((u) => (u.id === id ? { ...u, invitedAt: new Date(Date.parse(AT) - (INVITE_DAYS + 1) * 864e5).toISOString() } : u)) }
    expect(() => act(old, id, 'acceptInvite')).toThrow(/expired/)
    // Sending it again resets the clock.
    const resent = act(old, 'tm-lou', 'resendInvite', id)
    expect(act(resent.state, id, 'acceptInvite').state.users.find((u) => u.id === id)!.status).toBe('active')
  })
})

describe('turning access off and on', () => {
  it('a manager turns a coach off: logged, unschedulable, and their upcoming sessions listed', () => {
    const s = base()
    const coachUser = s.users.find((u) => u.role === 'coach' && s.sessions.some((x) => x.date >= s.today && x.status !== 'cancelled' && x.assignments.some((a) => a.coachId === u.coachId)) && u.territoryIds[0] === 'lou')!
    const { state, result } = act(s, 'tm-lou', 'deactivateUser', coachUser.id)
    const u = person(state, coachUser.id)
    expect(u).toMatchObject({ status: 'deactivated', deactivatedBy: 'tm-lou', deactivatedAt: AT })
    expect(u.history.at(-1)!.text).toBe('Access turned off')
    expect(state.coaches.find((c) => c.id === coachUser.coachId)!.active).toBe(false)
    expect((result as { upcoming: string[] }).upcoming.length).toBeGreaterThan(0)
    // Nothing is deleted: their sessions still name them.
    expect(state.sessions.filter((x) => x.assignments.some((a) => a.coachId === coachUser.coachId)).length).toBe(
      s.sessions.filter((x) => x.assignments.some((a) => a.coachId === coachUser.coachId)).length,
    )
  })

  it('turning access back on restores the account and the coach', () => {
    const off = act(base(), 'tm-lou', 'deactivateUser', 'u-lou-k1')
    const { state } = act(off.state, 'tm-lou', 'reactivateUser', 'u-lou-k1')
    expect(person(state, 'u-lou-k1').status).toBe('active')
    expect(state.coaches.find((c) => c.id === 'lou-k1')!.active).toBe(true)
  })

  it('cancelling an invitation, then reactivating, invites them again', () => {
    const invited = act(base(), 'tm-lou', 'inviteUser', coachInvite())
    const id = invited.result as string
    const cancelled = act(invited.state, 'tm-lou', 'deactivateUser', id)
    expect(person(cancelled.state, id).history.at(-1)!.text).toBe('Invitation cancelled')
    const again = act(cancelled.state, 'tm-lou', 'reactivateUser', id)
    expect(person(again.state, id)).toMatchObject({ status: 'invited', invitedAt: AT })
  })

  it('nobody can turn off their own access', () => {
    expect(() => act(base(), 'admin', 'deactivateUser', 'admin')).toThrow(/your own access/)
  })

  it('a manager can’t turn off office staff or another territory’s coach', () => {
    expect(() => act(base(), 'tm-lou', 'deactivateUser', 'rep-east')).toThrow(LifecycleError)
    expect(() => act(base(), 'tm-lou', 'deactivateUser', 'u-knx-k1')).toThrow(LifecycleError)
  })
})

describe('the last operations admin', () => {
  const twoAdmins = () => {
    const invited = act(base(), 'admin', 'inviteUser', { name: 'Ops Two', email: 'ops2@example.com', role: 'ops_admin', territoryIds: [] })
    const id = invited.result as string
    return { state: act(invited.state, id, 'acceptInvite').state, id }
  }

  it('can’t be turned off or demoted', () => {
    const { state, id } = twoAdmins()
    // With two admins, one can turn the other off…
    const off = act(state, id, 'deactivateUser', 'admin')
    expect(person(off.state, 'admin').status).toBe('deactivated')
    // …but the one left can't be demoted, even by themselves.
    expect(() => act(off.state, id, 'changeAccess', id, 'territory_manager', ['lou'])).toThrow(/only active operations admin/)
  })

  it('role changes are ops-admin only and logged', () => {
    const s = base()
    expect(() => act(s, 'tm-lou', 'changeAccess', 'rep-east', 'territory_manager', ['lou'])).toThrow(LifecycleError)
    const { state } = act(s, 'admin', 'changeAccess', 'rep-east', 'territory_manager', ['knx'])
    const u = person(state, 'rep-east')
    expect(u).toMatchObject({ role: 'territory_manager', territoryIds: ['knx'] })
    expect(u.history.map((h) => h.text)).toEqual(['Role: Sales rep → Territory manager', 'Territories: Louisville + Knoxville → Knoxville'])
  })

  it('coaches aren’t moved into office roles', () => {
    expect(() => act(base(), 'admin', 'changeAccess', 'u-lou-k1', 'sales_rep', ['lou'])).toThrow(/Coaches/)
  })
})
