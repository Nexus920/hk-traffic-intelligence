import { viewCachedGet } from "@/lib/view-cache"
import { loadCitybusNear } from "@/lib/citybus-feed"
import type { CitybusResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const empty = (error: string): CitybusResponse => ({ ok: false, error, observedAt: null, stops: [] })

export const GET = viewCachedGet({
  freshMs: 60_000,
  load: (lng, lat, now, _zoom, known) => loadCitybusNear(lng, lat, now, known),
  missing: () => empty("Citybus centre missing"),
  failed: (error) => empty(error instanceof Error ? error.message : "Citybus arrivals failed"),
})
