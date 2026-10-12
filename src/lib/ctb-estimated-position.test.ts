import assert from "node:assert/strict"
import {
  buildCtbEstimatedPositions,
  type CtbEtaRecord,
  type CtbRouteStopCoordinate,
} from "./ctb-estimated-position.ts"

const now = Date.parse("2026-10-12T04:00:00.000Z")
const stops: CtbRouteStopCoordinate[] = [
  { route: "22", bound: "O", serviceType: "CTB", stopSeq: 1, stopId: "c1", lng: 114.1775, lat: 22.327 },
  { route: "22", bound: "O", serviceType: "CTB", stopSeq: 2, stopId: "c2", lng: 114.179, lat: 22.327 },
  { route: "22", bound: "O", serviceType: "CTB", stopSeq: 3, stopId: "c3", lng: 114.1805, lat: 22.327 },
  { route: "22", bound: "O", serviceType: "CTB", stopSeq: 4, stopId: "c4", lng: 114.182, lat: 22.327 },
  { route: "113", bound: "O", serviceType: "CTB", stopSeq: 1, stopId: "x1", lng: 114.1775, lat: 22.327 },
  { route: "113", bound: "O", serviceType: "CTB", stopSeq: 2, stopId: "x2", lng: 114.179, lat: 22.327 },
  { route: "113", bound: "O", serviceType: "CTB", stopSeq: 3, stopId: "x3", lng: 114.1805, lat: 22.327 },
  { route: "113", bound: "O", serviceType: "CTB", stopSeq: 4, stopId: "x4", lng: 114.182, lat: 22.327 },
]

function etaRow(route: string, seq: number, etaSeq: number, minutes: number, stamp = now): CtbEtaRecord {
  return {
    route,
    dir: "O",
    service_type: "CTB",
    seq,
    eta_seq: etaSeq,
    eta: new Date(now + minutes * 60_000).toISOString(),
    dest_tc: "九龍城",
    rmk_tc: "",
    data_timestamp: new Date(stamp).toISOString(),
  }
}

const eta = [
  etaRow("22", 1, 1, 1),
  etaRow("22", 2, 1, 3),
  etaRow("22", 2, 2, 5),
  etaRow("22", 3, 1, 2),
  etaRow("22", 3, 2, 6),
  etaRow("22", 4, 1, 3),
  etaRow("22", 4, 2, 7),
  etaRow("113", 1, 1, 1),
  etaRow("113", 2, 1, 3),
  etaRow("113", 3, 1, 2),
  etaRow("113", 4, 1, 3),
]
const monitoring = [{
  id: "lasalle",
  name: "喇沙小學附近",
  point: [114.182, 22.327] as [number, number],
  routes: ["22"],
}]

const result = buildCtbEstimatedPositions(stops, eta, monitoring, now)
assert.equal(result.collection.features.length, 1, "only the selected CTB route near the monitoring point should appear")
const feature = result.collection.features[0]
assert.ok(feature, "a CTB estimate should be emitted when local ETA samples support adjacent-stop timing")
assert.equal(feature.properties?.operator, "CTB")
assert.equal(feature.properties?.route, "22")
assert.equal(feature.properties?.positionType, "estimated")
assert.equal(feature.properties?.label, "城巴 22（ETA 估算，非 GPS）")

const stale = buildCtbEstimatedPositions(
  stops.filter((stop) => stop.route === "22"),
  [
    etaRow("22", 1, 1, 1, now - 4 * 60_000),
    etaRow("22", 2, 1, 3, now - 4 * 60_000),
    etaRow("22", 2, 2, 5, now - 4 * 60_000),
    etaRow("22", 3, 1, 2, now - 4 * 60_000),
    etaRow("22", 3, 2, 6, now - 4 * 60_000),
    etaRow("22", 4, 1, 3, now - 4 * 60_000),
  ],
  monitoring,
  now,
)
assert.equal(stale.collection.features.length, 0, "stale CTB ETA rows must not create vehicle dots")

const unsupported = buildCtbEstimatedPositions(
  stops.filter((stop) => stop.route === "22"),
  [etaRow("22", 4, 1, 3)],
  monitoring,
  now,
)
assert.equal(unsupported.collection.features.length, 0, "ETA without valid adjacent segment timing must not create a dot")

console.log("CTB estimated-position validation passed")
