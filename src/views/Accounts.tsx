// Accounts (management): who can sign in. Invite people, send an invite
// again, turn access off and back on, and (ops admins) change office roles.
// Nothing is deleted: turned-off people stay listed with their history.

import { useState } from 'react'
import { canChangeAccess, canInvite, canManageAccount, formatPhone, isValidEmail, longDate, prettyTime, visibleAccounts } from '../engine'
import type { CoachLevel, Role, User } from '../engine'
import { go, href } from '../router'
import { acceptInvite, changeAccess, deactivateUser, inviteUser, mode, reactivateUser, resendInvite, useStore } from '../store'
import type { InviteInput } from '../store'
import { Hint, Modal, Toast } from '../ui/bits'
import { LEVEL_LABEL, ROLE_LABEL } from '../ui/format'
import { useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

const ROLES: Role[] = ['ops_admin', 'territory_manager', 'sales_rep', 'coach']
const STATUS_ORDER = { invited: 0, active: 1, deactivated: 2 }

const longDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '')

function StatusFlag({ u }: { u: User }) {
  if (u.status === 'invited') return <span className="flag pending">Invited</span>
  if (u.status === 'deactivated') return <span className="flag muted">Access off</span>
  return <span className="flag ok">Active</span>
}

function since(u: User): string {
  if (u.status === 'invited') return `Invited ${longDay(u.invitedAt)}`
  if (u.status === 'deactivated') return `Turned off ${longDay(u.deactivatedAt)}`
  return u.activatedAt ? `Since ${longDay(u.activatedAt)}` : ''
}

