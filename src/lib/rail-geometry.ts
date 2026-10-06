import { metresBetween, type GeoPoint } from "./mtr-estimate.ts"

export function lineMetres(line: readonly GeoPoint[]): number {
  let total = 0
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1]
    const to = line[index]
    if (from && to) total += metresBetween(from, to)
  }
  return total
}

export function pointAlong(line: readonly GeoPoint[], metres: number): GeoPoint {
  const start = line[0]
  if (!start) return { lng: 0, lat: 0 }
  if (line.length === 1) return start
  let left = Math.max(0, metres)
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1]
    const to = line[index]
    if (!from || !to) continue
    const step = metresBetween(from, to)
    if (left <= step || index === line.length - 1) {
      const mix = step <= 0 ? 1 : Math.min(1, left / step)
      return { lng: from.lng + (to.lng - from.lng) * mix, lat: from.lat + (to.lat - from.lat) * mix }
    }
    left -= step
  }
  return line[line.length - 1] ?? start
}

export function orientLine(line: readonly GeoPoint[], from: GeoPoint): GeoPoint[] {
  const first = line[0]
  const last = line[line.length - 1]
  if (!first || !last) return [...line]
  return metresBetween(first, from) <= metresBetween(last, from) ? [...line] : [...line].reverse()
}

export function fractionAlong(line: readonly GeoPoint[], point: GeoPoint): number {
  const total = lineMetres(line)
  if (total <= 1) return 0
  let walked = 0
  let best = 0
  let bestGap = Number.POSITIVE_INFINITY
  for (let index = 1; index < line.length; index += 1) {
    const from = line[index - 1]
    const to = line[index]
    if (!from || !to) continue
    const step = metresBetween(from, to)
    const gap = step <= 0 ? metresBetween(from, point) : distanceToSegment(from, to, point)
    if (gap < bestGap) {
      bestGap = gap
      const along = step <= 0 ? 0 : projectSegment(from, to, point) * step
      best = walked + along
    }
    walked += step
  }
  return Math.min(1, Math.max(0, best / total))
}

function distanceToSegment(from: GeoPoint, to: GeoPoint, point: GeoPoint): number {
  const mix = projectSegment(from, to, point)
  return metresBetween(point, {
    lng: from.lng + (to.lng - from.lng) * mix,
    lat: from.lat + (to.lat - from.lat) * mix,
  })
}

function projectSegment(from: GeoPoint, to: GeoPoint, point: GeoPoint): number {
  const east = to.lng - from.lng
  const north = to.lat - from.lat
  const span = east * east + north * north
  if (span <= 0) return 0
  const raw = ((point.lng - from.lng) * east + (point.lat - from.lat) * north) / span
  return Math.min(1, Math.max(0, raw))
}
