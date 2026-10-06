import assert from "node:assert/strict"
import { collapseSameSites, parseOneStopParks, parseOneStopSpaces, parseParkingParks, parseParkingSpaces, parksNear, publishedMotorcycleVacancies, publishedPrivateVacancies, oneStopCount, soloParkingRadiusMetres, type ParkingPark } from "./parking-parks.ts"

const near: ParkingPark = {
  id: "near",
  nameTc: "近",
  nameEn: "Near",
  addressTc: "",
  addressEn: "",
  lng: 114.17,
  lat: 22.28,
  heightM: null,
}
const far: ParkingPark = { ...near, id: "far", lng: 114.3, lat: 22.4 }

assert.deepEqual(parksNear([far, near], 114.17, 22.28, 800).map((park) => park.id), ["near"])
assert.equal(parksNear([near, far], 114.17, 22.28, 80_000, 1)[0]?.id, "near")

const parsed = parseParkingParks({
  car_park: [{ park_id: "a", name_tc: "甲", name_en: "A", latitude: 22.2, longitude: 114.1, height: 0, displayAddress_tc: "地址" }],
})
assert.equal(parsed[0]?.heightM, null)
assert.equal(parsed[0]?.addressTc, "地址")

const spaces = parseParkingSpaces({
  car_park: [
    {
      park_id: "a",
      vehicle_type: [
        { type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 4, lastupdate: "2026-10-05 11:03:05" }] },
        { type: "M", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: -1, lastupdate: "" }] },
      ],
    },
  ],
}, "a")
assert.equal(spaces[0]?.vacancy, 4)
assert.equal(spaces[1]?.vacancy, null)
assert.deepEqual(
  [...publishedMotorcycleVacancies({
    car_park: [
      { park_id: "live", vehicle_type: [{ type: "M", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 12 }] }] },
      { park_id: "quiet", vehicle_type: [{ type: "M", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: -1 }] }] },
      { park_id: "cars", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 3 }] }] },
    ],
  }).entries()],
  [["live", 12]],
)
const closeRadius = soloParkingRadiusMetres(18, 22.3)
assert.ok(closeRadius >= 800)
assert.equal(parksNear([near, { ...near, id: "half", lng: 114.175, lat: 22.284 }], 114.17, 22.28, closeRadius).length, 2)

assert.deepEqual(
  [...publishedPrivateVacancies({
    car_park: [
      { park_id: "open", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 30 }] }] },
      { park_id: "full", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 0 }] }] },
      { park_id: "quiet", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "B", vacancy: 8 }] }] },
      { park_id: "van", vehicle_type: [{ type: "L", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 9 }] }] },
    ],
  }).entries()],
  [["open", 30], ["full", 0]],
)

const chinese = {
  results: [
    { park_Id: "12", name: "淘大商場", displayAddress: "九龍九龍灣牛頭角道77號", latitude: 22.3247, longitude: 114.21675, heightLimits: [{ height: 1.9 }] },
    { park_Id: "77", name: "金利豐國際中心", displayAddress: "觀塘", latitude: 22.323615, longitude: 114.209249, heightLimits: null },
    { park_Id: "tdc108p1", name: "金利豐國際中心", displayAddress: "觀塘", latitude: 22.323615, longitude: 114.209278, heightLimits: [{ height: 2.45 }] },
  ],
}
const english = {
  results: [
    { park_Id: "12", name: "Amoy Plaza", displayAddress: "77 Ngau Tau Kok Road" },
    { park_Id: "77", name: "Kingston", displayAddress: "Kwun Tong" },
    { park_Id: "tdc108p1", name: "Kingston", displayAddress: "Kwun Tong" },
  ],
}
const oneStop = parseOneStopParks(chinese, english)
assert.equal(oneStop.length, 2)
assert.equal(oneStop.find((park) => park.id === "12")?.nameEn, "Amoy Plaza")
assert.equal(oneStop.find((park) => park.id === "12")?.nameTc, "淘大商場")
assert.equal(oneStop.find((park) => park.id === "12")?.heightM, 1.9)
assert.equal(oneStop.some((park) => park.id === "tdc108p1"), true)
assert.equal(oneStop.some((park) => park.id === "77"), false)
assert.equal(collapseSameSites(oneStop).length, 2)

const vacancy = {
  results: [
    { park_Id: "open", privateCar: [{ vacancy_type: "A", vacancy: 29, vacancyEV: 1, lastupdate: "2026-10-07 02:10:03" }], motorCycle: [{ vacancy_type: "A", vacancy: 6, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "full", privateCar: [{ vacancy_type: "A", vacancy: 0, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "quiet", privateCar: [{ vacancy_type: "B", vacancy: 1, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "shut", privateCar: [{ vacancy_type: "C", vacancy: 0, lastupdate: "2026-10-07 02:10:03" }] },
    { park_Id: "blank", privateCar: [{ vacancy_type: "A", vacancy: -1, lastupdate: "2026-10-07 02:10:03" }] },
  ],
}
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "private")?.state, "number")
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "private")?.ev, 1)
assert.equal(parseOneStopSpaces(vacancy, "full").find((space) => space.kind === "private")?.ev, null)
assert.equal(parseOneStopSpaces(vacancy, "open").find((space) => space.kind === "motorcycle")?.vacancy, 6)
assert.equal(parseOneStopSpaces(vacancy, "full").find((space) => space.kind === "private")?.vacancy, 0)
assert.equal(parseOneStopSpaces(vacancy, "quiet")[0]?.state, "unpublished")
assert.equal(parseOneStopSpaces(vacancy, "shut")[0]?.state, "closed")
assert.equal(parseOneStopSpaces(vacancy, "blank")[0]?.state, "unpublished")
assert.deepEqual([...oneStopCount(vacancy, "privateCar").entries()], [["open", 29], ["full", 0]])

console.log("parking-parks ok")
