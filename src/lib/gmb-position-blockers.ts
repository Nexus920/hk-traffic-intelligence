export type GmbPositionBlockerInput = {
  hasRouteStopDiagnostics: boolean
  routeStopCoverageComplete: boolean
  validEtaCount: number
  segmentTimingAvailable: boolean
}

/** Returns explicit reasons why a route cannot yet produce a safe position estimate. */
export function getGmbPositionEstimateBlockers(input: GmbPositionBlockerInput): string[] {
  const blockers: string[] = []
  if (!input.hasRouteStopDiagnostics) blockers.push("route-stop-diagnostics-unavailable")
  else if (!input.routeStopCoverageComplete) blockers.push("route-stop-coverage-incomplete")
  if (!Number.isSafeInteger(input.validEtaCount) || input.validEtaCount <= 0) {
    blockers.push("no-valid-nearby-eta")
  }
  if (!input.segmentTimingAvailable) blockers.push("segment-timing-unavailable")
  return blockers
}
