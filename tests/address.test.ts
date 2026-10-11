import { describe, expect, it } from 'vitest'
import { addressLine, serviceAddresses } from '../src/ui/address'
import type { PhotonFeature } from '../src/ui/address'

// The shape Photon returns (trimmed), for a real Louisville address.
const feature = (over: Record<string, string>, lng = -85.5712, lat = 38.2778): PhotonFeature => ({
  geometry: { coordinates: [lng, lat] },
  properties: { countrycode: 'US', housenumber: '2207', street: 'Gursky Court', city: 'Louisville', state: 'Kentucky', postcode: '40223', ...over },
})
const louisville = { lat: 38.2527, lng: -85.7585 }

describe('address search results', () => {
  it('turns a result into a standard address line', () => {
    const [a] = serviceAddresses([feature({})], louisville)
    expect(addressLine(a)).toBe('2207 Gursky Court, Louisville, KY 40223')
  })

  it('drops results outside the service area, without a house number, or repeated', () => {
    const far = feature({ city: 'Lexington' }, -84.5, 38.04)
    const streetOnly = feature({ housenumber: '' })
    expect(serviceAddresses([feature({}), far, streetOnly, feature({})], louisville).length).toBe(1)
  })
})
