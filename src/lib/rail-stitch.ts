import { metresBetween } from "./mtr-estimate.ts"

type Way = { id: number; line: [number, number][] }
type Station = { code: string; lng: number; lat: number }

const NEAR_M = 150

export function stitchPair(ways: readonly Way[], stations: readonly Station[], fromCode: string, toCode: string): [number, number][] | null {
  const from = stations.find((station) => station.code === fromCode)
  const to = stations.find((station) => station.code === toCode)
  if (!from || !to) return null
  const nodes = new Map<string, { lng: number; lat: number }>()
  const next = new Map<string, { to: string; metres: number }[]>()
  const nodeId = (lng: number, lat: number) => `${lng.toFixed(5)},${lat.toFixed(5)}`
  const touch = (lng: number, lat: number) => {
    const id = nodeId(lng, lat)
    if (!nodes.has(id)) nodes.set(id, { lng, lat })
    return id
  }
  for (const way of ways) {
    for (let index = 1; index < way.line.length; index += 1) {
      const a = way.line[index - 1]
      const b = way.line[index]
      if (!a || !b) continue
      const left = touch(a[0], a[1])
      const right = touch(b[0], b[1])
      const metres = metresBetween({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] })
      const out = next.get(left) ?? []
      out.push({ to: right, metres })
      next.set(left, out)
      const back = next.get(right) ?? []
      back.push({ to: left, metres })
      next.set(right, back)
    }
  }
  const portals = (station: Station) => {
    const found: { id: string; metres: number }[] = []
    for (const [id, point] of nodes) {
      const metres = metresBetween(station, point)
      if (metres <= NEAR_M) found.push({ id, metres })
    }
    return found
  }
  const starts = portals(from)
  const goals = portals(to)
  if (starts.length === 0 || goals.length === 0) return null
  const start = `portal:${fromCode}`
  const goal = `portal:${toCode}`
  next.set(start, starts.map((item) => ({ to: item.id, metres: item.metres })))
  for (const item of starts) {
    const back = next.get(item.id) ?? []
    back.push({ to: start, metres: item.metres })
    next.set(item.id, back)
  }
  for (const item of goals) {
    const out = next.get(item.id) ?? []
    out.push({ to: goal, metres: item.metres })
    next.set(item.id, out)
  }
  const cost = new Map<string, number>([[start, 0]])
  const prev = new Map<string, string>()
  const queue = [start]
  while (queue.length > 0) {
    queue.sort((a, b) => (cost.get(a) ?? Infinity) - (cost.get(b) ?? Infinity))
    const here = queue.shift()
    if (!here || here === goal) break
    for (const edge of next.get(here) ?? []) {
      const nextCost = (cost.get(here) ?? Infinity) + edge.metres
      if (nextCost >= (cost.get(edge.to) ?? Infinity)) continue
      cost.set(edge.to, nextCost)
      prev.set(edge.to, here)
      if (!queue.includes(edge.to)) queue.push(edge.to)
    }
  }
  if (!prev.has(goal) && start !== goal) return null
  const chain = [goal]
  let cursor = goal
  while (cursor !== start) {
    const before = prev.get(cursor)
    if (!before) return null
    chain.push(before)
    cursor = before
  }
  chain.reverse()
  const line: [number, number][] = [[from.lng, from.lat]]
  for (const id of chain) {
    const point = nodes.get(id)
    if (!point) continue
    const last = line[line.length - 1]
    if (last && last[0] === point.lng && last[1] === point.lat) continue
    line.push([point.lng, point.lat])
  }
  const tail = line[line.length - 1]
  if (!tail || tail[0] !== to.lng || tail[1] !== to.lat) line.push([to.lng, to.lat])
  return line
}
