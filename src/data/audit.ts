// The company-wide audit log: one entry per logged change, saying who did
// what, to what, and when. Entries come from the change notes every action
// already writes on sessions, coaches, people, centers and submissions, so
// the log and those histories always agree. Settings have no history of their
// own, so their changes are spelled out here.
//
// The demo keeps the log in the browser; live mode writes it in the same
// transaction as the change, to a table nobody can edit or delete.

import type { HistoryEntry, Settings, User } from '../engine'
import type { ActionName, State } from './actions'

export type AuditTarget = 'session' | 'coach' | 'person' | 'center' | 'intake' | 'settings'

export interface AuditEntry {
  id: string
  at: string
  /** Who did it (a person's id; the name is kept in case they're renamed). */
  actorId: string
  actorName: string
  /** The action that made the change, e.g. "reschedule". */
  action: string
  targetType: AuditTarget
  targetId: string
  text: string
}

export type NewAuditEntry = Omit<AuditEntry, 'id'>

type WithHistory = { id: string; history?: HistoryEntry[] }

/** History entries an action added: everything past what each record had before. */
function added<T extends WithHistory>(before: T[], after: T[]): { id: string; entry: HistoryEntry }[] {
  const had = new Map(before.map((x) => [x.id, x.history?.length ?? 0]))
  return after.flatMap((x) => (x.history ?? []).slice(had.get(x.id) ?? 0).map((entry) => ({ id: x.id, entry })))
}

const SETTING_LABEL: Record<keyof Settings, (v: number) => string> = {
  bufferMinutes: (v) => `${v} min`,
  avgSpeedMph: (v) => `${v} mph`,
  ratio: (v) => `1:${v}`,
  maxOverrideRatio: (v) => `1:${v}`,
}
const SETTING_NAME: Record<keyof Settings, string> = {
  bufferMinutes: 'Travel buffer',
  avgSpeedMph: 'Average driving speed',
  ratio: 'Coach ratio',
  maxOverrideRatio: 'Most children per coach with an override',
}

/** What one action changed, as audit entries (without ids; the store assigns them). */
export function auditEntries(before: State, after: State, actor: User, action: ActionName, at: string): NewAuditEntry[] {
  const entry = (targetType: AuditTarget, targetId: string, text: string, when = at): NewAuditEntry => ({
    at: when,
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetType,
    targetId,
    text,
  })
  const out: NewAuditEntry[] = [
    ...added(before.users, after.users).map(({ id, entry: e }) => entry('person', id, e.text, e.at)),
    ...added(before.coaches, after.coaches).map(({ id, entry: e }) => entry('coach', id, e.text, e.at)),
    ...added(before.centers, after.centers).map(({ id, entry: e }) => entry('center', id, e.text, e.at)),
    ...added(before.intakes, after.intakes).map(({ id, entry: e }) => entry('intake', id, e.text, e.at)),
    ...added(before.sessions, after.sessions).map(({ id, entry: e }) => entry('session', id, e.text, e.at)),
  ]
  for (const key of Object.keys(SETTING_NAME) as (keyof Settings)[]) {
    const [was, now] = [before.settings[key], after.settings[key]]
    if (was !== now) out.push(entry('settings', 'settings', `${SETTING_NAME[key]}: ${SETTING_LABEL[key](was)} → ${SETTING_LABEL[key](now)}`))
  }
  return out
}

/**
 * The demo's starting log: the changes the fictional managers already made
 * (overrides, reschedules, cancellations), so the screen isn't empty.
 */
export function auditFromHistory(state: State): AuditEntry[] {
  const byName = new Map(state.users.map((u) => [u.name, u]))
  const all = [
    ...state.sessions.flatMap((s) => s.history.map((e) => ({ type: 'session' as const, id: s.id, e }))),
    ...state.intakes.flatMap((i) => i.history.map((e) => ({ type: 'intake' as const, id: i.id, e }))),
  ]
  return all
    .filter(({ e }) => byName.has(e.by))
    .sort((a, b) => a.e.at.localeCompare(b.e.at))
    .map(({ type, id, e }, n) => ({
      id: `a${n + 1}`,
      at: e.at,
      actorId: byName.get(e.by)!.id,
      actorName: e.by,
      action: 'demo setup',
      targetType: type,
      targetId: id,
      text: e.text,
    }))
}
