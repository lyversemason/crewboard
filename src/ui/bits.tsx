// Small shared pieces of UI.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CoachLevel, SessionStatus, Violation } from '../engine'
import { LEVEL_LABEL, STATUS_LABEL, shortWarning, smsHref, telHref } from './format'
import { useGuide } from './guide'

const STATUS_TIP: Record<SessionStatus, string> = {
  pending: 'Not yet confirmed with the facility',
  confirmed: 'Confirmed with the facility',
  rescheduled: 'Moved to another date (kept on file)',
  cancelled: 'Cancelled (kept on file with its reason)',
}

export function StatusPill({ status }: { status: SessionStatus }) {
  return (
    <span className={`pill status-${status}`} title={STATUS_TIP[status]}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function LevelTag({ level }: { level: CoachLevel }) {
  return <span className={`tag level-${level}`}>{LEVEL_LABEL[level]}</span>
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
  </svg>
)
const MessageIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.3-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8z" />
  </svg>
)

/** A number with round call and text buttons (they dial or text from a phone). */
export function Phone({ phone, label, hideNumber }: { phone: string; label?: string; hideNumber?: boolean }) {
  return (
    <span className="contact">
      {!hideNumber && <span className="num">{label ?? phone}</span>}
      <a className="round-btn" href={telHref(phone)} aria-label={`Call ${phone}`} data-tip="Call">
        <PhoneIcon />
      </a>
      <a className="round-btn sms" href={smsHref(phone)} aria-label={`Text ${phone}`} data-tip="Text">
        <MessageIcon />
      </a>
    </span>
  )
}

/** Explanation shown only when the Demo guide is on. */
export function Hint({ children }: { children: ReactNode }) {
  return useGuide() ? <p className="hint">{children}</p> : null
}

/** A short confirmation that fades by itself. */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [message, onDone])
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}

/** Red (i): "Coach hasn't confirmed". Click it to call or text the coach. */
export function UnconfirmedAlert({ name, phone }: { name: string; phone: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span className="alert-wrap" ref={ref}>
      <button type="button" className="alert-i" onClick={() => setOpen(!open)} aria-label={`${name} hasn't confirmed: contact them`} aria-expanded={open}>
        i
      </button>
      <span className="alert-label">Coach hasn’t confirmed</span>
      {open && (
        <span className="popover">
          <p>
            <strong>{name}</strong> hasn’t confirmed this session yet.
          </p>
          <Phone phone={phone} />
        </span>
      )}
    </span>
  )
}

export function Modal({ title, onClose, children, wide, big }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; big?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2 className={big ? 'sp-title' : undefined}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export function IssueList({ issues, overridden = [] }: { issues: Violation[]; overridden?: string[] }) {
  if (!issues.length) return null
  return (
    <ul className="issues">
      {issues.map((v, i) => {
        const done = v.severity === 'override' && overridden.includes(v.code)
        return (
          <li key={i} className={done ? 'overridden' : v.severity}>
            <strong>{v.severity === 'block' ? 'Blocked' : done ? 'Overridden' : 'Needs override'}</strong>
            <span>{v.severity === 'block' ? v.message : shortWarning(v)}</span>
            <small>{v.detail}</small>
          </li>
        )
      })}
    </ul>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
