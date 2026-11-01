// Converts between the app's State and the database tables
// (supabase/migrations). toRows feeds the local database with the fictional
// company; fromRows will turn what a signed-in person may read back into a
// State for the screens. Nested details (groups, history, availability) stay
// as JSON; anything the read rules need to filter on is a real column.

import { DEFAULT_SETTINGS, mondayOf } from '../engine'
import type { Center, Coach, Intake, Session, Settings, Territory, User } from '../engine'
import type { State } from './actions'
import type { AuditEntry, NewAuditEntry } from './audit'

export interface TerritoryRow {
  id: string
  name: string
  state: string
  center_lat: number
  center_lng: number
}

export interface CoachRow {
  id: string
  territory_id: string
  name: string
  phone: string
  email: string
  level: Coach['level']
  active: boolean
  availability: Coach['availability']
  time_off: Coach['timeOff']
  week_changes: Coach['weekChanges']
  availability_confirmed_week: string | null
}

export interface CoachPrivateRow {
  coach_id: string
  pay_rate: number
  history: Coach['history']
}

export interface ProfileRow {
  id: string
  name: string
  email: string
  role: User['role']
  territory_ids: string[]
  coach_id: string | null
  status: User['status']
  invited_by: string | null
  invited_at: string | null
  activated_at: string | null
  deactivated_at: string | null
  deactivated_by: string | null
  history: User['history']
}

export interface CenterRow {
  id: string
  territory_id: string
  name: string
  phone: string
  address: string
  lat: number
  lng: number
  poc: Center['poc']
  space: Center['space']
}

export interface CenterTermsRow {
  center_id: string
  terms: Center['terms'] | null
  history: Center['history'] | null
}

export interface IntakeRow {
  id: string
  sales_rep_id: string
  territory_id: string
  center_id: string
  submitted_at: string
  session_ids: string[]
  schedule: Intake['schedule']
  history: Intake['history']
}

export interface SessionRow {
  id: string
  territory_id: string
  center_id: string
  date: string
  start_time: string
  end_time: string
  groups: Session['groups']
  status: Session['status']
  rescheduled_date: string | null
  rescheduled_to_id: string | null
  rescheduled_from_id: string | null
  cancel_reason: Session['cancelReason'] | null
  cancel_note: string | null
  overrides: Session['overrides']
  history: Session['history']
  intake_id: string | null
  notes: string | null
}

export interface AssignmentRow {
  session_id: string
  coach_id: string
  position: number
  confirmed_by_coach: boolean
  confirmed_at: string | null
}

export interface SettingsRow {
  id: true
  buffer_minutes: number
  avg_speed_mph: number
  ratio: number
  max_override_ratio: number
}

/** The audit log isn't part of Rows: it's only ever added to, never diffed. */
export interface AuditRow {
  id: number
  at: string
  actor_id: string | null
  actor_name: string
  action: string
  target_type: AuditEntry['targetType']
  target_id: string
  text: string
}

export const auditToRow = (e: NewAuditEntry): Omit<AuditRow, 'id'> => ({
  at: e.at,
  actor_id: e.actorId,
  actor_name: e.actorName,
  action: e.action,
  target_type: e.targetType,
  target_id: e.targetId,
  text: e.text,
})

export const auditFromRow = (r: AuditRow): AuditEntry => ({
  id: String(r.id),
  at: new Date(r.at).toISOString(),
  actorId: r.actor_id ?? '',
  actorName: r.actor_name,
  action: r.action,
  targetType: r.target_type,
  targetId: r.target_id,
  text: r.text,
})

export interface Rows {
  territories: TerritoryRow[]
  coaches: CoachRow[]
  coach_private: CoachPrivateRow[]
  profiles: ProfileRow[]
  centers: CenterRow[]
  center_terms: CenterTermsRow[]
  intakes: IntakeRow[]
  sessions: SessionRow[]
  session_assignments: AssignmentRow[]
  settings: SettingsRow[]
}

/** Tables in an order where every reference points at a row already written. */
export const TABLE_ORDER: (keyof Rows)[] = [
  'territories',
  'coaches',
  'coach_private',
  'profiles',
  'centers',
  'center_terms',
  'intakes',
  'sessions',
  'session_assignments',
  'settings',
]

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v)
const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

