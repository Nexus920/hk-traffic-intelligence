import assert from "node:assert/strict"
import { summarizeGmbPositionBlockers } from "./gmb-position-blocker-summary.ts"

assert.deepEqual(
  summarizeGmbPositionBlockers([
    ["segment-timing-unavailable", "no-valid-nearby-eta"],
    ["segment-timing-unavailable"],
    ["no-valid-nearby-eta", "no-valid-nearby-eta"],
    [],
  ]),
  {
    "no-valid-nearby-eta": 2,
    "segment-timing-unavailable": 2,
  },
)
assert.deepEqual(summarizeGmbPositionBlockers([]), {})
console.log("gmb-position-blocker-summary-ok")
