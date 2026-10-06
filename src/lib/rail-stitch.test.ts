import assert from "node:assert/strict"
import { stitchPair } from "./rail-stitch.ts"

const ways = [
  { id: 1, line: [[114.15, 22.28], [114.155, 22.285]] as [number, number][] },
  { id: 2, line: [[114.155, 22.285], [114.16, 22.29]] as [number, number][] },
  { id: 3, line: [[114.155, 22.285], [114.2, 22.2]] as [number, number][] },
]
const stations = [
  { code: "A", lng: 114.15, lat: 22.28 },
  { code: "B", lng: 114.16, lat: 22.29 },
  { code: "C", lng: 114.2, lat: 22.2 },
]
const joined = stitchPair(ways, stations, "A", "B")
assert.ok(joined)
assert.ok(joined.length >= 3)
assert.ok(Math.abs(joined[0]![1]! - 22.28) < 0.002)
assert.ok(joined.some((point) => point[0] > 114.17) === false)

console.log("rail stitch ok")
