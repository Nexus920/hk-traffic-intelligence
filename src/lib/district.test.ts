import assert from "node:assert/strict"
import { districtFromTraditional } from "./i18n.ts"

assert.equal(districtFromTraditional("en", "中西區"), "Central & Western")
assert.equal(districtFromTraditional("zh-HK", "中西區"), "中西區")
assert.equal(districtFromTraditional("zh-CN", "中西區"), "中西區")
assert.equal(districtFromTraditional("en", ""), "")

console.log("district ok")
