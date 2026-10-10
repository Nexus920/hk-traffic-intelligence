import assert from "node:assert/strict"
import { gmbStopsWithin } from "./gmb-reach.ts"

const near = gmbStopsWithin(114.172, 22.305, 400, 24)
assert.ok(near.length > 0)
assert.ok(near.length <= 24)
assert.ok(near.every((stop) => Array.isArray(stop.routes)))
import { gmbOfficialRouteIdsForLabels } from "./gmb-reach.ts"

const localRoutes = gmbOfficialRouteIdsForLabels(["2", "2A", "69A", "70", "70A", "25A", "25B", "25M"])
for (const label of ["2", "2A", "69A", "70", "70A", "25A", "25B", "25M"]) {
  assert.ok(Array.isArray(localRoutes[label]), `route ${label} should return an ID list`)
  assert.ok(localRoutes[label].length > 0, `route ${label} should resolve from the bundled official stop catalogue`)
  assert.ok(localRoutes[label].every((id) => Number.isSafeInteger(id) && id > 0))
}
assert.deepEqual(gmbOfficialRouteIdsForLabels(["definitely-not-a-real-route"]), {
  "definitely-not-a-real-route": [],
})
import { gmbOfficialRouteIdsNearPoint } from "./gmb-reach.ts"

const localLasalleRoutes = gmbOfficialRouteIdsNearPoint(
  ["2", "2A", "69A", "70", "70A", "25A", "25B", "25M"],
  114.1811,
  22.3271,
  2500,
)
assert.deepEqual(localLasalleRoutes["2"], [2009246])
assert.deepEqual(localLasalleRoutes["2A"], [2009247])
assert.deepEqual(localLasalleRoutes["70"], [2008850])
assert.deepEqual(localLasalleRoutes["70A"], [2008883])
assert.ok(localLasalleRoutes["2"].every((id) => id !== 2002342 && id !== 2002344 && id !== 2002349))
assert.deepEqual(
  gmbOfficialRouteIdsNearPoint(["2"], Number.NaN, 22.3271, 2500),
  { "2": [] },
)

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
assert.deepEqual(Object.keys(LOCAL_GMB_ROUTE_ALLOWLIST).sort(), ["beverly", "lasalle"])
