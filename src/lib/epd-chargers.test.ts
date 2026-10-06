import assert from "node:assert/strict"
import { CHARGER_POLL_MS, parseEpdStations } from "./epd-chargers.ts"
import { METER_POLL_MS } from "./meter-poles.ts"

const body = {
  lastUpdateDate: "2026-10-07T02:54:51.329+0800",
  data: [
    {
      id: 1,
      carParkId: "PIS-1",
      carParkEName: "North Point Government Offices",
      carParkCName: "北角政府合署",
      location: { lat: 22.29227, lng: 114.20841 },
      availableCharger: 24,
      chargerTotalByCombinations: [
        { typeEName: "Medium Charger (<20kW )", numOfCharger: 29 },
        { typeEName: "Quick Charger (<100kW)", numOfCharger: 2 },
      ],
    },
    {
      id: 2,
      carParkId: "PIS-2",
      carParkEName: "Quiet Court",
      carParkCName: "靜苑",
      location: { lat: 22.3, lng: 114.2 },
      availableCharger: null,
      chargerTotalByCombinations: [{ typeEName: "Standard Charger (<7kW )", numOfCharger: 4 }],
    },
    {
      id: 3,
      carParkId: "PIS-3",
      carParkEName: "Full Court",
      carParkCName: "滿苑",
      location: { lat: 22.31, lng: 114.21 },
      availableCharger: 0,
      chargerTotalByCombinations: [{ typeEName: "Fast Charger (>=100kW)", numOfCharger: 1 }],
    },
    {
      id: 4,
      carParkId: "OUT",
      carParkEName: "Far Away",
      carParkCName: "遠處",
      location: { lat: 1, lng: 1 },
      availableCharger: 3,
      chargerTotalByCombinations: [],
    },
  ],
}

const stations = parseEpdStations(body)
assert.equal(stations.length, 3)
const north = stations.find((station) => station.id === "PIS-1")
assert.equal(north?.free, 24)
assert.equal(north?.medium, 29)
assert.equal(north?.quick, 2)
assert.equal(north?.nameTc, "北角政府合署")
assert.equal(north?.publishCounts, true)
assert.equal(stations.find((station) => station.id === "PIS-2")?.free, null)
assert.equal(stations.find((station) => station.id === "PIS-3")?.free, 0)
assert.equal(stations.find((station) => station.id === "PIS-3")?.fast, 1)
assert.equal(CHARGER_POLL_MS, METER_POLL_MS)
assert.equal(parseEpdStations({ data: [] }).length, 0)
assert.equal(parseEpdStations(null).length, 0)

console.log("epd chargers ok")
