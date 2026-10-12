import { NextResponse } from "next/server"
import { buildCtbEtaApiUrl, buildCtbRouteStopApiUrl } from "@/lib/ctb-api-paths"
import { LOCAL_GMB_MONITORING } from "@/lib/local-gmb-monitoring"
import {
  buildCtbEstimatedPositions,
  type CtbEtaRecord,
  type CtbRouteStopCoordinate,
} from "@/lib/ctb-estimated-position"
import {
  buildKmbEstimatedPositions,
  type KmbEtaRecord,
  type KmbEstimatedPositionDiagnostics,
  type KmbRouteStopCoordinate,
} from "@/lib/kmb-estimated-position"
import {
  estimateBetweenStops,
  estimatedMinibusCollection,
  estimatesFromEtaObservations,
  locateOnRouteFromUpcomingEta,
  type GmbEtaObservation,
  type RouteStopCoordinate,
} from "@/lib/gmb-estimated-position"

const GMB_STOP_ALLOWLIST: Record<string, number[]> = {
  
  // 喇沙小學附近：只保留站名包含「喇沙小學」的站點
  lasalle: [
    20017179, // 界限街，近喇沙小學
    20015162, // 界限街，近喇沙小學（69A）
  ],


  
  // 碧華花園：只保留站名明確包含「碧華花園」的站點
  beverly: [
    20014203, // 界限街，近碧華花園第八座
    20014164, // 喇沙利道，近碧華花園第六座
    20023101, // 界限街，碧華花園第6座外
  ],

}

export const dynamic = "force-dynamic"

type Point = [number, number]

type Stop = {
  stop: string
  name_tc?: string
  name_en?: string
  lat?: string | number
  long?: string | number
  routes?: string[]
}

type HkBusStaticDatabase = {
  routeList: Record<
    string,
    {
      route: string
      co: string[]
      orig: { en: string; zh: string }
      dest: { en: string; zh: string }
      stops: Record<string, string[]>
      bound: Record<string, string>
      serviceType: string
      gtfsId: string
    }
  >
  stopList: Record<
    string,
    {
      location: {
        lat: number
        lng: number
      }
      name: {
        en: string
        zh: string
      }
    }
  >
  stopMap: Record<string, Array<[string, string]>>
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
  LOCAL_GMB_MONITORING.lasalle,
  LOCAL_GMB_MONITORING.beverly,
] as const

const KMB = "https://data.etabus.gov.hk/v1/transport/kmb"
const CTB = "https://rt.data.gov.hk/v2/transport/citybus"

// 香港綠色專線小巴官方 ETA API
const GMB = "https://data.etagmb.gov.hk"

type GmbRouteDirection = {
  route_seq: number
  orig_tc?: string
  dest_tc?: string
  orig_en?: string
  dest_en?: string
}

type GmbRouteVariant = {
  route_id: string
  directions?: GmbRouteDirection[]
}

type GmbRouteStop = {
  stop_id: string
  stop_seq: number
  name_tc?: string
  name_en?: string
}

type GmbStopInfo = {
  stop_id: string
  coordinates?: {
    wgs84?: {
      latitude?: number
      longitude?: number
    }
  }
}

type GmbEtaItem = {
  route_seq: number
  stop_seq: number
  eta?: Array<{
    eta_seq?: number
    timestamp?: string
    remarks_tc?: string
    remarks_en?: string
  }>
}

type GmbNearbyStop = {
  stop: string
  name_tc?: string
  name_en?: string
  lat: number
  long: number
  route_id: string
  route: string
  route_seq: number
  stop_seq: number
  destination: string
}

let gmbStopsCache: {
  expires: number
  data: GmbNearbyStop[]
  complete: boolean
} | null = null


const gmbStopsDebug = {
  variants: 0,
  routeStops: 0,
  uniqueStopIds: 0,
  stopInfoFound: 0,
  nearbyStops: 0,
  routeErrors: [] as string[],
}


const CTB_ROUTES = ["20A", "22", "113"] as const

let kmbStopCache: { expires: number; data: Stop[] } | null = null
let ctbStopCache: { expires: number; data: Stop[] } | null = null
let ctbRouteCoordinatesCache: { expires: number; data: CtbRouteStopCoordinate[] } | null = null
let ctbEstimatedPositionsCache: { expires: number; data: GeoJSON.FeatureCollection } | null = null
// Preserve CTB upstream-stage counts in the API response so an empty collection
// can be traced to the exact data stage without provider-side logs.
const ctbApiDiagnostics = {
  routeStopQueries: 0,
  routeStopRows: 0,
  routeStopErrors: 0,
  routeStopErrorDetails: [] as string[],
  uniqueRouteStopIds: 0,
  coordinateRowsJoined: 0,
  localRouteVariants: 0,
  etaQueries: 0,
  etaQueriesWithRows: 0,
  etaRowsReceived: 0,
  etaQueryErrors: 0,
  etaErrorDetails: [] as string[],
  lastEstimateError: null as string | null,
}
const ctbRouteEtaCache = new Map<string, { expires: number; data: CtbEtaRecord[] }>()
let ctbEstimatedPositionDebug: KmbEstimatedPositionDiagnostics & {
  routeStopCoordinates: number
  routeEtaQueries: number
  routeEtaErrors: number
  lastError: string | null
} = {
  routeVariants: 0,
  localRouteVariants: 0,
  localStops: 0,
  etaRowsChecked: 0,
  observedSegments: 0,
  fallbackSegments: 0,
  routesWithFallback: 0,
  anchorsExamined: 0,
  anchorsLocated: 0,
  anchorsWithoutTiming: 0,
  anchorsOutsideLocalArea: 0,
  estimatedVehicles: 0,
  apiErrors: 0,
  routeStopCoordinates: 0,
  routeEtaQueries: 0,
  routeEtaErrors: 0,
  lastError: null,
}
let kmbRouteCoordinatesCache: { expires: number; data: KmbRouteStopCoordinate[] } | null = null
let kmbEstimatedPositionsCache: { expires: number; data: GeoJSON.FeatureCollection } | null = null
const kmbRouteEtaCache = new Map<string, { expires: number; data: KmbEtaRecord[] }>()
let kmbEstimatedPositionDebug: KmbEstimatedPositionDiagnostics & {
  routeStopCoordinates: number
  routeEtaQueries: number
  routeEtaErrors: number
} = {
  routeVariants: 0,
  localRouteVariants: 0,
  localStops: 0,
  etaRowsChecked: 0,
  observedSegments: 0,
  fallbackSegments: 0,
  routesWithFallback: 0,
  anchorsExamined: 0,
  anchorsLocated: 0,
  anchorsWithoutTiming: 0,
  anchorsOutsideLocalArea: 0,
  estimatedVehicles: 0,
  apiErrors: 0,
  routeStopCoordinates: 0,
  routeEtaQueries: 0,
  routeEtaErrors: 0,
}
let responseCache: { expires: number; body: unknown } | null = null
let gmbEstimatedPositionsCache: { expires: number; data: GeoJSON.FeatureCollection } | null = null
let gmbEstimatedPositionDebug = {
  localStops: 0,
  queriedStops: 0,
  etaEntriesChecked: 0,
  segmentsWithEtaTravelTimes: 0,
  segmentsFilledBySpeedFallback: 0,
  routesWithSpeedFallback: 0,
  fallbackSpeedKmh: null as number | null,
  anchorsExamined: 0,
  anchorsLocated: 0,
  anchorsWithoutSegmentTiming: 0,
  anchorsOutsideLocalArea: 0,
  candidateSegments: 0,
  estimatedVehicles: 0,
  apiErrors: 0,
}

