import { isGmbRouteDirection } from "@/lib/gmb-route-sequence-validation"

export type EstimatedMinibus = {
  route: string
  routeSeq: number
  stopSeq: number
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
  etaMinutes: number
  segmentMinutes: number
  observedAt: string
  positionType: "estimated"
  label: string
}

export type RouteStopCoordinate = {
  stopSeq: number
  stopId: string
  lng: number
  lat: number
}

function validCoordinate(point: { lng: number; lat: number }): boolean {
  return Number.isFinite(point.lng) &&
    Number.isFinite(point.lat) &&
    point.lng >= -180 && point.lng <= 180 &&
    point.lat >= -90 && point.lat <= 90
}

/**
 * Interpolates a visual estimate between consecutive stops.
 * This is not a live GPS location. The caller must only use this
 * when it has a valid ETA and a known segment duration.
 * The returned coordinate is a display estimate, never a GPS fix.
 */
export function estimateBetweenStops(
  from: RouteStopCoordinate,
  to: RouteStopCoordinate,
  etaMinutes: number,
  segmentMinutes: number,
): { lng: number; lat: number } | null {
  if (
    !validCoordinate(from) ||
    !validCoordinate(to) ||
    !Number.isFinite(etaMinutes) ||
    !Number.isFinite(segmentMinutes) ||
    etaMinutes < 0 ||
    etaMinutes > segmentMinutes ||
    segmentMinutes <= 0
  ) {
    return null
  }

  // ETA is the time remaining to the next stop; values beyond the segment duration are not usable.
  const progress = 1 - etaMinutes / segmentMinutes
  return {
    lng: from.lng + (to.lng - from.lng) * progress,
    lat: from.lat + (to.lat - from.lat) * progress,
  }
}

/**
 * Converts validated estimates into a GeoJSON source for the map.
 * Only emits a point when ETA and segment duration pass validation.
 * The coordinate is a display estimate, never a GPS fix.
 */
export function estimatedMinibusCollection(
  vehicles: EstimatedMinibus[],
  now = Date.now(),
): GeoJSON.FeatureCollection<GeoJSON.Point, {
  route: string
  label: string
  positionType: "estimated"
  observedAt: string
  stopSeq: number
}> {
  return {
    type: "FeatureCollection",
    features: vehicles.flatMap((vehicle) => {
      const observedAtMs = Date.parse(vehicle.observedAt)
      if (
        !vehicle.route.trim() ||
        !vehicle.label.trim() ||
        !Number.isInteger(vehicle.stopSeq) ||
        vehicle.stopSeq <= 0 ||
        !Number.isFinite(observedAtMs) ||
        observedAtMs > now + 30_000 ||
        now - observedAtMs > GMB_ESTIMATE_MAX_AGE_MS
      ) return []
      const from: RouteStopCoordinate = { ...vehicle.from, stopSeq: vehicle.stopSeq, stopId: "" }
      const to: RouteStopCoordinate = { ...vehicle.to, stopSeq: vehicle.stopSeq + 1, stopId: "" }
      const coordinate = estimateBetweenStops(from, to, vehicle.etaMinutes, vehicle.segmentMinutes)
      if (!coordinate) return []
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [coordinate.lng, coordinate.lat] },
        properties: {
          route: vehicle.route,
          label: vehicle.label,
          positionType: vehicle.positionType,
          observedAt: vehicle.observedAt,
          stopSeq: vehicle.stopSeq,
        },
      }]
    }),
  }
}


/** Maximum age allowed for an ETA observation used in a map estimate. */
export const GMB_ESTIMATE_MAX_AGE_MS = 3 * 60_000

export type GmbEtaObservation = {
  route: string
  routeSeq: number
  nextStopSeq: number
  etaMinutes: number
  segmentMinutes: number
  observedAt: string
  label: string
}

/**
 * Creates display estimates only when the caller has matched an ETA to the
 * immediately following stop and has a defensible segment duration.
 * ETA alone is not a vehicle position, so invalid/incomplete observations
 * are omitted rather than replaced with a guessed midpoint.
 */
export function estimatesFromEtaObservations(
  observations: GmbEtaObservation[],
  routeStops: Map<string, RouteStopCoordinate[]>,
  now = Date.now(),
): EstimatedMinibus[] {
  const vehicles: EstimatedMinibus[] = []
  for (const observation of observations) {
    if (
      !/^[1-9]\\d*$/.test(observation.route) ||
      !Number.isSafeInteger(Number(observation.route)) ||
      !isGmbRouteDirection(observation.routeSeq) ||
      !Number.isInteger(observation.nextStopSeq) ||
      observation.nextStopSeq <= 1 ||
      !Number.isFinite(observation.etaMinutes) ||
      !Number.isFinite(observation.segmentMinutes) ||
      observation.etaMinutes < 0 ||
      observation.segmentMinutes <= 0 ||
      observation.etaMinutes > observation.segmentMinutes ||
      !Number.isFinite(Date.parse(observation.observedAt)) ||
      Date.parse(observation.observedAt) > now + 30_000 ||
      now - Date.parse(observation.observedAt) > GMB_ESTIMATE_MAX_AGE_MS
    ) continue

    const stops = routeStops.get(`${observation.route}/${observation.routeSeq}`)
    if (!stops) continue
    // Ambiguous sequence numbers can point at the wrong physical stop.
    // Require exactly one coordinate for each end of the segment.
    const toMatches = stops.filter((stop) => stop.stopSeq === observation.nextStopSeq)
    const fromMatches = stops.filter((stop) => stop.stopSeq === observation.nextStopSeq - 1)
    if (toMatches.length !== 1 || fromMatches.length !== 1) continue
    const to = toMatches[0]
    const from = fromMatches[0]
    if (
      !from ||
      !to ||
      !validCoordinate(from) ||
      !validCoordinate(to) ||
      from.stopSeq <= 0 ||
      to.stopSeq !== from.stopSeq + 1
    ) continue

    vehicles.push({
      route: observation.route,
      routeSeq: observation.routeSeq,
      stopSeq: from.stopSeq,
      from: { lng: from.lng, lat: from.lat },
      to: { lng: to.lng, lat: to.lat },
      etaMinutes: observation.etaMinutes,
      segmentMinutes: observation.segmentMinutes,
      observedAt: observation.observedAt,
      positionType: "estimated",
      label: observation.label,
    })
  }
  return vehicles
}
