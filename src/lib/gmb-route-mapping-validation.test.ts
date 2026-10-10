import assert from "node:assert/strict"
import networkFile from "../../data/gmb-network.json" with { type: "json" }
import destinationFile from "../../data/gmb-destinations.json" with { type: "json" }

type StopRecord = {
  routes?: string[]
  ids?: Record<string, string>
}
type NetworkFile = { stops: Record<string, StopRecord> }
type DestinationFile = { routes: Record<string, Record<string, { tc: string; en: string }>> }

const stops = (networkFile as NetworkFile).stops
const destinationRoutes = (destinationFile as DestinationFile).routes
const officialIds = new Set<string>()
const routeLabels = new Set<string>()

assert.ok(Object.keys(stops).length > 0, "GMB network must contain stops")
assert.ok(Object.keys(destinationRoutes).length > 0, "GMB destinations must contain routes")

for (const [stopId, stop] of Object.entries(stops)) {
  const routes = stop.routes ?? []
  const ids = stop.ids ?? {}
  const labelsFromIds = Object.values(ids)

  assert.ok(Array.isArray(routes), `Stop ${stopId}: routes must be an array`)
  assert.equal(new Set(routes).size, routes.length, `Stop ${stopId}: duplicate route labels`)
  assert.ok(Object.keys(ids).length > 0, `Stop ${stopId}: missing official route ID mapping`)

  for (const label of routes) {
    assert.equal(typeof label, "string")
    assert.ok(label.trim().length > 0, `Stop ${stopId}: empty route label`)
    routeLabels.add(label)
  }

  for (const [routeId, label] of Object.entries(ids)) {
    assert.match(routeId, /^[1-9]\d*$/, `Stop ${stopId}: invalid official route ID ${routeId}`)
    assert.ok(Number.isSafeInteger(Number(routeId)), `Stop ${stopId}: unsafe official route ID ${routeId}`)
    assert.equal(typeof label, "string")
    assert.ok(label.trim().length > 0, `Stop ${stopId}: empty mapped label for route ${routeId}`)
    assert.ok(routes.includes(label), `Stop ${stopId}: ID mapping label ${label} missing from routes[]`)
    officialIds.add(routeId)
  }

  for (const label of routes) {
    assert.ok(labelsFromIds.includes(label), `Stop ${stopId}: route label ${label} has no official ID mapping`)
  }
}

for (const routeId of officialIds) {
  assert.ok(
    Object.hasOwn(destinationRoutes, routeId),
    `Official route ID ${routeId} is mapped at stops but missing from destination data`,
  )
}

for (const routeId of Object.keys(destinationRoutes)) {
  assert.ok(
    officialIds.has(routeId),
    `Destination route ID ${routeId} has no stop mapping in the GMB network`,
  )
}

console.log(
  `GMB route mapping validation ok: ${Object.keys(stops).length} stops, ${officialIds.size} official route IDs, ${routeLabels.size} labels`,
)
