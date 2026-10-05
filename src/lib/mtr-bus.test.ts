import assert from "node:assert/strict"
import { mtrBusMinutes, mtrBusPolesNear, mtrBusVisits, parseMtrBusStops } from "./mtr-bus.ts"

const csv = `ROUTE_ID,DIRECTION,STATION_SEQNO,STATION_ID,STATION_LATITUDE,STATION_LONGITUDE,STATION_NAME_CHI,STATION_NAME_ENG,REFERENCE_ID
K51,O,1,K51-U010,22.413286,113.982895,富泰,Fu Tai,K51
K51A,O,1,K51A-U010,22.413286,113.982895,富泰,Fu Tai,K51A
K58,O,1,K58-U010,22.412815,113.982949,富泰,"Fu Tai, Estate",K58
`
const poles = parseMtrBusStops(csv)
const shared = poles.find((pole) => pole.stopIds.includes("K51-U010"))
assert.equal(shared?.routes.join(","), "K51,K51A")
assert.deepEqual(shared?.stopIds.sort(), ["K51-U010", "K51A-U010"])
assert.equal(poles.find((pole) => pole.stopIds.includes("K58-U010"))?.nameEn, "Fu Tai, Estate")
assert.equal(mtrBusPolesNear(poles, 113.982895, 22.413286, 30, 5).length, 1)

assert.equal(mtrBusMinutes("108000", "552"), 9)
assert.equal(mtrBusMinutes("631", "647"), 11)
assert.equal(mtrBusMinutes("108000", "108000"), null)

const visits = mtrBusVisits(["K51-U010"], "K51", {
  busStop: [{
    busStopId: "K51-U010",
    bus: [
      { arrivalTimeInSecond: "108000", departureTimeInSecond: "552", isScheduled: "1" },
      { arrivalTimeInSecond: "120", departureTimeInSecond: "140", isScheduled: "0" },
    ],
  }],
})
assert.equal(visits.length, 2)
assert.equal(visits[0]?.minutes, 2)
assert.equal(visits[0]?.scheduled, false)
assert.equal(visits[1]?.scheduled, true)

console.log("mtr-bus ok")
