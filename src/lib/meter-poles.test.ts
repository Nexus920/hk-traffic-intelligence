import assert from "node:assert/strict"
import { meterClock, meterFree, meterPolesNear, meterPolesWide, parseMeterPoles, parseMeterSites, METER_CAP, METER_WIDE_CAP, type MeterPole } from "./meter-poles.ts"

const spaces = `2026-10-04

PoleId,ParkingSpaceId,Street,Street_tc,SectionOfStreet,SectionOfStreet_tc,Latitude,Longitude,VehicleType
1,1B,Island Road,香島道,Golf Club,哥爾夫球會,22.2800,114.1500,G
1,1A,Island Road,香島道,Golf Club,哥爾夫球會,22.2800,114.1500,A
2,2A,Tai Po Road,大埔公路,Sha Tin,沙田,22.3800,114.1900,C
`
const occupancy = `ParkingSpaceId,ParkingMeterStatus,OccupancyStatus,OccupancyDateChanged
1A,N,V,10/05/2026 12:00:00 PM
1B,N,O,10/05/2026 12:04:00 PM
2A,NU,O,10/05/2026 12:00:00 PM
`
const poles = parseMeterPoles(spaces, occupancy)
assert.equal(poles.length, 2)
const island = poles.find((pole) => pole.id === "1")
assert.equal(island?.streetTc, "香島道")
assert.equal(island?.spaces.map((space) => space.id).join(","), "1A,1B")
assert.equal(island?.spaces[0]?.kind, "general")
assert.equal(island?.spaces[0]?.vacant, true)
assert.equal(island?.spaces[1]?.kind, "goods")
assert.equal(island?.spaces[1]?.vacant, false)
assert.equal(meterFree(island!), 1)
const coach = poles.find((pole) => pole.id === "2")
assert.equal(coach?.spaces[0]?.vacant, null)
assert.equal(meterPolesNear(poles, 114.15, 22.28, 500, METER_CAP).map((pole) => pole.id).join(","), "1")
assert.equal(parseMeterSites(spaces).length, 2)
assert.equal(meterClock("10/05/2026 06:46:59 PM"), "18:46")
assert.equal(meterClock("10/05/2026 12:10:34 AM"), "00:10")
assert.equal(meterClock("10/05/2026 08:32:58 AM"), "08:32")
assert.equal(meterClock(""), "")
const crowded = island
  ? Array.from({ length: METER_CAP + 5 }, (_, index): MeterPole => ({ ...crowdedPole(island, index) }))
  : []
assert.equal(meterPolesNear(crowded, 114.15, 22.28, 5_000).length, METER_CAP)

const west = Array.from({ length: 40 }, (_, index): MeterPole => ({ ...crowdedPole(island!, index), lng: 113.9 + index * 0.0001, lat: 22.2 }))
const east = Array.from({ length: 40 }, (_, index): MeterPole => ({ ...crowdedPole(island!, index + 40), lng: 114.4 + index * 0.0001, lat: 22.4 }))
const spread = meterPolesWide([...west, ...east], 114.15, 22.3, 80_000, 10)
assert.equal(spread.length, 10)
assert.ok(spread.some((pole) => pole.lng < 114))
assert.ok(spread.some((pole) => pole.lng > 114.3))
assert.equal(meterPolesWide(west, 113.9, 22.2, 5_000, METER_WIDE_CAP).length, west.length)

function crowdedPole(pole: MeterPole, index: number): MeterPole {
  return { ...pole, id: String(index), lng: pole.lng + index * 0.00001 }
}

console.log("meter-poles ok")
