import { gmbStop } from "@/lib/gmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import type { GmbRouteStopRow } from "@/lib/gmb-route-stop-validation"
import { joinGmbRouteStopCoordinates, type GmbRouteStopJoinResult } from "@/lib/gmb-route-stop-coordinate-join"
import { isGmbRouteDirection } from "@/lib/gmb-route-sequence-validation"

const ROUTE_STOP_ROOT = "https://data.etagmb.gov.hk/route-stop"
const CACHE_MS = 6 * 60 * 60_000

type ApiRouteStop = GmbRouteStopRow
type RouteStopResponse = {
  data?: { route_stops?: ApiRouteStop[] } | ApiRouteStop[]
}

export type GmbRouteStopCoordinate = {
  stopSeq: number
  stopId: string
  lng: number
  lat: number
}

const cache = new Map<string, { at: number; result: GmbRouteStopJoinResult }>()

/** Returns the latest join diagnostics for a route direction, if it was loaded. */
export function getGmbRouteStopCoordinateDiagnostics(
  routeId: number,
  routeSeq: number,
): GmbRouteStopJoinResult | null {
  if (!Number.isSafeInteger(routeId) || routeId <= 0 || !isGmbRouteDirection(routeSeq)) return null
  return cache.get(`${routeId}/${routeSeq}`)?.result ?? null
}

/**
 * Loads the official ordered stop sequence for one GMB route direction and
 * joins it to the local official-stop coordinate catalogue. Diagnostics make
 * incomplete joins visible; this metadata does not imply a vehicle is at any stop.
 */
export async function loadGmbRouteStopCoordinates(
  routeId: number,
  routeSeq: number,
  now = Date.now(),
): Promise<GmbRouteStopCoordinate[]> {
  if (!Number.isSafeInteger(routeId) || routeId <= 0 || !isGmbRouteDirection(routeSeq)) {
    return []
  }

  const key = `${routeId}/${routeSeq}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.result.stops

  const body = await readEtaJson<RouteStopResponse>(
    `${ROUTE_STOP_ROOT}/${routeId}/${routeSeq}`,
  )
  const rows = Array.isArray(body?.data)
    ? body.data
    : body?.data && "route_stops" in body.data && Array.isArray(body.data.route_stops)
      ? body.data.route_stops
      : null
  if (!rows) return hit?.result.stops ?? []

  const result = joinGmbRouteStopCoordinates(rows, (stopId) => {
    const stop = gmbStop(stopId)
    return stop ? { lng: stop.lng, lat: stop.lat } : null
  })

  cache.set(key, { at: now, result })
  return result.stops
}
