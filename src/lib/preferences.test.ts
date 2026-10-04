import assert from "node:assert/strict"
import { PREFERENCE_DEFAULTS, readPreferences } from "./preferences.ts"

const saved = readPreferences(JSON.stringify({
  locale: "en",
  layers: { kmb: false, ferry: false, speed: "yes" },
  basemap: "street",
  ground: "street",
  intelOpen: false,
  intelTab: "boundary",
  barOpen: false,
  pinnedOrigin: "H12",
}))
assert.equal(saved.locale, "en")
assert.equal(saved.layers.kmb, false)
assert.equal(saved.layers.ferry, false)
assert.equal(saved.layers.mtr, true)
assert.equal(saved.basemap, "street")
assert.equal(saved.intelOpen, false)
assert.equal(saved.intelTab, "boundary")
assert.equal(saved.barOpen, false)
assert.equal(saved.pinnedOrigin, "H12")

assert.equal(readPreferences("not-json").locale, PREFERENCE_DEFAULTS.locale)
assert.equal(readPreferences(JSON.stringify({ locale: "fr", intelTab: "nope", basemap: "moon" })).intelTab, "ranked")
assert.equal(readPreferences(JSON.stringify({ pinnedOrigin: null })).pinnedOrigin, null)

console.log("preferences ok")
