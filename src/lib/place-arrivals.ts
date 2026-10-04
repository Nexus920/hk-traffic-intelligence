import type { ArrivalClock } from "./types.ts"

export const ETA_FRESH_MS = 60_000
export const ETA_KEEP_MS = 3 * 60_000
export const ARRIVAL_SLICE = 8

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

export function catalogueBoards<S extends { id: string }>(
  places: { ok: boolean; stops: S[] } | null,
): { ok: true; observedAt: null; stops: (S & { calls: []; clock: "waiting" })[] } | null {
  if (!places?.ok) return null
  return {
    ok: true,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [] as [], clock: "waiting" as const })),
  }
}
