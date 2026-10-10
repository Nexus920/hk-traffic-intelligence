export type GmbRouteJourneyMetadata = {
  routeId: number
  journeyTimeMinutes: number
}

/**
 * Parses route-wide journey time from the official Transport Department
 * route-and-fare GeoJSON records. This is not a segment duration and must
 * never be passed directly as segmentMinutes.
 */
export function parseGmbRouteJourneyMetadata(value: unknown): GmbRouteJourneyMetadata[] {
  if (!Array.isArray(value)) return []

  const results: GmbRouteJourneyMetadata[] = []
  const seen = new Set<number>()

  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const routeId = row.routeId
    const journeyTime = row.journeyTime

    if (
      row.companyCode !== "GMB" ||
      typeof routeId !== "number" ||
      !Number.isSafeInteger(routeId) ||
      routeId <= 0 ||
      typeof journeyTime !== "number" ||
      !Number.isFinite(journeyTime) ||
      journeyTime <= 0 ||
      seen.has(routeId)
    ) continue

    seen.add(routeId)
    results.push({ routeId, journeyTimeMinutes: journeyTime })
  }

  return results
}