const HK_BUS_DB_URLS = [
  "https://data.hkbus.app/routeFareList.min.json",
  "https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json",
]

let hkBusDbCache: {
  expires: number
  data: HkBusStaticDatabase
} | null = null

async function getHkBusDatabase(): Promise<HkBusStaticDatabase> {
  if (hkBusDbCache && hkBusDbCache.expires > Date.now()) {
    return hkBusDbCache.data
  }

  for (const url of HK_BUS_DB_URLS) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      })

      if (!response.ok) continue

      const data =
        await response.json() as HkBusStaticDatabase

      if (!data.routeList || !data.stopList || !data.stopMap) {
        continue
      }

      hkBusDbCache = {
        expires: Date.now() + 24 * 60 * 60 * 1000,
        data,
      }

      return data
    } catch {
      // 嘗試下一個資料來源
    }
  }

  throw new Error("無法讀取整合式巴士路線資料")
}
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
async function readSingleStop(url: string): Promise<Stop> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  })

  if (!response.ok) {
    throw new Error(`Transit API returned ${response.status}`)
  }

  const body = await response.json() as { data?: Stop }

  if (!body.data) {
    throw new Error("Transit API response has no stop data")
  }

  return body.data
}
async function getStops(
  operator: "KMB" | "CTB",
): Promise<Stop[]> {
  const now = Date.now()

  const cached =
    operator === "KMB"
      ? kmbStopCache
      : ctbStopCache

  if (cached && cached.expires > now) {
    return cached.data
  }

  
  
const url =
  operator === "KMB"
    ? `${KMB}/stop`
    : "https://winstonma.github.io/MMM-HK-Transport-ETA-Data/ctb/stops/allstops.json"



  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  })

  if (!response.ok) {
    throw new Error(
      `${operator} stop list returned ${response.status}`,
    )
  }

  const body: unknown = await response.json()

  let data: Stop[] = []

  if (operator === "KMB") {
    const payload = body as { data?: unknown }

    data = Array.isArray(payload.data)
      ? payload.data as Stop[]
      : []
  } else {
    let entries: unknown[] = []

    if (Array.isArray(body)) {
      entries = body
    } else if (
      body !== null &&
      typeof body === "object"
    ) {
      const payload =
        body as Record<string, unknown>

      entries = Array.isArray(payload.data)
        ? payload.data
        : Object.values(payload)
    }

    data = entries.filter(
      (item): item is Stop => {
        if (
          item === null ||
          typeof item !== "object"
        ) {
          return false
        }

        const stop =
          item as Record<string, unknown>

        return (
          typeof stop.stop === "string" &&
          stop.lat !== undefined &&
          stop.long !== undefined
        )
      },
    )
  }

  if (data.length === 0) {
    throw new Error(
      `${operator} stop list is empty or invalid`,
    )
  }

  const cache = {
    expires: now + 24 * 60 * 60 * 1000,
    data,
  }

  if (operator === "KMB") {
    kmbStopCache = cache
  } else {
    ctbStopCache = cache
  }

  return data
}


type CloudflareCacheStorage = CacheStorage & {
  default?: Cache
}

async function gmbJson<T>(url: string): Promise<T> {
  // Cache stable route/stop metadata at the edge for a day and ETA responses
  // briefly. Cache API is used separately from fetch so Next/Vinext's dynamic
  // no-store request mode cannot conflict with Cloudflare cf.cacheTtl options.
  const isEtaRequest = url.includes("/eta/")
  const cacheTtlSeconds = isEtaRequest ? 20 : 24 * 60 * 60
  const cache = (globalThis as typeof globalThis & {
    caches?: CloudflareCacheStorage
  }).caches?.default
  const cacheKey = new Request(url, { method: "GET" })

  if (cache) {
    try {
      const cached = await cache.match(cacheKey)
      if (cached) return await cached.json() as T
    } catch {
      // A cache miss or cache API issue should fall through to the official API.
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(
      `GMB API returned ${response.status}: ${detail.slice(0, 200)}`,
    )
  }

  const body = await response.json() as T
  if (cache) {
    try {
      const cachedResponse = new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": `public, max-age=${cacheTtlSeconds}`,
        },
      })
      await cache.put(cacheKey, cachedResponse)
    } catch {
      // Cache storage is an optimization; never fail the live data request.
    }
  }

  return body
}


async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => worker(),
    ),
  )

  return results
}

