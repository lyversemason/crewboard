// The screens' only way to read or change data. Every change is a named
// action (src/data/actions.ts) run by the data source (src/data/source.ts),
// so permission checks and rules can't be skipped. Changes are async because
// a live source will wait on a server; the demo source answers at once.

import { useSyncExternalStore } from 'react'
import type { User } from './engine'
import type { ActionArgs, ActionName, ActionResult, State } from './data/actions'
import { createLive } from './data/live'
import type { AuthState } from './data/live'
import { demoSource } from './data/source'

export { worldOf } from './data/actions'
export type { BulkResult, CoachEdit, DeactivateResult, IntakeInput, InviteInput, SaveCrewResult, State } from './data/actions'
export type { AuthState } from './data/live'

// Live mode only when the build is given a database (npm run dev:live). The
// public demo has none, so it never loads the database code.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const live = url && key ? createLive(url, key) : undefined
const source = live?.source ?? demoSource()

export const mode = source.kind
/** Sign-in for live mode; undefined in the demo. */
export const auth = live?.auth

export function useStore(): State {
  return useSyncExternalStore(source.subscribe, source.getState)
}

const noSubscribe = () => () => {}
const noAuth = () => undefined

/** Live mode's sign-in state; undefined in the demo. */
export function useAuth(): AuthState | undefined {
  return useSyncExternalStore(auth?.subscribe ?? noSubscribe, auth?.get ?? noAuth)
}

export const getState = () => source.getState()

export function resetDemo() {
  source.reset?.()
}

const action =
  <N extends ActionName>(name: N) =>
  (user: User, ...args: ActionArgs<N>): Promise<ActionResult<N>> =>
    source.run(name, user, args)

export const saveCrew = action('saveCrew')
export const staffOpenSessions = action('staffOpenSessions')
export const confirmProgramWithFacility = action('confirmProgramWithFacility')
export const confirmWithFacility = action('confirmWithFacility')
export const reschedule = action('reschedule')
export const cancel = action('cancel')
export const coachConfirmMany = action('coachConfirmMany')
export const setAvailability = action('setAvailability')
export const setWeekChange = action('setWeekChange')
export const addTimeOff = action('addTimeOff')
export const removeTimeOff = action('removeTimeOff')
export const confirmAvailability = action('confirmAvailability')
export const updateCoach = action('updateCoach')
export const updateSettings = action('updateSettings')
export const updateTerms = action('updateTerms')
export const submitIntake = action('submitIntake')
export const updateIntake = action('updateIntake')
export const inviteUser = action('inviteUser')
export const resendInvite = action('resendInvite')
export const acceptInvite = action('acceptInvite')
export const deactivateUser = action('deactivateUser')
export const reactivateUser = action('reactivateUser')
export const changeAccess = action('changeAccess')
