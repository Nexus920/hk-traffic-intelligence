import type { ArrivalClock } from "./types.ts"

export const ETA_FRESH_MS = 60_000
export const ETA_KEEP_MS = 3 * 60_000
export const ARRIVAL_SLICE = 8
export const ARRIVAL_BATCH = 8

export type HeldRows<T> = { at: number; rows: T[] }

export function etaDue(held: { at: number } | undefined, now: number, freshMs = ETA_FRESH_MS): boolean {
  return held == null || now - held.at >= freshMs
}

export function heldRows<T>(held: HeldRows<T> | undefined, now: number, keepMs = ETA_KEEP_MS): T[] | null {
  if (!held || now - held.at > keepMs) return null
  return held.rows
}

export function dueIds(ids: readonly string[], remembered: ReadonlyMap<string, { at: number }>, now: number, limit = ARRIVAL_SLICE): string[] {
  const due: string[] = []
  for (const id of ids) {
    if (!etaDue(remembered.get(id), now)) continue
    due.push(id)
    if (due.length >= limit) break
  }
  return due
}

export function clocksWaiting(stops: readonly { clock?: ArrivalClock }[] | undefined): boolean {
  return Boolean(stops?.some((stop) => stop.clock === "waiting"))
}

export function knownSet(value: string | null): Set<string> {
  const ids = new Set<string>()
  if (!value) return ids
  for (const part of value.split(",")) {
    const id = part.trim()
    if (id) ids.add(id)
  }
  return ids
}

type KnownStop = { id: string; clock?: ArrivalClock; calls?: readonly { route: string }[] }

// Stops already on the card, so the next read can fetch the ones still missing.
export function knownQuery(stops: readonly KnownStop[] | undefined): string {
  const tokens: string[] = []
  for (const stop of stops ?? []) {
    if (stop.clock === "ready") {
      tokens.push(stop.id)
      continue
    }
    for (const call of stop.calls ?? []) {
      if (call.route) tokens.push(`${stop.id}/${call.route}`)
    }
  }
  return [...new Set(tokens)].sort().join(",")
}

type FetchStop = { id: string; key: string }

// The next unread stops. Records that share a point stay in the same read.
export function nextStopFetch(
  stops: readonly FetchStop[],
  known: ReadonlySet<string>,
  remembered: ReadonlyMap<string, { at: number }>,
  now: number,
  rawLimit = ARRIVAL_BATCH,
): string[] {
  const groups = new Map<string, string[]>()
  const order: string[] = []
  for (const stop of stops) {
    const list = groups.get(stop.key)
    if (list) list.push(stop.id)
    else {
      groups.set(stop.key, [stop.id])
      order.push(stop.key)
    }
  }
  const unread: string[][] = []
  const refresh: string[][] = []
  for (const key of order) {
    const ids = groups.get(key) ?? []
    const canonical = [...ids].sort()[0]
    if (!canonical) continue
    const pending = ids.filter((id) => etaDue(remembered.get(id), now))
    if (pending.length === 0) continue
    if (known.has(canonical)) refresh.push(pending)
    else unread.push(pending)
  }
  const due: string[] = []
  for (const ids of (unread.length > 0 ? unread : refresh)) {
    if (due.length > 0 && due.length + ids.length > rawLimit) break
    due.push(...ids)
  }
  return due
}

export function forgetStale<T>(held: Map<string, HeldRows<T>>, now: number, keepMs = ETA_KEEP_MS): void {
  for (const [key, item] of held) {
    if (now - item.at > keepMs) held.delete(key)
  }
}

export function arrivalFailure(missed: number, callCounts: number[], message: string): string | undefined {
  if (missed <= 0) return undefined
  if (callCounts.some((count) => count > 0)) return undefined
  return message
}

type PlaceBody<P> = { ok: boolean; stops: P[] }
type ArrivalBody<S> = { ok: boolean; observedAt: string | null; stops: S[] }

// Places stay on the map. A later arrival copy only fills the clock for ids the catalogue already listed.
export function mergePlaceArrivals<S extends { id: string; calls: unknown[]; clock?: ArrivalClock }>(
  places: PlaceBody<Omit<S, "calls" | "clock">> | null,
  arrivals: ArrivalBody<S> | null,
): { ok: true; observedAt: string | null; stops: S[] } | null {
  if (places?.ok) {
    const live = new Map<string, S>()
    if (arrivals?.ok) {
      for (const stop of arrivals.stops) live.set(stop.id, stop)
    }
    return {
      ok: true,
      observedAt: arrivals?.ok ? arrivals.observedAt : null,
      stops: places.stops.map((stop) => {
        const found = live.get(stop.id)
        if (found) return { ...stop, calls: found.calls, clock: found.clock ?? "ready" } as unknown as S
        return { ...stop, calls: [], clock: "waiting" } as unknown as S
      }),
    }
  }
  if (!arrivals?.ok) return null
  return { ok: true, observedAt: arrivals.observedAt, stops: arrivals.stops }
}

function callKey(call: { route: string; destTc?: string; destEn?: string }): string {
  return `${call.route}|${call.destTc ?? ""}|${call.destEn ?? ""}`
}

function unionCalls<T extends { route: string; destTc?: string; destEn?: string; minutes?: number | null }>(kept: readonly T[], incoming: readonly T[]): T[] {
  const best = new Map<string, T>()
  for (const call of [...kept, ...incoming]) {
    const key = callKey(call)
    const current = best.get(key)
    if (!current || (call.minutes ?? 1_000_000) < (current.minutes ?? 1_000_000)) best.set(key, call)
  }
  return [...best.values()].sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
}

// A later read that has not reached a stop yet must not wipe the board already on screen.
export function retainReadyStops<S extends { id: string; calls: { route: string; destTc?: string; destEn?: string; minutes?: number | null }[]; clock?: ArrivalClock }>(
  previous: { ok: boolean; observedAt: string | null; stops: S[] } | null,
  incoming: { ok: boolean; observedAt: string | null; stops: S[] } | null,
): { ok: boolean; observedAt: string | null; stops: S[] } | null {
  if (!incoming) return previous
  const prior = new Map((previous?.stops ?? []).map((stop) => [stop.id, stop]))
  return {
    ok: true,
    observedAt: incoming.observedAt ?? previous?.observedAt ?? null,
    stops: incoming.stops.map((stop) => {
      const kept = prior.get(stop.id)
      if (stop.clock === "ready") return stop
      if (kept?.clock === "ready") return { ...stop, calls: kept.calls, clock: "ready" as const }
      if (kept && kept.calls.length > 0) return { ...stop, calls: unionCalls(kept.calls, stop.calls), clock: "waiting" as const }
      return stop
    }),
  }
}
