// Small shared pieces of UI.

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { CoachLevel, SessionStatus, Violation } from '../engine'
import { LEVEL_LABEL, STATUS_LABEL, shortWarning, smsHref, telHref } from './format'

export function StatusPill({ status }: { status: SessionStatus }) {
  return <span className={`pill status-${status}`}>{STATUS_LABEL[status]}</span>
}

export function LevelTag({ level }: { level: CoachLevel }) {
  return <span className={`tag level-${level}`}>{LEVEL_LABEL[level]}</span>
}

export function Phone({ phone, label }: { phone: string; label?: string }) {
  return (
    <span className="phone">
      <a href={telHref(phone)}>{label ?? phone}</a>
      <a className="sms" href={smsHref(phone)} aria-label={`Text ${phone}`}>
        text
      </a>
    </span>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
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
