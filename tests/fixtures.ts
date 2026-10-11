// Tiny hand-built world for tests: two centers ~6 miles apart in one
// territory, one far-away territory, and a few coaches.

import { DEFAULT_SETTINGS } from '../src/engine'
import type { Center, Coach, Session, Weekday, World } from '../src/engine'

const allDay = (): Record<Weekday, number[]> => {
  const hours = [9, 10, 11, 12, 13, 14, 15, 16, 17]
  return { 1: hours, 2: hours, 3: hours, 4: hours, 5: hours, 6: hours }
}

export function coach(id: string, level: Coach['level'], over: Partial<Coach> = {}): Coach {
  return {
    id,
    territoryId: 'lou',
    name: id,
    phone: '502-555-0100',
    email: `${id}@example.com`,
    level,
    payRate: 20,
    active: true,
    availability: allDay(),
    timeOff: [],
    weekChanges: {},
    history: [],
    ...over,
  }
}

const space = { category: 'indoor' as const, grade: 'flat' as const, obstacles: [], backupIndoorSpace: true }
const poc = { name: 'Pat', title: 'Director', email: 'pat@example.com', phone: '502-555-0101' }

export const centerA: Center = { id: 'A', territoryId: 'lou', name: 'Center A', phone: '', address: '', lat: 38.25, lng: -85.75, poc, space }
// ~6 miles east of A: about 19 minutes at 25 mph with the road factor.
export const centerB: Center = { id: 'B', territoryId: 'lou', name: 'Center B', phone: '', address: '', lat: 38.25, lng: -85.64, poc, space }
export const centerK: Center = { id: 'K', territoryId: 'knx', name: 'Center K', phone: '', address: '', lat: 35.96, lng: -83.92, poc, space }

// 2026-10-12 is a Monday.
export const MON = '2026-10-12'

export function session(id: string, over: Partial<Session> = {}): Session {
  return {
    id,
    territoryId: 'lou',
    centerId: 'A',
    date: MON,
    start: '10:00',
    end: '11:00',
    groups: [{ players: 10, ageRange: '3-4', minutes: 60 }],
    status: 'confirmed',
    assignments: [],
    overrides: [],
    history: [],
    ...over,
  }
}

export function crew(...ids: string[]) {
  return ids.map((coachId) => ({ coachId, confirmedByCoach: false }))
}

export function world(over: Partial<World> = {}): World {
  return {
    sessions: [],
    coaches: [coach('lead1', 'lead'), coach('lead2', 'lead'), coach('asst1', 'assistant'), coach('trainee1', 'trainee')],
    centers: [centerA, centerB, centerK],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  }
}
