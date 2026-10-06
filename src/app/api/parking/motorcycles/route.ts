import { loadMotorcyclePlaces } from "@/lib/parking"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lngText = url.searchParams.get("lng")
  const latText = url.searchParams.get("lat")
  const lng = Number(lngText)
  const lat = Number(latText)
  if (lngText == null || latText == null || lngText.trim() === "" || latText.trim() === "" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, error: "Motorcycle centre missing", parks: [] }, { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  const places = await loadMotorcyclePlaces(lng, lat, zoom, url.searchParams.get("wide") === "1")
  if (!places.ok) return Response.json({ ok: false, error: "Motorcycle parks failed", parks: [] }, { status: 502 })
  return Response.json(places)
}
