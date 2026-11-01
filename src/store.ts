// The screens' only way to read or change data. Every change is a named
// action (src/data/actions.ts) run by the data source (src/data/source.ts),
// so permission checks and rules can't be skipped. Changes are async because
// a live source will wait on a server; the demo source answers at once.

import { useSyncExternalStore } from 'react'
import type { User } from './engine'
import type { ActionArgs, ActionName, ActionResult, State } from './data/actions'
import { demoSource } from './data/source'

export { worldOf } from './data/actions'
export type { BulkResult, CoachEdit, IntakeInput, SaveCrewResult, State } from './data/actions'

const source = demoSource()

export function useStore(): State {
  return useSyncExternalStore(source.subscribe, source.getState)
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
