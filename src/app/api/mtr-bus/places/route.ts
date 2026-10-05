import { loadMtrBusPlaces } from "@/lib/mtr-bus-feed"
import type { CitybusPlacesResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): CitybusPlacesResponse => ({ ok: false, error, stops: [] })

export async function GET(request: Request) {
  const url = new URL(request.url)
  const wide = url.searchParams.get("wide") === "1"
  const lng = Number(url.searchParams.get("lng"))
  const lat = Number(url.searchParams.get("lat"))
  const zoom = Number(url.searchParams.get("zoom"))
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json(empty("MTR bus centre missing"), { status: 400 })
  }
  try {
    const body = await loadMtrBusPlaces(lng, lat, zoom, wide)
    return Response.json(body, { status: body.ok ? 200 : 502 })
  } catch (error) {
    return Response.json(empty(error instanceof Error ? error.message : "MTR bus stops failed"), { status: 502 })
  }
}
