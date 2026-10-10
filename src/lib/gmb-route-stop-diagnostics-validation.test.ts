import assert from "node:assert/strict"
import {
  getGmbRouteStopQualityStatus,
  parseGmbRouteStopDiagnosticsBatchParams,
  parseGmbRouteStopDiagnosticsParams,
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
