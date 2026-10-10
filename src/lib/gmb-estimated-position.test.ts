import { parseGmbRouteJourneyMetadata } from "./gmb-route-journey-metadata.ts"
import { uniqueGmbRouteStopRows } from "./gmb-route-stop-validation.ts"
import assert from "node:assert/strict"
import {
  estimateBetweenStops,
  estimatesFromEtaObservations,
  estimatedMinibusCollection,
  GMB_ESTIMATE_MAX_AGE_MS,
  type RouteStopCoordinate,
} from "./gmb-estimated-position.ts"

const from: RouteStopCoordinate = { stopSeq: 1, stopId: "101", lng: 114.1, lat: 22.3 }
const to: RouteStopCoordinate = { stopSeq: 2, stopId: "102", lng: 114.2, lat: 22.4 }

assert.deepEqual(estimateBetweenStops(from, to, 5, 10), { lng: 114.15, lat: 22.35 })
assert.deepEqual(estimateBetweenStops(from, to, 0, 10), { lng: 114.2, lat: 22.4 })
assert.deepEqual(estimateBetweenStops(from, to, 10, 10), { lng: 114.1, lat: 22.3 })
assert.equal(estimateBetweenStops(from, to, 11, 10), null)
assert.equal(estimateBetweenStops(from, to, -1, 10), null)
assert.equal(estimateBetweenStops(from, to, 1, 0), null)
assert.equal(estimateBetweenStops({ ...from, lng: Number.NaN }, to, 1, 10), null)
assert.equal(estimateBetweenStops({ ...from, lng: 200 }, to, 1, 10), null)
assert.equal(estimateBetweenStops(from, { ...to, lat: -95 }, 1, 10), null)

const stops = new Map([["route-a/1", [from, to]]])
const base = {
  route: "route-a",
  routeSeq: 1,
  nextStopSeq: 2,
  etaMinutes: 5,
  segmentMinutes: 10,
  observedAt: "2026-10-10T00:00:00.000Z",
  label: "Estimated position",
}
const observedNow = Date.parse("2026-10-10T00:00:00.000Z")
assert.equal(estimatesFromEtaObservations([base], stops, observedNow).length, 1)
assert.equal(estimatesFromEtaObservations([base], stops, observedNow + GMB_ESTIMATE_MAX_AGE_MS + 1).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, observedAt: "2026-10-10T00:04:00.000Z" }], stops, observedNow).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, observedAt: "2026-10-10T00:00:31.000Z" }], stops, observedNow).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, etaMinutes: 20 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, segmentMinutes: 0 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, observedAt: "invalid" }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, routeSeq: 0 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, nextStopSeq: 1 }], stops).length, 0)
const nonAdjacentStops = new Map([["route-a/1", [from, { ...to, stopSeq: 3 }]]])
assert.equal(estimatesFromEtaObservations([base], nonAdjacentStops).length, 0)
const duplicateNextSequence = new Map([["route-a/1", [from, to, { ...to, stopId: "duplicate-102" }]]])
assert.equal(estimatesFromEtaObservations([base], duplicateNextSequence).length, 0)
const duplicatePreviousSequence = new Map([["route-a/1", [from, { ...from, stopId: "duplicate-101" }, to]]])
assert.equal(estimatesFromEtaObservations([base], duplicatePreviousSequence).length, 0)
const invalidCoordinateStops = new Map([["route-a/1", [from, { ...to, lng: 200 }]]])
assert.equal(estimatesFromEtaObservations([base], invalidCoordinateStops).length, 0)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated" }], observedNow).features.length, 1)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated", etaMinutes: 20 }], observedNow).features.length, 0)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated" }], observedNow + GMB_ESTIMATE_MAX_AGE_MS + 1).features.length, 0)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated", observedAt: "invalid" }], observedNow).features.length, 0)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 0, from, to, positionType: "estimated" }], observedNow).features.length, 0)

assert.deepEqual(uniqueGmbRouteStopRows([
  { stop_seq: 3, stop_id: "103" },
  { stop_seq: 1, stop_id: 101 },
  { stop_seq: 2, stop_id: "102" },
]), [
  { stopSeq: 1, stopId: "101" },
  { stopSeq: 2, stopId: "102" },
  { stopSeq: 3, stopId: "103" },
])
assert.deepEqual(uniqueGmbRouteStopRows([
  { stop_seq: 1, stop_id: "101" },
  { stop_seq: 2, stop_id: "102a" },
  { stop_seq: 2, stop_id: "102b" },
  { stop_seq: 0, stop_id: "100" },
  { stop_seq: 3, stop_id: "" },
]), [{ stopSeq: 1, stopId: "101" }])

assert.deepEqual(parseGmbRouteJourneyMetadata([
  { routeId: 10, companyCode: "GMB", journeyTime: 24 },
  { routeId: 11, companyCode: "KMB", journeyTime: 12 },
  { routeId: 12, companyCode: "GMB", journeyTime: 0 },
  { routeId: 10, companyCode: "GMB", journeyTime: 25 },
  null,
]), [{ routeId: 10, journeyTimeMinutes: 24 }])
assert.deepEqual(parseGmbRouteJourneyMetadata({ type: "FeatureCollection", features: [
  { type: "Feature", properties: { routeId: 20, companyCode: "GMB", journeyTime: 31 }, geometry: null },
  { type: "Feature", properties: { routeId: 21, companyCode: "KMB", journeyTime: 12 }, geometry: null },
] }), [{ routeId: 20, journeyTimeMinutes: 31 }])
assert.deepEqual(parseGmbRouteJourneyMetadata([
  { routeId: 30, companyCode: "GMB", journeyTime: 10 },
  { routeId: 30, companyCode: "GMB", journeyTime: 11 },
]), [])
assert.deepEqual(parseGmbRouteJourneyMetadata({ data: [] }), [])

console.log("gmb-estimated-position-ok")
