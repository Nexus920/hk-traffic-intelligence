import { loadChargerPlaces } from "@/lib/ev-chargers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lngText = url.searchParams.get("lng")
  const latText = url.searchParams.get("lat")
  const lng = lngText == null || lngText === "" ? Number.NaN : Number(lngText)
  const lat = latText == null || latText === "" ? Number.NaN : Number(latText)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, error: "Charger centre missing", places: [] }, { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  return Response.json(await loadChargerPlaces(lng, lat, zoom, url.searchParams.get("wide") === "1"))
}