export function toRows(state: State): Rows {
  return {
    territories: state.territories.map((t) => ({ id: t.id, name: t.name, state: t.state, center_lat: t.center.lat, center_lng: t.center.lng })),
    coaches: state.coaches.map((c) => ({
      id: c.id,
      territory_id: c.territoryId,
      name: c.name,
      phone: c.phone,
      email: c.email,
      level: c.level,
      active: c.active,
      availability: c.availability,
      time_off: c.timeOff,
      week_changes: c.weekChanges,
      availability_confirmed_week: orNull(c.availabilityConfirmedWeek),
    })),
    coach_private: state.coaches.map((c) => ({ coach_id: c.id, pay_rate: c.payRate, history: c.history })),
    profiles: state.users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      territory_ids: u.territoryIds,
      coach_id: orNull(u.coachId),
      status: u.status,
      invited_by: orNull(u.invitedBy),
      invited_at: orNull(u.invitedAt),
      activated_at: orNull(u.activatedAt),
      deactivated_at: orNull(u.deactivatedAt),
      deactivated_by: orNull(u.deactivatedBy),
      history: u.history,
    })),
    centers: state.centers.map((c) => ({
      id: c.id,
      territory_id: c.territoryId,
      name: c.name,
      phone: c.phone,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      poc: c.poc,
      space: c.space,
    })),
    center_terms: state.centers.filter((c) => c.terms || c.history).map((c) => ({ center_id: c.id, terms: orNull(c.terms), history: orNull(c.history) })),
    intakes: state.intakes.map((i) => ({
      id: i.id,
      sales_rep_id: i.salesRepId,
      territory_id: i.territoryId,
      center_id: i.centerId,
      submitted_at: i.submittedAt,
      session_ids: i.sessionIds,
      schedule: i.schedule,
      history: i.history,
    })),
    sessions: state.sessions.map((s) => ({
      id: s.id,
      territory_id: s.territoryId,
      center_id: s.centerId,
      date: s.date,
      start_time: s.start,
      end_time: s.end,
      groups: s.groups,
      status: s.status,
      rescheduled_date: orNull(s.rescheduledDate),
      rescheduled_to_id: orNull(s.rescheduledToId),
      rescheduled_from_id: orNull(s.rescheduledFromId),
      cancel_reason: orNull(s.cancelReason),
      cancel_note: orNull(s.cancelNote),
      overrides: s.overrides,
      history: s.history,
      intake_id: orNull(s.intakeId),
      notes: orNull(s.notes),
    })),
    session_assignments: state.sessions.flatMap((s) =>
      s.assignments.map((a, position) => ({
        session_id: s.id,
        coach_id: a.coachId,
        position,
        confirmed_by_coach: a.confirmedByCoach,
        confirmed_at: orNull(a.confirmedAt),
      })),
    ),
    settings: [
      {
        id: true,
        buffer_minutes: state.settings.bufferMinutes,
        avg_speed_mph: state.settings.avgSpeedMph,
        ratio: state.settings.ratio,
        max_override_ratio: state.settings.maxOverrideRatio,
      },
    ],
  }
}

/** The database answers "09:00:00" and "2026-11-02T14:00:00+00:00"; the app uses "09:00" and ISO with Z. */
const hhmm = (t: string) => t.slice(0, 5)
const iso = (t: string) => new Date(t).toISOString()
const when = (t: string | null) => (t === null ? undefined : iso(t))

/**
 * Rebuilds a State from whatever rows the reader was allowed to see. Missing
 * rows simply mean "not yours to see": a coach gets no pay rates, so their
 * coaches come back with payRate 0 and an empty change log.
 */
