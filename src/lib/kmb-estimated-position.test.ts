import assert from "node:assert/strict"
import {
  buildKmbEstimatedPositions,
  type KmbEtaRecord,
  type KmbRouteStopCoordinate,
} from "./kmb-estimated-position.ts"

const now = Date.parse("2026-10-12T04:00:00.000Z")
const localRouteStops: KmbRouteStopCoordinate[] = [
  { route: "1", bound: "O", serviceType: "1", stopSeq: 1, stopId: "s1", lng: 114.1775, lat: 22.327 },
  { route: "1", bound: "O", serviceType: "1", stopSeq: 2, stopId: "s2", lng: 114.179, lat: 22.327 },
  { route: "1", bound: "O", serviceType: "1", stopSeq: 3, stopId: "s3", lng: 114.1805, lat: 22.327 },
  { route: "1", bound: "O", serviceType: "1", stopSeq: 4, stopId: "s4", lng: 114.182, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 1, stopId: "x1", lng: 114.1775, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 2, stopId: "x2", lng: 114.179, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 3, stopId: "x3", lng: 114.1805, lat: 22.327 },
  { route: "2", bound: "O", serviceType: "1", stopSeq: 4, stopId: "x4", lng: 114.182, lat: 22.327 },
]

function etaRow(
  route: string,
  seq: number,
  rank: number,
  etaMinutes: number,
  stamp = now,
): KmbEtaRecord {
  return {
    route,
    dir: "O",
    service_type: "1",
    seq,
    eta_seq: rank,
    eta: new Date(now + etaMinutes * 60_000).toISOString(),
    dest_tc: "尖沙咀",
    rmk_tc: "",
    data_timestamp: new Date(stamp).toISOString(),
  }
}

// Same-rank ETA differences are only weak travel-time samples, not vehicle IDs.
// These deliberately vary by stop to model rank shifts between published arrivals.
const etaRecords = [
  etaRow("1", 1, 1, 1),
  etaRow("1", 2, 1, 3),
  etaRow("1", 2, 2, 5),
  etaRow("1", 3, 1, 2),
  etaRow("1", 3, 2, 6),
  etaRow("1", 4, 1, 3),
  etaRow("1", 4, 2, 7),
  etaRow("2", 1, 1, 1),
  etaRow("2", 2, 1, 3),
  etaRow("2", 3, 1, 2),
  etaRow("2", 4, 1, 3),
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
assert.ok(feature, "a point should be emitted when local ETA samples support a plausible segment")
assert.equal(feature.properties?.route, "1")
assert.equal(feature.properties?.operator, "KMB")
assert.equal(feature.properties?.positionType, "estimated")
assert.equal(feature.properties?.destination, "尖沙咀")
assert.ok(Number.isFinite(feature.geometry.type === "Point" ? feature.geometry.coordinates[0] : NaN))

const staleResult = buildKmbEstimatedPositions(
  localRouteStops.filter((stop) => stop.route === "1"),
  [
    etaRow("1", 1, 1, 1, now - 4 * 60_000),
    etaRow("1", 2, 1, 3, now - 4 * 60_000),
    etaRow("1", 2, 2, 5, now - 4 * 60_000),
    etaRow("1", 3, 1, 2, now - 4 * 60_000),
    etaRow("1", 3, 2, 6, now - 4 * 60_000),
    etaRow("1", 4, 1, 3, now - 4 * 60_000),
    etaRow("1", 4, 2, 7, now - 4 * 60_000),
  ],
  points,
  now,
)
assert.equal(staleResult.collection.features.length, 0, "stale official ETA data must not create a vehicle dot")

const noTimingResult = buildKmbEstimatedPositions(
  localRouteStops.filter((stop) => stop.route === "1"),
  [etaRow("1", 4, 1, 3)],
  points,
  now,
)
assert.equal(noTimingResult.collection.features.length, 0, "ETA without defensible segment timing must not create a dot")

console.log("KMB estimated-position validation passed")
