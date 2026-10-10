import assert from "node:assert/strict"
import {
  estimateBetweenStops,
  estimatesFromEtaObservations,
  estimatedMinibusCollection,
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
assert.equal(estimatesFromEtaObservations([base], stops).length, 1)
assert.equal(estimatesFromEtaObservations([{ ...base, etaMinutes: 20 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, segmentMinutes: 0 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, observedAt: "invalid" }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, routeSeq: 0 }], stops).length, 0)
assert.equal(estimatesFromEtaObservations([{ ...base, nextStopSeq: 1 }], stops).length, 0)
const nonAdjacentStops = new Map([["route-a/1", [from, { ...to, stopSeq: 3 }]]])
assert.equal(estimatesFromEtaObservations([base], nonAdjacentStops).length, 0)
const invalidCoordinateStops = new Map([["route-a/1", [from, { ...to, lng: 200 }]]])
assert.equal(estimatesFromEtaObservations([base], invalidCoordinateStops).length, 0)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated" }]).features.length, 1)
assert.equal(estimatedMinibusCollection([{ ...base, stopSeq: 1, from, to, positionType: "estimated", etaMinutes: 20 }]).features.length, 0)

console.log("gmb-estimated-position-ok")
