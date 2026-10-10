import assert from "node:assert/strict"
import { gmbDestination } from "./gmb-destinations.ts"

const cyberport = gmbDestination(2000511, 2)
assert.equal(cyberport?.tc, "數碼港")
assert.equal(cyberport?.en, "Cyberport")

const reverse = gmbDestination(2000511, 1)
assert.equal(reverse?.tc, "銅鑼灣(駱克道)")
assert.equal(reverse?.en, "Causeway Bay (Lockhart Road)")

assert.equal(gmbDestination(999999999, 1), null)
assert.equal(gmbDestination(2000511, 9), null)
assert.equal(gmbDestination(2000511, 0), null)
assert.equal(gmbDestination(2000511, 1.5), null)
assert.equal(gmbDestination(2000511.5, 1), null)
assert.equal(gmbDestination(Number.MAX_SAFE_INTEGER + 1, 1), null)

console.log("gmb destinations ok")
