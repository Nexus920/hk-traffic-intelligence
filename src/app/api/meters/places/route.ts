import { loadMeterPlaces } from "@/lib/meters"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, error: "Meter centre missing", poles: [] }, { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  const places = await loadMeterPlaces(lng, lat, zoom, url.searchParams.get("wide") === "1")
  if (!places.ok) return Response.json({ ok: false, error: "Meter catalogue failed", poles: [] }, { status: 502 })
  return Response.json(places)
}
