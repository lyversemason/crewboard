import { describe, expect, it } from 'vitest'
import { WARNINGS, hasBlock, transitMinutes, validateCrew } from '../src/engine'
import { centerA, centerB, coach, crew, session, world } from './fixtures'

const codes = (vs: { code: string }[]) => vs.map((v) => v.code).sort()

describe('I. time conflicts', () => {
  it('blocks a coach who is already booked at an overlapping time', () => {
    const w = world({ sessions: [session('busy', { start: '10:30', end: '11:30', assignments: crew('lead1') })] })
    const vs = validateCrew(session('new'), ['lead1'], w)
    expect(codes(vs)).toEqual(['overlap'])
    expect(hasBlock(vs)).toBe(true)
  })

  it('allows back-to-back sessions at the same center', () => {
    const w = world({ sessions: [session('earlier', { start: '09:00', end: '10:00', assignments: crew('lead1') })] })
    expect(validateCrew(session('new'), ['lead1'], w)).toEqual([])
  })

  it('ignores cancelled and rescheduled sessions', () => {
    const w = world({
      sessions: [
        session('x', { status: 'cancelled', assignments: crew('lead1') }),
        session('y', { status: 'rescheduled', assignments: crew('lead1') }),
      ],
    })
    expect(validateCrew(session('new'), ['lead1'], w)).toEqual([])
  })

  it('does not compare a session against itself', () => {
    const s = session('same', { assignments: crew('lead1') })
    expect(validateCrew(s, ['lead1'], world({ sessions: [s] }))).toEqual([])
  })
})

describe('II. transit time + configurable buffer', () => {
  const drive = transitMinutes(centerA, centerB, 25)

  it('estimates about 19 minutes between the two test centers', () => {
    expect(drive).toBe(19)
  })

  it('flags a gap shorter than drive + buffer', () => {
    // Ends 10:00 at A; new session at B starts 10:30. Gap 30 < 19 + 30.
    const w = world({ sessions: [session('a', { start: '09:00', end: '10:00', assignments: crew('lead1') })] })
    const vs = validateCrew(session('b', { centerId: 'B', start: '10:30', end: '11:30' }), ['lead1'], w)
    expect(codes(vs)).toEqual(['travel'])
    expect(vs[0].severity).toBe('override')
    expect(vs[0].message).toBe(WARNINGS.travel)
    expect(vs[0].detail).toContain('needs 49')
  })

  it('passes when the gap exactly equals drive + buffer', () => {
    // 10:00 + 49 min = 10:49
    const w = world({ sessions: [session('a', { start: '09:00', end: '10:00', assignments: crew('lead1') })] })
    expect(validateCrew(session('b', { centerId: 'B', start: '10:49', end: '11:49' }), ['lead1'], w)).toEqual([])
  })

  it('checks travel in both directions (the other session comes later)', () => {
    const w = world({ sessions: [session('later', { centerId: 'B', start: '11:20', end: '12:00', assignments: crew('lead1') })] })
    expect(codes(validateCrew(session('first'), ['lead1'], w))).toEqual(['travel'])
  })

  it('uses the buffer from settings', () => {
    const base = { sessions: [session('a', { start: '09:00', end: '10:00', assignments: crew('lead1') })] }
    const next = session('b', { centerId: 'B', start: '10:30', end: '11:30' })
    expect(validateCrew(next, ['lead1'], world({ ...base, settings: { ...world().settings, bufferMinutes: 10 } }))).toEqual([])
    expect(codes(validateCrew(next, ['lead1'], world({ ...base, settings: { ...world().settings, bufferMinutes: 15 } })))).toEqual(['travel'])
  })
})

describe('III. lead coach rule', () => {
  it('warns when no lead coach is assigned', () => {
    const vs = validateCrew(session('s'), ['asst1'], world())
    expect(codes(vs)).toEqual(['no_lead'])
    expect(vs[0].message).toBe(WARNINGS.no_lead)
  })

  it('warns when two non-leads are paired without a lead', () => {
    expect(codes(validateCrew(session('s'), ['asst1', 'trainee1'], world()))).toEqual(['no_lead'])
  })

  it('a lead alone is enough for a small group', () => {
    expect(validateCrew(session('s'), ['lead1'], world())).toEqual([])
  })
})