async function getGmbStops(): Promise<GmbNearbyStop[]> {
  const previousCompleteCache = gmbStopsCache?.complete ? gmbStopsCache : null
  if (gmbStopsCache && gmbStopsCache.expires > Date.now()) {
    return gmbStopsCache.data
  }

  // Avoid carrying old counters forward when a refresh has to be attempted.
  gmbStopsDebug.variants = 0
  gmbStopsDebug.routeStops = 0
  gmbStopsDebug.uniqueStopIds = 0
  gmbStopsDebug.stopInfoFound = 0
  gmbStopsDebug.nearbyStops = 0
  gmbStopsDebug.routeErrors.length = 0

  // 合併兩個監測位置的指定小巴路線
  const routes = Array.from(
    new Set(CONFIG.flatMap((station) => station.gmbRoutes)),
  )

  const regions = ["HKI", "KLN", "NT"]

  const variants = (
    await mapWithConcurrency(routes, 2, async (route) => {
      // Query regions serially for each route to avoid bursting the official API.
      const results: Array<Array<{ route: string; variant: GmbRouteVariant }>> = []
      for (const region of regions) {
        try {
          const result = await gmbJson<{
            data?: GmbRouteVariant[]
          }>(
            `${GMB}/route/${region}/${encodeURIComponent(route)}`,
          )
          results.push((result.data ?? []).map((variant) => ({ route, variant })))
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error)

          gmbStopsDebug.routeErrors.push(
            `${region}/${route}: ${message}`,
          )
          console.error(
            `[GMB route API] region=${region}, route=${route}:`,
            message,
          )
          results.push([])
        }
      }
      return results.flat()
    })
  ).flat()
  
  gmbStopsDebug.variants = variants.length

  const routeStopGroups = await mapWithConcurrency(
    variants,
    3,
    async ({ route, variant }) => {
      const directions = variant.directions ?? []

      return (
        await mapWithConcurrency(directions, 2, async (direction) => {
          try {
            const result = await gmbJson<{
              data?: { route_stops?: GmbRouteStop[] }
            }>(
              `${GMB}/route-stop/${encodeURIComponent(variant.route_id)}/${direction.route_seq}`,
            )

            return (result.data?.route_stops ?? []).map((stop) => ({
              route,
              variant,
              direction,
              stop,
            }))
                    
          } catch (error) {
            console.error(
              `[GMB route-stop API] route=${route}, route_id=${variant.route_id}, route_seq=${direction.route_seq}:`,
              error instanceof Error ? error.message : String(error),
            )
            return []
          }

        })
      ).flat()
    },
  )

  const routeStops = routeStopGroups.flat()

  
  gmbStopsDebug.routeStops = routeStops.length


  // 同一站點可能由多條路線共用，先合併站點 ID
  const uniqueStopIds = Array.from(
    new Set(routeStops.map((item) => item.stop.stop_id)),
  )
  
  gmbStopsDebug.uniqueStopIds = uniqueStopIds.length

  
  const stopInfoList = await mapWithConcurrency(
    uniqueStopIds,
    4,
    async (stopId) => {
      try {
        const result = await gmbJson<{ data?: GmbStopInfo }>(
          `${GMB}/stop/${encodeURIComponent(stopId)}`,
        )

        return result.data
          ? { stop_id: stopId, info: result.data }
          : null
      } catch {
        return null
      }
    },
  )

  const stopInfoMap = new Map(
    stopInfoList
      .filter(
        (item): item is {
          stop_id: string
          info: GmbStopInfo
        } => item !== null,
      )
      .map((item) => [item.stop_id, item.info]),
  )
  
  gmbStopsDebug.stopInfoFound = stopInfoMap.size


  const nearbyStops: GmbNearbyStop[] = []


  for (const item of routeStops) {
    const info = stopInfoMap.get(item.stop.stop_id)
    const coordinates = info?.coordinates?.wgs84
    const lat = Number(coordinates?.latitude)
    const long = Number(coordinates?.longitude)

    if (!Number.isFinite(lat) || !Number.isFinite(long)) continue

    nearbyStops.push({
      stop: item.stop.stop_id,
      name_tc: item.stop.name_tc,
      name_en: item.stop.name_en,
      lat,
      long,
      route_id: item.variant.route_id,
      route: item.route,
      route_seq: item.direction.route_seq,
      stop_seq: item.stop.stop_seq,
      destination:
        item.direction.dest_tc ||
        item.direction.dest_en ||
        "方向未明",
    })
  }
  
  gmbStopsDebug.nearbyStops = nearbyStops.length

  
  const routesWithVariants = new Set(variants.map((item) => item.route))
  const missingRoutes = routes.filter((route) => !routesWithVariants.has(route))
  const stopInfoCoverage = uniqueStopIds.length === 0
    ? 0
    : stopInfoMap.size / uniqueStopIds.length
  const cacheComplete = nearbyStops.length > 0 &&
    missingRoutes.length === 0 &&
    stopInfoCoverage >= 0.9

  // A partial upstream response must not poison the 24-hour cache. If this
  // isolate has a previously complete result, continue serving it briefly while
  // retrying the refresh; otherwise keep partial data only for a short interval.
  if (!cacheComplete && previousCompleteCache) {
    gmbStopsCache = {
      expires: Date.now() + 30_000,
      data: previousCompleteCache.data,
      complete: true,
    }
    return previousCompleteCache.data
  }

  gmbStopsCache = {
    expires: Date.now() + (cacheComplete ? 24 * 60 * 60 * 1000 : 30_000),
    data: nearbyStops,
    complete: cacheComplete,
  }

  return nearbyStops
}


async function loadGmbArrivals(
  station: typeof CONFIG[number],
  stops: GmbNearbyStop[],
): Promise<ArrivalItem[]> {
  
  const now = Date.now()

  const allowedStopIds =
    GMB_STOP_ALLOWLIST[station.id] ?? []

  const candidates = stops
    .filter((stop) => {
      if (!new Set<string>(station.gmbRoutes).has(stop.route)) {
        return false
      }

      if (!allowedStopIds.includes(Number(stop.stop))) {
        return false
      }
            if (
        station.id === "lasalle" &&
        !((stop.name_tc ?? "").includes("喇沙小學"))
      ) {
        return false
      }

      const stopPoint: Point = [stop.long, stop.lat]
      const thisDistance = distanceMetres(
        stopPoint,
        station.point,
      )

      if (thisDistance > 250) {
        return false
      }

      return true
    })
    .sort(
      (a, b) =>
        distanceMetres([a.long, a.lat], station.point) -
        distanceMetres([b.long, b.lat], station.point),
    )

     
  // 每條路線、每個方向保留最近站點
  const nearestByRouteDirection = new Map<
    string,
    GmbNearbyStop
  >()

  for (const stop of candidates) {
    const key = `${stop.route}|${stop.route_seq}`

    if (!nearestByRouteDirection.has(key)) {
      nearestByRouteDirection.set(key, stop)
    }
  }

  const nearby = Array.from(
    nearestByRouteDirection.values(),
  )

  const results = await mapWithConcurrency(
    nearby,
    8,
    async (stop): Promise<ArrivalItem[]> => {
      try {
        const result = await gmbJson<{
          data?: GmbEtaItem[]
        }>(
          `${GMB}/eta/route-stop/${encodeURIComponent(
            stop.route_id,
          )}/${encodeURIComponent(stop.stop)}`,
        )

        return (result.data ?? [])
          .filter(
            (record) =>
              record.route_seq === stop.route_seq &&
              record.stop_seq === stop.stop_seq,
          )
          .flatMap((record) =>
            (record.eta ?? [])
              .filter((eta) =>
                validEta(eta.timestamp, now),
              )
              .map((eta) => {
                const remark = eta.remarks_tc?.trim()

                const isStatusRemark =
                  remark === "未開出" ||
                  remark === "行車受阻"

                return {
                  route: stop.route,
                  operator: "綠色專線小巴",
                  destination:
                    !remark || isStatusRemark
                      ? stop.destination
                      : remark,
                  eta: eta.timestamp!,
                  stopName:
                    stop.name_tc ||
                    stop.name_en ||
                    "附近小巴站",
                  direction: String(stop.route_seq),
                }
              }),
          )
      } catch {
        return []
      }
    },
  )

  return results.flat()
}



type KmbRouteStopApiRecord = {
  route?: string
  bound?: string
  service_type?: string | number
  seq?: string | number
  stop?: string
}

const KMB_ROUTE_COORDINATES_TTL_MS = 24 * 60 * 60 * 1000
const KMB_ROUTE_ETA_TTL_MS = 20_000
const KMB_ESTIMATED_POSITION_TTL_MS = 20_000
const KMB_ESTIMATED_POSITION_RADIUS_METRES = 450

