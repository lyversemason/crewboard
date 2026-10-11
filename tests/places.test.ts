import { describe, expect, it } from 'vitest'
import { handAddress } from '../src/data/places'

const louisville = { lat: 38.2527, lng: -85.7585 }
const typed = (over = {}) => ({ street: '2207 gursky court', city: 'louisville', state: 'ky', zip: '40223', ...over })

describe('addresses typed by hand', () => {
  it('standardizes all four parts', () => {
    const r = handAddress(typed(), 'lou', louisville)
    expect('address' in r && r.address).toBe('2207 Gursky Ct, Louisville, KY 40223')
  })

  it('places a known ZIP at its middle, an unknown one at the territory middle (approximate)', () => {
    const known = handAddress(typed({ zip: '40222' }), 'lou', louisville)
    const unknown = handAddress(typed(), 'lou', louisville)
    expect('approximate' in known && known.approximate).toBe(false)
    expect('approximate' in unknown && unknown.approximate).toBe(true)
    expect('lat' in unknown && unknown.lat).toBe(louisville.lat)
  })

  it('says what is missing or wrong', () => {
    expect(handAddress(typed({ street: 'Gursky Ct' }), 'lou', louisville)).toEqual({ problem: expect.stringMatching(/house number/) })
    expect(handAddress(typed({ city: '' }), 'lou', louisville)).toEqual({ problem: 'Enter the city.' })
    expect(handAddress(typed({ state: 'TN' }), 'lou', louisville)).toEqual({ problem: 'Centers in this territory are in KY.' })
    expect(handAddress(typed({ zip: '4022' }), 'lou', louisville)).toEqual({ problem: 'Enter the 5-digit ZIP code.' })
  })
})
