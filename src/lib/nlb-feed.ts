import { cachedValue } from "@/lib/board-cache"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { nlbArrivalMs } from "@/lib/nlb-clock"
import { nearestNlbStops, nlbPoleIds, nlbStop } from "@/lib/nlb-network"
import { ETA_FRESH_MS } from "@/lib/place-arrivals"
import { etaQueue } from "@/lib/polite-fetch"
import { pool } from "@/lib/pool"
import { fetchUpstream } from "@/lib/upstream"
import type { NlbCall, NlbPlacesResponse, NlbResponse, NlbStopBoard } from "@/lib/types"

const STOP_LIMIT = 6
const FETCH_LIMIT = 4
const ETA_ROOT = "https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals"

type Arrival = { estimatedArrivalTime?: string }

export function loadNlbPlaces(lng: number, lat: number): NlbPlacesResponse {
  const stops: NlbPlacesResponse["stops"] = []
  for (const stop of nearestNlbStops(lng, lat, STOP_LIMIT)) {
    const record = nlbStop(stop.id)
    if (!record) continue
    stops.push({
      id: stop.id,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: record.routes,
    })
  }
  return { ok: true, stops: mergeSamePoles(stops) }
}

export async function loadNlbNear(lng: number, lat: number): Promise<NlbResponse> {
  const places = loadNlbPlaces(lng, lat)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadNlbBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: NlbStopBoard } | { ok: false }> {
  return cachedValue(`nlb:${id}`, ETA_FRESH_MS, () => readNlbBoard(id, now))
}

async function readNlbBoard(id: string, now: number): Promise<{ ok: true; stop: NlbStopBoard } | { ok: false }> {
  const ids = nlbPoleIds(id)
  if (ids.length === 0) return { ok: false }
  const stops: NlbStopBoard[] = []
  let missed = 0
  for (const stopId of ids) {
    const record = nlbStop(stopId)
    if (!record) {
      missed += 1
      continue
    }
    const calls: NlbCall[] = []
    await pool(record.services, FETCH_LIMIT, async (service) => {
      const rows = await fetchEta(service.id, stopId)
      if (!rows) {
        missed += 1
        return
      }
      const call = callAt(service.code, rows, now)
      if (call) calls.push(call)
    })
    calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
    stops.push({
      id: stopId,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: record.routes,
      calls,
      clock: "ready",
    })
  }
  const shown = mergeSamePoles(stops)[0]
  if (!shown || missed > 0) return { ok: false }
  return { ok: true, stop: shown }
}

function callAt(route: string, rows: Arrival[], now: number): NlbCall | null {
  let best: NlbCall | null = null
  for (const row of rows) {
    const etaMs = row.estimatedArrivalTime ? nlbArrivalMs(row.estimatedArrivalTime) : NaN
    if (!Number.isFinite(etaMs)) continue
    const minutes = Math.max(0, Math.round((etaMs - now) / 60_000))
    if (best && (best.minutes ?? 999) <= minutes) continue
    best = { route, destTc: "", destEn: "", eta: new Date(etaMs).toISOString(), minutes, scheduled: false, remarkTc: "", remarkEn: "" }
  }
  return best
}

async function fetchEta(routeId: string, stopId: string): Promise<Arrival[] | null> {
  const url = `${ETA_ROOT}&routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}&lang=en`
  try {
    const response = await etaQueue(() => fetchUpstream(url, ETA_FRESH_MS, {
      timeoutMs: 5_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
      },
    }))
    if (response.status !== 200) return null
    const text = new TextDecoder().decode(response.body)
    if (!text) return []
    const body = JSON.parse(text) as { estimatedArrivals?: Arrival[] }
    return Array.isArray(body.estimatedArrivals) ? body.estimatedArrivals : []
  } catch {
    return null
  }
}
