// Plain formatting helpers shared by the screens.

import { prettyDate, prettyTime, slotLabel } from '../engine'
import type { Coach, CoachLevel, Role, Session, SessionStatus, Violation } from '../engine'

/** Where a rescheduled session went: "Mon Oct 12, 11:30am" (or the full slot). */
export function movedTo(s: Session, sessions: Session[], full = false): string {
  const to = sessions.find((x) => x.id === s.rescheduledToId)
  if (!to) return s.rescheduledDate ? prettyDate(s.rescheduledDate) : ''
  return full ? slotLabel(to.date, to.start, to.end) : `${prettyDate(to.date)}, ${prettyTime(to.start)}`
}

export const LEVEL_LABEL: Record<CoachLevel, string> = { lead: 'Lead', assistant: 'Assistant', trainee: 'In training' }
export const STATUS_LABEL: Record<SessionStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  rescheduled: 'Rescheduled',
  cancelled: 'Cancelled',
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
export const smsHref = (phone: string) => `sms:${phone.replace(/[^\d+]/g, '')}`
export const mapHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

/** The warning sentence without the "Are you sure..." prefix, for lists. */
export function shortWarning(v: Violation): string {
  return v.message.replace(/^.*Warning: /, '')
}

export function crewSummary(s: Session, coaches: Coach[]): string {
  if (!s.assignments.length) return 'No coach assigned'
  return s.assignments.map((a) => coaches.find((c) => c.id === a.coachId)?.name.split(' ')[0] ?? '?').join(', ')
}

export const kids = (s: Session) => s.groups.reduce((n, g) => n + g.players, 0)

export function money(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export const ROLE_LABEL: Record<Role, string> = {
  ops_admin: 'Operations admin',
  territory_manager: 'Territory manager',
  sales_rep: 'Sales rep',
  coach: 'Coach',
}
