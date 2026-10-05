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

const { camerasFromWfs, withPortalCameras } = await import("./picture.ts")

function camera(id: string, name: string, lng: number, lat: number, district = "Kwai Tsing") {
  return {
    type: "Feature" as const,
    properties: { KEY: id, DESCRIPTION: name, DISTRICT: district, ROTATION: 0, URL: "" },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  }
}

function toll(band: "portal" | "overview", lng: number, lat: number) {
  return {
    type: "Feature" as const,
    properties: { band, TunnelCode: "CHT", FeatureID: `${band}-${lng}` },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  }
}

const wfs = {
  features: [
    camera("highway", "Tsing Kwai Highway/Cheung Tsing Tunnel", 114.11, 22.35),
    camera("bridge", "Cheung Tsing Bridge", 114.112, 22.349),
    camera("side", "Aberdeen Tunnel - Wan Chai Side", 114.17, 22.25),
    camera("road", "Lion Rock Tunnel Road near Sun Tin Wai Estate", 114.18, 22.37),
    camera("entrance", "Lion Rock Tunnel Road near Entrance from Kowloon - Northbound", 114.18, 22.36),
    camera("soccer", "Tsuen Wan Road near Wing Kei Road 5-A-Side Soccer Pitch - Northbound", 114.12, 22.36),
    camera("exit", "Fanling Highway near Exit to So Kwun Po Road - Westbound", 114.14, 22.49),
    camera("district", "Princess Margaret Road/Pui Ching Road", 114.178, 22.317, "Kowloon City"),
    camera("near", "Connaught Road West", 114.18, 22.3002),
    camera("far", "Connaught Road West", 114.18, 22.31),
    camera("overview", "Island Eastern Corridor", 114.2, 22.28),
  ],
}
const tolls = {
  type: "FeatureCollection" as const,
  features: [toll("portal", 114.18, 22.3), toll("overview", 114.2, 22.28)],
}

const placed = withPortalCameras(camerasFromWfs(wfs), tolls)
const zoom = new Map(placed.features.map((feature) => [feature.properties?.id, feature.properties?.portal]))

assert.equal(zoom.get("highway"), 0)
assert.equal(zoom.get("bridge"), 0)
assert.equal(zoom.get("side"), 1)
assert.equal(zoom.get("road"), 0)
assert.equal(zoom.get("entrance"), 1)
assert.equal(zoom.get("soccer"), 0)
assert.equal(zoom.get("exit"), 0)
assert.equal(zoom.get("district"), 0)
assert.equal(placed.features.find((feature) => feature.properties?.id === "district")?.properties?.harbour, 0)
assert.equal(zoom.get("near"), 1)
assert.equal(zoom.get("far"), 0)
assert.equal(zoom.get("overview"), 0)

console.log("picture ok")
