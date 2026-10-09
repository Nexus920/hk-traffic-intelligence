
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

type Point = [number, number]

type Stop = {
  stop: string
  name_tc?: string
  name_en?: string
  lat?: string | number
  long?: string | number
}

type EtaRecord = {
  route?: string
  dest_tc?: string
  dest_en?: string
  eta?: string | null
  dir?: string
}

type ArrivalItem = {
  route: string
  operator: string
  destination: string
  eta: string
  stopName: string
  direction: string
}

type BusRow = {
  route: string
  operator: string
  destination: string
  stopName: string
  arrivals: string[]
}

const CONFIG = [
  {
    id: "lasalle",
    name: "喇沙小學附近",
    point: [114.1811, 22.3271] as Point,
    keywords: ["喇沙小學", "la salle primary"],
    routes: ["113", "12A", "1A", "22", "7B"],
  },
  {
    id: "beverly",
    name: "碧華花園",
    point: [114.1827, 22.32715] as Point,
    keywords: ["碧華花園", "beverly villas"],
    routes: ["1A", "20A", "22", "6D", "6E", "6P", "42", "98E"],
  },
] as const

const KMB = "https://data.etabus.gov.hk/v1/transport/kmb"
const CTB = "https://rt.data.gov.hk/v2/transport/citybus"

let kmbStopCache: { expires: number; data: Stop[] } | null = null
let ctbStopCache: { expires: number; data: Stop[] } | null = null
let responseCache: { expires: number; body: unknown } | null = null

async function readData<T>(url: string): Promise<T[]> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  })

  if (!response.ok) {
    throw new Error(`Transit API returned ${response.status}`)
  }

  const body = await response.json() as { data?: T[] }
  return Array.isArray(body.data) ? body.data : []
}

async function getStops(operator: "KMB" | "CTB"): Promise<Stop[]> {
  const now = Date.now()
  const cached = operator === "KMB" ? kmbStopCache : ctbStopCache

  if (cached && cached.expires > now) return cached.data

  const url = operator === "KMB"
    ? `${KMB}/stop`
    : `${CTB}/stop/CTB`

  const data = await readData<Stop>(url)
  const cache = { expires: now + 24 * 60 * 60 * 1000, data }

  if (operator === "KMB") kmbStopCache = cache
  else ctbStopCache = cache

  return data
}

function distanceMetres(a: Point, b: Point): number {
  const lat = (a[1] * Math.PI) / 180
  const dx = (a[0] - b[0]) * 111320 * Math.cos(lat)
  const dy = (a[1] - b[1]) * 111320
  return Math.sqrt(dx * dx + dy * dy)
}

function stopPosition(stop: Stop): Point | null {
  const lon = Number(stop.long)
  const lat = Number(stop.lat)

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

  return [lon, lat]
}

function stopName(stop: Stop): string {
  return stop.name_tc || stop.name_en || "附近巴士站"
}

function nearestStops(
  stops: Stop[],
  station: typeof CONFIG[number],
  operator: "KMB" | "CTB",
): Stop[] {
  const candidates = stops
    .map((stop) => {
      const point = stopPosition(stop)
      if (!point) return null

      return {
        stop,
        distance: distanceMetres(point, station.point),
        name: `${stop.name_tc ?? ""} ${stop.name_en ?? ""}`.toLowerCase(),
      }
    })
    .filter(
      (item): item is { stop: Stop; distance: number; name: string } =>
        item !== null && item.distance <= 300,
    )
    .sort((a, b) => a.distance - b.distance)

  if (operator === "KMB") {
    const boundaryStops = candidates.filter(
      (item) => /界限街|boundary street/i.test(item.name),
    )

    const keywordStops = boundaryStops.filter(
      (item) => station.keywords.some(
        (keyword) => item.name.includes(keyword.toLowerCase()),
      ),
    )

    const selected = keywordStops.length
      ? keywordStops
      : boundaryStops.length
        ? boundaryStops
        : candidates

    return selected.slice(0, 3).map((item) => item.stop)
  }

  const keywordStops = candidates.filter(
    (item) => station.keywords.some(
      (keyword) => item.name.includes(keyword.toLowerCase()),
    ),
  )

  return (keywordStops.length ? keywordStops : candidates)
    .slice(0, 1)
    .map((item) => item.stop)
}

function validEta(value: string | null | undefined, now: number): boolean {
  if (!value) return false

  const time = Date.parse(value)

  return Number.isFinite(time) &&
    time >= now - 30_000 &&
    time <= now + 90 * 60_000
}

