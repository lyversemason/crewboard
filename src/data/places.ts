// Approximate ZIP-code centers used for the demo's address lookup and for
// placing the fictional centers on the map. A production build would call a
// geocoding API instead.

export interface Zip {
  zip: string
  area: string
  lat: number
  lng: number
}

export const CITY: Record<string, { city: string; state: string; areaCode: string }> = {
  lou: { city: 'Louisville', state: 'KY', areaCode: '502' },
  knx: { city: 'Knoxville', state: 'TN', areaCode: '865' },
  oak: { city: 'Oakland', state: 'CA', areaCode: '510' },
}

export const ZIPS: Record<string, Zip[]> = {
  lou: [
    { zip: '40202', area: 'Downtown', lat: 38.2533, lng: -85.7516 },
    { zip: '40204', area: 'Highlands', lat: 38.237, lng: -85.723 },
    { zip: '40205', area: 'Bonnycastle', lat: 38.222, lng: -85.688 },
    { zip: '40206', area: 'Crescent Hill', lat: 38.256, lng: -85.702 },
    { zip: '40207', area: 'St. Matthews', lat: 38.261, lng: -85.651 },
    { zip: '40214', area: 'South End', lat: 38.159, lng: -85.779 },
    { zip: '40220', area: 'Hikes Point', lat: 38.215, lng: -85.617 },
    { zip: '40222', area: 'Lyndon', lat: 38.266, lng: -85.62 },
    { zip: '40241', area: 'Prospect', lat: 38.301, lng: -85.579 },
    { zip: '40299', area: 'Jeffersontown', lat: 38.191, lng: -85.565 },
  ],
  knx: [
    { zip: '37902', area: 'Downtown', lat: 35.964, lng: -83.92 },
    { zip: '37909', area: 'West Knoxville', lat: 35.947, lng: -84.02 },
    { zip: '37912', area: 'North Knoxville', lat: 36.006, lng: -83.979 },
    { zip: '37917', area: 'Old North', lat: 35.996, lng: -83.912 },
    { zip: '37918', area: 'Fountain City', lat: 36.04, lng: -83.92 },
    { zip: '37919', area: 'Bearden', lat: 35.92, lng: -84.0 },
    { zip: '37920', area: 'South Knoxville', lat: 35.918, lng: -83.865 },
    { zip: '37922', area: 'Farragut', lat: 35.875, lng: -84.15 },
    { zip: '37923', area: 'Cedar Bluff', lat: 35.933, lng: -84.08 },
    { zip: '37931', area: 'Karns', lat: 35.976, lng: -84.124 },
  ],
  oak: [
    { zip: '94601', area: 'Fruitvale', lat: 37.776, lng: -122.217 },
    { zip: '94602', area: 'Glenview', lat: 37.802, lng: -122.211 },
    { zip: '94606', area: 'Eastlake', lat: 37.792, lng: -122.244 },
    { zip: '94607', area: 'West Oakland', lat: 37.804, lng: -122.29 },
    { zip: '94609', area: 'Temescal', lat: 37.835, lng: -122.264 },
    { zip: '94610', area: 'Grand Lake', lat: 37.812, lng: -122.242 },
    { zip: '94611', area: 'Piedmont Ave', lat: 37.83, lng: -122.22 },
    { zip: '94612', area: 'Downtown', lat: 37.808, lng: -122.27 },
    { zip: '94618', area: 'Rockridge', lat: 37.843, lng: -122.24 },
    { zip: '94619', area: 'Maxwell Park', lat: 37.788, lng: -122.188 },
  ],
}

const SUFFIXES: [RegExp, string][] = [
  [/\bstreet\b/gi, 'St'],
  [/\bavenue\b/gi, 'Ave'],
  [/\broad\b/gi, 'Rd'],
  [/\bdrive\b/gi, 'Dr'],
  [/\bboulevard\b/gi, 'Blvd'],
  [/\blane\b/gi, 'Ln'],
  [/\bcourt\b/gi, 'Ct'],
  [/\bparkway\b/gi, 'Pkwy'],
  [/\bplace\b/gi, 'Pl'],
  [/\bnorth\b/gi, 'N'],
  [/\bsouth\b/gi, 'S'],
  [/\beast\b/gi, 'E'],
  [/\bwest\b/gi, 'W'],
]

/** Standard street formatting: collapse spaces, title case, USPS suffixes. */
export function standardizeStreet(raw: string): string {
  let s = raw.trim().replace(/[.,]+$/g, '').replace(/\s+/g, ' ')
  s = s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
  for (const [re, abbr] of SUFFIXES) s = s.replace(re, abbr)
  return s.replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, sfx) => n + sfx.toLowerCase())
}

/** Returns null when the street doesn't look like "<number> <name>". */
export function standardizeAddress(street: string, territoryId: string, zip: string): string | null {
  const s = standardizeStreet(street)
  if (!/^\d+[A-Za-z]?\s+\S+/.test(s)) return null
  const place = ZIPS[territoryId]?.find((z) => z.zip === zip)
  if (!place) return null
  const { city, state } = CITY[territoryId]
  return `${s}, ${city}, ${state} ${zip}`
}
