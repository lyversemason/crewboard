// Core data model. Everything the app stores is one of these shapes.

export type Role = 'ops_admin' | 'territory_manager' | 'sales_rep' | 'coach'

/** Lead coaches can run a session alone; assistants and trainees cannot. */
export type CoachLevel = 'lead' | 'assistant' | 'trainee'

/** 1 = Monday ... 6 = Saturday. Sessions never run on Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6

export type SessionStatus = 'pending' | 'confirmed' | 'rescheduled' | 'cancelled'

export interface Territory {
  id: string
  name: string
  state: string
  center: { lat: number; lng: number }
}

/** invited: can't sign in until they accept · active · deactivated: locked out, history kept. */
export type AccountStatus = 'invited' | 'active' | 'deactivated'

export interface User {
  id: string
  name: string
  /** Sign-in email. */
  email: string
  role: Role
  /** Territories this user may see. Ops admins see all regardless. */
  territoryIds: string[]
  /** Set for coaches: which roster entry this login belongs to. */
  coachId?: string
  status: AccountStatus
  invitedBy?: string
  invitedAt?: string
  activatedAt?: string
  deactivatedAt?: string
  deactivatedBy?: string
  /** Account changes: invited, accepted, role changed, deactivated… */
  history: HistoryEntry[]
}

export interface Coach {
  id: string
  territoryId: string
  name: string
  phone: string
  email: string
  level: CoachLevel
  /** Dollars per hour. Management-only. */
  payRate: number
  active: boolean
  /** Hours (9..17) the coach is usually free, per weekday. 9 means 9:00-10:00. */
  availability: Record<Weekday, number[]>
  /** Whole days off (vacations, exams). Past entries simply stop mattering. */
  timeOff: TimeOff[]
  /** One-week changes, keyed by that week's Monday. They replace the usual week. */
  weekChanges: Record<string, Record<Weekday, number[]>>
  /** Monday of the latest week the coach confirmed their availability for. */
  availabilityConfirmedWeek?: string
  /** Who changed level, pay rate or contact details, and when. */
  history: HistoryEntry[]
}

export interface TimeOff {
  id: string
  /** First and last day off, inclusive (YYYY-MM-DD). */
  from: string
  to: string
  note?: string
}

export interface PointOfContact {
  name: string
  title: string
  email: string
  phone: string
  ext?: string
}

export type SpaceCategory = 'indoor' | 'outdoor'

export interface SpaceProfile {
  category: SpaceCategory
  indoorSize?: 'small_bedroom' | 'average_bedroom' | 'large_master_bedroom' | 'larger'
  floor?: string
  outdoorSurface?: 'short_grass' | 'long_grass' | 'turf' | 'mulch' | 'rubber' | 'blacktop'
  grade: 'flat' | 'sloped'
  obstacles: string[]
  backupIndoorSpace: boolean
}

export const CYCLE_WEEKS = [1, 2, 4, 8, 10, 12, 16, 20] as const
export type CycleWeeks = (typeof CYCLE_WEEKS)[number]

/**
 * What the center bought: entered by sales at signing, confirmed by management.
 * Customers pay for the whole cycle, not week to week.
 */
export interface ProgramTerms {
  /** Date of the first session of the current cycle. */
  startDate: string
  cycleWeeks: CycleWeeks
  /** Which days of the week sessions run (1 to 3 days). */
  weekdays: Weekday[]
  /**
   * A day that starts later than the program, e.g. Thursdays from Oct 15 but
   * Fridays from Oct 23. Each day runs `cycleWeeks` weeks from its own first date.
   * Days not listed start on the first matching date on or after `startDate`.
   */
  firstDates?: Partial<Record<Weekday, string>>
  /** Total price for the cycle, in dollars. */
  cycleRate: number
}

export interface Center {
  id: string
  territoryId: string
  name: string
  phone: string
  address: string
  lat: number
  lng: number
  poc: PointOfContact
  space: SpaceProfile
  terms?: ProgramTerms
  /** Changes to the program terms after signing. */
  history?: HistoryEntry[]
}

/** One group of kids that turns over inside a session block. */
export interface Group {
  players: number
  ageRange: string
  minutes: number
  supportNotes?: string
}

export interface Assignment {
  coachId: string
  confirmedByCoach: boolean
  confirmedAt?: string
}

export interface OverrideRecord {
  code: ViolationCode
  message: string
  by: string
  at: string
}

export interface HistoryEntry {
  at: string
  by: string
  text: string
}

export const CANCEL_REASONS = {
  facility_closed: 'Facility closed',
  weather: 'Weather (no backup space)',
  low_enrollment: 'Low enrollment',
  contract_ended: 'Contract ended',
  no_coach: 'No coach available',
  changed_by_sales: 'Program changed before it started',
  other: 'Other',
} as const
export type CancelReason = keyof typeof CANCEL_REASONS

export interface Session {
  id: string
  territoryId: string
  centerId: string
  /** YYYY-MM-DD, local to the territory. */
  date: string
  /** HH:MM, 24-hour. */
  start: string
  end: string
  groups: Group[]
  status: SessionStatus
  assignments: Assignment[]
  /** Required when status is rescheduled: the date it moved to. */
  rescheduledDate?: string
  rescheduledToId?: string
  rescheduledFromId?: string
  cancelReason?: CancelReason
  cancelNote?: string
  overrides: OverrideRecord[]
  history: HistoryEntry[]
  intakeId?: string
  notes?: string
}

/** One weekday of a program: when it starts and its own times and groups. */
export interface ProgramDay {
  weekday: Weekday
  /** The first session on this weekday (must fall on that weekday). */
  firstDate: string
  start: string
  end: string
  groups: Group[]
}

/** The scheduling part of a sales intake, kept so the rep can edit it later. */
export interface IntakeSchedule {
  days: ProgramDay[]
  notes?: string
}

export interface Intake {
  id: string
  salesRepId: string
  territoryId: string
  centerId: string
  submittedAt: string
  sessionIds: string[]
  schedule: IntakeSchedule
  history: HistoryEntry[]
}

export interface Settings {
  /** Minutes added on top of drive time between two different centers. */
  bufferMinutes: number
  /** Average driving speed used to turn distance into minutes. */
  avgSpeedMph: number
  /** Children per coach before a second coach is required. */
  ratio: number
  /** Most children one coach may take when a manager overrides the ratio. */
  maxOverrideRatio: number
}

export const DEFAULT_SETTINGS: Settings = {
  bufferMinutes: 30,
  avgSpeedMph: 25,
  ratio: 12,
  maxOverrideRatio: 18,
}

export type ViolationCode =
  | 'overlap'
  | 'travel'
  | 'ratio'
  | 'ratio_max'
  | 'no_lead'
  | 'unavailable'
  | 'wrong_territory'
  | 'inactive'

/**
 * block    = can never be saved (physically impossible or against hard policy).
 * override = a manager may save it after confirming the exact warning.
 */
export type Severity = 'block' | 'override'

export interface Violation {
  code: ViolationCode
  severity: Severity
  /** The sentence shown in the confirmation dialog. */
  message: string
  /** Plain-language specifics: who, which session, by how many minutes. */
  detail: string
  coachId?: string
  /** For overlap/travel: the other session involved. */
  otherSessionId?: string
}

export interface World {
  sessions: Session[]
  coaches: Coach[]
  centers: Center[]
  settings: Settings
}
