import assert from "node:assert/strict"
import { canonicalDistrict, districtFromTraditional } from "./i18n.ts"

assert.equal(districtFromTraditional("en", "中西區"), "Central & Western")
assert.equal(districtFromTraditional("zh-HK", "中西區"), "中西區")
assert.equal(districtFromTraditional("zh-CN", "中西區"), "中西區")
assert.equal(districtFromTraditional("en", ""), "")
assert.equal(canonicalDistrict("觀塘區"), "觀塘")
assert.equal(canonicalDistrict("東區"), "東區")
assert.equal(districtFromTraditional("en", canonicalDistrict("觀塘區")), "Kwun Tong")

console.log("district ok")
