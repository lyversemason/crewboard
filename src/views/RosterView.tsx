import { useState } from 'react'
import { addDays, canSeeMoney, planningWeek, toMinutes, visibleRoster } from '../engine'
import type { User, Weekday } from '../engine'
import { LevelTag, Modal, Phone } from '../ui/bits'
import { money } from '../ui/format'
import { useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'
import { AvailabilityGrid } from './AvailabilityGrid'
import { setAvailability } from '../store'

export function RosterView({ user }: { user: User }) {
  const { state, inScope } = useScope(user)
  const [editing, setEditing] = useState<string | null>(null)
  const roster = visibleRoster(user, state.coaches).filter((c) => inScope(c.territoryId))
  const week = planningWeek(state.today)
  const weekEnd = addDays(week, 5)
  const showMoney = canSeeMoney(user)

  const hoursThisWeek = (coachId: string) =>
    state.sessions
      .filter((s) => s.date >= week && s.date <= weekEnd && (s.status === 'confirmed' || s.status === 'pending'))
      .filter((s) => s.assignments.some((a) => a.coachId === coachId))
      .reduce((h, s) => h + (toMinutes(s.end) - toMinutes(s.start)) / 60, 0)

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <span className="muted small">Pay rates are visible to management only. Coaches see a directory with names and phones.</span>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Coach</th>
              <th>Role</th>
              <th>Territory</th>
              <th>Phone</th>
              <th>Email</th>
              {showMoney && <th>Pay rate</th>}
              <th>Booked this week</th>
              {showMoney && <th>Est. cost this week</th>}
              <th>Weekly availability</th>
            </tr>
          </thead>
          <tbody>
            {roster
              .sort((a, b) => a.territoryId.localeCompare(b.territoryId) || ['lead', 'assistant', 'trainee'].indexOf(a.level) - ['lead', 'assistant', 'trainee'].indexOf(b.level))
              .map((c) => {
                const h = hoursThisWeek(c.id)
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                    </td>
                    <td>
                      <LevelTag level={c.level} />
                    </td>
                    <td>{state.territories.find((t) => t.id === c.territoryId)?.name}</td>
                    <td className="nowrap">
                      <Phone phone={c.phone} />
                    </td>
                    <td>
                      <a href={`mailto:${c.email}`}>{c.email}</a>
                    </td>
                    {showMoney && <td>{money(c.payRate!)}/hr</td>}
                    <td>{h ? `${h.toFixed(1)} h` : '—'}</td>
                    {showMoney && <td>{h ? money(h * c.payRate!) : '—'}</td>}
                    <td>
                      <button className="avail-mini" onClick={() => setEditing(c.id)} title="View or edit availability">
                        <AvailabilityGrid value={c.availability} mini />
                      </button>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      {editing && (
        <AvailabilityEditor
          coachName={state.coaches.find((c) => c.id === editing)!.name}
          value={state.coaches.find((c) => c.id === editing)!.availability}
          onSave={(v) => {
            setAvailability(user, editing, v)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}


function AvailabilityEditor({ coachName, value, onSave, onClose }: { coachName: string; value: Record<Weekday, number[]>; onSave: (v: Record<Weekday, number[]>) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <Modal title={`${coachName}: weekly availability`} onClose={onClose}>
      <AvailabilityGrid value={draft} onChange={setDraft} />
      <p className="small muted">Changing availability re-checks every upcoming session this coach is on.</p>
      <div className="actions">
        <button className="btn primary" onClick={() => onSave(draft)}>
          Save
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
