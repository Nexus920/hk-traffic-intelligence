export type GmbRouteJourneyMetadata = {
  routeId: number
  journeyTimeMinutes: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : null
}

function routeMetadata(value: unknown): GmbRouteJourneyMetadata | null {
  const feature = record(value)
  const row = record(feature?.properties) ?? feature
  if (!row || row.companyCode !== "GMB") return null

  const routeId = row.routeId
  const journeyTime = row.journeyTime
  if (
    typeof routeId !== "number" ||
    !Number.isSafeInteger(routeId) ||
    routeId <= 0 ||
    typeof journeyTime !== "number" ||
    !Number.isFinite(journeyTime) ||
    journeyTime <= 0
  ) return null

  return { routeId, journeyTimeMinutes: journeyTime }
}

/**
 * Parses route-wide journey time from official Transport Department records.
 * Accepts a raw record list or a GeoJSON FeatureCollection whose attributes
 * live under feature.properties. Ambiguous duplicate route IDs are omitted.
 * journeyTime is route-wide, never a segment duration.
 */
export function parseGmbRouteJourneyMetadata(value: unknown): GmbRouteJourneyMetadata[] {
  const root = record(value)
  const items: unknown[] = Array.isArray(value)
    ? value
    : root?.type === "FeatureCollection" && Array.isArray(root.features)
      ? root.features
      : []

  const parsed = items.map(routeMetadata).filter(
    (item): item is GmbRouteJourneyMetadata => item !== null,
  )
  const counts = new Map<number, number>()
  for (const item of parsed) counts.set(item.routeId, (counts.get(item.routeId) ?? 0) + 1)

  return parsed.filter((item) => counts.get(item.routeId) === 1)
}