export function Accounts({ user }: { user: User }) {
  const { state, territories, selected, inScope } = useScope(user)
  const [open, setOpen] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [toast, setToast] = useState('')
  const people = visibleAccounts(user, state.users)
    .filter((u) => u.territoryIds.some(inScope))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name))
  const invitedCount = people.filter((u) => u.status === 'invited').length
  const canInviteAny = ROLES.some((r) => canInvite(user, r, territories.slice(0, 1).map((t) => t.id)))
  const territoryName = (ids: string[]) =>
    ids.length === state.territories.length && ids.length > 1 ? 'All territories' : ids.map((id) => state.territories.find((t) => t.id === id)?.name ?? id).join(', ')

  return (
    <>
      <div className="toolbar">
        <TerritoryPicker user={user} />
        {canInviteAny && (
          <button className="btn primary" onClick={() => setInviting(true)}>
            Invite someone
          </button>
        )}
        <div className="summary">
          <span>{people.filter((u) => u.status === 'active').length} active</span>
          {invitedCount > 0 && <span className="pending">{invitedCount} invited, not accepted yet</span>}
        </div>
      </div>
      <Hint>
        Everyone who can sign in. People are added by invitation (they set up their own sign-in, nobody hands out passwords) and are never deleted:
        turning access off locks them out at once and keeps their history.{' '}
        {user.role === 'territory_manager' ? 'Territory managers invite and manage the coaches in their territory.' : 'Operations admins manage everyone.'}
      </Hint>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              {selected === 'all' && <th>Territory</th>}
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((u) => (
              <tr key={u.id} className={`row ${u.status === 'deactivated' ? 'closed' : ''}`} onClick={() => setOpen(u.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(u.id)}>
                <td>
                  <strong>{u.name}</strong>
                  {u.id === user.id && <span className="muted"> (you)</span>}
                  <br />
                  <small className="muted nowrap">{u.email}</small>
                </td>
                <td>{ROLE_LABEL[u.role]}</td>
                {selected === 'all' && <td>{territoryName(u.territoryIds)}</td>}
                <td>
                  <StatusFlag u={u} />
                </td>
                <td className="small muted">{since(u)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inviting && (
        <InviteForm
          user={user}
          territories={territories}
          onClose={() => setInviting(false)}
          onInvited={(id) => {
            setInviting(false)
            setOpen(id)
          }}
        />
      )}
      {open && (
        <PersonPanel
          user={user}
          person={state.users.find((u) => u.id === open)!}
          territoryName={territoryName}
          allTerritories={state.territories}
          onClose={() => setOpen(null)}
          toast={setToast}
        />
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  )
}

function InviteForm({ user, territories, onClose, onInvited }: { user: User; territories: { id: string; name: string }[]; onClose: () => void; onInvited: (id: string) => void }) {
  const roles = ROLES.filter((r) => territories.some((t) => canInvite(user, r, [t.id])))
  const [role, setRole] = useState<Role>(roles.includes('coach') ? 'coach' : roles[0])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [picked, setPicked] = useState<string[]>(territories.length === 1 ? [territories[0].id] : [])
  const [level, setLevel] = useState<CoachLevel>('assistant')
  const [payRate, setPayRate] = useState(20)
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const single = role === 'coach'

  const chooseRole = (r: Role) => {
    setRole(r)
    // A coach belongs to exactly one territory.
    if (r === 'coach' && picked.length > 1) setPicked(picked.slice(0, 1))
  }

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Enter their name.')
    if (!isValidEmail(email.trim())) return setError('Enter a valid email.')
    if (role !== 'ops_admin' && !picked.length) return setError('Pick a territory.')
    const input: InviteInput = {
      name,
      email,
      role,
      territoryIds: picked,
      coach: role === 'coach' ? { level, payRate, phone: formatPhone(phone) } : undefined,
    }
    setBusy(true)
    try {
      onInvited(await inviteUser(user, input))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Invite someone" onClose={onClose}>
      <section className="sp-section" style={{ borderTop: 0 }}>
        <div className="terms-row">
          <label className="field grow">
            Name
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field grow">
            Email (they sign in with it)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        {roles.length > 1 && (
          <div className="field">
            Role
            <div className="seg" role="group" aria-label="Role">
              {roles.map((r) => (
                <button key={r} type="button" className={r === role ? 'on' : ''} onClick={() => chooseRole(r)}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}
        {role === 'ops_admin' ? (
          <p className="small muted">Operations admins see every territory.</p>
        ) : (
          territories.length > 1 && (
            <div className="field">
              {single ? 'Territory' : 'Territories'}
              <div className="seg" role="group" aria-label="Territories">
                {territories.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={picked.includes(t.id) ? 'on' : ''}
                    onClick={() => setPicked(single ? [t.id] : picked.includes(t.id) ? picked.filter((x) => x !== t.id) : [...picked, t.id])}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        {role === 'coach' && (
          <div className="terms-row">
            <label className="field">
              Level
              <select value={level} onChange={(e) => setLevel(e.target.value as CoachLevel)}>
                {(['lead', 'assistant', 'trainee'] as const).map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field narrow">
              Pay rate ($/hr)
              <input type="number" min={1} step={0.5} value={payRate} onChange={(e) => setPayRate(Number(e.target.value))} />
            </label>
            <label className="field">
              Phone
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
        )}
        {role === 'coach' && <p className="small muted">A new coach can’t be scheduled until they accept and set their availability.</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </Modal>
  )
}

function PersonPanel({
  user,
  person: p,
  territoryName,
  allTerritories,
  onClose,
  toast,
}: {
  user: User
  person: User
  territoryName: (ids: string[]) => string
  allTerritories: { id: string; name: string }[]
  onClose: () => void
  toast: (msg: string) => void
}) {
  const [error, setError] = useState('')
  const [armed, setArmed] = useState(false)
  const [upcoming, setUpcoming] = useState<string[] | null>(null)
  const manage = canManageAccount(user, p)
  const inviter = useInviterName(p.invitedBy)

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError('')
    try {
      await fn()
      toast(done)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal title={p.name} onClose={onClose}>
      <section className="sp-section" style={{ borderTop: 0 }}>
        <p>
          <StatusFlag u={p} /> {ROLE_LABEL[p.role]} · {territoryName(p.territoryIds)}
        </p>
        <p className="small">
          {p.email}
          <br />
          <span className="muted">
            {since(p)}
            {p.status === 'invited' && inviter && ` by ${inviter}`}
          </span>
        </p>

        {p.status === 'invited' && <InviteEmail person={p} inviter={inviter} />}

        {manage && (
          <div className="actions">
            {p.status === 'invited' && (
              <button className="btn" onClick={() => run(() => resendInvite(user, p.id), `Invitation sent to ${p.email} again.`)}>
                Send invitation again
              </button>
            )}
            {p.status !== 'deactivated' &&
              (armed ? (
                <button
                  className="btn danger"
                  onClick={() =>
                    run(async () => {
                      const r = await deactivateUser(user, p.id)
                      setArmed(false)
                      setUpcoming(r.upcoming)
                    }, p.status === 'invited' ? 'Invitation cancelled.' : `${p.name}’s access is off.`)
                  }
                >
                  {p.status === 'invited' ? 'Click again to cancel the invitation' : 'Click again to turn off access'}
                </button>
              ) : (
                <button className="btn ghost" onClick={() => setArmed(true)}>
                  {p.status === 'invited' ? 'Cancel invitation' : 'Turn off access'}
                </button>
              ))}
            {p.status === 'deactivated' && (
              <button className="btn" onClick={() => run(() => reactivateUser(user, p.id), p.activatedAt ? `${p.name}’s access is back on.` : `${p.name} is invited again.`)}>
                {p.activatedAt ? 'Turn access back on' : 'Invite again'}
              </button>
            )}
          </div>
        )}
        {!manage && p.id !== user.id && <p className="small muted">Only an operations admin can change this person’s access.</p>}
        {error && <p className="error">{error}</p>}
        {upcoming && <Restaff user={user} ids={upcoming} />}
      </section>

      {canChangeAccess(user) && p.role !== 'coach' && <AccessEditor user={user} person={p} allTerritories={allTerritories} toast={toast} />}

      {p.history.length > 0 && (
        <section className="sp-section">
          <details className="history-box" open>
            <summary>Account history ({p.history.length})</summary>
            <ol className="history">
              {[...p.history].reverse().map((h, i) => (
                <li key={i}>
                  <span>{h.text}</span>
                  <small>
                    {h.by} · {new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </small>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </Modal>
  )
}

function useInviterName(id?: string) {
  return useStore().users.find((u) => u.id === id)?.name
}

/** What the invitation email says. In the demo it's shown here instead of sent, with a button to accept it. */
function InviteEmail({ person: p, inviter }: { person: User; inviter?: string }) {
  if (mode === 'live') return <p className="small muted">The invitation was emailed. It can be accepted for 7 days; sending it again restarts the clock.</p>
  return (
    <div className="callout soft invite-email">
      <p className="small muted">Demo: this email would go to {p.email}</p>
      <p>
        <strong>You’re invited to SoccerSessions</strong>
      </p>
      <p className="small">
        {inviter ?? 'Your manager'} invited you to SoccerSessions as {ROLE_LABEL[p.role].toLowerCase()}. Open SoccerSessions and sign in with this email
        address. The invitation is good for 7 days.
      </p>
      <div className="actions">
        <button
          className="btn primary"
          onClick={async () => {
            await acceptInvite(p)
            go(p.id)
          }}
        >
          Accept as {p.name.split(' ')[0]}
        </button>
      </div>
    </div>
  )
}

/** After a coach's access is turned off: their upcoming sessions, to re-staff. */
function Restaff({ user, ids }: { user: User; ids: string[] }) {
  const { state } = useScope(user)
  if (!ids.length) return <p className="small">They weren’t on any upcoming sessions.</p>
  return (
    <div className="callout">
      <p>
        They were on <strong>{ids.length}</strong> upcoming session{ids.length === 1 ? '' : 's'}. Each now shows a red issue until it’s re-staffed:
      </p>
      <ul className="small">
        {ids.slice(0, 8).map((id) => {
          const s = state.sessions.find((x) => x.id === id)!
          const center = state.centers.find((c) => c.id === s.centerId)
          return (
            <li key={id}>
              <a href={href(user.id, 'table', { s: id })}>
                {longDate(s.date)} · {prettyTime(s.start)}–{prettyTime(s.end)} · {center?.name}
              </a>
            </li>
          )
        })}
        {ids.length > 8 && <li className="muted">and {ids.length - 8} more</li>}
      </ul>
    </div>
  )
}

function AccessEditor({ user, person: p, allTerritories, toast }: { user: User; person: User; allTerritories: { id: string; name: string }[]; toast: (msg: string) => void }) {
  const [role, setRole] = useState<Role>(p.role)
  const [picked, setPicked] = useState<string[]>(p.territoryIds)
  const [error, setError] = useState('')
  const dirty = role !== p.role || [...picked].sort().join() !== [...p.territoryIds].sort().join()
  const office: Role[] = ['ops_admin', 'territory_manager', 'sales_rep']
  return (
    <section className="sp-section">
      <h3>Role and territories</h3>
      <div className="seg" role="group" aria-label="Role">
        {office.map((r) => (
          <button key={r} type="button" className={r === role ? 'on' : ''} onClick={() => setRole(r)}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      {role !== 'ops_admin' && (
        <div className="seg" role="group" aria-label="Territories" style={{ marginTop: '0.6em' }}>
          {allTerritories.map((t) => (
            <button key={t.id} type="button" className={picked.includes(t.id) ? 'on' : ''} onClick={() => setPicked(picked.includes(t.id) ? picked.filter((x) => x !== t.id) : [...picked, t.id])}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="actions">
        <button
          className={`btn ${dirty ? 'save-ready' : 'save-idle'}`}
          disabled={!dirty}
          onClick={async () => {
            setError('')
            try {
              await changeAccess(user, p.id, role, picked)
              toast(`${p.name}’s access updated.`)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Save role and territories
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
