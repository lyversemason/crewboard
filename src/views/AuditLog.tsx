// Audit log (ops admins): every logged change across the company, newest
// first. Entries can only be added, never edited or deleted. Filter by who,
// by what kind of record, or by words in the change.

import { useMemo, useState } from 'react'
import { longDate, prettyTime } from '../engine'
import type { User } from '../engine'
import { href } from '../router'
import { useStore } from '../store'
import type { AuditEntry, State } from '../store'
import { Empty, Hint } from '../ui/bits'

const KINDS: Record<AuditEntry['targetType'], string> = {
  session: 'Sessions',
  coach: 'Coaches',
  person: 'Accounts',
  center: 'Centers',
  intake: 'Submissions',
  settings: 'Settings',
}

const PAGE = 100

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** A readable name and a link for what the entry is about. */
function about(e: AuditEntry, state: State, me: User): { label: string; link?: string } {
  switch (e.targetType) {
    case 'session': {
      const s = state.sessions.find((x) => x.id === e.targetId)
      const center = s && state.centers.find((c) => c.id === s.centerId)
      return s ? { label: `${center?.name ?? 'Session'}, ${longDate(s.date)} ${prettyTime(s.start)}`, link: href(me.id, 'table', { s: s.id }) } : { label: e.targetId }
    }
    case 'coach':
      return { label: state.coaches.find((c) => c.id === e.targetId)?.name ?? e.targetId, link: href(me.id, 'staff') }
    case 'person':
      return { label: state.users.find((u) => u.id === e.targetId)?.name ?? e.targetId, link: href(me.id, 'accounts') }
    case 'center':
      return { label: state.centers.find((c) => c.id === e.targetId)?.name ?? e.targetId, link: href(me.id, 'pipeline') }
    case 'intake': {
      const i = state.intakes.find((x) => x.id === e.targetId)
      return { label: `Submission for ${state.centers.find((c) => c.id === i?.centerId)?.name ?? e.targetId}`, link: href(me.id, 'pipeline') }
    }
    case 'settings':
      return { label: 'Global settings', link: href(me.id, 'dashboard') }
  }
}

export function AuditLog({ user }: { user: User }) {
  const state = useStore()
  const [who, setWho] = useState('')
  const [kind, setKind] = useState('')
  const [words, setWords] = useState('')
  const [shown, setShown] = useState(PAGE)

  const people = useMemo(() => [...new Map(state.audit.map((e) => [e.actorId, e.actorName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [state.audit])
  const entries = useMemo(() => {
    const w = words.trim().toLowerCase()
    return [...state.audit]
      .reverse()
      .filter((e) => (!who || e.actorId === who) && (!kind || e.targetType === kind) && (!w || e.text.toLowerCase().includes(w) || e.actorName.toLowerCase().includes(w)))
  }, [state.audit, who, kind, words])

  return (
    <>
      <div className="toolbar">
        <label className="field">
          Who
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {people.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          About
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Everything</option>
            {Object.entries(KINDS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          Search
          <input type="search" value={words} placeholder="e.g. override, Pay rate, cancelled" onChange={(e) => setWords(e.target.value)} />
        </label>
        <div className="summary">
          <span>
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </div>
      <Hint>
        Every logged change in the company, newest first: who made it, what changed and when. The log can only be added to; nobody can edit or delete an entry, administrators included.
      </Hint>
      {entries.length === 0 ? (
        <Empty>Nothing matches.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid audit">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What changed</th>
                <th>About</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, shown).map((e) => {
                const a = about(e, state, user)
                return (
                  <tr key={e.id}>
                    <td className="nowrap small">{when(e.at)}</td>
                    <td className="nowrap">{e.actorName}</td>
                    <td>{e.text}</td>
                    <td className="small">{a.link ? <a href={a.link}>{a.label}</a> : a.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {entries.length > shown && (
        <div className="actions">
          <button className="btn" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, entries.length - shown)} more
          </button>
        </div>
      )}
    </>
  )
}
