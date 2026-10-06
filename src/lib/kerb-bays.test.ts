import assert from "node:assert/strict"
import { clusterKerbBays, hk80ToWgs84, kerbRowsNear, parseKerbBays, KERB_CAP } from "./kerb-bays.ts"

const village = hk80ToWgs84(836962.13, 814378.414)
const east = (village.lng - 114.18360909577919) * Math.cos(village.lat * Math.PI / 180) * 111_320
const north = (village.lat - 22.268236185746296) * 110_540
assert.ok(Math.hypot(east, north) < 0.2)

const csv = [
  "OBJECTID,STREET_NAME_ENG,STREET_NAME_CHI,METER_NONMETER,CAPACITY,VEHICLE_TYPE_DESCRIPTION_1,VEHICLE_TYPE_DESCRIPTION_2,PARK_METER_PERIOD_DESC,OPERATIVE_HOUR_ENG,OPERATIVE_HOUR_CHI,IRNP_REMARKS_ENG,IRNP_REMARKS_CHI,OT_OPER_HR_DESC,OT_OPER_HR_DESC_CHI,OT_IRNP_REMARKS_ENG,OT_IRNP_REMARKS_CHI,X_COOR,Y_COOR,LAST_UPDATE_DATE,FEATUREID",
  "1,VILLAGE ROAD,村道路,N,1,Motor Cycles,,,,,,,,,,,836962.130,814378.414,28/12/2021,52",
  "2,VILLAGE ROAD,村道路,N,1,Motor Cycles,,,,,,,,,,,836963.130,814378.414,28/12/2021,53",
  "3,VILLAGE ROAD,村道路,M,1,Motor Cycles,,,,,,,,,,,836962.130,814378.414,28/12/2021,54",
  "4,OTHER ROAD,另一路,N,1,Any Vehicles,,,,,,,,,,,836962.130,814378.414,28/12/2021,55",
  "5,BUS ROAD,巴士路,N,1,Motor Cycles,,,,,FRANCHISED BUSES ONLY,,,,,,836962.130,814378.414,28/12/2021,56",
  "6,FAR ROAD,遠路,N,1,Motor Cycles,,,,,,,,,,,837200.000,814378.414,28/12/2021,57",
].join("\n")

const bays = parseKerbBays(csv)
assert.deepEqual(bays.map((bay) => bay.id).sort(), ["52", "53", "57"])
const rows = clusterKerbBays(bays)
const villageRow = rows.find((row) => row.streetEn === "VILLAGE ROAD")
assert.equal(villageRow?.bays, 2)
assert.equal(villageRow?.id, "52")
assert.equal(rows.find((row) => row.streetEn === "FAR ROAD")?.bays, 1)
assert.equal(kerbRowsNear(rows, village.lng, village.lat, 30, KERB_CAP).some((row) => row.streetEn === "FAR ROAD"), false)

console.log("kerb-bays ok")
