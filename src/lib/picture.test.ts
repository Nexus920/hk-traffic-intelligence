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

function toll(lng: number, lat: number) {
  return {
    type: "Feature" as const,
    properties: { band: "portal", TunnelCode: "CHT", FeatureID: `toll-${lng}` },
    geometry: { type: "Point" as const, coordinates: [lng, lat] },
  }
}

const wfs = {
  features: [
    camera("district", "Princess Margaret Road/Pui Ching Road", 114.178, 22.317, "Kowloon City"),
    camera("bridge", "Cheung Tsing Bridge", 114.112, 22.349),
    camera("tunnel", "Tsing Kwai Highway/Cheung Tsing Tunnel", 114.11, 22.348),
    camera("near", "Connaught Road West", 114.18, 22.3002),
    camera("far", "Connaught Road West", 114.18, 22.31),
  ],
}
const tolls = { type: "FeatureCollection" as const, features: [toll(114.18, 22.3)] }
const placed = withPortalCameras(camerasFromWfs(wfs), tolls)
const byId = new Map(placed.features.map((feature) => [feature.properties?.id, feature.properties]))

assert.equal(byId.get("district")?.harbour, 1)
assert.equal(byId.get("bridge")?.harbour, 0)
assert.equal(byId.get("bridge")?.portal, 0)
assert.equal(byId.get("tunnel")?.portal, 1)
assert.equal(byId.get("near")?.portal, 1)
assert.equal(byId.get("far")?.portal, 0)

console.log("picture ok")
