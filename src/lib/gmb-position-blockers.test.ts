import assert from "node:assert/strict"
import { getGmbPositionEstimateBlockers } from "./gmb-position-blockers.ts"

assert.deepEqual(
  getGmbPositionEstimateBlockers({
    hasRouteStopDiagnostics: false,
    routeStopCoverageComplete: false,
    validEtaCount: 0,
    segmentTimingAvailable: false,
  }),
  ["route-stop-diagnostics-unavailable", "no-valid-nearby-eta", "segment-timing-unavailable"],
)

assert.deepEqual(
  getGmbPositionEstimateBlockers({
    hasRouteStopDiagnostics: true,
    routeStopCoverageComplete: false,
    validEtaCount: 2,
    segmentTimingAvailable: false,
  }),
  ["route-stop-coverage-incomplete", "segment-timing-unavailable"],
)

assert.deepEqual(
  getGmbPositionEstimateBlockers({
    hasRouteStopDiagnostics: true,
    routeStopCoverageComplete: true,
    validEtaCount: 1,
    segmentTimingAvailable: true,
  }),
  [],
)

console.log("gmb-position-blockers-ok")
