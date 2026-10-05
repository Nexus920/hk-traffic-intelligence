import assert from "node:assert/strict"
import { register } from "node:module"

const hook = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = new URL("../" + specifier.slice(2) + ".ts", ${JSON.stringify(import.meta.url)})
    return nextResolve(target.href, context)
  }
  return nextResolve(specifier, context)
}
`
register(`data:text/javascript,${encodeURIComponent(hook)}`)

const { loadCitybusPlaces } = await import("./citybus-feed.ts")
const { GET: citybusPlaces } = await import("../app/api/citybus/places/route.ts")
const { loadGmbPlaces } = await import("./gmb-feed.ts")
const { GET: gmbPlaces } = await import("../app/api/gmb/places/route.ts")
const { kmbPlacesAt } = await import("./kmb-feed.ts")
const { loadNlbPlaces } = await import("./nlb-feed.ts")
const { GET: nlbPlaces } = await import("../app/api/nlb/places/route.ts")

const centre = { lng: 114.175, lat: 22.293 }

const citybus = loadCitybusPlaces(centre.lng, centre.lat)
const citybusWide = loadCitybusPlaces(centre.lng, centre.lat, true)
assert.ok(citybus.stops.length > 0)
assert.ok(citybus.stops.length <= 6)
assert.ok(citybusWide.stops.length > 1_000)
assert.ok(citybusWide.stops.length > citybus.stops.length)

const nlb = loadNlbPlaces(centre.lng, centre.lat)
const nlbWide = loadNlbPlaces(0, 0, true)
assert.ok(nlb.stops.length <= 6)
assert.ok(nlbWide.stops.length > 100)

const gmb = loadGmbPlaces(centre.lng, centre.lat, 0, 16)
const gmbFar = loadGmbPlaces(centre.lng, centre.lat, 0, 10)
const gmbWide = loadGmbPlaces(centre.lng, centre.lat, 0, 10, true)
assert.ok(gmb.stops.length > 0)
assert.ok(gmb.stops.length <= 24)
assert.ok(gmbFar.stops.length <= 24)
assert.ok(gmbWide.stops.length > 1_000)

const kmb = kmbPlacesAt(centre.lng, centre.lat, 16)
const kmbFar = kmbPlacesAt(centre.lng, centre.lat, 10)
const kmbWide = kmbPlacesAt(0, 0, Number.NaN, true)
assert.ok(kmb.stops.length > 0)
assert.ok(kmb.stops.length <= 40)
assert.ok(kmbFar.stops.length <= 40)
assert.ok(kmbWide.stops.length > 1_000)
const sizes = {
  citybus: JSON.stringify(citybusWide).length,
  gmb: JSON.stringify(gmbWide).length,
  kmb: JSON.stringify(kmbWide).length,
}
assert.ok(sizes.kmb < 2_000_000)
assert.ok(sizes.gmb < 2_000_000)
assert.ok(sizes.citybus < 1_000_000)

const citybusRoute = await citybusPlaces(new Request("http://local/api/citybus/places?wide=1"))
const citybusBody = await citybusRoute.json() as { stops: unknown[] }
assert.equal(citybusRoute.status, 200)
assert.equal(citybusBody.stops.length, citybusWide.stops.length)
const citybusNear = await citybusPlaces(new Request("http://local/api/citybus/places?lng=114.175&lat=22.293"))
const citybusNearBody = await citybusNear.json() as { stops: unknown[] }
assert.equal(citybusNear.status, 200)
assert.ok(citybusNearBody.stops.length <= 6)
assert.ok(citybusNearBody.stops.length < citybusBody.stops.length)

const gmbRoute = await gmbPlaces(new Request("http://local/api/gmb/places?wide=1"))
const gmbBody = await gmbRoute.json() as { stops: unknown[] }
assert.equal(gmbRoute.status, 200)
assert.equal(gmbBody.stops.length, gmbWide.stops.length)

const nlbRoute = await nlbPlaces(new Request("http://local/api/nlb/places?wide=1"))
const nlbBody = await nlbRoute.json() as { stops: unknown[] }
assert.equal(nlbRoute.status, 200)
assert.equal(nlbBody.stops.length, nlbWide.stops.length)

console.log("wide places ok", {
  citybus: citybusWide.stops.length,
  nlb: nlbWide.stops.length,
  gmb: gmbWide.stops.length,
  kmb: kmbWide.stops.length,
  kilobytes: {
    citybus: Math.round(sizes.citybus / 1024),
    gmb: Math.round(sizes.gmb / 1024),
    kmb: Math.round(sizes.kmb / 1024),
  },
})
