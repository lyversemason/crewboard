import { describe, expect, it } from 'vitest'
import { PAY_CYCLE_START, canSeeMoney, marginShare, monthRange, payCycleRange, payLines, payReport, payrollCsv, sessionHours, sessionPrices, weeklyPay } from '../src/engine'
import type { Center, User } from '../src/engine'
import { buildDemo } from '../src/data/seed'
import { MON, centerA, centerK, coach, crew, session } from './fixtures'

// Center A sold 4 Mondays for $800: $200 a session.
const A: Center = { ...centerA, terms: { startDate: MON, cycleWeeks: 4, weekdays: [1], cycleRate: 800 } }
const K: Center = { ...centerK, terms: { startDate: MON, cycleWeeks: 2, weekdays: [1], cycleRate: 300 } }
const lead = coach('lead1', 'lead', { payRate: 25 })
const asst = coach('asst1', 'assistant', { payRate: 20 })
const knx = coach('knx1', 'lead', { payRate: 30, territoryId: 'knx' })

const mondays = ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']
const cycleA = mondays.map((date, i) => session(`a${i + 1}`, { date, start: '10:00', end: '11:30', assignments: crew('lead1', 'asst1') }))

describe('hours × pay', () => {
  it('measures a session block in hours', () => {
    expect(sessionHours({ start: '10:00', end: '11:30' })).toBe(1.5)
    expect(sessionHours({ start: '09:15', end: '10:00' })).toBe(0.75)
  })

  it('pays every assigned coach for the whole block at their own rate', () => {
    const lines = payLines({ sessions: cycleA, coaches: [lead, asst] }, MON, MON, '2026-10-20')
    expect(lines.map((l) => [l.coachId, l.hours, l.rate, l.pay])).toEqual([
      ['asst1', 1.5, 20, 30],
      ['lead1', 1.5, 25, 37.5],
    ])
    expect(lines.every((l) => l.delivered)).toBe(true)
  })

  it('cancelled and rescheduled-away sessions cost nothing; the make-up does', () => {
    const list = [
      ...cycleA.slice(0, 2),
      { ...cycleA[2], status: 'cancelled' as const, cancelReason: 'weather' as const },
      { ...cycleA[3], status: 'rescheduled' as const, rescheduledToId: 'a5' },
      session('a5', { date: '2026-11-09', start: '10:00', end: '11:30', assignments: crew('lead1') }),
    ]
    const r = payReport({ sessions: list, coaches: [lead, asst], centers: [A] }, '2026-10-01', '2026-11-30', '2026-10-20')
    expect(r.totals.sessions).toBe(3)
    expect(r.totals.hours).toBe(1.5 * 2 * 2 + 1.5)
    expect(r.totals.pay).toBe(67.5 * 2 + 37.5)
  })

  it('splits the cycle price evenly across the sessions of the cycle', () => {
    const prices = sessionPrices([A], cycleA)
    expect([...prices.values()]).toEqual([200, 200, 200, 200])
  })

  it('a make-up past the cycle count earns nothing extra', () => {
    const extra = session('a5', { date: '2026-11-09', assignments: crew('lead1') })
    const prices = sessionPrices([A], [...cycleA, extra])
    expect(prices.get('a5')).toBeUndefined()
    expect([...prices.values()].reduce((a, b) => a + b, 0)).toBe(800)
  })

  it('a cancelled session hands its share to the make-up that replaces it', () => {
    const list = [{ ...cycleA[0], status: 'cancelled' as const }, ...cycleA.slice(1), session('a5', { date: '2026-11-09' })]
    const prices = sessionPrices([A], list)
    expect(prices.get('a1')).toBeUndefined()
    expect(prices.get('a5')).toBe(200)
  })

  it('totals revenue, pay and margin, split delivered and scheduled by today', () => {
    const r = payReport({ sessions: cycleA, coaches: [lead, asst], centers: [A] }, '2026-10-01', '2026-11-30', '2026-10-20')
    expect(r.totals).toMatchObject({ sessions: 4, hours: 12, pay: 270, revenue: 800, margin: 530, unstaffed: 0 })
    expect(r.delivered).toMatchObject({ sessions: 2, pay: 135, revenue: 400 })
    expect(r.scheduled).toMatchObject({ sessions: 2, pay: 135, revenue: 400 })
    expect(marginShare(r.totals)).toBeCloseTo(530 / 800)
  })

  it('counts a session on today as scheduled, not delivered', () => {
    const r = payReport({ sessions: cycleA, coaches: [lead, asst], centers: [A] }, MON, MON, MON)
    expect(r.delivered.sessions).toBe(0)
    expect(r.scheduled.sessions).toBe(1)
  })

  it('counts unstaffed sessions: revenue is in, their pay isn’t yet', () => {
    const list = [...cycleA.slice(0, 3), { ...cycleA[3], assignments: [] }]
    const r = payReport({ sessions: list, coaches: [lead, asst], centers: [A] }, '2026-10-01', '2026-11-30', '2026-10-20')
    expect(r.totals.unstaffed).toBe(1)
    expect(r.totals.revenue).toBe(800)
    expect(r.totals.pay).toBe(67.5 * 3)
  })

  it('only counts dates inside the range', () => {
    const r = payReport({ sessions: cycleA, coaches: [lead, asst], centers: [A] }, '2026-10-19', '2026-10-26', '2026-10-20')
    expect(r.totals.sessions).toBe(2)
    expect(r.lines.map((l) => l.date)).toEqual(['2026-10-19', '2026-10-19', '2026-10-26', '2026-10-26'])
  })

  it('breaks totals down by territory, coach and center', () => {
    const k = [session('k1', { territoryId: 'knx', centerId: 'K', start: '10:00', end: '12:00', assignments: crew('knx1') })]
    const r = payReport({ sessions: [...cycleA, ...k], coaches: [lead, asst, knx], centers: [A, K] }, '2026-10-01', '2026-11-30', '2026-10-20')
    expect(r.byTerritory.map((t) => [t.territoryId, t.pay])).toEqual([['lou', 270], ['knx', 60]])
    expect(r.byCoach.map((c) => [c.coachId, c.hours, c.pay])).toEqual([['lead1', 6, 150], ['asst1', 6, 120], ['knx1', 2, 60]])
    expect(r.byCoach[0]).toMatchObject({ deliveredHours: 3, scheduledHours: 3 })
    // Lowest margin first: the programs to look at.
    expect(r.byCenter.map((c) => [c.centerId, c.revenue, c.margin])).toEqual([['K', 150, 90], ['A', 800, 530]])
  })

  it('places a session in its cycle using every session, even when the report shows fewer', () => {
    // Showing only November: the price per session is still $200, not $800 ÷ 1.
    const nov = cycleA.filter((s) => s.date >= '2026-11-01')
    const r = payReport({ sessions: nov, coaches: [lead, asst], centers: [A] }, '2026-11-01', '2026-11-30', '2026-10-20', cycleA)
    expect(r.totals.revenue).toBe(200)
  })

  it('a center with no terms earns nothing; its coaches are still paid', () => {
    const r = payReport({ sessions: cycleA.slice(0, 1), coaches: [lead, asst], centers: [centerA] }, MON, MON, '2026-10-20')
    expect(r.totals.revenue).toBe(0)
    expect(r.totals.pay).toBe(67.5)
    expect(marginShare(r.totals)).toBeUndefined()
  })

  it('adds up week by week, Monday to Sunday', () => {
    const weeks = weeklyPay({ sessions: cycleA, coaches: [lead, asst], centers: [A] }, '2026-10-14', 5, '2026-10-20')
    expect(weeks.map((w) => w.monday)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    expect(weeks.map((w) => w.pay)).toEqual([67.5, 67.5, 67.5, 67.5, 0])
    expect(weeks.map((w) => w.revenue)).toEqual([200, 200, 200, 200, 0])
  })

  it('knows where a month starts and ends', () => {
    expect(monthRange('2026-11-17')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2026-12-05')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('knows which 3-week pay period a date is in, Monday to Sunday', () => {
    expect(payCycleRange(PAY_CYCLE_START)).toEqual({ from: '2026-01-05', to: '2026-01-25' })
    expect(payCycleRange('2026-01-25')).toEqual({ from: '2026-01-05', to: '2026-01-25' })
    expect(payCycleRange('2026-01-26')).toEqual({ from: '2026-01-26', to: '2026-02-15' })
    // Across the switch to standard time and into next year.
    expect(payCycleRange('2026-11-04')).toEqual({ from: '2026-10-26', to: '2026-11-15' })
    expect(payCycleRange('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-17' })
    // Before the first period too.
    expect(payCycleRange('2026-01-01')).toEqual({ from: '2025-12-15', to: '2026-01-04' })
  })

  it('exports payroll as CSV, quoting names with commas', () => {
    const lines = payLines({ sessions: cycleA.slice(0, 1), coaches: [lead, asst] }, MON, MON, '2026-10-20')
    const csv = payrollCsv(lines, {
      coach: (id) => (id === 'lead1' ? 'Lee, Pat' : 'Sam "Sammy" Ray'),
      level: (id) => (id === 'lead1' ? 'Lead' : 'Assistant'),
      center: () => 'Center A',
      territory: () => 'Louisville',
    })
    expect(csv.split('\n')).toEqual([
      'Date,Territory,Center,Coach,Level,Start,End,Hours,Rate,Pay,Delivered or scheduled',
      '2026-10-12,Louisville,Center A,"Sam ""Sammy"" Ray",Assistant,10:00,11:30,1.5,20.00,30.00,Delivered',
      '2026-10-12,Louisville,Center A,"Lee, Pat",Lead,10:00,11:30,1.5,25.00,37.50,Delivered',
      '',
    ])
  })

  it('is management only', () => {
    const as = (role: User['role']) => ({ role }) as User
    expect(canSeeMoney(as('ops_admin'))).toBe(true)
    expect(canSeeMoney(as('territory_manager'))).toBe(true)
    expect(canSeeMoney(as('sales_rep'))).toBe(false)
    expect(canSeeMoney(as('coach'))).toBe(false)
  })
})

describe('hours × pay on the demo company', () => {
  const today = '2026-11-04'
  const demo = buildDemo(today)
  const { from, to } = monthRange(today)
  const r = payReport(demo, from, to, today)

  it('every territory runs, pays and earns something this month', () => {
    expect(r.byTerritory.map((t) => t.territoryId).sort()).toEqual(['knx', 'lou', 'oak'])
    for (const t of r.byTerritory) {
      expect(t.hours).toBeGreaterThan(0)
      expect(t.pay).toBeGreaterThan(0)
      expect(t.revenue).toBeGreaterThan(t.pay)
    }
  })

  it('the parts add up to the whole', () => {
    const sum = (k: 'pay' | 'revenue' | 'hours') => r.byTerritory.reduce((n, t) => n + t[k], 0)
    expect(sum('pay')).toBeCloseTo(r.totals.pay)
    expect(sum('revenue')).toBeCloseTo(r.totals.revenue)
    expect(r.byCoach.reduce((n, c) => n + c.hours, 0)).toBeCloseTo(r.totals.hours)
    expect(r.byCenter.reduce((n, c) => n + c.margin, 0)).toBeCloseTo(r.totals.margin)
    expect(r.delivered.pay + r.scheduled.pay).toBeCloseTo(r.totals.pay)
  })

  it('no program earns more than it sold', () => {
    const prices = sessionPrices(demo.centers, demo.sessions)
    for (const c of demo.centers.filter((x) => x.terms)) {
      const earned = demo.sessions.reduce((n, s) => n + (s.centerId === c.id ? (prices.get(s.id) ?? 0) : 0), 0)
      expect(earned).toBeLessThanOrEqual(c.terms!.cycleRate + 0.01)
    }
  })
})
