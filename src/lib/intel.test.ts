import assert from "node:assert/strict"
import { MESSAGES } from "./i18n.ts"
import { firstOpenBoundary, intelBoard, type IntelInput } from "./intel.ts"

const quiet: IntelInput = {
  trafficError: null,
  traffic: null,
  incidents: null,
  incidentsError: null,
  works: null,
  controlPoints: null,
  controlError: null,
  approaches: [],
  approachesError: null,
  warnings: [],
  warningsReady: true,
  warningsError: null,
  conditions: null,
  pictureError: null,
  mtrError: null,
  kmbError: null,
  lrtError: null,
  citybusError: null,
  gmbError: null,
  nlbError: null,
  ferryError: null,
  mapError: null,
}

const clear = intelBoard(quiet, MESSAGES.en)
assert.deepEqual(clear.systems, [])

const failed = intelBoard(
  { ...quiet, ferryError: "HTTP 502", kmbError: "KMB arrivals failed", mapError: "Map failed" },
  MESSAGES.en,
)
assert.deepEqual(
  failed.systems.map((item) => item.id),
  ["fault-map", "fault-kmb", "fault-ferry"],
)
assert.equal(failed.systems[0]?.title, MESSAGES.en.mapFailed)
assert.equal(failed.systems[2]?.detail, "HTTP 502")

const missedStop = intelBoard(
  { ...quiet, boardFaults: [{ operator: "citybus", id: "002155", name: "保泰街" }] },
  MESSAGES["zh-HK"],
)
assert.equal(missedStop.systems.length, 1)
assert.equal(missedStop.systems[0]?.title, "未能取得城巴到站時間。")
assert.equal(missedStop.systems[0]?.detail, "保泰街")
assert.equal(missedStop.ranked.some((item) => item.detail === "保泰街"), false)

function hall(code: string, worst: number, band: string): GeoJSON.Feature {
  return {
    type: "Feature",
    properties: { code, name: code, worst, vehicleBand: band, vehicleKmh: 10, vehicleRoadEn: "Road", vehicleRoadTc: "路" },
    geometry: { type: "Point", coordinates: [114, 22] },
  }
}

const halls = intelBoard({
  ...quiet,
  controlPoints: { type: "FeatureCollection", features: [hall("LWS", 99, "congested"), hall("SBC", 0, "free"), hall("MKT", 1, "")] },
}, MESSAGES.en)
assert.equal(firstOpenBoundary(halls.boundary)?.id, "control-MKT")
assert.equal(halls.boundary[0]?.id, "control-MKT")
assert.equal(halls.ranked.some((item) => item.id === "control-LWS"), false)
assert.equal(halls.boundary.find((item) => item.id === "control-LWS")?.label, MESSAGES.en.hallClosed)
assert.equal(halls.boundary.find((item) => item.id === "control-LWS")?.detail.includes("Road"), false)
