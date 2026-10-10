import { gmbStop } from "@/lib/gmb-reach"
import { readEtaJson } from "@/lib/eta-read"

const ROUTE_STOP_ROOT = "https://data.etagmb.gov.hk/route-stop"
const CACHE_MS = 6 * 60 * 60_000

type ApiRouteStop = {
  stop_seq?: number
  stop_id?: string | number
  stop?: string | number
}

type RouteStopResponse = {
  data?: { route_stops?: ApiRouteStop[] } | ApiRouteStop[]
}

export type GmbRouteStopCoordinate = {
  stopSeq: number
  stopId: string
  lng: number
  lat: number
}

const cache = new Map<string, { at: number; stops: GmbRouteStopCoordinate[] }>()

/**
 * Loads the official ordered stop sequence for one GMB route direction and
 * joins it to the local official-stop coordinate catalogue. This is route
 * geometry metadata only; it does not imply that a vehicle is at any stop.
 */
export async function loadGmbRouteStopCoordinates(
  routeId: number,
  routeSeq: number,
  now = Date.now(),
): Promise<GmbRouteStopCoordinate[]> {
  if (!Number.isInteger(routeId) || routeId <= 0 || !Number.isInteger(routeSeq) || routeSeq <= 0) {
    return []
  }

  const key = `${routeId}/${routeSeq}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.stops

  const body = await readEtaJson<RouteStopResponse>(
    `${ROUTE_STOP_ROOT}/${routeId}/${routeSeq}`,
  )
  const rows = Array.isArray(body?.data)
    ? body.data
    : body?.data && "route_stops" in body.data && Array.isArray(body.data.route_stops)
      ? body.data.route_stops
      : null
  if (!rows) return hit?.stops ?? []

  const stops: GmbRouteStopCoordinate[] = []
  const seenSequences = new Set<number>()
  for (const row of rows) {
    const stopSeq = row.stop_seq
    const rawStopId = row.stop_id ?? row.stop
    const stopId =
      typeof rawStopId === "number" && Number.isSafeInteger(rawStopId) && rawStopId > 0
        ? String(rawStopId)
        : typeof rawStopId === "string" && rawStopId.trim()
          ? rawStopId.trim()
          : null
    if (!Number.isInteger(stopSeq) || (stopSeq as number) <= 0 || !stopId) continue

    // Keep route metadata unambiguous: duplicate sequence numbers make
    // adjacent-stop interpolation unsafe, so discard every duplicate.
    const sequence = stopSeq as number
    if (seenSequences.has(sequence)) continue
    seenSequences.add(sequence)

    const stop = gmbStop(stopId)
    if (
      !stop ||
      !Number.isFinite(stop.lng) ||
      !Number.isFinite(stop.lat) ||
      stop.lng < -180 ||
      stop.lng > 180 ||
      stop.lat < -90 ||
      stop.lat > 90
    ) continue
    stops.push({ stopSeq: sequence, stopId, lng: stop.lng, lat: stop.lat })
  }

  stops.sort((a, b) => a.stopSeq - b.stopSeq)
  cache.set(key, { at: now, stops })
  return stops
}
