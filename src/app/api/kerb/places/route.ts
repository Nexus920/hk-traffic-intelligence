import { loadKerbRows } from "@/lib/kerb"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const lngText = url.searchParams.get("lng")
  const latText = url.searchParams.get("lat")
  const lng = Number(lngText)
  const lat = Number(latText)
  if (lngText == null || latText == null || lngText.trim() === "" || latText.trim() === "" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ ok: false, error: "Kerb centre missing", rows: [] }, { status: 400 })
  }
  const zoom = Number(url.searchParams.get("zoom"))
  const places = await loadKerbRows(lng, lat, zoom, url.searchParams.get("wide") === "1")
  if (!places.ok) return Response.json({ ok: false, error: "Motorcycle bays failed", rows: [] }, { status: 502 })
  return Response.json(places)
}
