export type GmbRouteJourneyMetadata = {
  routeId: number
  routeSeq: number
  journeyTimeMinutes: number
}

/**
 * Reads route-level metadata from the official Transport Department
 * routes-and-fares GeoJSON schema. journeyTime is route-wide, not a
 * per-segment duration; callers must not use it directly as segmentMinutes.
 */
export function parseGmbRouteJourneyMetadata(
  value: unknown,
): GmbRouteJourneyMetadata[] {
  if (!Array.isArray(value)) return []

  const results: GmbRouteJourneyMetadata[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const routeId = row.routeId
    const companyCode = row.companyCode
    const journeyTime = row.journeyTime

    if (
      companyCode !== "GMB" ||
      !Number.isSafeInteger(routeId) ||
      (routeId as number) <= 0 ||
      !Number.isFinite(journeyTime) ||
      (journeyTime as number) <= 0
    ) continue

    // A route can have multiple directions; routeSeq belongs to stop rows
    // in the documented schema, so this metadata deliberately stays route-wide.
    const key = String(routeId)
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      routeId: routeId as number,
      routeSeq: 0,
      journeyTimeMinutes: journeyTime as number,
    })
  }

  return results
}
