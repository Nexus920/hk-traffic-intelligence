import assert from "node:assert/strict"
import {
  LOCAL_GMB_MONITORING,
  LOCAL_GMB_ROUTE_ALLOWLIST,
} from "./local-gmb-monitoring.ts"

assert.deepEqual(LOCAL_GMB_ROUTE_ALLOWLIST.lasalle, ["2", "2A", "69A", "70", "70A"])
assert.deepEqual(LOCAL_GMB_ROUTE_ALLOWLIST.beverly, ["2", "2A", "25A", "25B", "25M", "70", "70A"])
assert.deepEqual(LOCAL_GMB_MONITORING.lasalle.gmbRoutes, LOCAL_GMB_ROUTE_ALLOWLIST.lasalle)
assert.deepEqual(LOCAL_GMB_MONITORING.beverly.gmbRoutes, LOCAL_GMB_ROUTE_ALLOWLIST.beverly)
assert.equal(new Set(LOCAL_GMB_ROUTE_ALLOWLIST.lasalle).size, LOCAL_GMB_ROUTE_ALLOWLIST.lasalle.length)
assert.equal(new Set(LOCAL_GMB_ROUTE_ALLOWLIST.beverly).size, LOCAL_GMB_ROUTE_ALLOWLIST.beverly.length)
assert.deepEqual(
  Object.keys(LOCAL_GMB_ROUTE_ALLOWLIST).sort(),
  ["beverly", "lasalle"],
  "the local map must not expand to other areas",
)
console.log("local-gmb-monitoring-ok")
