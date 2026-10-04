import type { ArrivalClock } from "./types.ts"

type Call = {
  route: string
  destTc: string
  destEn: string
  minutes: number | null
}

type Pole = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  routes: string[]
  calls?: Call[]
  clock?: ArrivalClock
}

function poleKey(stop: { nameTc: string; lng: number; lat: number }): string {
  return `${stop.nameTc}|${stop.lng.toFixed(5)}|${stop.lat.toFixed(5)}`
}

function mergeCalls<T extends Call>(calls: T[]): T[] {
  const best = new Map<string, T>()
  for (const call of calls) {
    const key = `${call.route}|${call.destTc}|${call.destEn}`
    const current = best.get(key)
    if (!current || (call.minutes ?? 1_000_000) < (current.minutes ?? 1_000_000)) best.set(key, call)
  }
  return [...best.values()].sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
}

// KMB sometimes publishes one physical pole as two stop records. Keep one pin and the reading that has a time.
export function mergeSamePoles<T extends Pole>(stops: T[]): T[] {
  const order: string[] = []
  const groups = new Map<string, T[]>()
  for (const stop of stops) {
    const key = poleKey(stop)
    const list = groups.get(key)
    if (!list) {
      groups.set(key, [stop])
      order.push(key)
    } else list.push(stop)
  }
  return order.map((key) => {
    const group = groups.get(key) ?? []
    const head = [...group].sort((a, b) => (a.id < b.id ? -1 : 1))[0]
    if (!head) return group[0] as T
    const routes = [...new Set(group.flatMap((stop) => stop.routes))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const clocks = group.map((stop) => stop.clock).filter((clock): clock is ArrivalClock => clock != null)
    const clock = clocks.length === 0 ? undefined : clocks.includes("waiting") ? "waiting" : "ready"
    const calls = group.some((stop) => stop.calls) ? mergeCalls(group.flatMap((stop) => stop.calls ?? [])) : undefined
    return { ...head, routes, ...(calls ? { calls } : {}), ...(clock ? { clock } : {}) }
  })
}
