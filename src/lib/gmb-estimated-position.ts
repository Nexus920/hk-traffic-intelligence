import { isGmbRouteDirection } from "./gmb-route-sequence-validation.ts"

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
  destination?: string
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
 * Locates the current segment by walking upstream from a stop's next published
 * ETA. Segment durations must be derived from adjacent-stop ETA observations;
 * this helper never fills gaps with a guessed travel time.
 */
export type LocatedEstimatedSegment = {
  from: RouteStopCoordinate
  to: RouteStopCoordinate
  etaMinutes: number
  segmentMinutes: number
}

export function locateOnRouteFromUpcomingEta(
  routeStops: RouteStopCoordinate[],
  anchorStopSeq: number,
  etaMinutes: number,
  segmentMinutesByPair: Map<string, number>,
): LocatedEstimatedSegment | null {
  if (
    !Number.isInteger(anchorStopSeq) ||
    anchorStopSeq <= 1 ||
    !Number.isFinite(etaMinutes) ||
    etaMinutes < 0
  ) return null

  let remainingMinutes = etaMinutes
  let toStopSeq = anchorStopSeq

  // Do not extrapolate outside segments for which ETA timing was observed.
  for (let hops = 0; hops < routeStops.length; hops += 1) {
    const fromStopSeq = toStopSeq - 1
    if (fromStopSeq <= 0) return null

    const segmentMinutes = segmentMinutesByPair.get(`${fromStopSeq}/${toStopSeq}`)
    if (
      segmentMinutes === undefined ||
      !Number.isFinite(segmentMinutes) ||
      segmentMinutes < 0.4 ||
      segmentMinutes > 8
    ) return null

    const fromMatches = routeStops.filter((stop) => stop.stopSeq === fromStopSeq)
    const toMatches = routeStops.filter((stop) => stop.stopSeq === toStopSeq)
    if (fromMatches.length !== 1 || toMatches.length !== 1) return null

    const from = fromMatches[0]
    const to = toMatches[0]
    if (!from || !to || !validCoordinate(from) || !validCoordinate(to)) return null

    if (remainingMinutes <= segmentMinutes) {
      return {
        from,
        to,
        etaMinutes: remainingMinutes,
        segmentMinutes,
      }
    }

    remainingMinutes -= segmentMinutes
    toStopSeq = fromStopSeq
  }

  return null
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
  destination?: string
  positionType: "estimated"
  observedAt: string
  stopSeq: number
  etaMinutes: number
  segmentMinutes: number
  fromLng: number
  fromLat: number
  toLng: number
  toLat: number
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
          destination: vehicle.destination ?? "",
          positionType: vehicle.positionType,
          observedAt: vehicle.observedAt,
          stopSeq: vehicle.stopSeq,
          etaMinutes: vehicle.etaMinutes,
          segmentMinutes: vehicle.segmentMinutes,
          fromLng: vehicle.from.lng,
          fromLat: vehicle.from.lat,
          toLng: vehicle.to.lng,
          toLat: vehicle.to.lat,
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
  destination?: string
  /** Stable route-variant key; optional for legacy callers. */
  routeKey?: string
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
      !observation.route ||
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

    const stops = routeStops.get(observation.routeKey ?? `${observation.route}/${observation.routeSeq}`)
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
      destination: observation.destination,
    })
  }
  return vehicles
}
