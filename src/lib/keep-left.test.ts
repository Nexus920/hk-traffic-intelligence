import assert from "node:assert/strict"
import lines from "../../data/strategic-centerlines.json" with { type: "json" }
import { keepLeftCarriageways, type Carriageway } from "./keep-left.ts"

const wrong: Carriageway[] = [
  { id: "east", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "3", coordinates: [[114.17, 22.28], [114.175, 22.28]] },
  { id: "west", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "3", coordinates: [[114.175, 22.28015], [114.17, 22.28015]] },
]
const turned = keepLeftCarriageways(wrong)
assert.equal(turned[0]?.coordinates[0]?.[0], 114.175)
assert.equal(turned[1]?.coordinates[0]?.[0], 114.17)
assert.deepEqual(keepLeftCarriageways(turned).map((line) => line.coordinates), turned.map((line) => line.coordinates))

const already: Carriageway[] = [
  { id: "east", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "3", coordinates: [[114.17, 22.28015], [114.175, 22.28015]] },
  { id: "west", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "3", coordinates: [[114.175, 22.28], [114.17, 22.28]] },
]
assert.equal(keepLeftCarriageways(already)[0]?.coordinates[0]?.[0], 114.17)

const oneWay: Carriageway[] = [
  { id: "east", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "1", coordinates: [[114.17, 22.28], [114.175, 22.28]] },
  { id: "west", roadTc: "告士打道", roadEn: "GLOUCESTER ROAD", direction: "3", coordinates: [[114.175, 22.28015], [114.17, 22.28015]] },
]
assert.equal(keepLeftCarriageways(oneWay)[0]?.coordinates[0]?.[0], 114.17)
assert.equal(keepLeftCarriageways(oneWay)[1]?.coordinates[0]?.[0], 114.175)

const alone: Carriageway[] = [
  { id: "only", roadTc: "公主道", roadEn: "PRINCESS MARGARET ROAD", direction: "3", coordinates: [[114.17, 22.3], [114.175, 22.3]] },
]
assert.equal(keepLeftCarriageways(alone)[0]?.coordinates[0]?.[0], 114.17)

function bearing(a: [number, number], b: [number, number]): number {
  const east = (b[0] - a[0]) * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180)
  const north = b[1] - a[1]
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
}

const fixed = keepLeftCarriageways(lines as Carriageway[])
let eastLat = 0
let eastCount = 0
let westLat = 0
let westCount = 0
for (const line of fixed) {
  if (line.roadTc !== "告士打道" || line.coordinates.length < 2) continue
  const first = line.coordinates[0]
  const last = line.coordinates[line.coordinates.length - 1]
  const mid = line.coordinates[Math.floor(line.coordinates.length / 2)]
  if (!first || !last || !mid) continue
  if (mid[0] < 114.17 || mid[0] > 114.172 || mid[1] < 22.28 || mid[1] > 22.282) continue
  const deg = bearing(first, last)
  if (deg > 45 && deg < 135) {
    eastLat += mid[1]
    eastCount += 1
  } else if (deg > 225 && deg < 315) {
    westLat += mid[1]
    westCount += 1
  }
}
assert.ok(eastCount > 0 && westCount > 0)
assert.ok(eastLat / eastCount > westLat / westCount)
const settled = keepLeftCarriageways(fixed)
assert.equal(settled.every((line, index) => line.coordinates[0]?.[0] === fixed[index]?.coordinates[0]?.[0]), true)

console.log("keep-left ok")
