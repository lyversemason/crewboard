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

export interface User {
  id: string
  name: string
  role: Role
  /** Territories this user may see. Ops admins see all regardless. */
  territoryIds: string[]
  /** Set for coaches: which roster entry this login belongs to. */
  coachId?: string
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
  /** Hours (9..17) the coach is free, per weekday. 9 means 9:00-10:00. */
  availability: Record<Weekday, number[]>
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

/** Contract money. Only ops admins and territory managers may see this. */
export interface ProgramTerms {
  cycleWeeks: 1 | 2 | 4 | 8 | 12 | 20
  sessionsPerWeek: 1 | 2 | 3
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

export interface Intake {
  id: string
  salesRepId: string
  territoryId: string
  centerId: string
  submittedAt: string
  sessionIds: string[]
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
}

export interface World {
  sessions: Session[]
  coaches: Coach[]
  centers: Center[]
  settings: Settings
}
