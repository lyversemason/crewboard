// Role-based access. Every screen reads data through these functions, so a
// territory manager in Knoxville never receives Louisville's records at all.

import type { Coach, Intake, Role, Session, User } from './types'

export function canSeeTerritory(user: User, territoryId: string): boolean {
  if (user.role === 'ops_admin') return true
  if (user.role === 'coach') return false // coaches see their own shifts, not a territory calendar
  return user.territoryIds.includes(territoryId)
}

/** Only management sees coach pay rates and margins. */
export function canSeeMoney(user: User): boolean {
  return user.role === 'ops_admin' || user.role === 'territory_manager'
}

/** Program prices: management, plus the sales rep who signed the center. */
export function canSeePrice(user: User, intake?: Intake): boolean {
  return canSeeMoney(user) || (user.role === 'sales_rep' && !!intake && intake.salesRepId === user.id)
}

/** Sales enters the terms; after signing only an ops admin may change them. */
export function canEditTerms(user: User): boolean {
  return user.role === 'ops_admin'
}

/** Level, pay rate, contact details, active: management in that territory. Every change is logged. */
export function canEditCoach(user: User, coach: Pick<Coach, 'territoryId'>): boolean {
  return canAssign(user, coach.territoryId)
}

/** Availability belongs to the coach. Managers can read it, not change it. */
export function canEditAvailability(user: User, coach: Pick<Coach, 'id'>): boolean {
  return user.role === 'coach' && user.coachId === coach.id
}

/**
 * A rep can change their own submission while a territory manager hasn't
 * confirmed any of its sessions and the program hasn't started.
 */
export function canEditIntake(user: User, intake: Intake, sessions: Session[], today: string): boolean {
  if (user.role !== 'sales_rep' || intake.salesRepId !== user.id) return false
  const mine = sessions.filter((s) => s.intakeId === intake.id && s.status !== 'cancelled')
  return mine.length > 0 && mine.every((s) => s.status === 'pending' && s.date > today)
}

export function canAssign(user: User, territoryId: string): boolean {
  return (user.role === 'ops_admin' || user.role === 'territory_manager') && canSeeTerritory(user, territoryId)
}

/** Managers can override 'override'-severity rules. Nobody can override a 'block'. */
export const canOverride = canAssign

export function canChangeSettings(user: User): boolean {
  return user.role === 'ops_admin'
}

export function canSubmitIntake(user: User, territoryId: string): boolean {
  return user.role !== 'coach' && canSeeTerritory(user, territoryId)
}

export function visibleSessions(user: User, sessions: Session[]): Session[] {
  if (user.role === 'coach') {
    return sessions.filter((s) => s.assignments.some((a) => a.coachId === user.coachId))
  }
  if (user.role === 'sales_rep') return [] // sales works the intake pipeline, not the calendar
  return sessions.filter((s) => canSeeTerritory(user, s.territoryId))
}

export function visibleIntakes(user: User, intakes: Intake[]): Intake[] {
  if (user.role === 'sales_rep') return intakes.filter((i) => i.salesRepId === user.id)
  if (user.role === 'coach') return []
  return intakes.filter((i) => canSeeTerritory(user, i.territoryId))
}

/** A rep may follow the status of sessions their own intake created, nothing else. */
export function intakeSessions(user: User, intake: Intake, sessions: Session[]): Session[] {
  if (!visibleIntakes(user, [intake]).length) return []
  return sessions.filter((s) => s.intakeId === intake.id)
}

/** Pay rate is removed, not hidden, for anyone outside management. */
export type PublicCoach = Omit<Coach, 'payRate'> & { payRate?: number }

export function visibleRoster(user: User, coaches: Coach[]): PublicCoach[] {
  if (user.role === 'coach') {
    const me = coaches.find((c) => c.id === user.coachId)
    // Territory directory: active peers' names and phones only.
    return coaches
      .filter((c) => me && c.territoryId === me.territoryId && c.active)
      .map(({ payRate: _pay, ...rest }) => rest)
  }
  const inScope = coaches.filter((c) => canSeeTerritory(user, c.territoryId))
  return canSeeMoney(user) ? inScope : inScope.map(({ payRate: _pay, ...rest }) => rest)
}

// ---------------------------------------------------------------- accounts

/**
 * Who may invite whom: ops admins anyone, anywhere; territory managers only
 * coaches, and only into their own territory.
 */
export function canInvite(user: User, role: Role, territoryIds: string[]): boolean {
  if (user.role === 'ops_admin') return true
  return user.role === 'territory_manager' && role === 'coach' && territoryIds.length === 1 && user.territoryIds.includes(territoryIds[0])
}

/**
 * Resend or cancel an invite, turn access off or back on: ops admins for
 * anyone, territory managers for coaches in their territory. Never yourself.
 */
export function canManageAccount(user: User, target: User): boolean {
  if (user.id === target.id) return false
  if (user.role === 'ops_admin') return true
  return user.role === 'territory_manager' && target.role === 'coach' && target.territoryIds.every((t) => user.territoryIds.includes(t))
}

/** Changing someone's role or territories: ops admins only. */
export function canChangeAccess(user: User): boolean {
  return user.role === 'ops_admin'
}

/** The Accounts screen: ops admins see everyone, territory managers the people in their territories. */
export function visibleAccounts(user: User, users: User[]): User[] {
  if (user.role === 'ops_admin') return users
  if (user.role !== 'territory_manager') return []
  return users.filter((u) => u.territoryIds.some((t) => user.territoryIds.includes(t)))
}
