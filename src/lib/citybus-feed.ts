import { cachedValue } from "@/lib/board-cache"
import { citybusPoleIds, citybusStop, nearestCitybusStops } from "@/lib/citybus-network"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { ETA_FRESH_MS } from "@/lib/place-arrivals"
import { etaQueue } from "@/lib/polite-fetch"
import { pool } from "@/lib/pool"
import { fetchUpstream } from "@/lib/upstream"
import type { CitybusCall, CitybusPlacesResponse, CitybusResponse, CitybusStopBoard } from "@/lib/types"

const STOP_LIMIT = 6
const FETCH_LIMIT = 4
const ETA_ROOT = "https://rt.data.gov.hk/v2/transport/citybus/eta/CTB"

type EtaRow = {
  route?: string
  dest_tc?: string
  dest_en?: string
  eta?: string | null
  eta_seq?: number
  rmk_en?: string
  rmk_tc?: string
}

export function loadCitybusPlaces(lng: number, lat: number): CitybusPlacesResponse {
  const stops: CitybusPlacesResponse["stops"] = []
  for (const stop of nearestCitybusStops(lng, lat, STOP_LIMIT)) {
    const record = citybusStop(stop.id)
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
  return { ok: true, stops }
}

export async function loadCitybusNear(lng: number, lat: number): Promise<CitybusResponse> {
  const places = loadCitybusPlaces(lng, lat)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadCitybusBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: CitybusStopBoard } | { ok: false }> {
  return cachedValue(`citybus:${id}`, ETA_FRESH_MS, () => readCitybusBoard(id, now))
}

async function readCitybusBoard(id: string, now: number): Promise<{ ok: true; stop: CitybusStopBoard } | { ok: false }> {
  const ids = citybusPoleIds(id)
  if (ids.length === 0) return { ok: false }
  const stops: CitybusStopBoard[] = []
  let missed = 0
  for (const stopId of ids) {
    const record = citybusStop(stopId)
    if (!record) {
      missed += 1
      continue
    }
    const rows: EtaRow[] = []
    await pool(record.routes, FETCH_LIMIT, async (route) => {
      const got = await fetchEta(stopId, route)
      if (!got) {
        missed += 1
        return
      }
      rows.push(...got)
    })
    stops.push({
      id: stopId,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: record.routes,
      calls: callsAt(rows, now),
      clock: "ready",
    })
  }
  const shown = mergeSamePoles(stops)[0]
  if (!shown || missed > 0) return { ok: false }
  return { ok: true, stop: shown }
}

function callsAt(rows: EtaRow[], now: number): CitybusCall[] {
  const calls: CitybusCall[] = []
  for (const row of rows) {
    if (row.eta_seq !== 1) continue
    const route = text(row.route)
    if (!route) continue
    const etaMs = row.eta ? Date.parse(row.eta) : NaN
    const hasEta = Number.isFinite(etaMs)
    const remarkTc = isScheduled(row) ? "" : text(row.rmk_tc)
    const remarkEn = isScheduled(row) ? "" : text(row.rmk_en)
    calls.push({
      route,
      destTc: text(row.dest_tc),
      destEn: text(row.dest_en),
      eta: hasEta ? new Date(etaMs).toISOString() : "",
      minutes: hasEta ? Math.max(0, Math.round((etaMs - now) / 60_000)) : null,
      scheduled: isScheduled(row),
      remarkTc,
      remarkEn,
    })
  }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
  return calls
}

function isScheduled(row: EtaRow): boolean {
  return row.rmk_en === "Scheduled Bus" || row.rmk_tc === "原定班次"
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function fetchEta(stopId: string, route: string): Promise<EtaRow[] | null> {
  try {
    const response = await etaQueue(() => fetchUpstream(`${ETA_ROOT}/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`, ETA_FRESH_MS, {
      timeoutMs: 5_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
      },
    }))
    if (response.status !== 200) return null
    const body = JSON.parse(new TextDecoder().decode(response.body)) as { data?: EtaRow[] }
    return Array.isArray(body.data) ? body.data : []
  } catch {
    return null
  }
}
