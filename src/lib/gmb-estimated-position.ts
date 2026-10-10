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
    !Number.isFinite(from.lng) ||
    !Number.isFinite(from.lat) ||
    !Number.isFinite(to.lng) ||
    !Number.isFinite(to.lat) ||
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
