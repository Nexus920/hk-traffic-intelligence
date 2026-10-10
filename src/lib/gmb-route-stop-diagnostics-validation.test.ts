import assert from "node:assert/strict"
import {
  getGmbRouteStopQualityStatus,
  parseGmbRouteStopDiagnosticsBatchParams,
  parseGmbRouteStopDiagnosticsParams,
  rankNearbyGmbRouteStops,
} from "./gmb-route-stop-diagnostics-validation.ts"

assert.deepEqual(parseGmbRouteStopDiagnosticsParams("123", "1"), { routeId: 123, routeSeq: 1 })
assert.deepEqual(parseGmbRouteStopDiagnosticsParams("456", "2"), { routeId: 456, routeSeq: 2 })

for (const [routeId, routeSeq] of [
  [null, "1"],
  ["", "1"],
  ["0", "1"],
  ["01", "1"],
  ["1.5", "1"],
  ["-1", "1"],
  ["9007199254740992", "1"],
  ["123", null],
  ["123", "0"],
  ["123", "3"],
  ["123", "1.0"],
  ["123", " 1"],
] as const) {
  assert.equal(parseGmbRouteStopDiagnosticsParams(routeId, routeSeq), null, `expected invalid params: ${routeId}, ${routeSeq}`)
}

assert.equal(getGmbRouteStopQualityStatus({ validRows: 4, isComplete: true }), "complete")
assert.equal(getGmbRouteStopQualityStatus({ validRows: 4, isComplete: false }), "partial")
assert.equal(getGmbRouteStopQualityStatus({ validRows: 0, isComplete: false }), "no-valid-stops")
assert.equal(getGmbRouteStopQualityStatus({ validRows: 0, isComplete: true }), "no-valid-stops")

console.log("gmb-route-stop-diagnostics-validation-ok")

assert.deepEqual(
  parseGmbRouteStopDiagnosticsBatchParams("2000410,2000511", "1"),
  { routeIds: [2000410, 2000511], routeSeq: 1 },
)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams(null, "1"), null)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams("2000410", null), null)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams("2000410,", "1"), null)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams("2000410,2000410", "1"), null)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams("2000410,2000511,3,4,5,6", "1"), null)
assert.equal(parseGmbRouteStopDiagnosticsBatchParams("2000410", "3"), null)

console.log("gmb-route-stop-diagnostics-batch-validation-ok")


const nearbyStops = rankNearbyGmbRouteStops([
  { stopSeq: 3, stopId: "103", lng: 114.1812, lat: 22.3271 },
  { stopSeq: 2, stopId: "102", lng: 114.1811, lat: 22.3271 },
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
  { stopSeq: 4, stopId: "outside", lng: 114.2, lat: 22.4 },
  { stopSeq: 5, stopId: "invalid", lng: 200, lat: 22.3 },
], [114.1811, 22.3271], 100, 8)
assert.deepEqual(nearbyStops.map((stop) => stop.stopId), ["101", "102", "103"])
assert.deepEqual(nearbyStops.map((stop) => stop.distanceMetres), [0, 0, 10])
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
], [Number.NaN, 22.3]), [])
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271], 100, 0), [])

console.log("gmb-nearby-route-stop-ranking-ok")


// Invalid search bounds must never widen the diagnostic search accidentally.
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271], -1), [])
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271], Number.NaN), [])
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271], 100, 1.5), [])
assert.deepEqual(rankNearbyGmbRouteStops([
  { stopSeq: 0, stopId: "bad-sequence", lng: 114.1811, lat: 22.3271 },
  { stopSeq: 1, stopId: "bad-coordinate", lng: 114.1811, lat: 91 },
  { stopSeq: 2, stopId: "   ", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271]), [])

// Results are stable for equal distances and the requested result cap is honoured.
const cappedNearbyStops = rankNearbyGmbRouteStops([
  { stopSeq: 3, stopId: "103", lng: 114.1811, lat: 22.3271 },
  { stopSeq: 1, stopId: "101", lng: 114.1811, lat: 22.3271 },
  { stopSeq: 2, stopId: "102", lng: 114.1811, lat: 22.3271 },
], [114.1811, 22.3271], 100, 2)
assert.deepEqual(cappedNearbyStops.map((stop) => stop.stopId), ["101", "102"])

console.log("gmb-nearby-route-stop-input-guards-ok")
