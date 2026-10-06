import assert from "node:assert/strict"
import catalogueFile from "../../data/ev-chargers.json" with { type: "json" }
import { CHARGER_CAP, chargersInsideParks, chargersNear, joinChargers, parseChargerPlaces, type ChargerPlace } from "./ev-chargers.ts"

const places = parseChargerPlaces(catalogueFile)
const citic = places.find((place) => place.nameTc === "中信大廈")
assert.ok(citic)
assert.ok(Math.abs(citic.lng - 114.16712) < 0.001)
assert.equal(citic.districtTc, "中西區")
assert.equal(places.some((place) => place.nameTc.includes("英皇道1063")), false)
assert.equal(places.some((place) => place.nameEn === "Millennium City 1"), false)
assert.equal(places.some((place) => place.nameEn === "Hopewell Centre II"), false)
assert.equal(places.some((place) => place.nameTc.includes("蘇屋邨第二期")), false)

const langham = places.find((place) => place.nameTc === "朗豪坊")
assert.ok(langham)
assert.equal(langham.districtTc, "油尖旺")

const aroundCitic = chargersNear(places, 114.167, 22.281, 500)
assert.ok(aroundCitic.some((place) => place.id === citic.id))
assert.ok(aroundCitic.length <= CHARGER_CAP)

const crowded = Array.from({ length: CHARGER_CAP + 5 }, (_, index): ChargerPlace => ({
  ...citic,
  id: String(index),
  lng: citic.lng + index * 0.00001,
}))
assert.equal(chargersNear(crowded, citic.lng, citic.lat, 5_000).length, CHARGER_CAP)
assert.equal(parseChargerPlaces({ places: [{ id: "x", nameTc: "外", lng: 10, lat: 10 }] }).length, 0)

const inside = chargersInsideParks(
  [{ ...citic, id: "inside", lng: citic.lng, lat: citic.lat + 0.00005 }],
  [{ id: "park", lng: citic.lng, lat: citic.lat }],
)
assert.equal(inside.get("park")?.id, "inside")
const outside = chargersInsideParks(
  [{ ...citic, id: "outside", lng: citic.lng + 0.001, lat: citic.lat }],
  [{ id: "park", lng: citic.lng, lat: citic.lat }],
)
assert.equal(outside.size, 0)

const joined = joinChargers(
  [{ ...citic, id: "june", nameEn: "Citygate", lng: 113.94, lat: 22.29, free: null }],
  [{ id: "9", name: "Citygate", provider: "CLP", lng: 113.94001, lat: 22.29001, address: "", free: 2, updated: "", quick: 2, semiQuick: 0 }],
)
assert.equal(joined.find((place) => place.id === "june")?.free, 2)
assert.equal(joined.some((place) => place.id === "clp:9"), false)
const added = joinChargers([], [{ id: "9", name: "Citygate", provider: "CLP", lng: 113.94, lat: 22.29, address: "", free: null, updated: "", quick: 1, semiQuick: 0 }])
assert.equal(added[0]?.id, "clp:9")
assert.equal(added[0]?.free, null)

console.log("ev-chargers ok")