async function getKmbRouteCoordinates(stops: Stop[], now = Date.now()): Promise<KmbRouteStopCoordinate[]> {
  if (kmbRouteCoordinatesCache && kmbRouteCoordinatesCache.expires > now) {
    return kmbRouteCoordinatesCache.data
  }

  // This official daily resource provides route, direction, service type,
  // stop sequence and stop ID. Coordinates are joined only from KMB's stop API.
  const routeRows = await readData<KmbRouteStopApiRecord>(KMB + "/route-stop")
  const stopById = new Map(stops.map((stop) => [stop.stop, stop]))
  const selectedRoutes = new Set<string>(CONFIG.flatMap((station) => [...station.routes]))
  const allCoordinates: KmbRouteStopCoordinate[] = []

  for (const row of routeRows) {
    const route = String(row.route ?? "").trim()
    const bound = String(row.bound ?? "")
    const serviceType = String(row.service_type ?? "").trim()
    const stopSeq = Number(row.seq)
    const stopId = String(row.stop ?? "").trim()
    if (
      !selectedRoutes.has(route) ||
      (bound !== "I" && bound !== "O") ||
      !serviceType ||
      !Number.isInteger(stopSeq) ||
      stopSeq <= 0 ||
      !stopId
    ) continue

    const stop = stopById.get(stopId)
    if (!stop) continue
    const lng = Number(stop.long)
    const lat = Number(stop.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    allCoordinates.push({
      route,
      bound,
      serviceType,
      stopSeq,
      stopId,
      lng,
      lat,
    })
  }

  // Keep only route variants that actually serve one of the dashboard's
  // route-specific monitoring areas, while retaining their full stop sequence
  // so the estimator can look upstream from nearby stops.
  const localVariantKeys = new Set<string>()
  for (const stop of allCoordinates) {
    const key = [stop.route, stop.bound, stop.serviceType].join("|")
    if (CONFIG.some((station) =>
      station.routes.some((route) => route === stop.route) &&
      distanceMetres([stop.lng, stop.lat], station.point) <= KMB_ESTIMATED_POSITION_RADIUS_METRES
    )) localVariantKeys.add(key)
  }
  const localCoordinates = allCoordinates.filter((stop) =>
    localVariantKeys.has([stop.route, stop.bound, stop.serviceType].join("|"))
  )

  if (localCoordinates.length === 0) {
    throw new Error("KMB official route-stop list did not contain selected routes near the local monitoring points")
  }

  kmbRouteCoordinatesCache = {
    expires: now + KMB_ROUTE_COORDINATES_TTL_MS,
    data: localCoordinates,
  }
  return localCoordinates
}

async function loadLocalKmbEstimatedPositions(
  kmbStops: Stop[],
  now = Date.now(),
): Promise<GeoJSON.FeatureCollection> {
  if (kmbEstimatedPositionsCache && kmbEstimatedPositionsCache.expires > now) {
    return kmbEstimatedPositionsCache.data
  }

  kmbEstimatedPositionDebug = {
    routeVariants: 0,
    localRouteVariants: 0,
    localStops: 0,
    etaRowsChecked: 0,
    observedSegments: 0,
    fallbackSegments: 0,
    routesWithFallback: 0,
    anchorsExamined: 0,
    anchorsLocated: 0,
    anchorsWithoutTiming: 0,
    anchorsOutsideLocalArea: 0,
    estimatedVehicles: 0,
    apiErrors: 0,
    routeStopCoordinates: 0,
    routeEtaQueries: 0,
    routeEtaErrors: 0,
  }

  const routeStops = await getKmbRouteCoordinates(kmbStops, now)
  const routeServiceTypes = Array.from(new Set(
    routeStops.map((stop) => [stop.route, stop.serviceType].join("|"))
  ))
  kmbEstimatedPositionDebug.routeStopCoordinates = routeStops.length
  kmbEstimatedPositionDebug.routeEtaQueries = routeServiceTypes.length

  const etaResponses = await mapWithConcurrency(routeServiceTypes, 4, async (routeServiceType) => {
    const separator = routeServiceType.lastIndexOf("|")
    const route = routeServiceType.slice(0, separator)
    const serviceType = routeServiceType.slice(separator + 1)
    const cached = kmbRouteEtaCache.get(routeServiceType)
    if (cached && cached.expires > now) {
      return { key: routeServiceType, rows: cached.data }
    }

    try {
      // The official route-eta resource returns ETA rows for the whole route,
      // avoiding a separate request for every stop on a local route.
      const rows = await readData<KmbEtaRecord>(
        KMB + "/route-eta/" + encodeURIComponent(route) + "/" + encodeURIComponent(serviceType),
      )
      kmbRouteEtaCache.set(routeServiceType, {
        expires: now + KMB_ROUTE_ETA_TTL_MS,
        data: rows,
      })
      return { key: routeServiceType, rows }
    } catch (error) {
      kmbEstimatedPositionDebug.routeEtaErrors += 1
      kmbEstimatedPositionDebug.apiErrors += 1
      console.error(
        "[KMB estimated positions] route=" + route + " service_type=" + serviceType + ":",
        error instanceof Error ? error.message : String(error),
      )
      return { key: routeServiceType, rows: [] as KmbEtaRecord[] }
    }
  })

  const result = buildKmbEstimatedPositions(
    routeStops,
    etaResponses.flatMap((response) => response.rows),
    CONFIG.map((station) => ({
      id: station.id,
      name: station.name,
      point: station.point,
      routes: station.routes,
    })),
    now,
    KMB_ESTIMATED_POSITION_RADIUS_METRES,
  )
  kmbEstimatedPositionDebug = {
    ...result.diagnostics,
    apiErrors: result.diagnostics.apiErrors + kmbEstimatedPositionDebug.apiErrors,
    routeStopCoordinates: routeStops.length,
    routeEtaQueries: routeServiceTypes.length,
    routeEtaErrors: kmbEstimatedPositionDebug.routeEtaErrors,
  }
  kmbEstimatedPositionsCache = {
    expires: now + KMB_ESTIMATED_POSITION_TTL_MS,
    data: result.collection,
  }
  return result.collection
}

type CtbRouteStopApiRecord = {
  co?: string
  route?: string
  dir?: string
  seq?: string | number
  stop?: string
  data_timestamp?: string
}

const CTB_ROUTE_COORDINATES_TTL_MS = 24 * 60 * 60 * 1000
const CTB_ROUTE_ETA_TTL_MS = 20_000
const CTB_ESTIMATED_POSITION_TTL_MS = 20_000
const CTB_ESTIMATED_POSITION_RADIUS_METRES = 450

async function getCtbRouteCoordinates(
  stops: Stop[],
  now = Date.now(),
): Promise<CtbRouteStopCoordinate[]> {
  if (ctbRouteCoordinatesCache && ctbRouteCoordinatesCache.expires > now) {
    return ctbRouteCoordinatesCache.data
  }

  // Official CTB V2 route-stop API provides stop sequence and direction.
  // Inbound/outbound URLs return direction codes I/O in each response row.
  const requests = CTB_ROUTES.flatMap((route) =>
    (["inbound", "outbound"] as const).map((direction) => ({ route, direction }))
  )
  ctbApiDiagnostics.routeStopQueries = requests.length
  ctbApiDiagnostics.routeStopRows = 0
  ctbApiDiagnostics.routeStopErrors = 0
  ctbApiDiagnostics.routeStopErrorDetails = []
  ctbApiDiagnostics.uniqueRouteStopIds = 0
  ctbApiDiagnostics.coordinateRowsJoined = 0
  ctbApiDiagnostics.localRouteVariants = 0

  const routeResults = await mapWithConcurrency(requests, 3, async ({ route, direction }) => {
    try {
      const rows = await readData<CtbRouteStopApiRecord>(
        buildCtbRouteStopApiUrl(CTB, route, direction),
      )
      return { route, direction, rows, error: null as string | null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("[CTB route-stop] route=" + route + " direction=" + direction + ":", message)
      return { route, direction, rows: [] as CtbRouteStopApiRecord[], error: message }
    }
  })
  ctbApiDiagnostics.routeStopRows = routeResults.reduce((total, result) => total + result.rows.length, 0)
  const routeStopErrors = routeResults.filter((result) => result.error !== null)
  ctbApiDiagnostics.routeStopErrors = routeStopErrors.length
  ctbApiDiagnostics.routeStopErrorDetails = routeStopErrors
    .slice(0, 6)
    .map((result) => result.route + "/" + result.direction + ": " + result.error)

  const stopById = new Map(stops.map((stop) => [stop.stop, stop]))
  const routeRows = routeResults.flatMap((result) =>
    result.rows.filter((row) => String(row.route ?? result.route) === result.route)
  )
  const stopIds = Array.from(new Set(routeRows.map((row) => String(row.stop ?? "").trim()).filter(Boolean)))
  ctbApiDiagnostics.uniqueRouteStopIds = stopIds.length
  const missingStopIds = stopIds.filter((stopId) => {
    const stop = stopById.get(stopId)
    return !stop || !Number.isFinite(Number(stop.long)) || !Number.isFinite(Number(stop.lat))
  })

  // The existing stop catalogue is useful for bulk joining. Any missing CTB
  // coordinates are recovered from CTB's own stop endpoint, not guessed.
  const missingStops = await mapWithConcurrency(missingStopIds, 4, async (stopId) => {
    try {
      return await readSingleStop(CTB + "/stop/" + encodeURIComponent(stopId))
    } catch (error) {
      console.error(
        "[CTB stop detail] stop=" + stopId + ":",
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
  })
  for (const stop of missingStops) {
    if (stop) stopById.set(stop.stop, stop)
  }

  const allCoordinates: CtbRouteStopCoordinate[] = []
  for (const row of routeRows) {
    const route = String(row.route ?? "").trim()
    const bound = String(row.dir ?? "")
    const stopSeq = Number(row.seq)
    const stopId = String(row.stop ?? "").trim()
    if (
      !CTB_ROUTES.some((selectedRoute) => selectedRoute === route) ||
      (bound !== "I" && bound !== "O") ||
      !Number.isInteger(stopSeq) ||
      stopSeq <= 0 ||
      !stopId
    ) continue

    const stop = stopById.get(stopId)
    if (!stop) continue
    const lng = Number(stop.long)
    const lat = Number(stop.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue

    allCoordinates.push({
      route,
      bound,
      serviceType: "CTB",
      stopSeq,
      stopId,
      lng,
      lat,
    })
  }

  const localVariantKeys = new Set<string>()
  for (const stop of allCoordinates) {
    const key = [stop.route, stop.bound, stop.serviceType].join("|")
    if (CONFIG.some((station) =>
      station.routes.some((route) => route === stop.route) &&
      distanceMetres([stop.lng, stop.lat], station.point) <= CTB_ESTIMATED_POSITION_RADIUS_METRES
    )) localVariantKeys.add(key)
  }
  const localCoordinates = allCoordinates.filter((stop) =>
    localVariantKeys.has([stop.route, stop.bound, stop.serviceType].join("|"))
  )
  ctbApiDiagnostics.coordinateRowsJoined = allCoordinates.length
  ctbApiDiagnostics.localRouteVariants = localVariantKeys.size

  if (localCoordinates.length === 0) {
    ctbApiDiagnostics.lastEstimateError =
      "No selected CTB route variants had coordinates within " + CTB_ESTIMATED_POSITION_RADIUS_METRES + "m of the monitoring points"
    throw new Error("CTB official route-stop list did not contain selected routes near the local monitoring points")
  }

  ctbRouteCoordinatesCache = {
    expires: now + CTB_ROUTE_COORDINATES_TTL_MS,
    data: localCoordinates,
  }
  return localCoordinates
}

async function loadLocalCtbEstimatedPositions(
  ctbStops: Stop[],
  now = Date.now(),
): Promise<GeoJSON.FeatureCollection> {
  if (ctbEstimatedPositionsCache && ctbEstimatedPositionsCache.expires > now) {
    return ctbEstimatedPositionsCache.data
  }

  ctbApiDiagnostics.etaQueries = 0
  ctbApiDiagnostics.etaQueriesWithRows = 0
  ctbApiDiagnostics.etaRowsReceived = 0
  ctbApiDiagnostics.etaQueryErrors = 0
  ctbApiDiagnostics.etaErrorDetails = []
  ctbApiDiagnostics.lastEstimateError = null
  ctbEstimatedPositionDebug = {
    routeVariants: 0,
    localRouteVariants: 0,
    localStops: 0,
    etaRowsChecked: 0,
    observedSegments: 0,
    fallbackSegments: 0,
    routesWithFallback: 0,
    anchorsExamined: 0,
    anchorsLocated: 0,
    anchorsWithoutTiming: 0,
    anchorsOutsideLocalArea: 0,
    estimatedVehicles: 0,
    apiErrors: 0,
    routeStopCoordinates: 0,
    routeEtaQueries: 0,
    routeEtaErrors: 0,
    lastError: null,
  }

  const routeStops = await getCtbRouteCoordinates(ctbStops, now)
  const localStopsByVariant = new Map<string, CtbRouteStopCoordinate[]>()
  for (const stop of routeStops) {
    const key = [stop.route, stop.bound, stop.serviceType].join("|")
    const isLocal = CONFIG.some((station) =>
      station.routes.some((route) => route === stop.route) &&
      distanceMetres([stop.lng, stop.lat], station.point) <= CTB_ESTIMATED_POSITION_RADIUS_METRES
    )
    if (!isLocal) continue
    const list = localStopsByVariant.get(key) ?? []
    list.push(stop)
    localStopsByVariant.set(key, list)
  }

  // Request ETAs only for nearby selected routes plus upstream context stops.
  // CTB publishes ETA per stop and route rather than a whole-route ETA feed.
  const etaTargetsByKey = new Map<string, CtbRouteStopCoordinate>()
  for (const [variantKey, localStops] of localStopsByVariant) {
    const minSeq = Math.min(...localStops.map((stop) => stop.stopSeq))
    const maxSeq = Math.max(...localStops.map((stop) => stop.stopSeq))
    for (const stop of routeStops) {
      if (
        [stop.route, stop.bound, stop.serviceType].join("|") !== variantKey ||
        stop.stopSeq < Math.max(1, minSeq - 8) ||
        stop.stopSeq > maxSeq + 2
      ) continue
      etaTargetsByKey.set([stop.route, stop.stopId].join("|"), stop)
    }
  }

  ctbEstimatedPositionDebug.routeStopCoordinates = routeStops.length
  ctbEstimatedPositionDebug.routeEtaQueries = etaTargetsByKey.size
  const etaResponses = await mapWithConcurrency([...etaTargetsByKey.values()], 4, async (stop) => {
    const cacheKey = [stop.route, stop.stopId].join("|")
    const cached = ctbRouteEtaCache.get(cacheKey)
    if (cached && cached.expires > now) {
      return { key: cacheKey, rows: cached.data, error: null as string | null }
    }

    try {
      const rows = await readData<CtbEtaRecord>(
        buildCtbEtaApiUrl(CTB, stop.stopId, stop.route),
      )
      // CTB does not use KMB service_type; set a stable sentinel for the
      // shared estimator while preserving route direction and stop sequence.
      const normalized = rows.map((row) => ({ ...row, service_type: "CTB" }))
      ctbRouteEtaCache.set(cacheKey, {
        expires: now + CTB_ROUTE_ETA_TTL_MS,
        data: normalized,
      })
      return { key: cacheKey, rows: normalized, error: null as string | null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctbEstimatedPositionDebug.routeEtaErrors += 1
      ctbEstimatedPositionDebug.apiErrors += 1
      console.error("[CTB estimated positions] route=" + stop.route + " stop=" + stop.stopId + ":", message)
      return { key: cacheKey, rows: [] as CtbEtaRecord[], error: stop.route + "/" + stop.stopId + ": " + message }
    }
  })
  ctbApiDiagnostics.etaQueries = etaResponses.length
  ctbApiDiagnostics.etaRowsReceived = etaResponses.reduce((total, response) => total + response.rows.length, 0)
  ctbApiDiagnostics.etaQueriesWithRows = etaResponses.filter((response) => response.rows.length > 0).length
  const etaErrors = etaResponses.filter((response) => response.error !== null)
  ctbApiDiagnostics.etaQueryErrors = etaErrors.length
  ctbApiDiagnostics.etaErrorDetails = etaErrors.slice(0, 8).map((response) => response.error as string)

  const result = buildCtbEstimatedPositions(
    routeStops,
    etaResponses.flatMap((response) => response.rows),
    CONFIG.map((station) => ({
      id: station.id,
      name: station.name,
      point: station.point,
      routes: station.routes,
    })),
    now,
    CTB_ESTIMATED_POSITION_RADIUS_METRES,
  )
  ctbEstimatedPositionDebug = {
    ...result.diagnostics,
    apiErrors: result.diagnostics.apiErrors + ctbEstimatedPositionDebug.apiErrors,
    routeStopCoordinates: routeStops.length,
    routeEtaQueries: etaTargetsByKey.size,
    routeEtaErrors: ctbEstimatedPositionDebug.routeEtaErrors,
    lastError: null,
  }
  ctbEstimatedPositionsCache = {
    expires: now + CTB_ESTIMATED_POSITION_TTL_MS,
    data: result.collection,
  }
  return result.collection
}

async function loadLocalGmbEstimatedPositions(
  allStops: GmbNearbyStop[],
  now = Date.now(),
): Promise<GeoJSON.FeatureCollection> {
  if (gmbEstimatedPositionsCache && gmbEstimatedPositionsCache.expires > now) {
    return gmbEstimatedPositionsCache.data
  }

  // Query ETAs only for selected local routes. Keep full official route coordinates
  // so a future ETA can be walked upstream across observed, consecutive segments.
  const localStops = allStops.filter((stop) =>
    CONFIG.some((station) =>
      station.gmbRoutes.some((route) => route === stop.route) &&
      distanceMetres([stop.long, stop.lat], station.point) <= 450,
    ),
  )
  gmbEstimatedPositionDebug = {
    localStops: localStops.length,
    queriedStops: 0,
    etaEntriesChecked: 0,
    segmentsWithEtaTravelTimes: 0,
    segmentsFilledBySpeedFallback: 0,
    routesWithSpeedFallback: 0,
    fallbackSpeedKmh: null,
    anchorsExamined: 0,
    anchorsLocated: 0,
    anchorsWithoutSegmentTiming: 0,
    anchorsOutsideLocalArea: 0,
    candidateSegments: 0,
    estimatedVehicles: 0,
    apiErrors: 0,
  }

  const routeStops = new Map<string, RouteStopCoordinate[]>()
  const localStopsByDirection = new Map<string, GmbNearbyStop[]>()

  for (const stop of allStops) {
    const routeKey = `${stop.route_id}/${stop.route_seq}`
    const coordinates = routeStops.get(routeKey) ?? []
    if (!coordinates.some((item) =>
      item.stopSeq === stop.stop_seq && item.stopId === stop.stop
    )) {
      coordinates.push({
        stopSeq: stop.stop_seq,
        stopId: stop.stop,
        lng: stop.long,
        lat: stop.lat,
      })
    }
    routeStops.set(routeKey, coordinates)
  }

  for (const stop of localStops) {
    const routeKey = `${stop.route_id}/${stop.route_seq}`
    const directionStops = localStopsByDirection.get(routeKey) ?? []
    if (!directionStops.some((item) =>
      item.stop_seq === stop.stop_seq && item.stop === stop.stop
    )) directionStops.push(stop)
    localStopsByDirection.set(routeKey, directionStops)
  }

  // Fetch nearby stops plus context stops immediately before/after the local
  // area. The point is only emitted if its final coordinate is local, but ETA
  // timing for upstream segments often needs stops just outside the 450m circle.
  const etaStopsByDirection = new Map<string, GmbNearbyStop[]>()
  for (const [routeKey, localDirectionStops] of localStopsByDirection) {
    const minSeq = Math.min(...localDirectionStops.map((stop) => stop.stop_seq))
    const maxSeq = Math.max(...localDirectionStops.map((stop) => stop.stop_seq))
    const contextStops = allStops.filter((stop) =>
      `${stop.route_id}/${stop.route_seq}` === routeKey &&
      stop.stop_seq >= Math.max(1, minSeq - 8) &&
      stop.stop_seq <= maxSeq + 2,
    )
    etaStopsByDirection.set(routeKey, contextStops)
  }

  const etaQueryStops = [...etaStopsByDirection.values()].flat()
  const uniqueTargets = Array.from(
    new Map(etaQueryStops.map((stop) => [`${stop.route_id}|${stop.stop}`, stop])).values(),
  )
  gmbEstimatedPositionDebug.queriedStops = uniqueTargets.length

  const etaResponses = await mapWithConcurrency(uniqueTargets, 4, async (stop) => {
    try {
      const result = await gmbJson<{ data?: GmbEtaItem[] }>(
        `${GMB}/eta/route-stop/${encodeURIComponent(stop.route_id)}/${encodeURIComponent(stop.stop)}`,
      )
      return { key: `${stop.route_id}|${stop.stop}`, rows: result.data ?? [] }
    } catch {
      gmbEstimatedPositionDebug.apiErrors += 1
      return { key: `${stop.route_id}|${stop.stop}`, rows: [] as GmbEtaItem[] }
    }
  })
  const etaByStop = new Map(etaResponses.map((result) => [result.key, result.rows]))

  const isUsableEta = (eta: NonNullable<GmbEtaItem["eta"]>[number]) => {
    const timestamp = eta.timestamp ? Date.parse(eta.timestamp) : NaN
    const remarkTc = eta.remarks_tc?.trim()
    const remarkEn = eta.remarks_en?.trim().toLowerCase()
    return Number.isFinite(timestamp) &&
      timestamp > now &&
      timestamp <= now + 20 * 60_000 &&
      remarkTc !== "未開出" &&
      remarkTc !== "行車受阻" &&
      remarkEn !== "scheduled"
  }

  const observedAt = new Date(now).toISOString()
  const travelTimesByRoute = new Map<string, Map<string, number>>()
  const routeSpeedsByLabel = new Map<string, number[]>()
  const pooledObservedSpeeds: number[] = []

  // Calibrate adjacent segments from ETA differences. eta_seq is an ETA ordering
  // at a stop (not a vehicle ID), so only retain differences that also produce a
  // plausible journey time and speed. These observed values are preferred.
  for (const [routeKey, directionStops] of etaStopsByDirection) {
    const ordered = directionStops.slice().sort((a, b) => a.stop_seq - b.stop_seq)
    const segmentSamples = new Map<string, number[]>()
    const segmentDistances = new Map<string, number>()

    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i]
      const to = ordered[i + 1]
      if (!from || !to || to.stop_seq !== from.stop_seq + 1) continue

      const segmentMetres = distanceMetres([from.long, from.lat], [to.long, to.lat])
      if (segmentMetres < 15 || segmentMetres > 800) continue
      const segmentKey = `${from.stop_seq}/${to.stop_seq}`
      segmentDistances.set(segmentKey, segmentMetres)

      const fromRows = etaByStop.get(`${from.route_id}|${from.stop}`) ?? []
      const toRows = etaByStop.get(`${to.route_id}|${to.stop}`) ?? []
      const fromRecord = fromRows.find(
        (row) => row.route_seq === from.route_seq && row.stop_seq === from.stop_seq,
      )
      const toRecord = toRows.find(
        (row) => row.route_seq === to.route_seq && row.stop_seq === to.stop_seq,
      )
      const fromEtas = (fromRecord?.eta ?? []).filter(isUsableEta)
      const toEtas = (toRecord?.eta ?? []).filter(isUsableEta)
      gmbEstimatedPositionDebug.etaEntriesChecked += fromEtas.length + toEtas.length

      const toByRank = new Map(
        toEtas
          .filter((eta) => Number.isInteger(eta.eta_seq) && eta.eta_seq! > 0)
          .map((eta) => [eta.eta_seq!, eta]),
      )

      for (const fromEta of fromEtas) {
        if (!Number.isInteger(fromEta.eta_seq) || fromEta.eta_seq! <= 0) continue
        const toEta = toByRank.get(fromEta.eta_seq!)
        if (!toEta?.timestamp || !fromEta.timestamp) continue

        const segmentMinutes =
          (Date.parse(toEta.timestamp) - Date.parse(fromEta.timestamp)) / 60_000
        const speedKmh = segmentMinutes > 0
          ? segmentMetres / 1000 / segmentMinutes * 60
          : Number.POSITIVE_INFINITY

        if (
          segmentMinutes < 0.4 ||
          segmentMinutes > 8 ||
          speedKmh < 4 ||
          speedKmh > 60
        ) continue

        const samples = segmentSamples.get(segmentKey) ?? []
        samples.push(segmentMinutes)
        segmentSamples.set(segmentKey, samples)
      }
    }

    const segmentMinutesByPair = new Map<string, number>()
    for (const [key, samples] of segmentSamples) {
      const sorted = samples.slice().sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const distance = segmentDistances.get(key)
      if (median === undefined || distance === undefined) continue
      segmentMinutesByPair.set(key, median)
      gmbEstimatedPositionDebug.segmentsWithEtaTravelTimes += 1

      const speedKmh = distance / 1000 / median * 60
      if (speedKmh >= 4 && speedKmh <= 45) {
        const routeLabel = ordered[0]?.route ?? ""
        const routeSpeeds = routeSpeedsByLabel.get(routeLabel) ?? []
        routeSpeeds.push(speedKmh)
        routeSpeedsByLabel.set(routeLabel, routeSpeeds)
        pooledObservedSpeeds.push(speedKmh)
      }
    }
    travelTimesByRoute.set(routeKey, segmentMinutesByPair)
  }

  // Fill gaps only with an ETA-derived local speed profile. Prefer samples from
  // the same displayed route; use the pooled nearby GMB-corridor median only when
  // there are at least five plausible observed segment speeds. This remains an
  // estimate, not GPS, and has hard distance/time bounds.
  const medianOf = (values: number[]): number | null => {
    if (values.length === 0) return null
    const sorted = values.slice().sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? null
  }
  const pooledFallbackSpeed = pooledObservedSpeeds.length >= 5
    ? medianOf(pooledObservedSpeeds)
    : null

  for (const [routeKey, directionStops] of etaStopsByDirection) {
    const ordered = directionStops.slice().sort((a, b) => a.stop_seq - b.stop_seq)
    const routeLabel = ordered[0]?.route ?? ""
    const routeSamples = routeSpeedsByLabel.get(routeLabel) ?? []
    const fallbackSpeedKmh = routeSamples.length >= 2
      ? medianOf(routeSamples)
      : pooledFallbackSpeed
    const segmentMinutesByPair = travelTimesByRoute.get(routeKey)
    if (!segmentMinutesByPair || fallbackSpeedKmh === null || fallbackSpeedKmh === undefined) continue

    let filledAny = false
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const from = ordered[i]
      const to = ordered[i + 1]
      if (!from || !to || to.stop_seq !== from.stop_seq + 1) continue
      const key = `${from.stop_seq}/${to.stop_seq}`
      if (segmentMinutesByPair.has(key)) continue

      const metres = distanceMetres([from.long, from.lat], [to.long, to.lat])
      if (metres < 15 || metres > 800) continue

      const minutes = Math.max(0.4, metres / 1000 / fallbackSpeedKmh * 60)
      if (!Number.isFinite(minutes) || minutes > 8) continue
      segmentMinutesByPair.set(key, minutes)
      gmbEstimatedPositionDebug.segmentsFilledBySpeedFallback += 1
      filledAny = true
    }

    if (filledAny) gmbEstimatedPositionDebug.routesWithSpeedFallback += 1
    gmbEstimatedPositionDebug.fallbackSpeedKmh ??= fallbackSpeedKmh
  }

  const candidates: Array<{
    observation: GmbEtaObservation
    distanceToStation: number
  }> = []

  for (const [routeKey, directionStops] of localStopsByDirection) {
    const coordinates = routeStops.get(routeKey)
    const segmentMinutesByPair = travelTimesByRoute.get(routeKey)
    if (!coordinates || !segmentMinutesByPair?.size) continue

    const ordered = directionStops.slice().sort((a, b) => a.stop_seq - b.stop_seq)
    const anchors = ordered.flatMap((stop) => {
      const rows = etaByStop.get(`${stop.route_id}|${stop.stop}`) ?? []
      const record = rows.find(
        (row) => row.route_seq === stop.route_seq && row.stop_seq === stop.stop_seq,
      )
      const eta = (record?.eta ?? [])
        .filter(isUsableEta)
        .sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!))[0]
      if (!eta?.timestamp) return []
      const etaMinutes = (Date.parse(eta.timestamp) - now) / 60_000
      if (etaMinutes < 0 || etaMinutes > 8) return []
      return [{ stop, etaMinutes }]
    }).sort((a, b) => a.etaMinutes - b.etaMinutes)

    for (const anchor of anchors) {
      gmbEstimatedPositionDebug.anchorsExamined += 1
      const located = locateOnRouteFromUpcomingEta(
        coordinates,
        anchor.stop.stop_seq,
        anchor.etaMinutes,
        segmentMinutesByPair,
      )
      if (!located) {
        gmbEstimatedPositionDebug.anchorsWithoutSegmentTiming += 1
        continue
      }

      const position = estimateBetweenStops(
        located.from,
        located.to,
        located.etaMinutes,
        located.segmentMinutes,
      )
      if (!position) continue

      const distanceToStation = Math.min(...CONFIG.map((station) =>
        distanceMetres([position.lng, position.lat], station.point),
      ))
      if (distanceToStation > 450) {
        gmbEstimatedPositionDebug.anchorsOutsideLocalArea += 1
        continue
      }

      gmbEstimatedPositionDebug.anchorsLocated += 1
      gmbEstimatedPositionDebug.candidateSegments += 1
      candidates.push({
        distanceToStation,
        observation: {
          route: anchor.stop.route,
          routeSeq: anchor.stop.route_seq,
          nextStopSeq: located.to.stopSeq,
          etaMinutes: located.etaMinutes,
          segmentMinutes: located.segmentMinutes,
          observedAt,
          label: `小巴 ${anchor.stop.route} · ${anchor.stop.destination}（ETA 估算，非 GPS）`,
          destination: anchor.stop.destination,
          routeKey,
        },
      })
      // Prefer the nearest upcoming ETA that can be placed within this local segment.
      break
    }
  }

  const bestByRouteDirection = new Map<string, {
    observation: GmbEtaObservation
    distanceToStation: number
  }>()
  for (const candidate of candidates) {
    const key = `${candidate.observation.route}|${candidate.observation.routeSeq}`
    const current = bestByRouteDirection.get(key)
    if (!current || candidate.distanceToStation < current.distanceToStation) {
      bestByRouteDirection.set(key, candidate)
    }
  }

  const vehicles = estimatesFromEtaObservations(
    [...bestByRouteDirection.values()].map((item) => item.observation),
    routeStops,
    now,
  )
  const rawCollection = estimatedMinibusCollection(vehicles, now)
  const collection: GeoJSON.FeatureCollection = {
    ...rawCollection,
    features: rawCollection.features.filter((feature) => {
      if (feature.geometry.type !== "Point") return false
      const point = feature.geometry.coordinates as [number, number]
      return CONFIG.some((station) => distanceMetres(point, station.point) <= 450)
    }),
  }

  gmbEstimatedPositionDebug.estimatedVehicles = collection.features.length
  gmbEstimatedPositionsCache = { expires: now + 20_000, data: collection }
  return collection
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
  const keywordStops = candidates.filter(
    (item) =>
      station.keywords.some((keyword) =>
        item.name.includes(keyword.toLowerCase()),
      ),
  )

  const boundaryStops = candidates.filter(
    (item) => /界限街|boundary street/i.test(item.name),
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
  gmbStops: GmbNearbyStop[],
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
            buildCtbEtaApiUrl(CTB, stop.stop, route),
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

  // 綠色專線小巴到站時間
  const gmbResults = await loadGmbArrivals(
    station,
    gmbStops,
  )

  items.push(...gmbResults)

    return {
    id: station.id,
    name: station.name,
    buses: groupArrivals(
  items,
  [...station.routes, ...station.gmbRoutes],
),
    debug: {
  kmbStops: nearbyKmb.map((stop) => ({
    id: stop.stop,
    name: stopName(stop),
  })),
  ctbStops: nearbyCtb.map((stop) => ({
    id: stop.stop,
    name: stopName(stop),
  })),
  gmbCandidates: gmbStops
    .filter((stop) =>
      station.gmbRoutes.some(
        (route) => route === stop.route
      ) &&
      distanceMetres(
        [stop.long, stop.lat],
        station.point,
      ) <= 350
    )
    .map((stop) => ({
      stopId: stop.stop,
      name: stop.name_tc || stop.name_en || "",
      route: stop.route,
      routeId: stop.route_id,
      routeSeq: stop.route_seq,
      stopSeq: stop.stop_seq,
      destination: stop.destination,
      distanceMetres: Math.round(
        distanceMetres(
          [stop.long, stop.lat],
          station.point,
        )
      ),
    }))
    .sort(
      (a, b) =>
        a.distanceMetres - b.distanceMetres,
    ),
  apiErrors,
},
  }
}

export async function GET() {
  if (responseCache && responseCache.expires > Date.now()) {
    return NextResponse.json(responseCache.body)
  }

  const stopListErrors: string[] = []

  const [kmbStops, ctbStops, gmbStops] = await Promise.all([
  getStops("KMB").catch((error) => {
    stopListErrors.push(
      `九巴站點清單：${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return []
  }),

  getStops("CTB").catch((error) => {
    stopListErrors.push(
      `城巴站點清單：${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return []
  }),

  getGmbStops().catch((error) => {
    stopListErrors.push(
      `綠色小巴站點清單：${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return []
  }),
])

  const [stations, gmbEstimatedPositions, kmbEstimatedPositions, ctbEstimatedPositions] = await Promise.all([
    Promise.all(
      CONFIG.map((station) =>
        loadStation(station, kmbStops, ctbStops, gmbStops),
      ),
    ),
    loadLocalGmbEstimatedPositions(gmbStops).catch((error) => {
      gmbEstimatedPositionDebug.apiErrors += 1
      console.error("[GMB estimated positions]", error instanceof Error ? error.message : String(error))
      return { type: "FeatureCollection" as const, features: [] }
    }),
    loadLocalKmbEstimatedPositions(kmbStops).catch((error) => {
      kmbEstimatedPositionDebug.apiErrors += 1
      console.error("[KMB estimated positions]", error instanceof Error ? error.message : String(error))
      return { type: "FeatureCollection" as const, features: [] }
    }),
    loadLocalCtbEstimatedPositions(ctbStops).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      ctbEstimatedPositionDebug.apiErrors += 1
      ctbEstimatedPositionDebug.lastError = message
      ctbApiDiagnostics.lastEstimateError = message
      console.error("[CTB estimated positions]", message)
      return { type: "FeatureCollection" as const, features: [] }
    }),
  ])

  const body = {
    ok: true,
    observedAt: new Date().toISOString(),
    stations,
    gmbEstimatedPositions,
    kmbEstimatedPositions,
    ctbEstimatedPositions,

    debug: {
      kmbStopTotal: kmbStops.length,
      ctbStopTotal: ctbStops.length,
      gmbStopTotal: gmbStops.length,
      stopListErrors,
      gmbDiagnostics: gmbStopsDebug,
      gmbEstimatedPosition: gmbEstimatedPositionDebug,
      kmbEstimatedPosition: kmbEstimatedPositionDebug,
      ctbEstimatedPosition: ctbEstimatedPositionDebug,
      ctbApiDiagnostics,
    },
  }

  // Keep this shorter than the dashboard's 45-second polling interval.
  // A matching TTL could serve the same calculated vehicle positions on the
  // next poll because the cache starts after all ETA requests have completed.
  responseCache = {
    expires: Date.now() + 20_000,
    body,
  }

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  })
}