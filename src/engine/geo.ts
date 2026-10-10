// Turns the distance between two centers into estimated driving minutes.
// A real deployment would call a routing API; this demo uses straight-line
// distance times a road factor so it works offline and is easy to test.

export interface Point {
  lat: number
  lng: number
}

const EARTH_RADIUS_MILES = 3958.8
/** Roads are longer than a straight line; 1.3 is a common rule of thumb. */
export const ROAD_FACTOR = 1.3

export function milesBetween(a: Point, b: Point): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

export function transitMinutes(a: Point, b: Point, avgSpeedMph: number): number {
  if (a.lat === b.lat && a.lng === b.lng) return 0
  return Math.ceil(((milesBetween(a, b) * ROAD_FACTOR) / avgSpeedMph) * 60)
}
