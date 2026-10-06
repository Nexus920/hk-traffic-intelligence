import assert from "node:assert/strict"
import { parseChargerDistricts, keepDistrictRows, withDistricts } from "./charger-districts.ts"

const body = {
  features: [
    {
      attributes: {
        LOCATION_TC: "北角政府合署 (金偉停車場有限公司)",
        LOCATION_EN: "North Point Government Offices",
        NAME_OF_DISTRICT_COUNCIL_DISTRICT_TC: "東區",
      },
    },
    {
      attributes: {
        LOCATION_TC: "西貢政府合署停車場",
        LOCATION_EN: "Sai Kung Government Offices Carpark",
        NAME_OF_DISTRICT_COUNCIL_DISTRICT_TC: "西貢區",
      },
    },
  ],
}

const rows = parseChargerDistricts(body)
assert.equal(rows.length, 2)
assert.equal(rows[1]?.districtTc, "西貢")

const places = withDistricts(
  [
    { id: "kept", nameTc: "中信大廈", nameEn: "CITIC Tower", districtTc: "中西區" },
    { id: "sai", nameTc: "西貢政府合署停車場", nameEn: "Other", districtTc: "" },
    { id: "blank", nameTc: "沒有", nameEn: "Nowhere", districtTc: "" },
  ],
  rows,
)
assert.equal(places.find((place) => place.id === "kept")?.districtTc, "中西區")
assert.equal(places.find((place) => place.id === "sai")?.districtTc, "西貢")
assert.equal(places.find((place) => place.id === "blank")?.districtTc, "")
assert.equal(parseChargerDistricts({ features: [] }).length, 0)
assert.deepEqual(keepDistrictRows([], [{ nameTc: "西貢政府合署停車場", nameEn: "Sai Kung", districtTc: "西貢" }]).map((row) => row.districtTc), ["西貢"])
assert.equal(keepDistrictRows([], []).length, 0)

console.log("charger districts ok")
