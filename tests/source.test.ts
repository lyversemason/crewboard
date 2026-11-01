// The data layer: actions are pure, and a data source only changes when an action succeeds.

import { describe, expect, it } from 'vitest'
import { LifecycleError } from '../src/engine'
import { ACTIONS } from '../src/data/actions'
import type { State } from '../src/data/actions'
import { demoSource } from '../src/data/source'
import * as store from '../src/store'

const userOf = (state: State, id: string) => state.users.find((u) => u.id === id)!
const louSession = (state: State) => state.sessions.find((s) => s.territoryId === 'lou' && s.status === 'pending')!

describe('actions', () => {
  it('return a new state and never change the one they were given', () => {
    const state = demoSource().getState()
    const before = JSON.stringify(state)
    const s = louSession(state)
    const out = ACTIONS.confirmWithFacility({ state, user: userOf(state, 'tm-lou'), at: '2026-11-01T12:00:00.000Z' }, s.id)
    expect(JSON.stringify(state)).toBe(before)
    expect(out.state).not.toBe(state)
    expect(out.state.sessions.find((x) => x.id === s.id)!.status).toBe('confirmed')
  })

  it('return the same state object when nothing changes', () => {
    const state = demoSource().getState()
    const c = state.coaches.find((x) => x.territoryId === 'lou')!
    const out = ACTIONS.updateCoach({ state, user: userOf(state, 'tm-lou'), at: '2026-11-01T12:00:00.000Z' }, c.id, { level: c.level, payRate: c.payRate, phone: c.phone, email: c.email, active: c.active })
    expect(out.state).toBe(state)
  })

  it('all have a store function the screens can call', () => {
    for (const name of Object.keys(ACTIONS)) expect(typeof (store as Record<string, unknown>)[name], name).toBe('function')
  })
})

describe('demo source', () => {
  it('saves a successful action and tells subscribers once', async () => {
    const source = demoSource()
    const state = source.getState()
    let calls = 0
    const stop = source.subscribe(() => calls++)
    const s = louSession(state)
    await source.run('confirmWithFacility', userOf(state, 'tm-lou'), [s.id])
    stop()
    expect(calls).toBe(1)
    expect(source.getState().sessions.find((x) => x.id === s.id)!.status).toBe('confirmed')
  })

  it('leaves everything untouched when an action is refused', async () => {
    const source = demoSource()
    const state = source.getState()
    let calls = 0
    source.subscribe(() => calls++)
    await expect(source.run('confirmWithFacility', userOf(state, 'tm-knx'), [louSession(state).id])).rejects.toThrow(LifecycleError)
    expect(source.getState()).toBe(state)
    expect(calls).toBe(0)
  })

  it('reset rebuilds the fictional company', async () => {
    const source = demoSource()
    const state = source.getState()
    const s = louSession(state)
    await source.run('confirmWithFacility', userOf(state, 'tm-lou'), [s.id])
    source.reset!()
    expect(source.getState().sessions.find((x) => x.id === s.id)!.status).toBe('pending')
  })
})
