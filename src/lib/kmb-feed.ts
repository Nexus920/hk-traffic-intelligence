import { busCompany } from "@/lib/bus-company"
import { refreshKmbCatalogueSoon } from "@/lib/kmb-catalogue"
import { kmbPoleIds, kmbStop, kmbStopsWithin } from "@/lib/kmb-network"
import { kmbRoutesAt, refreshKmbRoutesSoon } from "@/lib/kmb-routes"
import { mergeSamePoles } from "@/lib/kmb-pole"
import { isListedKmbRow, kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { ETA_FRESH_MS } from "@/lib/place-arrivals"
import { cachedValue } from "@/lib/board-cache"
import { etaQueue } from "@/lib/polite-fetch"
import { pool } from "@/lib/pool"
import { fetchUpstream } from "@/lib/upstream"
import type { KmbCall, KmbPlacesResponse, KmbResponse, KmbStopBoard } from "@/lib/types"

const FETCH_LIMIT = 6
const ETA_ROOT = "https://data.etabus.gov.hk/v1/transport/kmb/stop-eta"

type EtaRow = {
  co?: string
  route?: string
  dest_tc?: string
  dest_en?: string
  eta?: string | null
  eta_seq?: number
  rmk_en?: string
  rmk_tc?: string
}

export function loadKmbPlaces(lng: number, lat: number, now = Date.now(), zoom = Number.NaN): KmbPlacesResponse {
  refreshKmbCatalogueSoon(now)
  refreshKmbRoutesSoon(now)
  const stops: KmbPlacesResponse["stops"] = []
  for (const stop of kmbStopsWithin(lng, lat, kmbReachMetres(zoom, lat), STOP_CAP)) {
    const record = kmbStop(stop.id)
    if (!record) continue
    stops.push({
      id: stop.id,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: kmbRoutesAt(stop.id),
    })
  }
  return { ok: true, stops: mergeSamePoles(stops) }
}

export async function loadKmbNear(lng: number, lat: number, now = Date.now(), zoom = Number.NaN): Promise<KmbResponse> {
  const places = loadKmbPlaces(lng, lat, now, zoom)
  return {
    ok: places.ok,
    observedAt: null,
    stops: places.stops.map((stop) => ({ ...stop, calls: [], clock: "waiting" as const })),
    cacheable: true,
  }
}

export function loadKmbBoard(id: string, now = Date.now()): Promise<{ ok: true; stop: KmbStopBoard } | { ok: false }> {
  return cachedValue(`kmb:${id}`, ETA_FRESH_MS, () => readKmbBoard(id, now))
}

async function readKmbBoard(id: string, now: number): Promise<{ ok: true; stop: KmbStopBoard } | { ok: false }> {
  const ids = kmbPoleIds(id)
  if (ids.length === 0) return { ok: false }
  const stops: KmbStopBoard[] = []
  let missed = 0
  await pool(ids, FETCH_LIMIT, async (stopId) => {
    const record = kmbStop(stopId)
    const rows = await fetchStop(stopId)
    if (!record || !rows) {
      missed += 1
      return
    }
    stops.push({
      id: stopId,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: kmbRoutesAt(stopId),
      calls: callsAt(rows, now),
      clock: "ready",
    })
  })
  const shown = mergeSamePoles(stops)[0]
  if (!shown || missed > 0) return { ok: false }
  return { ok: true, stop: shown }
}

function callsAt(rows: EtaRow[], now: number): KmbCall[] {
  const calls: KmbCall[] = []
  for (const row of rows) {
    if (row.eta_seq !== 1) continue
    if (!isListedKmbRow(row)) continue
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
      company: busCompany(route, text(row.co)),
    })
  }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route))
  return calls
}

function isScheduled(row: EtaRow): boolean {
  return row.rmk_en === "Scheduled Bus" || row.rmk_tc === "原定班次"
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

async function fetchStop(stopId: string): Promise<EtaRow[] | null> {
  try {
    const response = await etaQueue(() => fetchUpstream(`${ETA_ROOT}/${encodeURIComponent(stopId)}`, ETA_FRESH_MS, {
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
