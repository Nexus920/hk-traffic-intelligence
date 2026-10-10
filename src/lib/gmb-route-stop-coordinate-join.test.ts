import assert from "node:assert/strict"
import { joinGmbRouteStopCoordinates } from "./gmb-route-stop-coordinate-join.ts"

const coordinates = new Map([
  ["101", { lng: 114.1, lat: 22.3 }],
  ["102", { lng: 114.2, lat: 22.4 }],
  ["103", { lng: 181, lat: 22.5 }],
])

const result = joinGmbRouteStopCoordinates([
  { stop_seq: 1, stop_id: "101" },
  { stop_seq: 2, stop_id: "102" },
  { stop_seq: 3, stop_id: "999" },
  { stop_seq: 4, stop_id: "103" },
  { stop_seq: 5, stop_id: "105" },
  { stop_seq: 5, stop_id: "106" },
  { stop_seq: 6, stop_id: "not-an-id" },
], (stopId) => coordinates.get(stopId))

assert.equal(result.inputRows, 7)
assert.equal(result.validRows, 4)
assert.equal(result.matchedRows, 2)
assert.equal(result.isComplete, false)
assert.equal(result.coverageRate, 0.5)
assert.deepEqual(result.stops, [
  { stopSeq: 1, stopId: "101", lng: 114.1, lat: 22.3 },
  { stopSeq: 2, stopId: "102", lng: 114.2, lat: 22.4 },
])
assert.deepEqual(result.unmatchedStopIds, ["999", "103"])
assert.deepEqual(result.duplicateSequences, [5])

const complete = joinGmbRouteStopCoordinates([
  { stop_seq: 1, stop_id: "101" },
  { stop_seq: 2, stop_id: "102" },
], (stopId) => coordinates.get(stopId))
assert.equal(complete.inputRows, complete.validRows)
assert.equal(complete.validRows, complete.matchedRows)
assert.equal(complete.isComplete, true)
assert.equal(complete.coverageRate, 1)
assert.deepEqual(complete.unmatchedStopIds, [])
assert.deepEqual(complete.duplicateSequences, [])

console.log("gmb-route-stop-coordinate-join-ok")
