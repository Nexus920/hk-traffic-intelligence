export type GmbRouteJourneyMetadata = {
  routeId: number
  journeyTimeMinutes: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null
}

/**
 * Parses route-wide journey time from official Transport Department records.
 * Accepts a raw record list or a GeoJSON FeatureCollection whose attributes
 * live under feature.properties. journeyTime is route-wide, never a segment
 * duration, and must not be passed directly as segmentMinutes.
 */
export function parseGmbRouteJourneyMetadata(value: unknown): GmbRouteJourneyMetadata[] {
  const root = record(value)
  const items: unknown[] = Array.isArray(value)
    ? value
    : root?.type === "FeatureCollection" && Array.isArray(root.features)
      ? root.features
      : []

  const results: GmbRouteJourneyMetadata[] = []
  const seen = new Set<number>()

  for (const item of items) {
    const feature = record(item)
    const row = record(feature?.properties) ?? feature
    if (!row) continue

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
