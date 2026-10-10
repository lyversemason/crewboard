import type { User } from '../engine'
import { setParams } from '../router'
import { useScope } from './scope'

export function TerritoryPicker({ user }: { user: User }) {
  const { territories, selected, route } = useScope(user)
  if (territories.length === 1) return <span className="chip">{territories[0].name}, {territories[0].state}</span>
  return (
    <div className="seg" role="group" aria-label="Territory">
      {[{ id: 'all', name: 'All territories' }, ...territories].map((t) => (
        <button key={t.id} className={selected === t.id ? 'on' : ''} onClick={() => setParams(route, { t: t.id === 'all' ? undefined : t.id })}>
          {t.name}
        </button>
      ))}
    </div>
  )
}
