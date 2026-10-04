import { busCompany } from "@/lib/bus-company"
import { refreshKmbCatalogueSoon } from "@/lib/kmb-catalogue"
import { kmbStop, kmbStopsWithin } from "@/lib/kmb-network"
import { kmbRoutesAt, refreshKmbRoutesSoon } from "@/lib/kmb-routes"
import { isListedKmbRow, kmbReachMetres, STOP_CAP } from "@/lib/kmb-reach"
import { arrivalFailure, dueIds, ETA_FRESH_MS, forgetStale, heldRows, type HeldRows } from "@/lib/place-arrivals"
import { etaQueue, takeEtaTurn } from "@/lib/polite-fetch"
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

const remembered = new Map<string, HeldRows<EtaRow>>()

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
  return { ok: true, stops }
}

// Poles come from the catalogue. This only refreshes the arrival clock.
export async function loadKmbNear(lng: number, lat: number, now = Date.now(), zoom = Number.NaN): Promise<KmbResponse> {
  refreshKmbCatalogueSoon(now)
  refreshKmbRoutesSoon(now)
  forgetStale(remembered, now)
  const nearest = kmbStopsWithin(lng, lat, kmbReachMetres(zoom, lat), STOP_CAP)
  const turn = await takeEtaTurn(async () => {
    let missed = 0
    const due = dueIds(nearest.map((stop) => stop.id), remembered, now, nearest.length)
    await pool(due, FETCH_LIMIT, async (stopId) => {
      const rows = await fetchStop(stopId)
      if (rows) remembered.set(stopId, { at: now, rows })
      else missed += 1
    })
    return missed
  })
  const missed = turn ?? 0

  const stops: KmbStopBoard[] = []
  for (const stop of nearest) {
    const record = kmbStop(stop.id)
    if (!record) continue
    const held = heldRows(remembered.get(stop.id), now)
    stops.push({
      id: stop.id,
      nameTc: record.tc,
      nameEn: record.en,
      lng: record.lng,
      lat: record.lat,
      routes: kmbRoutesAt(stop.id),
      calls: callsAt(held ?? [], now),
      clock: held == null ? "waiting" : "ready",
    })
  }
  const error = arrivalFailure(missed, stops.map((stop) => stop.calls.length), "KMB arrivals failed")
  return {
    ok: true,
    ...(error ? { error } : {}),
    observedAt: new Date(now).toISOString(),
    stops,
    cacheable: turn !== null && missed === 0 && stops.every((stop) => stop.clock === "ready"),
  }
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
  return calls.slice(0, 12)
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
