import assert from "node:assert/strict"
import { MESSAGES } from "./i18n.ts"
import { intelBoard, type IntelInput } from "./intel.ts"

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
