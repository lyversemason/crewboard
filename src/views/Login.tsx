import { useState } from 'react'
import { addDays, planningWeek } from '../engine'
import { href } from '../router'
import { resetDemo, useStore } from '../store'
import { LEVEL_LABEL } from '../ui/format'

export function Login() {
  const { users, coaches, territories, sessions, today } = useStore()
  const coachUsers = users.filter((u) => u.role === 'coach')
  // Default to the coach with the busiest coming week, so the demo has something to show.
  const week = planningWeek(today)
  const shifts = (coachId?: string) => sessions.filter((s) => s.date >= week && s.date < addDays(week, 7) && s.assignments.some((a) => a.coachId === coachId)).length
  const busiest = [...coachUsers].sort((a, b) => shifts(b.coachId) - shifts(a.coachId))[0]
  const [coachId, setCoachId] = useState(busiest?.id ?? '')
  const tName = (id: string) => territories.find((t) => t.id === id)?.name ?? id

  const card = (id: string, title: string, who: string, sees: string, cta = 'Open') => (
    <a className="role-card" href={href(id)} key={id}>
      <span className="role-title">{title}</span>
      <span className="role-who">{who}</span>
      <span className="role-sees">{sees}</span>
      <span className="role-cta">{cta} →</span>
    </a>
  )

  return (
    <div className="login">
      <header className="login-head">
        <span className="logo big" aria-hidden>
          ⚽
        </span>
        <h1>SoccerSessions</h1>
        <p className="lede">
          Scheduling, staffing rules and sales intake for <strong>Bramblewood Youth Soccer</strong>, a fictional company
          that sends coaches to daycares and schools in Louisville, Knoxville and Oakland.
        </p>
        <p className="muted">
          Pick a demo user. Each role sees different data. Turn on <strong>Demo guide</strong> (top right, once inside) for
          explanations of each screen. Everything is made up and lives only in your browser.{' '}
          <button className="linklike" onClick={resetDemo}>
            Reset demo data
          </button>
        </p>
      </header>

      <section className="role-grid">
        {card('admin', 'Operations admin', 'Dana Whitfield', 'All three territories, master dashboard, global rule settings.')}
        {card('tm-lou', 'Territory manager', 'Priya Raman · Louisville', 'Only Louisville: calendar, table, coaching staff assignment with rule checks and overrides, program cycles.')}
        {card('tm-knx', 'Territory manager', 'Caleb Odom · Knoxville', 'Only Knoxville. A coach changed their availability and a session needs fixing.')}
        {card('rep-east', 'Sales rep', 'Jamie Ellison · Louisville + Knoxville', 'New-center intake with program terms and the live "can our coaching staff cover this?" check. Can edit a submission until it’s confirmed.')}
        <div className="role-card coach-card">
          <span className="role-title">Coach (phone view)</span>
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="Pick a coach">
            {coachUsers.map((u) => {
              const c = coaches.find((x) => x.id === u.coachId)!
              return (
                <option key={u.id} value={u.id}>
                  {u.name} · {LEVEL_LABEL[c.level]} · {tName(c.territoryId)}
                </option>
              )
            })}
          </select>
          <span className="role-sees">Only their own shifts: tap-to-map, call and text buttons, confirm shifts, weekly availability check-in and days off.</span>
          <a className="role-cta" href={href(coachId)}>
            Open →
          </a>
        </div>
        {card('tm-oak', 'Territory manager', 'Marisol Vega · Oakland', 'Only Oakland.')}
        {card('rep-west', 'Sales rep', 'Theo Park · Oakland', 'Intake for Oakland only.')}
      </section>

      <footer className="login-foot">
        <a href="https://github.com/lyversemason/soccer-sessions">Source code and how it was built (GitHub)</a>
      </footer>
    </div>
  )
}
