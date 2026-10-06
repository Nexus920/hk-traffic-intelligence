import assert from "node:assert/strict"
import { parseClpStations } from "./clp-chargers.ts"

const notAvailable = {
  code: 200,
  message: "Success",
  data: {
    totalSearchResult: 1,
    geoLocationResult: [
      {
        itemId: "1033",
        title: "Cheung Fat Plaza",
        provider: "CLP",
        longitude: 114.102919,
        latitude: 22.362646,
        detailedAddress: "Cheung Fat Plaza Carpark",
        chargerList: [
          { cpNo: "150", cpStatus: "Status_Not_Available", chargerType: "Semi-Quick", lastUpdate: "2026-10-07 02:18:14" },
          { cpNo: "156", cpStatus: "Status_Not_Available", chargerType: "Semi-Quick", lastUpdate: "2026-10-07 02:18:14" },
          { cpNo: "155", cpStatus: "Status_Not_Available", chargerType: "Semi-Quick", lastUpdate: "2026-10-07 02:18:14" },
        ],
        totalNumberOfCharger: 3,
        totalNumberOfQuickCharger: 0,
        totalNumberOfSemiQuickCharger: 3,
        totalNumberOfAvailableCharger: 0,
        totalNumberOfStatusNotAvailableCharger: 3,
        lastUpdate: "2026-10-07 02:18:14",
        status: "Status_Not_Available",
      },
    ],
  },
}

const available = {
  code: 200,
  data: {
    geoLocationResult: [
      {
        itemId: "9",
        title: "Citygate",
        provider: "CLP",
        longitude: 113.94,
        latitude: 22.29,
        detailedAddress: "Tung Chung",
        chargerList: [
          { chargerType: "Quick", cpStatus: "Available" },
          { chargerType: "Quick", cpStatus: "Not_Available" },
        ],
        totalNumberOfCharger: 4,
        totalNumberOfQuickCharger: 2,
        totalNumberOfSemiQuickCharger: 2,
        totalNumberOfAvailableCharger: 2,
        totalNumberOfStatusNotAvailableCharger: 0,
        lastUpdate: "2026-10-07 02:20:00",
        status: "Available",
      },
    ],
  },
}

assert.equal(parseClpStations(notAvailable).find((station) => station.id === "1033")?.free, null)
assert.equal(parseClpStations(notAvailable)[0]?.semiQuick, 3)
const live = parseClpStations(available)[0]
assert.equal(live?.free, 2)
assert.equal(live?.quick, 2)
assert.equal(live?.name, "Citygate")
assert.equal(parseClpStations({ code: 500, data: {} }).length, 0)

console.log("clp chargers ok")
