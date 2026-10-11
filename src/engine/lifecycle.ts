// Session status lifecycle: pending -> confirmed -> rescheduled / cancelled.
// There is deliberately no delete. Rescheduling keeps the original record and
// creates a linked new one; cancelling keeps the record with a reason code.

import { slotLabel } from './time'
import { CANCEL_REASONS } from './types'
import type { CancelReason, Session } from './types'

export class LifecycleError extends Error {}

/** Longest note allowed on a cancellation or reschedule. */
export const NOTE_MAX = 300

function cleanNote(note: string | undefined): string {
  const n = (note ?? '').trim()
  if (n.length > NOTE_MAX) throw new LifecycleError(`Keep the note under ${NOTE_MAX} characters (it has ${n.length}).`)
  return n
}

function log(s: Session, by: string, at: string, text: string): Session['history'] {
  return [...s.history, { at, by, text }]
}

export function confirmSession(s: Session, by: string, at: string): Session {
  if (s.status !== 'pending') throw new LifecycleError(`Only pending sessions can be confirmed (this one is ${s.status}).`)
  return { ...s, status: 'confirmed', history: log(s, by, at, 'Confirmed with the facility') }
}

export interface RescheduleInput {
  newDate: string
  newStart?: string
  newEnd?: string
  newId: string
  by: string
  at: string
  /** Why it moved, e.g. "Field trip that day". */
  note?: string
}

/**
 * Returns [the original, now marked rescheduled; the new session].
 * The new session keeps the crew, but coaches must re-confirm.
 */
export function rescheduleSession(s: Session, input: RescheduleInput): [Session, Session] {
  if (s.status !== 'pending' && s.status !== 'confirmed') {
    throw new LifecycleError(`A ${s.status} session can't be rescheduled.`)
  }
  if (!input.newDate) throw new LifecycleError('Rescheduled Date is required.')
  const note = cleanNote(input.note)
  const why = note ? ` (${note})` : ''
  const start = input.newStart ?? s.start
  const end = input.newEnd ?? s.end
  if (input.newDate === s.date && start === s.start && end === s.end) {
    throw new LifecycleError('Pick a different date or time.')
  }
  const old: Session = {
    ...s,
    status: 'rescheduled',
    rescheduledDate: input.newDate,
    rescheduledToId: input.newId,
    history: log(s, input.by, input.at, `Rescheduled to ${slotLabel(input.newDate, start, end)}${why}`),
  }
  const moved: Session = {
    ...s,
    id: input.newId,
    date: input.newDate,
    start,
    end,
    status: s.status,
    rescheduledDate: undefined,
    rescheduledToId: undefined,
    rescheduledFromId: s.id,
    assignments: s.assignments.map((a) => ({ coachId: a.coachId, confirmedByCoach: false })),
    overrides: [],
    history: [{ at: input.at, by: input.by, text: `Moved here from ${slotLabel(s.date, s.start, s.end)}${why}` }],
  }
  return [old, moved]
}

export function cancelSession(s: Session, reason: CancelReason, note: string, by: string, at: string): Session {
  if (s.status !== 'pending' && s.status !== 'confirmed') {
    throw new LifecycleError(`A ${s.status} session can't be cancelled.`)
  }
  if (!(reason in CANCEL_REASONS)) throw new LifecycleError('A cancellation reason code is required.')
  if (reason === 'other' && !note.trim()) throw new LifecycleError('Explain the reason when choosing "Other".')
  note = cleanNote(note)
  return {
    ...s,
    status: 'cancelled',
    cancelReason: reason,
    cancelNote: note || undefined,
    history: log(s, by, at, `Cancelled: ${CANCEL_REASONS[reason]}${note ? ` (${note})` : ''}`),
  }
}

/** A coach confirms they will work an assigned session. */
export function coachConfirm(s: Session, coachId: string, at: string): Session {
  if (s.status === 'cancelled' || s.status === 'rescheduled') throw new LifecycleError('This session is no longer running.')
  if (!s.assignments.some((a) => a.coachId === coachId)) throw new LifecycleError('You are not assigned to this session.')
  return {
    ...s,
    assignments: s.assignments.map((a) =>
      a.coachId === coachId && !a.confirmedByCoach ? { ...a, confirmedByCoach: true, confirmedAt: at } : a,
    ),
  }
}
