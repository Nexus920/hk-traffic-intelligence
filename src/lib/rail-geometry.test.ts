import assert from "node:assert/strict"
import { fractionAlong, lineMetres, orientLine, pointAlong } from "./rail-geometry.ts"

const bend = [
  { lng: 114, lat: 22 },
  { lng: 114, lat: 22.009 },
  { lng: 114.009, lat: 22.009 },
]
const length = lineMetres(bend)
assert.ok(length > 1800)
const mid = pointAlong(bend, length / 2)
assert.ok(Math.abs(mid.lng - 114) < 0.001)
assert.ok(Math.abs(mid.lat - 22.009) < 0.001)
const chordMid = {
  lng: (bend[0]!.lng + bend[2]!.lng) / 2,
  lat: (bend[0]!.lat + bend[2]!.lat) / 2,
}
assert.ok(Math.abs(mid.lat - chordMid.lat) > 0.002)

const flipped = orientLine([...bend].reverse(), bend[0]!)
assert.equal(flipped[0]!.lat, 22)
assert.ok(Math.abs(fractionAlong(bend, mid) - 0.5) < 0.05)

console.log("rail geometry ok")
