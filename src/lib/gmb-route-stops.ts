import { gmbStop } from "@/lib/gmb-reach"
import { readEtaJson } from "@/lib/eta-read"
import { uniqueGmbRouteStopRows, type GmbRouteStopRow } from "@/lib/gmb-route-stop-validation"
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
  if (!Number.isSafeInteger(routeId) || routeId <= 0 || !isGmbRouteDirection(routeSeq)) {
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
  for (const row of uniqueGmbRouteStopRows(rows)) {
    const stop = gmbStop(row.stopId)
    if (
      !stop ||
      !Number.isFinite(stop.lng) ||
      !Number.isFinite(stop.lat) ||
      stop.lng < -180 ||
      stop.lng > 180 ||
      stop.lat < -90 ||
      stop.lat > 90
    ) continue
    stops.push({ stopSeq: row.stopSeq, stopId: row.stopId, lng: stop.lng, lat: stop.lat })
  }

  cache.set(key, { at: now, stops })
  return stops
}