describe('IV. 1:12 ratio, second coach at 13, override cap of 18', () => {
  const sized = (players: number) => session('s', { groups: [{ players, ageRange: '4-5', minutes: 60 }] })

  it('12 children with one lead is fine', () => {
    expect(validateCrew(sized(12), ['lead1'], world())).toEqual([])
  })

  it('13 children with one coach needs a second coach (overridable)', () => {
    const vs = validateCrew(sized(13), ['lead1'], world())
    expect(codes(vs)).toEqual(['ratio'])
    expect(vs[0].severity).toBe('override')
    expect(vs[0].message).toBe(WARNINGS.ratio)
  })

  it('13 children with a lead and an assistant is fine', () => {
    expect(validateCrew(sized(13), ['lead1', 'asst1'], world())).toEqual([])
  })

  it('trainees do not count toward the ratio', () => {
    expect(codes(validateCrew(sized(13), ['lead1', 'trainee1'], world()))).toEqual(['ratio'])
  })

  it('18 children with one coach is the most an override allows', () => {
    expect(validateCrew(sized(18), ['lead1'], world())[0].severity).toBe('override')
  })

  it('19 children with one coach is blocked outright', () => {
    const vs = validateCrew(sized(19), ['lead1'], world())
    expect(codes(vs)).toEqual(['ratio_max'])
    expect(hasBlock(vs)).toBe(true)
  })

  it('uses the largest group when several groups turn over', () => {
    const s = session('s', {
      groups: [
        { players: 8, ageRange: '2-3', minutes: 30 },
        { players: 14, ageRange: '4-5', minutes: 30 },
      ],
    })
    expect(codes(validateCrew(s, ['lead1'], world()))).toEqual(['ratio'])
  })
})

describe('roster rules', () => {
  it('blocks a coach from another territory', () => {
    const w = world({ coaches: [...world().coaches, coach('knxLead', 'lead', { territoryId: 'knx' })] })
    expect(codes(validateCrew(session('s'), ['knxLead'], w))).toEqual(['wrong_territory'])
  })

  it('blocks an inactive coach', () => {
    const w = world({ coaches: [coach('gone', 'lead', { active: false })] })
    expect(codes(validateCrew(session('s'), ['gone'], w))).toEqual(['inactive'])
  })

  it('warns when the coach is not marked available', () => {
    const w = world({ coaches: [coach('am', 'lead', { availability: { 1: [9], 2: [], 3: [], 4: [], 5: [], 6: [] } })] })
    // Monday 10:00-11:00, but only free 9-10.
    const vs = validateCrew(session('s'), ['am'], w)
    expect(codes(vs)).toEqual(['unavailable'])
    expect(vs[0].severity).toBe('override')
  })

  it('reports several problems at once', () => {
    const w = world({ sessions: [session('a', { start: '09:00', end: '10:00', assignments: crew('asst1') })] })
    const s = session('b', { centerId: 'B', start: '10:15', end: '11:00', groups: [{ players: 15, ageRange: '5', minutes: 45 }] })
    expect(codes(validateCrew(s, ['asst1'], w))).toEqual(['no_lead', 'ratio', 'travel'])
  })
})

describe('V. manager override warnings', () => {
  it('use the exact wording from the spec', () => {
    expect(WARNINGS.travel).toBe(
      'Are you sure you want to override this constraint? Warning: This assignment violates calculated travel time between centers.',
    )
    expect(WARNINGS.ratio).toBe(
      'Are you sure you want to override this constraint? Warning: This group size violates the 1:12 capacity ratio without an additional coach.',
    )
    expect(WARNINGS.no_lead).toBe(
      'Are you sure you want to override this constraint? Warning: No certified Lead Coach is assigned to this session block.',
    )
  })
})
