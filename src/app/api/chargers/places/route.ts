import { loadChargerPlaces } from "@/lib/ev-chargers"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, error: "Charger centre missing", places: [] }, { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  return Response.json(loadChargerPlaces(lng, lat, zoom, url.searchParams.get("wide") === "1"))
}
