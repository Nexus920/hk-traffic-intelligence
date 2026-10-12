import assert from "node:assert/strict"
import {
  buildKmbEstimatedPositions,
  type KmbEtaRecord,
  type KmbRouteStopCoordinate,
} from "./kmb-estimated-position.ts"

const now = Date.parse("2026-10-12T04:00:00.000Z")
const localRouteStops: KmbRouteStopCoordinate[] = [
  { route: "1", bound: "O", serviceType: "1", stopSeq: 1, stopId: "s1", lng: 114.179, lat: 22.327 },
  { route: "1", bound: "O", serviceType: "1", stopSeq: 2, stopId: "s2", lng: 114.1805, lat: 22.327 },
  { route: "1", bound: "O", serviceType: "1", stopSeq: 3, stopId: "s3", lng: 114.182, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 1, stopId: "x1", lng: 114.179, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 2, stopId: "x2", lng: 114.1805, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 3, stopId: "x3", lng: 114.182, lat: 22.327 },
]

function etaRow(route: string, seq: number, etaMinutes: number, stamp = now): KmbEtaRecord {
  return {
    route,
    dir: "O",
    service_type: "1",
    seq,
    eta_seq: 1,
    eta: new Date(now + etaMinutes * 60_000).toISOString(),
    dest_tc: "尖沙咀",
    rmk_tc: "",
    data_timestamp: new Date(stamp).toISOString(),
  }
}

const etaRecords = [
  etaRow("1", 1, 1),
  etaRow("1", 2, 3),
  etaRow("1", 3, 5),
  etaRow("2", 1, 1),
  etaRow("2", 2, 3),
  etaRow("2", 3, 5),
]
const points = [{
  id: "test",
  name: "測試站",
  point: [114.182, 22.327] as [number, number],
  routes: ["1"],
}]

const result = buildKmbEstimatedPositions(localRouteStops, etaRecords, points, now)
assert.equal(result.collection.features.length, 1, "only the explicitly selected local KMB route should appear")
const feature = result.collection.features[0]
assert.ok(feature, "an estimated position should be emitted when adjacent ETA samples are valid")
assert.equal(feature.properties?.route, "1")
assert.equal(feature.properties?.operator, "KMB")
assert.equal(feature.properties?.positionType, "estimated")
assert.equal(feature.properties?.destination, "尖沙咀")
assert.ok(Number.isFinite(feature.geometry.type === "Point" ? feature.geometry.coordinates[0] : NaN))

const staleResult = buildKmbEstimatedPositions(
  localRouteStops.filter((stop) => stop.route === "1"),
  [
    etaRow("1", 1, 1, now - 4 * 60_000),
    etaRow("1", 2, 3, now - 4 * 60_000),
    etaRow("1", 3, 5, now - 4 * 60_000),
  ],
  points,
  now,
)
assert.equal(staleResult.collection.features.length, 0, "stale official ETA data must not create a vehicle dot")

const noTimingResult = buildKmbEstimatedPositions(
  localRouteStops.filter((stop) => stop.route === "1"),
  [etaRow("1", 3, 5)],
  points,
  now,
)
assert.equal(noTimingResult.collection.features.length, 0, "ETA without defensible segment timing must not create a dot")

console.log("KMB estimated-position validation passed")
