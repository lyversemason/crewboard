// Hours & pay: coaching hours, what they cost and what the programs earn, for
// one week or one month. Management only (pay rates and prices).

import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { PAY_CYCLE_DAYS, addDays, dateSpan, marginShare, monthDay, mondayOf, monthRange, payCycleRange, payReport, payrollCsv, visibleSessions, weeklyPay } from '../engine'
import type { CenterPay, PayTotals, User, WeekPay } from '../engine'
import { setParams } from '../router'
import { Empty, Hint, LevelTag } from '../ui/bits'
import { LEVEL_LABEL, money } from '../ui/format'
import { useScope } from './scope'
import { TerritoryPicker } from './TerritoryPicker'

type Period = 'week' | 'cycle' | 'month'
const PERIODS: { id: Period; label: string; noun: string }[] = [
  { id: 'week', label: 'Week', noun: 'week' },
  { id: 'cycle', label: 'Pay period', noun: 'pay period' },
  { id: 'month', label: 'Month', noun: 'month' },
]
const CHART_WEEKS = 13

const hrs = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`
const pct = (n: number | undefined) => (n === undefined ? '—' : `${Math.round(n * 100)}%`)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthName = (from: string) => `${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`

function rangeFor(period: Period, anchor: string) {
  if (period === 'month') return monthRange(anchor)
  if (period === 'cycle') return payCycleRange(anchor)
  const from = mondayOf(anchor)
  return { from, to: addDays(from, 6) }
}

export function HoursPay({ user }: { user: User }) {
  const { state, route, selected, territories, sessions, inScope } = useScope(user)
  const period: Period = PERIODS.find((p) => p.id === route.params.get('p'))?.id ?? 'month'
  const noun = PERIODS.find((p) => p.id === period)!.noun
  const { from, to } = rangeFor(period, route.params.get('d') ?? state.today)
  const thisRange = rangeFor(period, state.today)

  const all = visibleSessions(user, state.sessions)
  const centers = state.centers.filter((c) => inScope(c.territoryId) && territories.some((t) => t.id === c.territoryId))
  const coaches = state.coaches.filter((c) => inScope(c.territoryId) && territories.some((t) => t.id === c.territoryId))
  const input = { sessions, coaches: state.coaches, centers }
  const report = payReport(input, from, to, state.today, all)

  // The chart: 13 weeks around the period being shown.
  const spanWeeks = Math.round((Number(new Date(`${mondayOf(to)}T00:00:00Z`)) - Number(new Date(`${mondayOf(from)}T00:00:00Z`))) / (7 * 864e5)) + 1
  const firstMonday = addDays(mondayOf(from), -7 * Math.floor((CHART_WEEKS - spanWeeks) / 2))
  const weeks = weeklyPay(input, firstMonday, CHART_WEEKS, state.today, all)

  const go = (anchor: string, p: Period = period) => {
    const start = rangeFor(p, anchor).from
    setParams(route, { p: p === 'month' ? undefined : p, d: start === rangeFor(p, state.today).from ? undefined : start })
  }
  const step = (dir: -1 | 1) => go(dir < 0 ? addDays(from, -1) : addDays(to, 1))

  const name = {
    coach: (id: string) => state.coaches.find((c) => c.id === id)?.name ?? id,
    level: (id: string) => {
      const c = state.coaches.find((x) => x.id === id)
      return c ? LEVEL_LABEL[c.level] : ''
    },
    center: (id: string) => state.centers.find((c) => c.id === id)?.name ?? id,
    territory: (id: string) => state.territories.find((t) => t.id === id)?.name ?? id,
  }

  const download = () => {
    const blob = new Blob([payrollCsv(report.lines, name)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `soccersessions-payroll-${selected === 'all' ? 'all' : selected}-${from}-to-${to}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // Active coaches with no shifts in the range are listed too: hours that could be used.
  const idle = coaches.filter((c) => c.active && !report.byCoach.some((p) => p.coachId === c.id))
  const programs = [...report.byCenter].sort((a, b) => (marginShare(a) ?? -1) - (marginShare(b) ?? -1))
  const showTerritory = selected === 'all' && territories.length > 1

  return (
    <div className="pay">
      <div className="toolbar">
        <TerritoryPicker user={user} />
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} className={period === p.id ? 'on' : ''} onClick={() => go(state.today >= from && state.today <= to ? state.today : from, p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="pager">
          <button className="btn ghost" onClick={() => step(-1)} aria-label={`Previous ${noun}`}>
            ‹
          </button>
          <button className="btn ghost" onClick={() => step(1)} aria-label={`Next ${noun}`}>
            ›
          </button>
          {from !== thisRange.from && (
            <button className="btn ghost" onClick={() => go(thisRange.from)}>
              This {noun}
            </button>
          )}
        </div>
        <button className="btn" onClick={download} disabled={!report.lines.length} title="One row per coach per session, for payroll">
          Download payroll (CSV)
        </button>
      </div>

      <p className="date-head">
        {period === 'month' ? `${monthName(from)}: ` : period === 'cycle' ? `Pay period (${PAY_CYCLE_DAYS / 7} weeks): ` : ''}
        {dateSpan(from, period === 'week' ? addDays(from, 5) : to)}
      </p>
      <Hint>
        What coaching costs and what programs earn. Coaches are paid for the whole session at their hourly rate; a program’s price is split evenly across the sessions of its cycle.
        Cancelled sessions cost and earn nothing. Before today is delivered, from today on is scheduled. Drive time, equipment and office costs aren’t included.
      </Hint>

      <div className="pay-tiles">
        <Tile label="Coaching hours" value={hrs(report.totals.hours)} split={[hrs(report.delivered.hours), hrs(report.scheduled.hours)]} />
        <Tile label="Coach pay" value={money(report.totals.pay)} split={[money(report.delivered.pay), money(report.scheduled.pay)]} />
        <Tile label="Program revenue" value={money(report.totals.revenue)} split={[money(report.delivered.revenue), money(report.scheduled.revenue)]} />
        <Tile label="After coach pay" value={money(report.totals.margin)} sub={`${pct(marginShare(report.totals))} of revenue`} bad={report.totals.margin < 0} />
      </div>
      {report.totals.unstaffed > 0 && (
        <p className="pay-note">
          {report.totals.unstaffed} {report.totals.unstaffed === 1 ? 'session still needs' : 'sessions still need'} coaching staff, so {report.totals.unstaffed === 1 ? 'its' : 'their'} pay isn’t counted yet.
        </p>
      )}

      <section className="card">
        <h3>Week by week</h3>
        <WeekChart weeks={weeks} from={from} to={to} today={state.today} onPick={(monday) => go(monday, 'week')} />
      </section>

      {showTerritory && (
        <section className="card">
          <h3>By territory</h3>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Territory</th>
                  <NumHead>Sessions</NumHead>
                  <NumHead>Coaching hours</NumHead>
                  <NumHead>Coach pay</NumHead>
                  <NumHead>Revenue</NumHead>
                  <NumHead>After coach pay</NumHead>
                </tr>
              </thead>
              <tbody>
                {report.byTerritory.map((t) => (
                  <tr key={t.territoryId} className="row" onClick={() => setParams(route, { t: t.territoryId })}>
                    <td>
                      <strong>{name.territory(t.territoryId)}</strong>
                    </td>
                    <TotalsCells t={t} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="pay-cols">
        <section className="card">
          <h3>By program</h3>
          <Hint>Lowest share left after coach pay first: the programs to look at when pricing a renewal.</Hint>
          {programs.length === 0 ? (
            <Empty>No sessions in this {noun}.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Center</th>
                    {showTerritory && <th>Territory</th>}
                    <NumHead>Sessions</NumHead>
                    <NumHead>Coach pay</NumHead>
                    <NumHead>Revenue</NumHead>
                    <NumHead>After pay</NumHead>
                    <NumHead>Share</NumHead>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((c) => (
                    <ProgramRow key={c.centerId} c={c} name={name.center(c.centerId)} territory={showTerritory ? name.territory(c.territoryId) : undefined} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h3>By coach</h3>
          {report.byCoach.length === 0 ? (
            <Empty>No shifts this {noun}.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Coach</th>
                    <NumHead>Shifts</NumHead>
                    <NumHead>Hours</NumHead>
                    <NumHead>Rate</NumHead>
                    <NumHead>Pay</NumHead>
                  </tr>
                </thead>
                <tbody>
                  {report.byCoach.map((p) => {
                    const c = state.coaches.find((x) => x.id === p.coachId)
                    return (
                      <tr key={p.coachId} className="row static">
                        <td>
                          <span className="pay-who">
                            {name.coach(p.coachId)} {c && <LevelTag level={c.level} />}
                          </span>
                          {showTerritory && c && <small className="muted">{name.territory(c.territoryId)}</small>}
                        </td>
                        <Num>{p.sessions}</Num>
                        <Num title={`${hrs(p.deliveredHours)} delivered · ${hrs(p.scheduledHours)} scheduled`}>{hrs(p.hours)}</Num>
                        <Num>{money(p.rate)}</Num>
                        <Num>
                          <strong>{money(p.pay)}</strong>
                        </Num>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {idle.length > 0 && (
            <p className="small muted pay-idle">
              <strong>No shifts this {noun}:</strong> {idle.map((c) => `${c.name} (${LEVEL_LABEL[c.level].toLowerCase()})`).join(', ')}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function NumHead({ children }: { children: ReactNode }) {
  return <th className="num">{children}</th>
}

function Num({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <td className="num" title={title}>
      {children}
    </td>
  )
}

function Tile({ label, value, split, sub, bad }: { label: string; value: string; split?: [string, string]; sub?: string; bad?: boolean }) {
  return (
    <div className={`pay-tile ${bad ? 'bad' : ''}`}>
      <span className="pay-label">{label}</span>
      <span className="pay-value">{value}</span>
      {split && (
        <span className="pay-sub">
          {split[0]} delivered · {split[1]} scheduled
        </span>
      )}
      {sub && <span className="pay-sub">{sub}</span>}
    </div>
  )
}

function TotalsCells({ t }: { t: PayTotals }) {
  return (
    <>
      <Num>{t.sessions}</Num>
      <Num>{hrs(t.hours)}</Num>
      <Num>{money(t.pay)}</Num>
      <Num>{money(t.revenue)}</Num>
      <Num>
        <span className={t.margin < 0 ? 'bad' : ''}>{money(t.margin)}</span> <small className="muted">{pct(marginShare(t))}</small>
      </Num>
    </>
  )
}

function ProgramRow({ c, name, territory }: { c: CenterPay; name: string; territory?: string }) {
  const losing = c.margin < 0
  return (
    <tr className={`row static ${losing ? 'losing' : ''}`}>
      <td>
        {name}
        {c.unstaffed > 0 && <small className="bad"> · {c.unstaffed} need staff</small>}
        {losing && <small className="bad"> · costs more than it earns</small>}
      </td>
      {territory && <td>{territory}</td>}
      <Num>{c.sessions}</Num>
      <Num>{money(c.pay)}</Num>
      <Num>{c.revenue ? money(c.revenue) : '—'}</Num>
      <Num>
        <span className={losing ? 'bad' : ''}>{money(c.margin)}</span>
      </Num>
      <Num>{pct(marginShare(c))}</Num>
    </tr>
  )
}

// ---------------------------------------------------------------- chart

/** Width of an element, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

function niceStep(max: number, ticks = 4) {
  const raw = max / ticks
  const mag = 10 ** Math.floor(Math.log10(raw || 1))
  return ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag
}

/** A column whose top corners are rounded (4px) and whose base is square. */
function column(x: number, y: number, w: number, h: number, round: boolean) {
  if (h <= 0) return ''
  const r = round ? Math.min(4, h, w / 2) : 0
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

const PAY = 'var(--chart-pay)'
const LEFT = 'var(--chart-left)'

function WeekChart({ weeks, from, to, today, onPick }: { weeks: WeekPay[]; from: string; to: string; today: string; onPick: (monday: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)

  const H = 220
  const pad = { top: 12, right: 8, bottom: 30, left: 52 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = H - pad.top - pad.bottom
  const top = Math.max(1, ...weeks.map((w) => Math.max(w.revenue, w.pay)))
  const stepV = niceStep(top)
  const maxV = Math.ceil(top / stepV) * stepV
  const y = (v: number) => pad.top + plotH - (v / maxV) * plotH
  const band = plotW / weeks.length
  const barW = Math.min(24, band * 0.6)
  const thisWeek = mondayOf(today)
  const every = band < 30 ? 3 : band < 52 ? 2 : 1
  const nowIdx = weeks.findIndex((w) => w.monday === thisWeek)
  const ticks = Array.from({ length: Math.round(maxV / stepV) + 1 }, (_, i) => i * stepV)
  const tickLabel = (v: number) => (maxV >= 10000 ? `$${v / 1000}K` : money(v))
  const shown = (w: WeekPay) => w.monday <= to && addDays(w.monday, 6) >= from

  const picked = weeks.flatMap((w, i) => (shown(w) ? [i] : []))
  const tip = hover !== null ? weeks[hover] : undefined
  const tipX = hover !== null ? pad.left + band * (hover + 0.5) : 0

  return (
    <div className="week-chart">
      <div className="chart-head">
        <ul className="legend" aria-label="Legend">
          <li>
            <span className="swatch" style={{ background: PAY }} /> Coach pay
          </li>
          <li>
            <span className="swatch" style={{ background: LEFT }} /> Left after coach pay
          </li>
          <li className="muted">Whole column = program revenue</li>
        </ul>
        <button className="btn ghost small-btn" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Week of</th>
                <NumHead>Hours</NumHead>
                <NumHead>Coach pay</NumHead>
                <NumHead>Revenue</NumHead>
                <NumHead>After coach pay</NumHead>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.monday} className={`row ${shown(w) ? 'picked' : ''}`} onClick={() => onPick(w.monday)}>
                  <td>
                    {monthDay(w.monday)}
                    {w.monday === thisWeek && <span className="chip small">This week</span>}
                  </td>
                  <Num>{hrs(w.hours)}</Num>
                  <Num>{money(w.pay)}</Num>
                  <Num>{money(w.revenue)}</Num>
                  <Num>{money(w.margin)}</Num>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-box" ref={ref} onMouseLeave={() => setHover(null)}>
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label="Coach pay and program revenue, week by week">
              {picked.length > 0 && (
                <rect x={pad.left + band * picked[0] + 1} y={pad.top - 6} width={band * picked.length - 2} height={plotH + 6} rx={6} className="chart-picked" />
              )}
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} className="chart-grid" />
                  <text x={pad.left - 8} y={y(v)} dy="0.35em" textAnchor="end" className="chart-tick">
                    {tickLabel(v)}
                  </text>
                </g>
              ))}
              {weeks.map((w, i) => {
                const x = pad.left + band * i + (band - barW) / 2
                const payTop = y(w.pay)
                const leftH = Math.max(0, w.margin) / maxV * plotH
                const gap = leftH > 0 && w.pay > 0 ? 2 : 0
                const label = (((i - nowIdx) % every) + every) % every === 0
                return (
                  <g
                    key={w.monday}
                    tabIndex={0}
                    role="button"
                    aria-label={`Week of ${monthDay(w.monday)}: revenue ${money(w.revenue)}, coach pay ${money(w.pay)}, ${hrs(w.hours)}. Show this week.`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    onClick={() => onPick(w.monday)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(w.monday))}
                    className="chart-col"
                  >
                    <rect x={pad.left + band * i} y={pad.top} width={band} height={plotH + pad.bottom} fill="transparent" />
                    {hover === i && <rect x={pad.left + band * i + 2} y={pad.top} width={band - 4} height={plotH} className="chart-hover" />}
                    <path d={column(x, payTop, barW, y(0) - payTop, leftH === 0)} fill={PAY} />
                    <path d={column(x, payTop - leftH, barW, leftH - gap, true)} fill={LEFT} />
                    {label && (
                      <text x={pad.left + band * (i + 0.5)} y={H - 10} textAnchor="middle" className={`chart-tick ${w.monday === thisWeek ? 'now' : ''}`}>
                        {w.monday === thisWeek ? 'This week' : monthDay(w.monday).replace(/^(\w{3})\w*/, '$1')}
                      </text>
                    )}
                  </g>
                )
              })}
              <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="chart-axis" />
            </svg>
          )}
          {tip && (
            <div className={`chart-tip ${tipX > width / 2 ? 'left' : ''}`} style={{ left: tipX, top: pad.top }} role="status">
              <strong>Week of {monthDay(tip.monday)}</strong>
              <span>
                <i className="swatch" style={{ background: LEFT }} /> After coach pay <b>{money(tip.margin)}</b>
              </span>
              <span>
                <i className="swatch" style={{ background: PAY }} /> Coach pay <b>{money(tip.pay)}</b>
              </span>
              <span>
                Revenue <b>{money(tip.revenue)}</b>
              </span>
              <span className="muted">
                {hrs(tip.hours)} · {tip.monday < thisWeek ? 'delivered' : tip.monday === thisWeek ? 'this week' : 'scheduled'} · click to show
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
