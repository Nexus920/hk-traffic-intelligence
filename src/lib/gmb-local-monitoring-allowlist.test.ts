import assert from "node:assert/strict"
import networkFile from "../../data/gmb-network.json" with { type: "json" }
import destinationFile from "../../data/gmb-destinations.json" with { type: "json" }
import { LOCAL_GMB_MONITORING } from "./local-gmb-monitoring.ts"

type StopRecord = {
  routes?: string[]
  ids?: Record<string, string>
}
type NetworkFile = { stops: Record<string, StopRecord> }
type DestinationFile = { routes: Record<string, Record<string, { tc: string; en: string }>> }

const stops = (networkFile as NetworkFile).stops
const destinationRoutes = (destinationFile as DestinationFile).routes

for (const area of Object.values(LOCAL_GMB_MONITORING)) {
  assert.ok(area.gmbRoutes.length > 0, `${area.id}: GMB allowlist must not be empty`)
  assert.equal(new Set(area.gmbRoutes).size, area.gmbRoutes.length, `${area.id}: duplicate GMB labels`)

  for (const label of area.gmbRoutes) {
    const matchingIds = new Set<string>()
    for (const [stopId, stop] of Object.entries(stops)) {
      if (!(stop.routes ?? []).includes(label)) continue
      const ids = Object.entries(stop.ids ?? {})
        .filter(([, mappedLabel]) => mappedLabel === label)
        .map(([routeId]) => routeId)
      assert.ok(ids.length > 0, `${area.id} route ${label}: stop ${stopId} has no matching official ID`)
      for (const routeId of ids) matchingIds.add(routeId)
    }

    assert.ok(matchingIds.size > 0, `${area.id} route ${label}: no official route IDs in GMB network`)
    for (const routeId of matchingIds) {
      assert.ok(
        Object.hasOwn(destinationRoutes, routeId),
        `${area.id} route ${label}: official route ID ${routeId} missing from destination data`,
      )
    }
  }
}

console.log("GMB local monitoring allowlist validation ok")
