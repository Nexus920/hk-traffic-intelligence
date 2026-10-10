import { isGmbRouteDirection } from "./gmb-route-sequence-validation.ts"
import { auditGmbRouteIdCandidates, matchGmbOfficialRouteId } from "./gmb-route-id-validation.ts"

import { parseGmbRouteStopEtaResponse } from "./gmb-route-eta-validation.ts"
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
assert.equal(estimatesFromEtaObservations([{ ...base, routeSeq: 3 }], stops).length, 0)
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
  { routeId: 13, companyCode: "GMB", journeyTime: 18 },
  null,
]), [{ routeId: 13, journeyTimeMinutes: 18 }])
assert.deepEqual(parseGmbRouteJourneyMetadata({ type: "FeatureCollection", features: [
  { type: "Feature", properties: { routeId: 20, companyCode: "GMB", journeyTime: 31 }, geometry: null },
  { type: "Feature", properties: { routeId: 21, companyCode: "KMB", journeyTime: 12 }, geometry: null },
] }), [{ routeId: 20, journeyTimeMinutes: 31 }])
assert.deepEqual(parseGmbRouteJourneyMetadata([
  { routeId: 30, companyCode: "GMB", journeyTime: 10 },
  { routeId: 30, companyCode: "GMB", journeyTime: 11 },
]), [])
assert.deepEqual(parseGmbRouteJourneyMetadata({ data: [] }), [])


assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: true,
  stop_id: 20003337,
  eta: [
    { eta_seq: 2, diff: 8, timestamp: "2026-10-10T10:08:00+08:00" },
    { eta_seq: 1, diff: 3, timestamp: "2026-10-10T10:03:00+08:00" },
  ],
} }), [
  { etaSeq: 1, diffMinutes: 3, timestamp: "2026-10-10T10:03:00+08:00" },
  { etaSeq: 2, diffMinutes: 8, timestamp: "2026-10-10T10:08:00+08:00" },
])
assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: false, stop_id: 20003337, description_tc: "暫停服務",
} }), [])
assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: true, stop_id: 20003337, eta: [
    { eta_seq: 1, diff: -1, timestamp: "2026-10-10T10:03:00+08:00" },
    { eta_seq: 2, diff: 2.5, timestamp: "2026-10-10T10:04:00+08:00" },
    { eta_seq: 1, diff: 4, timestamp: "2026-10-10T10:04:00+08:00" },
    { eta_seq: 3, diff: 2, timestamp: "not-a-date" },
    { eta_seq: 4, diff: 2, timestamp: "2026-10-10T10:04:00+08:00" },
    null,
  ],
} }), [
  { etaSeq: 1, diffMinutes: 4, timestamp: "2026-10-10T10:04:00+08:00" },
  { etaSeq: 4, diffMinutes: 2, timestamp: "2026-10-10T10:04:00+08:00" },
])
assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: true, stop_id: 20003337, eta: "invalid",
} }), [])
assert.deepEqual(parseGmbRouteStopEtaResponse({ data: [] }), [])

assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: true, stop_id: "20003337", eta: [
    { eta_seq: 1, diff: 2, timestamp: "2026-10-10T10:02:00+08:00" },
  ],
} }), [])
assert.deepEqual(parseGmbRouteStopEtaResponse({ data: {
  enabled: true, stop_id: 20003337, eta: [
    { eta_seq: 0, diff: 2, timestamp: "2026-10-10T10:02:00+08:00" },
    { eta_seq: 1.5, diff: 2, timestamp: "2026-10-10T10:02:00+08:00" },
  ],
} }), [])



assert.equal(matchGmbOfficialRouteId("123", [123, 456]), 123)
assert.equal(matchGmbOfficialRouteId("00123", [123]), null)
assert.equal(matchGmbOfficialRouteId("Route 123", [123]), null)
assert.equal(matchGmbOfficialRouteId("123", [123, 123]), null)
assert.equal(matchGmbOfficialRouteId("0", [0]), null)
assert.equal(matchGmbOfficialRouteId("9007199254740992", [9007199254740992]), null)
assert.deepEqual(auditGmbRouteIdCandidates(
  ["123", "Route 456", "789", "00123"],
  [123, 456, 789],
), [
  { localRouteId: "123", officialRouteId: 123 },
  { localRouteId: "789", officialRouteId: 789 },
])


assert.equal(isGmbRouteDirection(1), true)
assert.equal(isGmbRouteDirection(2), true)
assert.equal(isGmbRouteDirection(0), false)
assert.equal(isGmbRouteDirection(3), false)
assert.equal(isGmbRouteDirection("1"), false)
assert.equal(isGmbRouteDirection(null), false)

console.log("gmb-estimated-position-ok")
