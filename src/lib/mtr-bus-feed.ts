import { fetchUpstream } from "@/lib/upstream"
import { kmbReachMetres } from "@/lib/kmb-reach"
import { spreadWithin } from "@/lib/nearest"
import { mtrBusPolesNear, mtrBusVisits, parseMtrBusStops, type MtrBusPole } from "@/lib/mtr-bus"
import { etaQueue } from "@/lib/polite-fetch"
import type { CitybusCall, CitybusPlacesResponse, CitybusStopBoard } from "@/lib/types"

const STOPS_URL = "https://opendata.mtr.com.hk/data/mtr_bus_stops.csv"
const SCHEDULE_URL = "https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule"
const STOPS_MS = 12 * 60 * 60 * 1000
const SCHEDULE_MS = 60_000
const STOP_CAP = 24
// A few hundred poles in the whole feed, so Only can take a larger share than KMB.
const SOLO_CAP = 240

const schedules = new Map<string, { at: number; body: unknown }>()
let poles: MtrBusPole[] | null = null
let polesAt = 0

export async function loadMtrBusPlaces(lng: number, lat: number, zoom = Number.NaN, wide = false): Promise<CitybusPlacesResponse> {
  const list = await catalogue()
  if (!list) return { ok: false, error: "MTR bus stops failed", stops: [] }
  const radius = kmbReachMetres(zoom, lat)
  const found = wide ? spreadWithin(list, lng, lat, radius, SOLO_CAP) : mtrBusPolesNear(list, lng, lat, radius, STOP_CAP)
  return {
    ok: true,
    stops: found.map((pole) => ({
      id: pole.id,
      nameTc: pole.nameTc,
      nameEn: pole.nameEn,
      lng: pole.lng,
      lat: pole.lat,
      routes: pole.routes,
    })),
  }
}

export async function loadMtrBusBoard(id: string): Promise<{ ok: true; stop: CitybusStopBoard } | { ok: false }> {
  const list = await catalogue()
  const pole = list?.find((item) => item.id === id)
  if (!pole) return { ok: false }
  const calls: CitybusCall[] = []
  let missed = 0
  for (const route of pole.routes) {
    const body = await readSchedule(route)
    if (!body) {
      missed += 1
      continue
    }
    for (const visit of mtrBusVisits(pole.stopIds, route, body)) {
      calls.push({
        route: visit.route,
        destTc: "",
        destEn: "",
        eta: "",
        minutes: visit.minutes,
        scheduled: visit.scheduled,
        remarkTc: "",
        remarkEn: "",
      })
    }
  }
  if (pole.routes.length > 0 && missed === pole.routes.length) return { ok: false }
  calls.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || a.route.localeCompare(b.route, undefined, { numeric: true }))
  return {
    ok: true,
    stop: {
      id: pole.id,
      nameTc: pole.nameTc,
      nameEn: pole.nameEn,
      lng: pole.lng,
      lat: pole.lat,
      routes: pole.routes,
      calls,
      clock: "ready",
    },
  }
}

async function catalogue(): Promise<MtrBusPole[] | null> {
  if (poles && Date.now() - polesAt < STOPS_MS) return poles
  try {
    const response = await fetchUpstream(STOPS_URL, STOPS_MS, { timeoutMs: 8_000 })
    if (response.status !== 200) return poles
    const next = parseMtrBusStops(new TextDecoder().decode(response.body))
    if (next.length === 0) return poles
    poles = next
    polesAt = Date.now()
    return poles
  } catch {
    return poles
  }
}

async function readSchedule(route: string): Promise<unknown | null> {
  const hit = schedules.get(route)
  if (hit && Date.now() - hit.at < SCHEDULE_MS) return hit.body
  try {
    const body = await etaQueue(async () => {
      const response = await fetch(SCHEDULE_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; HKTrafficIntelligence/1.0; +https://hktraffic.keith-li.workers.dev)",
        },
        body: JSON.stringify({ language: "zh", routeName: route }),
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) return null
      return await response.json() as unknown
    })
    if (body) schedules.set(route, { at: Date.now(), body })
    return body
  } catch {
    return null
  }
}
