// Address search results (Photon / OpenStreetMap) turned into the parts the
// intake form needs. Kept apart from the component so it can be tested.

import { milesBetween } from '../engine'

export interface PickedAddress {
  street: string
  city: string
  state: string
  zip: string
  lat: number
  lng: number
}

/** How far from the territory's middle a center can be and still be served. */
export const SERVICE_MILES = 30

const STATE_CODES: Record<string, string> = { Kentucky: 'KY', Tennessee: 'TN', California: 'CA' }

export interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: Record<string, string | undefined>
}

export function toPicked(f: PhotonFeature): PickedAddress | null {
  const p = f.properties
  if (p.countrycode !== 'US' || !p.street || !p.housenumber || !p.postcode) return null
  return {
    street: `${p.housenumber} ${p.street}`,
    city: p.city ?? p.town ?? p.village ?? p.county ?? '',
    state: STATE_CODES[p.state ?? ''] ?? p.state ?? '',
    zip: p.postcode.slice(0, 5),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }
}

export const addressLine = (a: PickedAddress) => `${a.street}, ${a.city}, ${a.state} ${a.zip}`

/** Usable street addresses within the service area, nearest-first order kept, no repeats. */
export function serviceAddresses(features: PhotonFeature[], center: { lat: number; lng: number }, limit = 6): PickedAddress[] {
  const seen = new Set<string>()
  const out: PickedAddress[] = []
  for (const f of features) {
    const a = toPicked(f)
    if (!a || milesBetween(a, center) > SERVICE_MILES || seen.has(addressLine(a))) continue
    seen.add(addressLine(a))
    out.push(a)
  }
  return out.slice(0, limit)
}
