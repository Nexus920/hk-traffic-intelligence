export type GmbRouteStopDiagnosticsParams = {
  routeId: number
  routeSeq: 1 | 2
}

export type GmbRouteStopQualityStatus = "complete" | "partial" | "no-valid-stops"

export function parseGmbRouteStopDiagnosticsParams(
  routeIdRaw: string | null,
  routeSeqRaw: string | null,
): GmbRouteStopDiagnosticsParams | null {
  if (!routeIdRaw || !/^[1-9]\d*$/.test(routeIdRaw)) return null
  if (!routeSeqRaw || !/^[12]$/.test(routeSeqRaw)) return null

  const routeId = Number(routeIdRaw)
  if (!Number.isSafeInteger(routeId) || routeId <= 0) return null

  return { routeId, routeSeq: Number(routeSeqRaw) as 1 | 2 }
}

export function getGmbRouteStopQualityStatus(diagnostics: {
  validRows: number
  isComplete: boolean
}): GmbRouteStopQualityStatus {
  if (diagnostics.validRows === 0) return "no-valid-stops"
  return diagnostics.isComplete ? "complete" : "partial"
}

export type GmbRouteStopDiagnosticsBatchParams = {
  routeIds: number[]
  routeSeq: 1 | 2
}

/** Accepts a small, unique route sample to avoid excessive upstream requests. */
export function parseGmbRouteStopDiagnosticsBatchParams(
  routeIdsRaw: string | null,
  routeSeqRaw: string | null,
): GmbRouteStopDiagnosticsBatchParams | null {
  if (!routeIdsRaw || !routeSeqRaw || !/^[12]$/.test(routeSeqRaw)) return null
  const rawIds = routeIdsRaw.split(",")
  if (rawIds.length < 1 || rawIds.length > 5) return null
  const routeIds: number[] = []
  for (const rawId of rawIds) {
    if (!/^[1-9]\d*$/.test(rawId)) return null
    const routeId = Number(rawId)
    if (!Number.isSafeInteger(routeId) || routeId <= 0 || routeIds.includes(routeId)) return null
    routeIds.push(routeId)
  }
  return { routeIds, routeSeq: Number(routeSeqRaw) as 1 | 2 }
}


export type GmbNearbyRouteStop = {
  stopSeq: number
  stopId: string
  lng: number
  lat: number
  distanceMetres: number
}

function distanceMetres(a: [number, number], b: [number, number]): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(b[1] - a[1])
  const dLng = toRadians(b[0] - a[0])
  const lat1 = toRadians(a[1])
  const lat2 = toRadians(b[1])
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

/** Returns nearby official route stops in deterministic distance/sequence order. */
export function rankNearbyGmbRouteStops(
  stops: readonly { stopSeq: number; stopId: string; lng: number; lat: number }[],
  reference: [number, number],
  radiusMetres = 1000,
  limit = 8,
): GmbNearbyRouteStop[] {
  const [lng, lat] = reference
  if (
    !Number.isFinite(lng) || !Number.isFinite(lat) ||
    lng < -180 || lng > 180 || lat < -90 || lat > 90 ||
    !Number.isFinite(radiusMetres) || radiusMetres < 0 ||
    !Number.isSafeInteger(limit) || limit < 1
  ) return []

  return stops.flatMap((stop) => {
    if (
      !Number.isSafeInteger(stop.stopSeq) || stop.stopSeq <= 0 ||
      !stop.stopId.trim() ||
      !Number.isFinite(stop.lng) || !Number.isFinite(stop.lat) ||
      stop.lng < -180 || stop.lng > 180 || stop.lat < -90 || stop.lat > 90
    ) return []
    const distance = distanceMetres(reference, [stop.lng, stop.lat])
    if (distance > radiusMetres) return []
    return [{
      stopSeq: stop.stopSeq,
      stopId: stop.stopId,
      lng: stop.lng,
      lat: stop.lat,
      distanceMetres: Math.round(distance),
    }]
  }).sort((a, b) => a.distanceMetres - b.distanceMetres || a.stopSeq - b.stopSeq || a.stopId.localeCompare(b.stopId))
    .slice(0, limit)
}
