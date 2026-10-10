import assert from "node:assert/strict"
import { buildGmbRouteLabelCoverage } from "./gmb-route-label-coverage.ts"

const result = buildGmbRouteLabelCoverage(
  ["2", "2A", "70", "missing", "2", "   "],
  { "2": [2009246, 2009246, -1], "2A": [2009247], "70": [], ignored: [123] },
)

assert.deepEqual(result.routeLabelCoverage, [
  { label: "2", nearbyOfficialRouteIds: [2009246], hasNearbyOfficialRouteId: true },
  { label: "2A", nearbyOfficialRouteIds: [2009247], hasNearbyOfficialRouteId: true },
  { label: "70", nearbyOfficialRouteIds: [], hasNearbyOfficialRouteId: false },
  { label: "missing", nearbyOfficialRouteIds: [], hasNearbyOfficialRouteId: false },
])
assert.deepEqual(result.routeLabelsWithoutNearbyOfficialIds, ["70", "missing"])

const invalid = buildGmbRouteLabelCoverage(["  ", "25A"], { "25A": [0, Number.NaN, 2004070] })
assert.deepEqual(invalid.routeLabelsWithoutNearbyOfficialIds, [])
assert.deepEqual(invalid.routeLabelCoverage[0].nearbyOfficialRouteIds, [2004070])

console.log("gmb-route-label-coverage-ok")
