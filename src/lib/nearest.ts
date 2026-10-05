const METRES_PER_PIXEL_AT_EQUATOR = 156_543.03392
const EAST_METRES = 111_320
const NORTH_METRES = 110_540

export function metresPerPixel(zoom: number, lat: number): number {
  return (METRES_PER_PIXEL_AT_EQUATOR * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

export function groundMetres(lng: number, lat: number, otherLng: number, otherLat: number): number {
  const cos = Math.cos((lat * Math.PI) / 180)
  const east = (otherLng - lng) * cos * EAST_METRES
  const north = (otherLat - lat) * NORTH_METRES
  return Math.hypot(east, north)
}

export function pointsWithin<T extends { lng: number; lat: number }>(
  points: readonly T[],
  lng: number,
  lat: number,
  radiusMetres: number,
  limit: number,
): T[] {
  return points
    .map((point) => ({ point, distance: groundMetres(lng, lat, point.lng, point.lat) }))
    .filter((item) => item.distance <= radiusMetres)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.point)
}

// One point per cell across the points that are actually in range, then the nearest leftovers up to the limit.
export function spreadWithin<T extends { lng: number; lat: number }>(
  points: readonly T[],
  lng: number,
  lat: number,
  radiusMetres: number,
  limit: number,
): T[] {
  const near = points
    .map((point) => ({ point, distance: groundMetres(lng, lat, point.lng, point.lat) }))
    .filter((item) => item.distance <= radiusMetres)
    .sort((a, b) => a.distance - b.distance || a.point.lng - b.point.lng || a.point.lat - b.point.lat)
  if (near.length <= limit) return near.map((item) => item.point)
  let west = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  for (const item of near) {
    if (item.point.lng < west) west = item.point.lng
    if (item.point.lng > east) east = item.point.lng
    if (item.point.lat < south) south = item.point.lat
    if (item.point.lat > north) north = item.point.lat
  }
  const width = Math.max(east - west, 1e-6)
  const height = Math.max(north - south, 1e-6)
  const cols = Math.max(1, Math.min(limit, Math.round(Math.sqrt(limit * (width / height)))))
  const rows = Math.max(1, Math.ceil(limit / cols))
  const lngCell = width / cols
  const latCell = height / rows
  const picked: T[] = []
  const seen = new Set<string>()
  const chosen = new Set<T>()
  for (const item of near) {
    if (picked.length >= limit) return picked
    const key = `${Math.floor((item.point.lng - west) / lngCell)},${Math.floor((item.point.lat - south) / latCell)}`
    if (seen.has(key)) continue
    seen.add(key)
    chosen.add(item.point)
    picked.push(item.point)
  }
  for (const item of near) {
    if (picked.length >= limit) break
    if (chosen.has(item.point)) continue
    picked.push(item.point)
  }
  return picked
}

export function nearestMetres<T extends { lng: number; lat: number }>(
  points: readonly T[],
  lng: number,
  lat: number,
  limit: number,
): T[] {
  return pointsWithin(points, lng, lat, Number.POSITIVE_INFINITY, limit)
}

export function nearestPoints<T extends { lng: number; lat: number }>(
  points: readonly T[],
  lng: number,
  lat: number,
  limit: number,
): T[] {
  const cos = Math.cos((lat * Math.PI) / 180)
  return points
    .map((point) => {
      const x = (point.lng - lng) * cos
      const y = (point.lat - lat)
      return { point, distance: x * x + y * y }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.point)
}
