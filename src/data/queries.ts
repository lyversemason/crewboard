// Questions a screen asks without changing anything. Like actions they get
// the whole picture (state) and who is asking, so in live mode they run on the
// server, which can see what the asker can't, and answer only what the asker
// may know.

import { LifecycleError, canSubmitIntake, checkProgramCoverage, suggestSlots, weekdayOf, weeklyDates } from '../engine'
import type { CoverageRequest, CoverageResult, ProgramDay, SlotSuggestion, Weekday } from '../engine'
import { worldOf } from './actions'
import type { Ctx } from './actions'

export interface CoverageInput {
  territoryId: string
  location: { lat: number; lng: number }
  days: ProgramDay[]
  cycleWeeks: number
  /** When editing a submission: its own sessions don't count as conflicts. */
  editingIntakeId?: string
}

export interface CoverageAnswer {
  coverage: CoverageResult
  /** The first weekday that can't be staffed, and open slots to offer instead. */
  stuckWeekday?: Weekday
  suggestions: SlotSuggestion[]
}

/**
 * The sales form's "can our coaching staff cover this?" check. A rep can't
 * read other people's sessions, so in live mode this runs on the server. The
 * answer says how many coaches are free, never who.
 */
function salesCoverage({ state, user }: Ctx, input: CoverageInput): CoverageAnswer {
  if (!canSubmitIntake(user, input.territoryId)) throw new LifecycleError('You can’t check coverage for this territory.')
  const editing = input.editingIntakeId ? state.intakes.find((i) => i.id === input.editingIntakeId) : undefined
  if (input.editingIntakeId && (!editing || (user.role === 'sales_rep' && editing.salesRepId !== user.id))) throw new LifecycleError('Submission not found.')
  const all = worldOf(state)
  const world = editing ? { ...all, sessions: all.sessions.filter((s) => s.intakeId !== editing.id) } : all

  const sorted = [...input.days].sort((a, b) => a.weekday - b.weekday)
  const result = checkProgramCoverage(input.territoryId, input.location, sorted, input.cycleWeeks, world)
  const coverage = { ...result, dates: result.dates.map((d) => ({ ...d, exampleCrew: [] })) }
  const stuck = !result.ok ? sorted.find((d) => result.dates.some((c) => !c.ok && weekdayOf(c.date) === d.weekday)) : undefined
  if (!stuck) return { coverage, suggestions: [] }
  const req: CoverageRequest = {
    territoryId: input.territoryId,
    location: input.location,
    dates: weeklyDates(stuck.firstDate, input.cycleWeeks),
    start: stuck.start,
    end: stuck.end,
    groups: stuck.groups,
  }
  const suggestions = suggestSlots(req, world).filter((sg) => sg.weekdays[0] === stuck.weekday || !sorted.some((d) => d.weekday === sg.weekdays[0]))
  return { coverage, stuckWeekday: stuck.weekday, suggestions }
}

export const QUERIES = { salesCoverage }

export type QueryName = keyof typeof QUERIES
export type QueryArgs<N extends QueryName> = (typeof QUERIES)[N] extends (ctx: Ctx, ...args: infer A) => unknown ? A : never
export type QueryResult<N extends QueryName> = ReturnType<(typeof QUERIES)[N]>
