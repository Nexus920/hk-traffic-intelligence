export type Carriageway = {
  id: string
  roadEn: string
  roadTc: string
  direction: string
  coordinates: [number, number][]
}

const MIN_LENGTH_M = 40
const MIN_GAP_M = 3
const MAX_GAP_M = 40
const OPPOSITE_DEG = 150

type Span = {
  index: number
  key: string
  deg: number
  mid: [number, number]
}

// Hong Kong keeps left. A divided road stored with the dot on the right of its own direction is drawn backwards.
export function keepLeftCarriageways<T extends Carriageway>(lines: readonly T[]): T[] {
  let current = lines
  for (let pass = 0; pass < 4; pass += 1) {
    const next = turnWrongPairs(current)
    if (sameOrder(current, next)) return next
    current = next
  }
  return current
}

function sameOrder<T extends Carriageway>(before: readonly T[], after: readonly T[]): boolean {
  return before.every((line, index) => {
    const next = after[index]?.coordinates[0]
    const start = line.coordinates[0]
    return Boolean(start && next && start[0] === next[0] && start[1] === next[1])
  })
}

function turnWrongPairs<T extends Carriageway>(lines: readonly T[]): T[] {
  const spans: Span[] = []
  lines.forEach((line, index) => {
    const span = measure(line, index)
    if (span) spans.push(span)
  })
  const byRoad = new Map<string, Span[]>()
  for (const span of spans) {
    const group = byRoad.get(span.key) ?? []
    group.push(span)
    byRoad.set(span.key, group)
  }
  const reverse = new Set<number>()
  for (const group of byRoad.values()) {
    for (const span of group) {
      const partners = oppositeSides(lines, group, span)
      if (partners.length > 0 && partners.every((partner) => onRight(span.deg, partner.closest, span.mid))) reverse.add(span.index)
    }
  }
  lines.forEach((line, index) => {
    if (reverse.has(index) || line.direction !== "3" || line.coordinates.length < 2) return
    const lengthM = lengthMetres(line.coordinates)
    if (lengthM < 1 || lengthM >= MIN_LENGTH_M) return
    const key = line.roadTc.trim() || line.roadEn.trim()
    const group = byRoad.get(key)
    if (!group) return
    const first = line.coordinates[0]
    const last = line.coordinates[line.coordinates.length - 1]
    const mid = halfway(line.coordinates)
    if (!first || !last || !mid) return
    const span = { index, key, deg: bearing(first, last), mid }
    const partners = oppositeSides(lines, group, span)
    if (partners.length > 0 && partners.every((partner) => onRight(span.deg, partner.closest, span.mid))) reverse.add(index)
  })
  return lines.map((line, index) => (reverse.has(index) ? { ...line, coordinates: line.coordinates.slice().reverse() } : line))
}

function measure(line: Carriageway, index: number): Span | null {
  if (line.direction !== "3" || line.coordinates.length < 2) return null
  const key = line.roadTc.trim() || line.roadEn.trim()
  if (!key) return null
  const lengthM = lengthMetres(line.coordinates)
  if (lengthM < MIN_LENGTH_M) return null
  const first = line.coordinates[0]
  const last = line.coordinates[line.coordinates.length - 1]
  const mid = halfway(line.coordinates)
  if (!first || !last || !mid) return null
  return { index, key, deg: bearing(first, last), mid }
}

function oppositeSides(lines: readonly Carriageway[], group: readonly Span[], span: Span): { closest: [number, number] }[] {
  const found: { closest: [number, number] }[] = []
  for (const other of group) {
    if (other.index === span.index || !opposite(span.deg, other.deg)) continue
    const side = beside(span.mid, lines[other.index]?.coordinates ?? [])
    if (side) found.push(side)
  }
  return found
}

function beside(point: [number, number], coordinates: readonly [number, number][]): { gap: number; closest: [number, number] } | null {
  let best: { gap: number; closest: [number, number] } | null = null
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    if (!start || !end) continue
    const found = besideSegment(point, start, end)
    if (!found || found.gap < MIN_GAP_M || found.gap > MAX_GAP_M) continue
    if (!best || found.gap < best.gap) best = found
  }
  return best
}

function besideSegment(point: [number, number], start: [number, number], end: [number, number]): { gap: number; closest: [number, number] } | null {
  const scale = Math.cos((start[1] * Math.PI) / 180) * 111_000
  const alongEast = (end[0] - start[0]) * scale
  const alongNorth = (end[1] - start[1]) * 111_000
  const lengthSq = alongEast * alongEast + alongNorth * alongNorth
  if (lengthSq === 0) return null
  const pointEast = (point[0] - start[0]) * scale
  const pointNorth = (point[1] - start[1]) * 111_000
  const placed = (pointEast * alongEast + pointNorth * alongNorth) / lengthSq
  if (placed < 0 || placed > 1) return null
  const closest: [number, number] = [start[0] + (end[0] - start[0]) * placed, start[1] + (end[1] - start[1]) * placed]
  return { gap: metresBetween(point, closest), closest }
}

function onRight(travelDeg: number, from: [number, number], to: [number, number]): boolean {
  const rad = (travelDeg * Math.PI) / 180
  const forwardEast = Math.sin(rad)
  const forwardNorth = Math.cos(rad)
  const east = (to[0] - from[0]) * Math.cos((to[1] * Math.PI) / 180)
  const north = to[1] - from[1]
  return forwardEast * north - forwardNorth * east < 0
}

function opposite(a: number, b: number): boolean {
  let diff = Math.abs(a - b)
  if (diff > 180) diff = 360 - diff
  return diff >= OPPOSITE_DEG
}

function bearing(a: [number, number], b: [number, number]): number {
  const east = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180)
  const north = b[1] - a[1]
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
}

function halfway(coordinates: readonly [number, number][]): [number, number] | null {
  const total = lengthMetres(coordinates)
  const first = coordinates[0]
  if (!first || total <= 0) return first ?? null
  const target = total / 2
  let walked = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const point = coordinates[index]
    if (!previous || !point) continue
    const step = metresBetween(previous, point)
    if (walked + step >= target) {
      const mix = step === 0 ? 0 : (target - walked) / step
      return [previous[0] + (point[0] - previous[0]) * mix, previous[1] + (point[1] - previous[1]) * mix]
    }
    walked += step
  }
  return coordinates[coordinates.length - 1] ?? null
}

function lengthMetres(coordinates: readonly [number, number][]): number {
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1]
    const point = coordinates[index]
    if (previous && point) total += metresBetween(previous, point)
  }
  return total
}

function metresBetween(a: [number, number], b: [number, number]): number {
  const north = (b[1] - a[1]) * 111_000
  const east = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111_000
  return Math.hypot(east, north)
}
