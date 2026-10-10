// Which territory a manager screen is showing. Admins can pick any (or all);
// territory managers are locked to theirs by the access rules.

import { canSeeTerritory, visibleSessions } from '../engine'
import type { Session, User } from '../engine'
import { setParams, useRoute } from '../router'
import { useStore } from '../store'

export function useScope(user: User) {
  const state = useStore()
  const route = useRoute()
  const territories = state.territories.filter((t) => canSeeTerritory(user, t.id))
  const wanted = route.params.get('t')
  const selected = territories.some((t) => t.id === wanted) ? wanted! : territories.length === 1 ? territories[0].id : 'all'
  const inScope = (territoryId: string) => selected === 'all' || territoryId === selected
  const sessions: Session[] = visibleSessions(user, state.sessions).filter((s) => inScope(s.territoryId))
  return { state, route, territories, selected, inScope, sessions }
}

export function openSession(route: ReturnType<typeof useRoute>, id: string) {
  setParams(route, { s: id })
}
