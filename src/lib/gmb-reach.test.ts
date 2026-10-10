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
