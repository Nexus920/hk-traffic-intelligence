import assert from "node:assert/strict"
import { parseGmbRouteStopDiagnosticsParams } from "./gmb-route-stop-diagnostics-validation.ts"

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

console.log("gmb-route-stop-diagnostics-validation-ok")