export function fromRows(rows: Rows, today: string, audit: AuditRow[] = []): State {
  const pay = new Map(rows.coach_private.map((p) => [p.coach_id, p]))
  const terms = new Map(rows.center_terms.map((t) => [t.center_id, t]))
  const crews = new Map<string, AssignmentRow[]>()
  for (const a of rows.session_assignments) crews.set(a.session_id, [...(crews.get(a.session_id) ?? []), a])
  const row = rows.settings[0]
  const settings: Settings = row
    ? { bufferMinutes: row.buffer_minutes, avgSpeedMph: Number(row.avg_speed_mph), ratio: row.ratio, maxOverrideRatio: row.max_override_ratio }
    : DEFAULT_SETTINGS

  return {
    today,
    seededForWeek: mondayOf(today),
    territories: rows.territories.map((t): Territory => ({ id: t.id, name: t.name, state: t.state, center: { lat: t.center_lat, lng: t.center_lng } })),
    coaches: rows.coaches.map(
      (c): Coach => ({
        id: c.id,
        territoryId: c.territory_id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        level: c.level,
        payRate: Number(pay.get(c.id)?.pay_rate ?? 0),
        active: c.active,
        availability: c.availability,
        timeOff: c.time_off,
        weekChanges: c.week_changes,
        availabilityConfirmedWeek: orUndefined(c.availability_confirmed_week),
        history: pay.get(c.id)?.history ?? [],
      }),
    ),
    users: rows.profiles.map(
      (p): User => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        territoryIds: p.territory_ids,
        coachId: orUndefined(p.coach_id),
        status: p.status,
        invitedBy: orUndefined(p.invited_by),
        invitedAt: when(p.invited_at),
        activatedAt: when(p.activated_at),
        deactivatedAt: when(p.deactivated_at),
        deactivatedBy: orUndefined(p.deactivated_by),
        history: p.history,
      }),
    ),
    centers: rows.centers.map((c): Center => {
      const t = terms.get(c.id)
      return {
        id: c.id,
        territoryId: c.territory_id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        lat: c.lat,
        lng: c.lng,
        poc: c.poc,
        space: c.space,
        terms: orUndefined(t?.terms ?? null),
        history: orUndefined(t?.history ?? null),
      }
    }),
    intakes: rows.intakes.map(
      (i): Intake => ({
        id: i.id,
        salesRepId: i.sales_rep_id,
        territoryId: i.territory_id,
        centerId: i.center_id,
        submittedAt: iso(i.submitted_at),
        sessionIds: i.session_ids,
        schedule: i.schedule,
        history: i.history,
      }),
    ),
    sessions: rows.sessions.map(
      (s): Session => ({
        id: s.id,
        territoryId: s.territory_id,
        centerId: s.center_id,
        date: s.date,
        start: hhmm(s.start_time),
        end: hhmm(s.end_time),
        groups: s.groups,
        status: s.status,
        assignments: (crews.get(s.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((a) => ({ coachId: a.coach_id, confirmedByCoach: a.confirmed_by_coach, confirmedAt: a.confirmed_at === null ? undefined : iso(a.confirmed_at) })),
        rescheduledDate: orUndefined(s.rescheduled_date),
        rescheduledToId: orUndefined(s.rescheduled_to_id),
        rescheduledFromId: orUndefined(s.rescheduled_from_id),
        cancelReason: orUndefined(s.cancel_reason ?? null),
        cancelNote: orUndefined(s.cancel_note),
        overrides: s.overrides,
        history: s.history,
        intakeId: orUndefined(s.intake_id),
        notes: orUndefined(s.notes),
      }),
    ),
    settings,
    audit: [...audit].sort((a, b) => a.id - b.id).map(auditFromRow),
  }
}

/** Rows to write after an action, for the database's apply_changes. */
export type Changes = Partial<Rows> & {
  /** Sessions whose coaching staff is replaced as a whole (rows in session_assignments). */
  replace_assignments?: string[]
}

const KEYS: Record<keyof Rows, (r: never) => string> = {
  territories: (r: TerritoryRow) => r.id,
  coaches: (r: CoachRow) => r.id,
  coach_private: (r: CoachPrivateRow) => r.coach_id,
  profiles: (r: ProfileRow) => r.id,
  centers: (r: CenterRow) => r.id,
  center_terms: (r: CenterTermsRow) => r.center_id,
  intakes: (r: IntakeRow) => r.id,
  sessions: (r: SessionRow) => r.id,
  session_assignments: (r: AssignmentRow) => `${r.session_id}/${r.coach_id}`,
  settings: () => 'settings',
}

/**
 * What an action changed: new and changed rows per table. Nothing may
 * disappear (records are never deleted); the one exception is a session's
 * coaching staff, which is sent whole for every session whose staff changed.
 */
export function diffRows(before: Rows, after: Rows): Changes {
  const changes: Changes = {}
  for (const table of TABLE_ORDER) {
    if (table === 'session_assignments') continue
    const key = KEYS[table] as (r: unknown) => string
    const old = new Map((before[table] as unknown[]).map((r) => [key(r), JSON.stringify(r)]))
    const next = new Set((after[table] as unknown[]).map(key))
    for (const k of old.keys()) if (!next.has(k)) throw new Error(`Records are never deleted (${table} ${k}).`)
    const changed = (after[table] as unknown[]).filter((r) => old.get(key(r)) !== JSON.stringify(r))
    if (changed.length) (changes as Record<string, unknown[]>)[table] = changed
  }
  const crew = (rows: AssignmentRow[]) => {
    const by = new Map<string, AssignmentRow[]>()
    for (const a of rows) by.set(a.session_id, [...(by.get(a.session_id) ?? []), a])
    return by
  }
  const was = crew(before.session_assignments)
  const now = crew(after.session_assignments)
  const touched = [...new Set([...was.keys(), ...now.keys()])].filter((id) => JSON.stringify(was.get(id) ?? []) !== JSON.stringify(now.get(id) ?? []))
  if (touched.length) {
    changes.replace_assignments = touched
    const rows = touched.flatMap((id) => now.get(id) ?? [])
    if (rows.length) changes.session_assignments = rows
  }
  return changes
}