function groupArrivals(
  items: ArrivalItem[],
  routeOrder: readonly string[],
): BusRow[] {
  const groups = new Map<string, {
    route: string
    operator: string
    destination: string
    stopName: string
    direction: string
    arrivals: string[]
  }>()

  for (const item of items) {
    const key = [
      item.operator,
      item.route,
      item.destination,
      item.direction,
    ].join("|")

    if (!groups.has(key)) {
      groups.set(key, {
        route: item.route,
        operator: item.operator,
        destination: item.destination,
        stopName: item.stopName,
        direction: item.direction,
        arrivals: [],
      })
    }

    const group = groups.get(key)!
    const minuteKey = item.eta.slice(0, 16)

    if (!group.arrivals.some((eta) => eta.slice(0, 16) === minuteKey)) {
      group.arrivals.push(item.eta)
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      route: group.route,
      operator: group.operator,
      destination: group.destination,
      stopName: group.stopName,
      arrivals: group.arrivals
        .sort((a, b) => Date.parse(a) - Date.parse(b))
        .slice(0, 2),
    }))
    .sort((a, b) => {
      const ai = routeOrder.indexOf(a.route)
      const bi = routeOrder.indexOf(b.route)

      if (ai !== bi) {
        return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
      }

      return Date.parse(a.arrivals[0] ?? "") -
        Date.parse(b.arrivals[0] ?? "")
    })
}

async function loadStation(
  station: typeof CONFIG[number],
  kmbStops: Stop[],
  ctbStops: Stop[],
) {
  const now = Date.now()
  const items: ArrivalItem[] = []
  const apiErrors: string[] = []

  const nearbyKmb = nearestStops(kmbStops, station, "KMB")
  const nearbyCtb = nearestStops(ctbStops, station, "CTB")

  const kmbResults = await Promise.all(
    nearbyKmb.map(async (stop) => {
      try {
        const records = await readData<EtaRecord>(
          `${KMB}/stop-eta/${encodeURIComponent(stop.stop)}`,
        )

        return records
          .filter((item) =>
            station.routes.some(
  (route) => route === String(item.route)
) &&
            validEta(item.eta, now),
          )
          .map((item) => ({
            route: String(item.route),
            operator: "九巴",
            destination: item.dest_tc || item.dest_en || "方向未明",
            eta: item.eta!,
            stopName: stopName(stop),
            direction: item.dir || "",
          }))
      } catch (error) {
  apiErrors.push(
    `九巴 ${stopName(stop)}：${
      error instanceof Error
        ? error.message
        : String(error)
    }`,
  )
  return []
}
    }),
  )

  items.push(...kmbResults.flat())

  const ctbResults = await Promise.all(
    nearbyCtb.flatMap((stop) =>
      station.routes.map(async (route) => {
        try {
          const records = await readData<EtaRecord>(
            `${CTB}/eta/CTB/${encodeURIComponent(stop.stop)}/${encodeURIComponent(route)}`,
          )

          return records
            .filter((item) =>
              String(item.route) === route &&
              validEta(item.eta, now),
            )
            .map((item) => ({
              route,
              operator: "城巴",
              destination: item.dest_tc || item.dest_en || "方向未明",
              eta: item.eta!,
              stopName: stopName(stop),
              direction: item.dir || "",
            }))
        } catch (error) {
  apiErrors.push(
    `城巴 ${stopName(stop)} ${route}：${
      error instanceof Error
        ? error.message
        : String(error)
    }`,
  )
  return []
}
      }),
    ),
  )

  items.push(...ctbResults.flat())

    return {
    id: station.id,
    name: station.name,
    buses: groupArrivals(items, station.routes),
    debug: {
      kmbStops: nearbyKmb.map((stop) => ({
        id: stop.stop,
        name: stopName(stop),
      })),
      ctbStops: nearbyCtb.map((stop) => ({
        id: stop.stop,
        name: stopName(stop),
      })),
      apiErrors,
    },
  }
}

export async function GET() {
  if (responseCache && responseCache.expires > Date.now()) {
    return NextResponse.json(responseCache.body)
  }

  const stopListErrors: string[] = []

  const [kmbStops, ctbStops] = await Promise.all([
    getStops("KMB").catch((error) => {
      stopListErrors.push(
        `九巴站點清單：${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      )
      return []
    }),

    getStops("CTB").catch((error) => {
      stopListErrors.push(
        `城巴站點清單：${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      )
      return []
    }),
  ])

  const stations = await Promise.all(
    CONFIG.map((station) =>
      loadStation(station, kmbStops, ctbStops),
    ),
  )

  const body = {
    ok: true,
    observedAt: new Date().toISOString(),
    stations,
    debug: {
      kmbStopTotal: kmbStops.length,
      ctbStopTotal: ctbStops.length,
      stopListErrors,
    },
  }

  responseCache = {
    expires: Date.now() + 45_000,
    body,
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  })
}
