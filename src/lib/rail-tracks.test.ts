import assert from "node:assert/strict"
import { fractionAlong, lineMetres, pointAlong } from "./rail-geometry.ts"
import { segmentLength, segmentSpan, setTrackEdges } from "./rail-tracks.ts"

const start = { lng: 114.15, lat: 22.28 }
const end = { lng: 114.17, lat: 22.28 }
setTrackEdges({})
assert.equal(segmentSpan("ADM", "CEN", start, end).length, 2)

const bend = [
  { lng: 114.15, lat: 22.28 },
  { lng: 114.16, lat: 22.3 },
  { lng: 114.17, lat: 22.28 },
]
setTrackEdges({ "ADM>CEN": bend.map((point) => [point.lng, point.lat]) })
const line = segmentSpan("CEN", "ADM", end, start)
assert.ok(lineMetres(line) > segmentLength("NO", "EDGE", start, end))
const mid = pointAlong(line, lineMetres(line) / 2)
assert.ok(mid.lat > 22.29)
assert.ok(Math.abs(fractionAlong(line, mid) - 0.5) < 0.08)
setTrackEdges({})

console.log("rail tracks ok")
