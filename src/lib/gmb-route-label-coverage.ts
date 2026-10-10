export type GmbRouteLabelCoverage = {
  label: string
  nearbyOfficialRouteIds: number[]
  hasNearbyOfficialRouteId: boolean
}

/**
 * Reports which configured public labels resolve to local official route IDs.
 * Missing local matches are diagnostics only; they do not prove a route is invalid.
 */
export function buildGmbRouteLabelCoverage(
  configuredLabels: readonly string[],
  routeIdsByLabel: Record<string, number[]>,
): {
  routeLabelCoverage: GmbRouteLabelCoverage[]
  routeLabelsWithoutNearbyOfficialIds: string[]
} {
  const labels = [...new Set(configuredLabels.map((label) => label.trim()).filter(Boolean))]
  const routeLabelCoverage = labels.map((label) => {
    const nearbyOfficialRouteIds = [...new Set(routeIdsByLabel[label] ?? [])]
      .filter((id) => Number.isSafeInteger(id) && id > 0)
      .sort((a, b) => a - b)
    return {
      label,
      nearbyOfficialRouteIds,
      hasNearbyOfficialRouteId: nearbyOfficialRouteIds.length > 0,
    }
  })
  return {
    routeLabelCoverage,
    routeLabelsWithoutNearbyOfficialIds: routeLabelCoverage
      .filter((item) => !item.hasNearbyOfficialRouteId)
      .map((item) => item.label),
  }
}
