"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { LocalCctvPanel } from "./local-cctv-panel"
import { LocalBusEtaPanel } from "./local-bus-eta-panel"
import { LocalRoadAlertsPanel } from "./local-road-alerts-panel"
import { LocalTrafficIncidentsPanel } from "./local-traffic-incidents-panel"
import * as maplibregl from "maplibre-gl"
import type {
  GeoJSONSource,
  Map,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { LOCAL_GMB_MONITORING } from "@/lib/local-gmb-monitoring"

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")

type RoadBand =
  | "free"
  | "slow"
  | "congested"
  | "unknown"

type TrafficCorridor = {
  id: string
  roadTc: string
  roadEn: string
  speedKmh: number | null
  band: RoadBand
  coordinates: [number, number][]
}

type Road = {
  id: string
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string
  coordinates: [number, number][]
  band: RoadBand
  speedKmh: number | null
  dataQuality:
    | "DIRECT"
    | "NEARBY"
    | "NO_DATA"
  nearbyRoads: string[]
}

type JourneyTime = {
  id: string
  eta: string | null
  journeyTimeMinutes: number | null
  distanceMetres: number | null
  distanceText: string | null
  speedKmh: number | null
  status: string
  source: string
  error: string | null
}

type CctvFeature = {
  type?: string
  geometry?: {
    type?: string
    coordinates?: number[]
  }
  properties?: {
    id?: string
    KEY?: string
    name?: string
    DESCRIPTION?: string
    district?: string
    DISTRICT?: string
    url?: string
    URL?: string
  }
}

type CctvResponse = {
  cameras?: {
    type?: string
    features?: CctvFeature[]
  }
}

const CCTV_RADIUS_METRES = 80
const CCTV_PANEL_RADIUS_METRES = 300

const LOCAL_BUS_STOP_MARKERS = [
  {
    id: "lasalle",
    label: "喇沙小學巴士站",
    point: [...LOCAL_GMB_MONITORING.lasalle.point] as [number, number],
  },
  {
    id: "beverly",
    label: "碧華花園巴士站",
    point: [...LOCAL_GMB_MONITORING.beverly.point] as [number, number],
  },
] as const

const LOCAL_ROADS: Omit<
  Road,
  "band" | "speedKmh" | "dataQuality" | "nearbyRoads"
>[] = [
  {
    id: "boundary-131-174",
    nameTc: "界限街",
    nameEn: "Boundary Street",
    startAddress: "131 Boundary Street",
    endAddress: "174 Boundary Street",
   coordinates: [
  [114.18053, 22.3270544],
  [114.1808377, 22.327068],
  [114.1809278, 22.327072],
  [114.1810014, 22.3270752],
  [114.1817659, 22.327109],
  [114.1818109, 22.327111],
  [114.1819173, 22.3271157],
  [114.1820325, 22.3271208],
  [114.1827575, 22.3271544],
  [114.18300, 22.3271638],
],
  },
  {
    id: "la-salle-1e-1b",
    nameTc: "喇沙利道",
    nameEn: "La Salle Road",
    startAddress: "1E La Salle Road",
    endAddress: "1B La Salle Road",
    coordinates: [
      [114.1794975466469, 22.32795327540832],
      [114.1794878002429, 22.32803259702032],
      [114.1794500904272, 22.32858319923182],
      [114.1794446737888, 22.3286457991516],
    ],
  },
]

const STATUS_COLOR: Record<RoadBand, string> = {
  free: "#3DDC97",
  slow: "#FFC857",
  congested: "#FF5D73",
  unknown: "#C9D2DC",
}

const STATUS_TEXT: Record<RoadBand, string> = {
  free: "正常",
  slow: "較慢",
  congested: "擠塞",
  unknown: "沒有數據",
}

function distanceMetres(
  a: [number, number],
  b: [number, number],
) {
  const R = 6371000

  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLon = ((b[0] - a[0]) * Math.PI) / 180

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h =
    sinLat * sinLat +
    Math.cos(lat1) *
      Math.cos(lat2) *
      sinLon *
      sinLon

  return (
    2 *
    R *
    Math.atan2(
      Math.sqrt(h),
      Math.sqrt(1 - h),
    )
  )
}

function distancePointToPolylineMetres(
  point: [number, number],
  line: readonly [number, number][],
) {
  if (line.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  if (line.length === 1) {
    return distanceMetres(point, line[0])
  }

  const lat0 =
    (point[1] * Math.PI) / 180

  const metersPerDegLat = 111320
  const metersPerDegLon =
    111320 * Math.cos(lat0)

  let best =
    Number.POSITIVE_INFINITY

  for (
    let i = 0;
    i < line.length - 1;
    i += 1
  ) {
    const a = line[i]
    const b = line[i + 1]

    const ax =
      (a[0] - point[0]) *
      metersPerDegLon

    const ay =
      (a[1] - point[1]) *
      metersPerDegLat

    const bx =
      (b[0] - point[0]) *
      metersPerDegLon

    const by =
      (b[1] - point[1]) *
      metersPerDegLat

    const abx = bx - ax
    const aby = by - ay

    const ab2 =
      abx * abx + aby * aby

    let t = 0

    if (ab2 > 0) {
      t =
        ((-ax * abx) +
          (-ay * aby)) /
        ab2

      t = Math.max(
        0,
        Math.min(1, t),
      )
    }

    const closestX =
      ax + abx * t

    const closestY =
      ay + aby * t

    const dx = -closestX
    const dy = -closestY

    const distance = Math.sqrt(
      dx * dx + dy * dy,
    )

    if (distance < best) {
      best = distance
    }
  }

  return best
}

function nearestRoadDistance(
  point: [number, number],
  roads: readonly (readonly [
    number,
    number,
  ][])[],
) {
  let best =
    Number.POSITIVE_INFINITY

  for (const road of roads) {
    const distance =
      distancePointToPolylineMetres(
        point,
        road,
      )

    if (distance < best) {
      best = distance
    }
  }

  return best
}

function makeFeatureCollection(
  roads: Road[],
) {
  return {
    type: "FeatureCollection" as const,
    features: roads.map((road) => ({
      type: "Feature" as const,
      properties: {
        id: road.id,
        band: road.band,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: road.coordinates,
      },
    })),
  }
}

function makeCctvFeatureCollection(
  features: GeoJSON.Feature[],
) {
  return {
    type: "FeatureCollection" as const,
    features,
  }
}

function average(values: number[]) {
  if (values.length === 0) {
    return null
  }

  return (
    values.reduce(
      (a, b) => a + b,
      0,
    ) / values.length
  )
}

function formatJourneyTime(
  minutes: number | null,
) {
  if (
    minutes == null ||
    !Number.isFinite(minutes)
  ) {
    return "—"
  }

  if (minutes < 1) {
    return "少於 1 分鐘"
  }

  return `約 ${Math.ceil(
    minutes,
  )} 分鐘`
}

function formatCctvDistance(
  metres: number,
) {
  if (!Number.isFinite(metres)) {
    return "—"
  }

  return `${Math.round(metres)}m`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

export function LocalTrafficDashboard() {
const mapElement =
  useRef<HTMLDivElement | null>(null)

const mapRef =
  useRef<Map | null>(null)

const boundaryMapElement =
  useRef<HTMLDivElement | null>(null)

const boundaryMapRef =
  useRef<Map | null>(null)

  const [roads, setRoads] =
    useState<Road[]>(
      () =>
        LOCAL_ROADS.map(
          (road) => ({
            ...road,
            band: "unknown",
            speedKmh: null,
            dataQuality:
              "NO_DATA",
            nearbyRoads: [],
          }),
        ),
    )

  const [journeyTimes, setJourneyTimes] =
    useState<
      Record<string, JourneyTime>
    >({})

  const [mapReady, setMapReady] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [journeyLoading, setJourneyLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(null)

  const [journeyError, setJourneyError] =
    useState<string | null>(null)

  const [updatedAt, setUpdatedAt] =
    useState<string | null>(null)

  const [journeyUpdatedAt, setJourneyUpdatedAt] =
    useState<string | null>(null)

  async function loadTraffic() {
    try {
      setLoading(true)

      const response =
        await fetch(
          "/api/traffic",
          {
            cache: "no-store",
          },
        )

      const body =
        await response.json()

      if (
        !response.ok ||
        !body.ok
      ) {
        throw new Error(
          body.error ??
            "Traffic data unavailable",
        )
      }

      const corridors:
        TrafficCorridor[] =
        body.corridors ?? []

      const updated =
        LOCAL_ROADS.map(
          (road) => {
            const matches =
  corridors
    .map(
      (corridor) => ({
        corridor,
        distanceKm:
          road.coordinates.reduce(
            (best, point) =>
              Math.min(
                best,
                nearestRoadDistance(
                  point,
                  [corridor.coordinates],
                ),
              ),
            Number.POSITIVE_INFINITY,
          ) / 1000,
      }),
    )
    .filter(
      (item) =>
        item.distanceKm <= 0.25,
    )
    .sort(
      (a, b) =>
        a.distanceKm -
        b.distanceKm,
    )

/*
 * The two target roads are not present as named
 * corridors in strategic-centerlines.json.
 *
 * Therefore:
 * 1. Prefer a named direct match when available.
 * 2. Otherwise score each nearby corridor by how well
 *    its geometry follows the ENTIRE target road.
 * 3. This prevents Boundary Street from simply borrowing
 *    the closest La Salle Road segment near their junction.
 */
const scored = matches
  .map((item) => {
    const corridorDistance =
      road.coordinates.reduce(
        (total, point) =>
          total +
          nearestRoadDistance(
            point,
            [item.corridor.coordinates],
          ),
        0,
      ) / road.coordinates.length

    return {
      ...item,
      corridorDistance,
    }
  })
  .sort(
    (a, b) =>
      a.corridorDistance -
      b.corridorDistance,
  )

const direct =
  matches.filter(
    (item) =>
      item.corridor.roadTc
        ?.toLowerCase()
        .includes(
          road.nameTc.toLowerCase(),
        ) ||
      item.corridor.roadEn
        ?.toLowerCase()
        .includes(
          road.nameEn.toLowerCase(),
        ),
  )

const selected =
  direct.length > 0
    ? direct.slice(0, 5)
    : scored.slice(0, 5)
  

            const speeds =
              selected
                .map(
                  (item) =>
                    item.corridor
                      .speedKmh,
                )
                .filter(
                  (
                    speed,
                  ): speed is number =>
                    typeof speed ===
                      "number" &&
                    Number.isFinite(
                      speed,
                    ),
                )

            const speedKmh =
              average(speeds)

            const band =
              selected.length > 0
                ? selected
                    .map(
                      (item) =>
                        item.corridor
                          .band,
                    )
                    .sort(
                      (a, b) => {
                        const rank:
                          Record<
                            RoadBand,
                            number
                          > = {
                            congested: 3,
                            slow: 2,
                            free: 1,
                            unknown: 0,
                          }

                        return (
                          rank[b] -
                          rank[a]
                        )
                      },
                    )[0] ??
                  "unknown"
                : "unknown"

            return {
              ...road,
              speedKmh,
              band:
                speedKmh == null
                  ? "unknown"
                  : band,
              dataQuality:
                direct.length > 0
                  ? ("DIRECT" as const)
                  : selected.length > 0
                    ? ("NEARBY" as const)
                    : ("NO_DATA" as const),
              nearbyRoads:
                selected
                  .map(
                    (item) =>
                      item.corridor
                        .roadTc ||
                      item.corridor
                        .roadEn,
                  )
                  .filter(Boolean),
            }
          },
        )

      setRoads(updated)

      setUpdatedAt(
        body.observedAt ??
          new Date().toISOString(),
      )

      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Traffic data unavailable",
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadJourneyTime() {
    try {
      setJourneyLoading(true)

      const response =
        await fetch(
          "/api/journey-time",
          {
            cache: "no-store",
          },
        )

      const body =
        await response.json()

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Journey time unavailable",
        )
      }

      const routes:
        JourneyTime[] =
        body.routes ?? []

      const next:
        Record<string, JourneyTime> =
        {}

      for (const route of routes) {
        next[route.id] = route
      }

      setJourneyTimes(next)

      setJourneyUpdatedAt(
        body.observedAt ??
          new Date().toISOString(),
      )

      setJourneyError(null)
    } catch (err) {
      setJourneyError(
        err instanceof Error
          ? err.message
          : "Journey time unavailable",
      )
    } finally {
      setJourneyLoading(false)
    }
  }

  async function loadAllData() {
    await Promise.allSettled([
      loadTraffic(),
      loadJourneyTime(),
    ])
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadAllData()
    }, 0)
    const timer = window.setInterval(() => {
      void loadAllData()
    }, 60_000)

    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [])

  const featureCollection =
    useMemo(
      () =>
        makeFeatureCollection(
          roads,
        ),
      [roads],
    )

  useEffect(() => {
    if (
      !mapElement.current ||
      mapRef.current
    ) {
      return
    }

    const map =
      new maplibregl.Map({
        container:
          mapElement.current,
        style: {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm",
      type: "raster",
      source: "osm",
    },
  ],
},
        center: [
          114.1814,
          22.3283,
        ],
        zoom: 15.8,
        pitch: 0,
      })
    const mapContainer =
  map.getContainer()

mapContainer.style.width = "100%"
mapContainer.style.height = "100%"
map.addControl(
  new maplibregl.NavigationControl(),
  "top-right",
)

const resizeObserver =
  new ResizeObserver(() => {
    map.resize()
  })

resizeObserver.observe(
  mapElement.current,
)

map.resize()

mapRef.current = map
let gmbRefreshTimer: number | null = null

map.on("load", () => {

      map.addSource(
        "local-roads",
        {
          type: "geojson",
          data: featureCollection,
        },
      )

      map.addSource("local-gmb-stops", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      })
      map.addLayer({
        id: "local-gmb-stop-circles",
        type: "circle",
        source: "local-gmb-stops",
        paint: {
          "circle-radius": 6,
          "circle-color": "#0f9f6e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      })

      map.addLayer({
        id: "local-gmb-stop-labels",
        type: "symbol",
        source: "local-gmb-stops",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.25],
          "text-anchor": "top",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        },
        paint: {
          "text-color": "#064e3b",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.5,
        },
      })

      const refreshLocalGmbStops = async () => {
        try {
          const center = map.getCenter()
          const params = new URLSearchParams({
            lng: center.lng.toFixed(5),
            lat: center.lat.toFixed(5),
            zoom: map.getZoom().toFixed(2),
          })
          const response = await fetch(
            `/api/gmb?${params.toString()}`,
            { cache: "no-store" },
          )
          if (!response.ok) return
          const body = await response.json() as {
            ok?: boolean
            stops?: Array<{
              id: string
              nameTc?: string
              nameEn?: string
              lng: number
              lat: number
              routes?: string[]
              calls?: Array<{ route: string; minutes: number | null; destTc?: string }>
            }>
          }
          if (!body.ok || !Array.isArray(body.stops)) return

          const allowedRoutes = new Set([
            "2", "2A", "69A", "70", "70A",
            "25A", "25B", "25M",
          ])
          const features = body.stops.flatMap((stop) => {
            if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) return []
            const routes = (stop.routes ?? []).filter((route) => allowedRoutes.has(route))
            const calls = (stop.calls ?? []).filter((call) => allowedRoutes.has(call.route))
            if (routes.length === 0 && calls.length === 0) return []
            const etaText = calls
              .slice(0, 2)
              .map((call) => `${call.route} ${call.minutes == null ? "—" : Math.max(0, call.minutes) + "分"}`)
              .join(" · ")
            const routeText = [...new Set([...routes, ...calls.map((call) => call.route)])]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .join("/")
            return [{
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [stop.lng, stop.lat],
              },
              properties: {
                id: stop.id,
                name: stop.nameTc || stop.nameEn || "綠色小巴站",
                routes: routeText,
                eta: etaText || "暫無即時到站預報",
                label: etaText ? `${routeText} · ${etaText}` : routeText,
              },
            }]
          })
          const source = map.getSource("local-gmb-stops") as GeoJSONSource | undefined
          source?.setData({ type: "FeatureCollection", features })
        } catch {
          // Keep the last successful layer if the live GMB feed is temporarily unavailable.
        }
      }
      map.on("click", "local-gmb-stop-circles", (event) => {
        const feature = event.features?.[0]
        const properties = feature?.properties as { name?: string; routes?: string; eta?: string } | undefined
        const geometry = feature?.geometry
        if (!properties || !geometry || geometry.type !== "Point") return
        const point = geometry.coordinates as [number, number]
        const content = document.createElement("div")
        const title = document.createElement("strong")
        title.textContent = properties.name || "綠色小巴站"
        const routes = document.createElement("div")
        routes.textContent = `路線：${properties.routes || "—"}`
        const eta = document.createElement("div")
        eta.textContent = `到站預報：${properties.eta || "暫無資料"}`
        content.append(title, routes, eta)
        new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
          .setLngLat(point)
          .setDOMContent(content)
          .addTo(map)
      })
      map.on("mouseenter", "local-gmb-stop-circles", () => {
        map.getCanvas().style.cursor = "pointer"
      })
      map.on("mouseleave", "local-gmb-stop-circles", () => {
        map.getCanvas().style.cursor = ""
      })

      void refreshLocalGmbStops()
      // Refresh the nearby-stop layer after a completed pan or zoom.
      map.on("moveend", refreshLocalGmbStops)
      gmbRefreshTimer = window.setInterval(() => {
        void refreshLocalGmbStops()
      }, 60_000)


      map.addLayer({
        id: "local-roads-casing",
        type: "line",
        source:
          "local-roads",
        layout: {
  "line-cap": "round",
  "line-join": "round",
},
paint: {
  "line-color": "#111827",
  "line-width": 11,
  "line-opacity": 0.9,
},
      })

      map.addLayer({
  id: "local-roads-status",
  type: "line",
  source: "local-roads",
  layout: {
    "line-cap": "round",
    "line-join": "round",
  },
  paint: {
    "line-color": [
      "match",
      ["get", "band"],
      "free",
      STATUS_COLOR.free,
      "slow",
      STATUS_COLOR.slow,
      "congested",
      STATUS_COLOR.congested,
      STATUS_COLOR.unknown,
    ],
    "line-width": 7,
    "line-opacity": 0.95,
  },
})

      map.addLayer({
        id: "local-road-labels",
        type: "symbol",
        source:
          "local-roads",
        layout: {
          "symbol-placement":
            "line",
          "text-field": [
            "match",
            ["get", "id"],
            "boundary-131-174",
            "界限街 131–174",
            "la-salle-1e-1b",
            "喇沙利道 1E–1B",
            "",
          ],
          "text-size": 13,
          "text-offset": [
            0,
            -1.4,
          ],
          "text-allow-overlap":
            true,
        },
        paint: {
          "text-color":
            "#111827",
          "text-halo-color":
            "#ffffff",
          "text-halo-width": 2,
        },
      })

      const bounds =
        new maplibregl.LngLatBounds()

      for (
        const road of LOCAL_ROADS
      ) {
        for (
          const point of road.coordinates
        ) {
          bounds.extend(point)
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(
          bounds,
          {
            padding: {
  top: 160,
  bottom: 40,
  left: 40,
  right: 40,
},
            maxZoom: 16.7,
            duration: 0,
          },
        )
      }

      setMapReady(true)
    })

    return () => {
  if (gmbRefreshTimer !== null) window.clearInterval(gmbRefreshTimer)
  resizeObserver.disconnect()
  map.remove()
  mapRef.current = null
}
  }, [])
  useEffect(() => {
    if (
      !boundaryMapElement.current ||
      boundaryMapRef.current
    ) {
      return
    }

    const boundaryMap =
      new maplibregl.Map({
        container:
          boundaryMapElement.current,

        style: {
          version: 8,

          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution:
                "© OpenStreetMap contributors",
            },
          },

          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
            },
          ],
        },

        center: [
          114.1814,
          22.3287,
        ],

        zoom: 16.8,

        pitch: 0,
      })

    const container =
      boundaryMap.getContainer()

    container.style.width = "100%"
    container.style.height = "100%"

    const resizeObserver =
      new ResizeObserver(() => {
        boundaryMap.resize()
      })

    resizeObserver.observe(
      boundaryMapElement.current,
    )

    boundaryMap.resize()

   boundaryMapRef.current =
  boundaryMap
  let localGmbVehicleRefreshTimer: number | null = null
  let boundaryGmbAnimationTimer: number | null = null
  let boundaryGmbBoundsFitted = false
  let latestBoundaryGmbCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  }
  let latestBoundaryKmbCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  }
  let latestBoundaryCtbCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [],
  }

boundaryMap.on("load", () => {
  boundaryMap.addSource(
    "boundary-local-road",
    {
      type: "geojson",

      data: {
        type: "Feature",

        properties: {
  name: "界限街 131–174",
  band: "unknown",
},

        geometry: {
          type: "LineString",

          coordinates:
            LOCAL_ROADS.find(
              (road) =>
                road.id ===
                "boundary-131-174",
            )?.coordinates ?? [],
        },
      },
    },
  )

  boundaryMap.addSource("boundary-gmb-vehicles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  boundaryMap.addSource("boundary-kmb-vehicles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  boundaryMap.addSource("boundary-ctb-vehicles", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  })
  boundaryMap.addSource("boundary-bus-stations", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: LOCAL_BUS_STOP_MARKERS.map((station) => ({
        type: "Feature" as const,
        properties: { id: station.id, label: station.label },
        geometry: {
          type: "Point" as const,
          coordinates: station.point,
        },
      })),
    },
  })

  const boundary =
    LOCAL_ROADS.find(
      (road) =>
        road.id ===
        "boundary-131-174",
    )

  const coordinates =
    boundary?.coordinates ?? []

  const bounds =
    new maplibregl.LngLatBounds()

  for (const road of LOCAL_ROADS) {
    for (const point of road.coordinates) bounds.extend(point)
  }
  for (const station of LOCAL_BUS_STOP_MARKERS) {
    bounds.extend(station.point)
  }

  /*
   * Faint monitoring area.
   *
   * This is intentionally subtle so the
   * OSM map remains the main visual layer.
   */
  boundaryMap.addLayer({
    id:
      "boundary-monitoring-area",

    type: "line",

    source:
      "boundary-local-road",

    layout: {
      "line-cap":
        "round",

      "line-join":
        "round",
    },

    paint: {
  "line-color":
    "#22d3ee",

  "line-width":
    24,

  "line-opacity":
    0.24,
},
  })

  boundaryMap.addLayer({
  id: "boundary-road-condition",
  type: "line",
  source: "boundary-local-road",
  layout: {
    "line-cap": "round",
    "line-join": "round",
  },
  paint: {
    "line-color": [
      "match",
      ["get", "band"],
      "free", STATUS_COLOR.free,
      "slow", STATUS_COLOR.slow,
      "congested", STATUS_COLOR.congested,
      STATUS_COLOR.unknown,
    ],
    "line-width": 6,
    "line-opacity": 0.98,
  },
})

  // Estimated vehicles belong on this local map (not only on the full-screen
  // background map), so the user can see the route dots beside the monitored road.
  boundaryMap.addLayer({
    id: "boundary-gmb-vehicle-circles",
    type: "circle",
    source: "boundary-gmb-vehicles",
    paint: {
      "circle-radius": 7,
      "circle-color": "#22c55e",
      "circle-stroke-color": "#064e3b",
      "circle-stroke-width": 2,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-gmb-vehicle-labels",
    type: "symbol",
    source: "boundary-gmb-vehicles",
    layout: {
      "text-field": ["concat", "小巴 ", ["get", "route"]],
      "text-size": 11,
      "text-offset": [0, -1.15],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#065f46",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  })

  // KMB estimated positions use red markers to distinguish them from GMB.
  boundaryMap.addLayer({
    id: "boundary-kmb-vehicle-circles",
    type: "circle",
    source: "boundary-kmb-vehicles",
    paint: {
      "circle-radius": 7,
      "circle-color": "#dc2626",
      "circle-stroke-color": "#7f1d1d",
      "circle-stroke-width": 2,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-kmb-vehicle-labels",
    type: "symbol",
    source: "boundary-kmb-vehicles",
    layout: {
      "text-field": ["concat", "九巴 ", ["get", "route"]],
      "text-size": 11,
      "text-offset": [0, -1.15],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#991b1b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  })

  // CTB ETA estimates use a bright cyan halo and a larger foreground marker.
  boundaryMap.addLayer({
    id: "boundary-ctb-vehicle-glow",
    type: "circle",
    source: "boundary-ctb-vehicles",
    paint: {
      "circle-radius": 17,
      "circle-color": "#38bdf8",
      "circle-opacity": 0.28,
      "circle-blur": 0.6,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-ctb-vehicle-circles",
    type: "circle",
    source: "boundary-ctb-vehicles",
    paint: {
      "circle-radius": 9,
      "circle-color": "#00bfff",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-ctb-vehicle-labels",
    type: "symbol",
    source: "boundary-ctb-vehicles",
    layout: {
      "text-field": ["concat", "城巴 ", ["get", "route"], " · #", ["to-string", ["get", "etaSequence"]]],
      "text-size": 12,
      "text-offset": [0, -1.35],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#075985",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2.5,
    },
  })

  // Visually distinct orange bus-stop markers with labels on opposing sides,
  // so the two nearby names remain easy to distinguish on the compact map.
  boundaryMap.addLayer({
    id: "boundary-bus-station-circles",
    type: "circle",
    source: "boundary-bus-stations",
    paint: {
      "circle-radius": 7,
      "circle-color": "#f59e0b",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-bus-station-label-lasalle",
    type: "symbol",
    source: "boundary-bus-stations",
    filter: ["==", ["get", "id"], "lasalle"],
    layout: {
      "text-field": ["get", "label"],
      "text-size": 12,
      "text-offset": [0, -1.5],
      "text-anchor": "bottom",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#92400e",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  })
  boundaryMap.addLayer({
    id: "boundary-bus-station-label-beverly",
    type: "symbol",
    source: "boundary-bus-stations",
    filter: ["==", ["get", "id"], "beverly"],
    layout: {
      "text-field": ["get", "label"],
      "text-size": 12,
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#92400e",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  })

  boundaryMap.on("click", "boundary-gmb-vehicle-circles", (event) => {
    const feature = event.features?.[0]
    const properties = feature?.properties as Record<string, unknown> | null | undefined
    const geometry = feature?.geometry
    if (!properties || !geometry || geometry.type !== "Point") return

    const point = geometry.coordinates as [number, number]
    const route = String(properties.route ?? "").trim()
    const destination = String(properties.destination ?? "").trim()
    const label = String(properties.label ?? "").trim()
    const observedAt = Date.parse(String(properties.observedAt ?? ""))
    const etaMinutes = Number(properties.etaMinutes)
    const segmentMinutes = Number(properties.segmentMinutes)
    const elapsedMinutes = Number.isFinite(observedAt)
      ? Math.max(0, (Date.now() - observedAt) / 60_000)
      : 0
    const etaRemaining = Number.isFinite(etaMinutes)
      ? Math.max(0, etaMinutes - elapsedMinutes)
      : null

    const content = document.createElement("div")
    // Make popup text explicitly dark: the page theme is white-on-dark and
    // would otherwise inherit white text on MapLibre's white popup surface.
    content.style.color = "#0f172a"
    content.style.fontSize = "13px"
    content.style.lineHeight = "1.5"
    content.style.minWidth = "170px"

    const title = document.createElement("strong")
    title.style.display = "block"
    title.style.fontSize = "14px"
    title.style.marginBottom = "4px"
    title.textContent = route ? `綠色專線小巴 ${route}` : (label || "綠色小巴（估算位置）")

    const destinationLine = document.createElement("div")
    destinationLine.style.marginBottom = "4px"
    destinationLine.textContent = `目的地：${destination || "暫無資料"}`

    const etaLine = document.createElement("div")
    etaLine.style.marginBottom = "6px"
    etaLine.textContent = etaRemaining === null
      ? "到下一站時間：暫無資料"
      : `到下一站估算：約 ${etaRemaining < 1 ? "少於 1 分鐘" : `${Math.ceil(etaRemaining)} 分鐘`}`

    const note = document.createElement("div")
    note.style.borderTop = "1px solid #e2e8f0"
    note.style.paddingTop = "5px"
    note.style.fontSize = "11px"
    note.style.color = "#475569"
    note.textContent = "位置由 ETA 與相鄰站點時間推算，並非 GPS 即時定位。"

    content.append(title, destinationLine, etaLine, note)
    new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(point)
      .setDOMContent(content)
      .addTo(boundaryMap)
  })

  boundaryMap.on("click", "boundary-kmb-vehicle-circles", (event) => {
    const feature = event.features?.[0]
    const properties = feature?.properties as Record<string, unknown> | null | undefined
    const geometry = feature?.geometry
    if (!properties || !geometry || geometry.type !== "Point") return

    const point = geometry.coordinates as [number, number]
    const route = String(properties.route ?? "").trim()
    const destination = String(properties.destination ?? "").trim()
    const observedAt = Date.parse(String(properties.observedAt ?? ""))
    const etaMinutes = Number(properties.etaMinutes)
    const elapsedMinutes = Number.isFinite(observedAt)
      ? Math.max(0, (Date.now() - observedAt) / 60_000)
      : 0
    const etaRemaining = Number.isFinite(etaMinutes)
      ? Math.max(0, etaMinutes - elapsedMinutes)
      : null

    const content = document.createElement("div")
    content.style.color = "#0f172a"
    content.style.fontSize = "13px"
    content.style.lineHeight = "1.5"
    content.style.minWidth = "170px"

    const title = document.createElement("strong")
    title.style.display = "block"
    title.style.fontSize = "14px"
    title.style.marginBottom = "4px"
    title.textContent = route ? "九巴 KMB " + route : "九巴（估算位置）"

    const destinationLine = document.createElement("div")
    destinationLine.style.marginBottom = "4px"
    destinationLine.textContent = "方向／目的地：" + (destination || "暫無資料")

    const etaLine = document.createElement("div")
    etaLine.style.marginBottom = "6px"
    etaLine.textContent = etaRemaining === null
      ? "到下一站時間：暫無資料"
      : "到下一站估算：約 " + (etaRemaining < 1 ? "少於 1 分鐘" : Math.ceil(etaRemaining) + " 分鐘")

    const note = document.createElement("div")
    note.style.borderTop = "1px solid #e2e8f0"
    note.style.paddingTop = "5px"
    note.style.fontSize = "11px"
    note.style.color = "#475569"
    note.textContent = "位置由九巴 ETA 與相鄰站點時間推算，並非 GPS 即時定位。"

    content.append(title, destinationLine, etaLine, note)
    new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(point)
      .setDOMContent(content)
      .addTo(boundaryMap)
  })

  boundaryMap.on("click", "boundary-ctb-vehicle-circles", (event) => {
    const feature = event.features?.[0]
    const properties = feature?.properties as Record<string, unknown> | null | undefined
    const geometry = feature?.geometry
    if (!properties || !geometry || geometry.type !== "Point") return

    const point = geometry.coordinates as [number, number]
    const route = String(properties.route ?? "").trim()
    const etaSequence = Number(properties.etaSequence)
    const destination = String(properties.destination ?? "").trim()
    const observedAt = Date.parse(String(properties.observedAt ?? ""))
    const etaMinutes = Number(properties.etaMinutes)
    const elapsedMinutes = Number.isFinite(observedAt)
      ? Math.max(0, (Date.now() - observedAt) / 60_000)
      : 0
    const etaRemaining = Number.isFinite(etaMinutes)
      ? Math.max(0, etaMinutes - elapsedMinutes)
      : null

    const content = document.createElement("div")
    content.style.color = "#0f172a"
    content.style.fontSize = "13px"
    content.style.lineHeight = "1.5"
    content.style.minWidth = "170px"

    const title = document.createElement("strong")
    title.style.display = "block"
    title.style.fontSize = "14px"
    title.style.marginBottom = "4px"
    title.textContent = route ? "城巴 CTB " + route : "城巴（估算位置）"

    const orderLine = document.createElement("div")
    orderLine.style.marginBottom = "4px"
    orderLine.textContent = Number.isInteger(etaSequence) ? "官方 ETA 次序：第 " + etaSequence + " 班" : ""

    const destinationLine = document.createElement("div")
    destinationLine.style.marginBottom = "4px"
    destinationLine.textContent = "方向／目的地：" + (destination || "暫無資料")

    const etaLine = document.createElement("div")
    etaLine.style.marginBottom = "6px"
    etaLine.textContent = etaRemaining === null
      ? "到下一站時間：暫無資料"
      : "到下一站估算：約 " + (etaRemaining < 1 ? "少於 1 分鐘" : Math.ceil(etaRemaining) + " 分鐘")

    const note = document.createElement("div")
    note.style.borderTop = "1px solid #e2e8f0"
    note.style.paddingTop = "5px"
    note.style.fontSize = "11px"
    note.style.color = "#475569"
    note.textContent = "位置由城巴 ETA 與相鄰站點時間推算，並非 GPS 即時定位。"

    content.append(title, orderLine, destinationLine, etaLine, note)
    new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
      .setLngLat(point)
      .setDOMContent(content)
      .addTo(boundaryMap)
  })

  /*
   * Endpoint markers.
   */
  if (
    coordinates.length >= 2
  ) {

   const start = coordinates[0]
const end = coordinates[coordinates.length - 1]

    const createEndpoint =
      (
        label: string,
      ) => {
        const element =
          document.createElement(
            "div",
          )

        element.style.width =
          "30px"

        element.style.height =
          "30px"

        element.style.borderRadius =
          "9999px"

        element.style.border =
          "2px solid rgba(255,255,255,0.95)"

        element.style.background =
          "rgba(15,23,42,0.92)"

        element.style.boxShadow =
          "0 2px 8px rgba(0,0,0,0.45)"

        element.style.display =
          "flex"

        element.style.alignItems =
          "center"

        element.style.justifyContent =
          "center"

        element.style.color =
          "white"

        element.style.fontSize =
          "9px"

        element.style.fontWeight =
          "700"

        element.textContent =
          label

        return element
      }

    new maplibregl.Marker({
      element:
        createEndpoint("131"),
      anchor:
        "center",
    })
      .setLngLat(start)
      .addTo(boundaryMap)

    new maplibregl.Marker({
      element:
        createEndpoint("174"),
      anchor:
        "center",
    })
      .setLngLat(end)
      .addTo(boundaryMap)
  }

  const animateEstimatedVehicleCollection = (
    sourceId: string,
    collection: GeoJSON.FeatureCollection,
  ) => {
    const source = boundaryMap.getSource(sourceId) as GeoJSONSource | undefined
    if (!source) return
    if (collection.features.length === 0) return

    const now = Date.now()
    const features = collection.features.map((feature) => {
      if (!feature.geometry || feature.geometry.type !== "Point" || !feature.properties) return feature
      const properties = feature.properties as Record<string, unknown>
      const fromLng = Number(properties.fromLng)
      const fromLat = Number(properties.fromLat)
      const toLng = Number(properties.toLng)
      const toLat = Number(properties.toLat)
      const etaMinutes = Number(properties.etaMinutes)
      const segmentMinutes = Number(properties.segmentMinutes)
      const observedAtMs = Date.parse(String(properties.observedAt ?? ""))

      if (
        ![fromLng, fromLat, toLng, toLat, etaMinutes, segmentMinutes, observedAtMs].every(Number.isFinite) ||
        segmentMinutes <= 0 ||
        etaMinutes < 0
      ) return feature

      // Elapsed time reduces the published ETA. Interpolate from the upstream
      // stop toward the next stop once per second so dots visibly move between API refreshes.
      const elapsedMinutes = Math.max(0, (now - observedAtMs) / 60_000)
      const etaRemainingMinutes = Math.max(0, etaMinutes - elapsedMinutes)
      const progress = Math.max(0, Math.min(1, 1 - etaRemainingMinutes / segmentMinutes))
      return {
        ...feature,
        geometry: {
          type: "Point" as const,
          coordinates: [
            fromLng + (toLng - fromLng) * progress,
            fromLat + (toLat - fromLat) * progress,
          ],
        },
      }
    })

    source.setData({ type: "FeatureCollection", features })
  }

  const animateBoundaryGmbVehicles = () =>
    animateEstimatedVehicleCollection("boundary-gmb-vehicles", latestBoundaryGmbCollection)
  const animateBoundaryKmbVehicles = () =>
    animateEstimatedVehicleCollection("boundary-kmb-vehicles", latestBoundaryKmbCollection)
  const animateBoundaryCtbVehicles = () =>
    animateEstimatedVehicleCollection("boundary-ctb-vehicles", latestBoundaryCtbCollection)

  const refreshBoundaryGmbVehicles = async () => {
    try {
      const response = await fetch("/api/bus-eta", { cache: "no-store" })
      if (!response.ok) return
      const body = await response.json() as {
        ok?: boolean
        gmbEstimatedPositions?: GeoJSON.FeatureCollection
        kmbEstimatedPositions?: GeoJSON.FeatureCollection
        ctbEstimatedPositions?: GeoJSON.FeatureCollection
      }
      if (!body.ok) return

      if (body.gmbEstimatedPositions && Array.isArray(body.gmbEstimatedPositions.features)) {
        latestBoundaryGmbCollection = body.gmbEstimatedPositions
        animateBoundaryGmbVehicles()
      }
      if (body.kmbEstimatedPositions && Array.isArray(body.kmbEstimatedPositions.features)) {
        latestBoundaryKmbCollection = body.kmbEstimatedPositions
        animateBoundaryKmbVehicles()
      }
      if (body.ctbEstimatedPositions && Array.isArray(body.ctbEstimatedPositions.features)) {
        latestBoundaryCtbCollection = body.ctbEstimatedPositions
        animateBoundaryCtbVehicles()
      }

      const allVehicleCollections = [
        latestBoundaryGmbCollection,
        latestBoundaryKmbCollection,
        latestBoundaryCtbCollection,
      ]
      const hasEstimatedVehicles = allVehicleCollections.some(
        (collection) => collection.features.length > 0,
      )

      // Fit the inset map once to the monitored roads and any valid estimated
      // dots, rather than leaving either company's dots beyond its initial bounds.
      if (!boundaryGmbBoundsFitted && hasEstimatedVehicles) {
        const localBounds = new maplibregl.LngLatBounds()
        for (const road of LOCAL_ROADS) {
          for (const point of road.coordinates) localBounds.extend(point)
        }
        for (const station of LOCAL_BUS_STOP_MARKERS) {
          localBounds.extend(station.point)
        }
        for (const collection of allVehicleCollections) {
          for (const feature of collection.features) {
            if (!feature.geometry || feature.geometry.type !== "Point") continue
            const [lng, lat] = feature.geometry.coordinates
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              localBounds.extend([lng as number, lat as number])
            }
          }
        }
        if (!localBounds.isEmpty()) {
          boundaryMap.fitBounds(localBounds, {
            padding: { top: 30, bottom: 30, left: 34, right: 34 },
            maxZoom: 16.2,
            duration: 250,
          })
          boundaryGmbBoundsFitted = true
        }
      }
    } catch {
      // Keep the last valid set of dots while the ETA endpoint is temporarily unavailable.
    }
  }

  void refreshBoundaryGmbVehicles()
  localGmbVehicleRefreshTimer = window.setInterval(() => {
    void refreshBoundaryGmbVehicles()
  }, 45_000)
  boundaryGmbAnimationTimer = window.setInterval(() => {
    animateBoundaryGmbVehicles()
    animateBoundaryKmbVehicles()
    animateBoundaryCtbVehicles()
  }, 1_000)

  if (
    !bounds.isEmpty()
  ) {
    boundaryMap.fitBounds(
      bounds,
      {
        padding: 45,
        maxZoom: 17.5,
        duration: 0,
      },
    )
  }
})

    return () => {
      if (localGmbVehicleRefreshTimer !== null) {
        window.clearInterval(localGmbVehicleRefreshTimer)
      }
      if (boundaryGmbAnimationTimer !== null) {
        window.clearInterval(boundaryGmbAnimationTimer)
      }
      resizeObserver.disconnect()
      boundaryMap.remove()
      boundaryMapRef.current = null
    }
  }, [])

  
useEffect(() => {
  const map = boundaryMapRef.current

  if (!map) return

  const updateRoadStatus = () => {
    const source = map.getSource(
      "boundary-local-road",
    ) as GeoJSONSource | undefined

    if (!source) return

    const road = roads.find(
      (item) =>
        item.id === "boundary-131-174",
    )

    if (!road) return

    source.setData({
      type: "Feature",
      properties: {
        name: "界限街 131–174",
        band: road.band,
      },
      geometry: {
        type: "LineString",
        coordinates: road.coordinates,
      },
    })
  }

  if (
    map.getSource("boundary-local-road")
  ) {
    updateRoadStatus()
  } else {
    map.once("load", updateRoadStatus)
  }

  return () => {
    map.off("load", updateRoadStatus)
  }
}, [roads])
  
  useEffect(() => {
    const map = mapRef.current

    if (
      !map ||
      !mapReady
    ) {
      return
    }

    const source =
      map.getSource(
        "local-roads",
      ) as
        | GeoJSONSource
        | undefined

    if (source) {
      source.setData(
        featureCollection,
      )
    }
  }, [
    featureCollection,
    mapReady,
  ])

  /*
   * Step 6:
   * CCTV markers on the map.
   *
   * We deliberately use the same 80m corridor rule
   * as LocalCctvPanel so the map and CCTV panel remain
   * consistent.
   */
  useEffect(() => {
    if (
      !mapReady ||
      !mapRef.current
    ) {
      return
    }

    const map = mapRef.current

    // DOM markers are independent of MapLibre style layers, so style ordering,
    // GeoJSON fill rendering, or other map layers cannot hide the two targets.
    const targetDomMarkers = new Map<string, maplibregl.Marker>()

    let cancelled = false

    async function loadCctvMarkers() {
      try {
        const response =
          await fetch(
            "/api/picture",
            {
              cache: "no-store",
            },
          )

        if (!response.ok) {
          throw new Error(
            `CCTV API returned ${response.status}`,
          )
        }

        const body =
          (await response.json()) as CctvResponse

        const features =
          Array.isArray(
            body.cameras
              ?.features,
          )
            ? body.cameras
                ?.features
            : []

        const matched:
          GeoJSON.Feature[] =
          []
        // Keep these two requested CCTV markers visible even when they are
        // not among the eight nearest cameras returned for the local map.
        // Stable official camera IDs from the /api/picture response.
        // local-cctv-222: AID01118, Waterloo Road near Kowloon Tong Club (northbound).
        // local-cctv-241: AID01206, Waterloo Road near Kowloon Tong Club (southbound).
        // Match by official ID rather than array index, which can change between API responses.
        const targetCctvLabels = new Map([
          ["AID01118", "local-cctv-222"],
          ["AID01206", "local-cctv-241"],
          ["222", "local-cctv-222"],
          ["241", "local-cctv-241"],
        ])
        const normalizeCctvId = (value: unknown) =>
          String(value ?? "").trim().replace(/^local-cctv-/, "")
        const targetCctvLabel = (value: unknown) => {
          const normalized = normalizeCctvId(value)
          return targetCctvLabels.get(normalized) ?? null
        }
        const isTargetCctvId = (value: unknown) =>
          targetCctvLabel(value) !== null
        features.forEach(
          (
            feature,
            index,
          ) => {
            const coordinates =
              feature.geometry
                ?.coordinates

            if (
              !Array.isArray(
                coordinates,
              ) ||
              coordinates.length <
                2
            ) {
              return
            }

            const longitude =
              Number(
                coordinates[0],
              )

            const latitude =
              Number(
                coordinates[1],
              )

            if (
              !Number.isFinite(
                longitude,
              ) ||
              !Number.isFinite(
                latitude,
              )
            ) {
              return
            }

            const properties =
              feature.properties ??
              {}

            const imageUrl =
              String(
                properties.URL ??
                  properties.url ??
                  "",
              ).trim()

            const point:
              [number, number] = [
                longitude,
                latitude,
              ]

            const id =
              String(
                properties.KEY ??
                  properties.id ??
                  `local-cctv-${index}`,
              ).trim()
            // Match requested markers by stable official camera ID, not array index.
            const targetLabel = targetCctvLabel(id)
            const isTargetCctv = targetLabel !== null

            // A target marker is a location annotation; it must not disappear
            // just because its snapshot URL is missing or temporarily invalid.
            if (!imageUrl && !isTargetCctv) {
              return
            }

            const distance =
              nearestRoadDistance(
                point,
                LOCAL_ROADS.map(
                  (road) =>
                    road.coordinates,
                ),
              )

            // Always retain the two explicitly requested official cameras,
            // even if they are outside the normal 80m local-road corridor.
            if (
              distance > CCTV_RADIUS_METRES &&
              !isTargetCctv
            ) {
              return
            }

            const name =
              String(
                properties.DESCRIPTION ??
                  properties.name ??
                  "Traffic Camera",
              ).trim()

            const district =
              String(
                properties.DISTRICT ??
                  properties.district ??
                  "",
              ).trim()

            matched.push({
              type: "Feature",
              properties: {
                id,
                name,
                district,
                imageUrl,
                distanceMetres:
                  Math.round(
                    distance,
                  ),
                isTargetCctv,
                markerLabel: isTargetCctv
                  ? `■ ${targetLabel}`
                  : "",
              },
              geometry: {
                type: "Point",
                coordinates: [
                  longitude,
                  latitude,
                ],
              },
            })
          },
        )

        matched.sort(
          (a, b) =>
            Number(
              a.properties
                ?.distanceMetres ??
                999999,
            ) -
            Number(
              b.properties
                ?.distanceMetres ??
                999999,
            ),
        )

        const nearestMatched = matched.slice(0, 8)
        const priorityMatched = matched.filter((feature) =>
          Boolean(feature.properties?.isTargetCctv) ||
          isTargetCctvId(feature.properties?.id),
        )
        const visibleMatched = [
          ...nearestMatched,
          ...priorityMatched.filter((priority) =>
            !nearestMatched.some(
              (nearest) =>
                String(nearest.properties?.id ?? "") ===
                String(priority.properties?.id ?? ""),
            ),
          ),
        ]

        const collection =
          makeCctvFeatureCollection(visibleMatched)

        if (
          cancelled ||
          !mapRef.current
        ) {
          return
        }

        const currentMap =
          mapRef.current

        // Render the two requested cameras as actual HTML square markers.
        // This is separate from the GeoJSON style-layer marker path.
        for (const feature of visibleMatched) {
          if (!feature.properties?.isTargetCctv) continue
          const coordinates = feature.geometry?.coordinates
          if (!Array.isArray(coordinates) || coordinates.length < 2) continue
          const lng = Number(coordinates[0])
          const lat = Number(coordinates[1])
          const id = String(feature.properties.id ?? "")
          if (!Number.isFinite(lng) || !Number.isFinite(lat) || !id) continue

          let marker = targetDomMarkers.get(id)
          if (!marker) {
            const element = document.createElement("div")
            element.setAttribute("aria-label", String(feature.properties.markerLabel ?? "目標 CCTV"))
            element.title = String(feature.properties.name ?? "目標 CCTV")
            element.style.width = "22px"
            element.style.height = "22px"
            element.style.backgroundColor = "#000000"
            element.style.border = "3px solid #ffffff"
            element.style.boxSizing = "border-box"
            element.style.boxShadow = "0 0 0 2px #000000, 0 2px 8px rgba(0,0,0,0.65)"
            element.style.zIndex = "1000"
            element.style.pointerEvents = "auto"
            marker = new maplibregl.Marker({ element, anchor: "center" })
              .setLngLat([lng, lat])
              .addTo(currentMap)
            targetDomMarkers.set(id, marker)
          } else {
            marker.setLngLat([lng, lat])
          }
        }

        const existing =
          currentMap.getSource(
            "local-cctv",
          ) as
            | GeoJSONSource
            | undefined

        if (existing) {
          existing.setData(collection)
        } else {
          currentMap.addSource(
            "local-cctv",
            {
              type: "geojson",
              data: collection,
            },
          )
        }

        // Render target markers as actual polygon squares instead of a text glyph.
        // This avoids missing-font/glyph issues in MapLibre symbol layers.
        const targetSquareFeatures = visibleMatched
          .filter((feature) => Boolean(feature.properties?.isTargetCctv))
          .map((feature) => {
            const coordinates = feature.geometry?.coordinates
            if (!Array.isArray(coordinates) || coordinates.length < 2) return null
            const longitude = Number(coordinates[0])
            const latitude = Number(coordinates[1])
            if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
            // Make the target square large enough to remain visible at local-map zoom.
            const halfWidth = 0.00010
            const halfHeight = 0.00010
            return {
              type: "Feature" as const,
              properties: { id: feature.properties?.id },
              geometry: {
                type: "Polygon" as const,
                coordinates: [[
                  [longitude - halfWidth, latitude - halfHeight],
                  [longitude + halfWidth, latitude - halfHeight],
                  [longitude + halfWidth, latitude + halfHeight],
                  [longitude - halfWidth, latitude + halfHeight],
                  [longitude - halfWidth, latitude - halfHeight],
                ]],
              },
            }
          })
          .filter((feature): feature is NonNullable<typeof feature> => feature !== null)

        const targetSquareCollection = {
          type: "FeatureCollection" as const,
          features: targetSquareFeatures,
        }
        const existingTargetSquares = currentMap.getSource("local-cctv-target-squares") as GeoJSONSource | undefined
        if (existingTargetSquares) {
          existingTargetSquares.setData(targetSquareCollection)
        } else {
          currentMap.addSource("local-cctv-target-squares", {
            type: "geojson",
            data: targetSquareCollection,
          })
        }

        if (!currentMap.getLayer("local-cctv-target-square-fill")) {
          currentMap.addLayer({
            id: "local-cctv-target-square-fill",
            type: "fill",
            source: "local-cctv-target-squares",
            paint: {
              "fill-color": "#000000",
              "fill-outline-color": "#ffffff",
              "fill-opacity": 1,
            },
          })
        }

        // Keep text labels separate from the visible square markers.
        if (!currentMap.getLayer("local-cctv-target-labels")) {
          currentMap.addLayer({
            id: "local-cctv-target-labels",
            type: "symbol",
            source: "local-cctv",
            filter: ["==", ["get", "isTargetCctv"], true],
            layout: {
              "text-field": ["get", "markerLabel"],
              "text-size": 10,
              "text-offset": [0, 1.8],
              "text-anchor": "top",
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": "#111111",
              "text-halo-color": "#ffffff",
              "text-halo-width": 2,
            },
          })
        }

        if (!currentMap.getLayer("local-cctv-points")) {
          currentMap.addLayer({
            id: "local-cctv-points",
          type: "circle",
          source:
            "local-cctv",
          paint: {
            "circle-radius": 8,
            "circle-color":
              "#06b6d4",
            "circle-stroke-color":
              "#ffffff",
            "circle-stroke-width": 2,
            "circle-opacity": 0.95,
          },
          })
        }

        // Put the target CCTV markers at the top of the style stack.
        // Other map layers may be added after the base CCTV layers.
        if (currentMap.getLayer("local-cctv-target-square-fill")) {
          currentMap.moveLayer("local-cctv-target-square-fill")
        }
        if (currentMap.getLayer("local-cctv-target-labels")) {
          currentMap.moveLayer("local-cctv-target-labels")
        }

        currentMap.on(
          "mouseenter",
          "local-cctv-points",
          () => {
            currentMap.getCanvas().style.cursor =
              "pointer"
          },
        )

        currentMap.on(
          "mouseleave",
          "local-cctv-points",
          () => {
            currentMap.getCanvas().style.cursor =
              ""
          },
        )

        currentMap.on(
          "click",
          "local-cctv-points",
          (event) => {
            const feature =
              event.features?.[0]

            if (!feature) {
              return
            }

            const props =
              feature.properties

            if (!props) {
              return
            }

            const name =
              String(
                props.name ??
                  "Traffic Camera",
              )

            const imageUrl =
              String(
                props.imageUrl ??
                  "",
              )

            const distance =
              String(
                props.distanceMetres ??
                  "",
              )

            const district =
              String(
                props.district ??
                  "",
              )

            const imageSrc =
              `/api/camera?url=${encodeURIComponent(
                imageUrl,
              )}`

            const html = `
              <div style="width:260px;font-family:system-ui,sans-serif;color:#0f172a">
                <div style="font-weight:700;font-size:14px;margin-bottom:6px">
                  ${escapeHtml(name)}
                </div>

                ${
                  district
                    ? `<div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(
                        district,
                      )}</div>`
                    : ""
                }

                <div style="font-size:11px;color:#0891b2;margin-bottom:8px">
                  距離目標道路中心線約 ${escapeHtml(
                    distance,
                  )}m
                </div>

                <img
                  src="${escapeHtml(
                    imageSrc,
                  )}"
                  alt="${escapeHtml(
                    name,
                  )}"
                  style="display:block;width:100%;border-radius:8px;background:#0f172a"
                />

                <div style="font-size:10px;color:#64748b;margin-top:7px">
                  香港運輸署交通情況快拍圖像
                </div>
              </div>
            `

            new maplibregl.Popup({
              closeButton: true,
              closeOnClick: true,
              maxWidth: "290px",
            })
              .setLngLat(
                event.lngLat,
              )
              .setHTML(html)
              .addTo(
                currentMap,
              )
          },
        )

        // Re-assert target square visibility and place it above all map layers.
        if (currentMap.getLayer("local-cctv-target-square-fill")) {
          currentMap.setLayoutProperty("local-cctv-target-square-fill", "visibility", "visible")
          currentMap.setPaintProperty("local-cctv-target-square-fill", "fill-color", "#000000")
          currentMap.setPaintProperty("local-cctv-target-square-fill", "fill-opacity", 1)
          currentMap.moveLayer("local-cctv-target-square-fill")
        }
        if (currentMap.getLayer("local-cctv-target-labels")) {
          currentMap.moveLayer("local-cctv-target-labels")
        }
      } catch (error) {
        console.error(
          "Failed to load CCTV map markers:",
          error,
        )
      }
    }

    loadCctvMarkers()

    const timer =
      window.setInterval(
        loadCctvMarkers,
        5 * 60 * 1000,
      )

    return () => {
      cancelled = true
      window.clearInterval(timer)
      for (const marker of targetDomMarkers.values()) marker.remove()
      targetDomMarkers.clear()
    }
  }, [mapReady])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#2E2D2D] text-white">

      {/* Map background */}
      <div
        ref={mapElement}
        className="absolute inset-0"
      />
{/* Full-screen background: #2E2D2D */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[#2E2D2D]" />
      {/* Dashboard overlay */}
      <div className="pointer-events-none absolute inset-0 z-20">

        <div className="mx-auto h-full max-w-6xl overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-5">

          <div className="pointer-events-auto space-y-3 pb-8">

            {/* Header */}
            <section className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5">

              <div className="flex flex-wrap items-start justify-between gap-4">

                <div>
                  <div className="text-[10px] font-bold tracking-[0.25em] text-cyan-300 sm:text-xs">
                    KOWLOON LOCAL TRAFFIC INTELLIGENCE
                  </div>

                  <h1 className="mt-1 text-lg font-bold sm:text-2xl">
                    九龍兩段道路交通監控
                  </h1>

                  <p className="mt-1 text-xs text-white/55">
                    界限街 131–174 號 ／
                    喇沙利道 1E–1B 號
                  </p>
                </div>

                <button
                  onClick={loadAllData}
                  disabled={
                    loading ||
                    journeyLoading
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-50"
                >
                  {loading ||
                  journeyLoading
                    ? "更新中..."
                    : "立即更新"}
                </button>

              </div>

              {error && (
                <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  ⚠️ 交通資料：
                  {error}
                </div>
              )}

              {journeyError && (
                <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  ⚠️ TDAS 行車時間：
                  {journeyError}
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">

                {roads.map((road) => {
                  const journey =
                    journeyTimes[
                      road.id
                    ]

                  return (
                    <article
                      key={road.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >

                      <div className="flex items-start justify-between gap-3">

                        <div>
                          <div className="text-base font-bold">
                            {road.nameTc}
                          </div>

                          <div className="text-[10px] text-white/40">
                            {road.nameEn}
                          </div>
                        </div>

                        <span
                          className="rounded-full px-3 py-1 text-[11px] font-bold"
                          style={{
                            backgroundColor:
                              STATUS_COLOR[
                                road.band
                              ],
                            color:
                              "#071018",
                          }}
                        >
                          {
                            STATUS_TEXT[
                              road.band
                            ]
                          }
                        </span>

                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">

                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/40">
                            SPEED
                          </div>

                          <div className="mt-1 text-lg font-bold">
                            {road.speedKmh ==
                            null
                              ? "—"
                              : `${road.speedKmh.toFixed(
                                  1,
                                )} km/h`}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-white/40">
                            DATA QUALITY
                          </div>

                          <div className="mt-1 text-xs font-semibold text-white/70">
                            {road.dataQuality ===
                            "DIRECT"
                              ? "官方直接路段"
                              : road.dataQuality ===
                                  "NEARBY"
                                ? "附近路段估算"
                                : "沒有數據"}
                          </div>
                        </div>

                      </div>

                      <div className="mt-4 rounded-lg border border-cyan-400/10 bg-cyan-400/5 px-3 py-2">

                        <div className="flex items-center justify-between gap-3">

                          <div>
                            <div className="text-[9px] uppercase tracking-wider text-cyan-300/60">
                              JOURNEY TIME
                            </div>

                            <div className="mt-1 text-base font-bold text-cyan-100">
                              {journeyLoading &&
                              !journey
                                ? "更新中..."
                                : formatJourneyTime(
                                    journey?.journeyTimeMinutes ??
                                      null,
                                  )}
                            </div>
                          </div>

                          <div className="text-right">

                            <div className="text-[9px] text-white/35">
                              SOURCE
                            </div>

                            <div className="mt-1 text-[10px] font-semibold text-white/60">
                              {journey?.status ===
                              "OK"
                                ? "TDAS"
                                : journeyLoading
                                  ? "..."
                                  : "NO DATA"}
                            </div>

                          </div>

                        </div>

                      </div>

                      {road.dataQuality === "NEARBY" && (
  <div className="mt-2 text-[10px] text-white/35">
    交通資料：附近路段估算
  </div>
)}

                      <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-white/40">
                        {road.startAddress}
                        {" → "}
                        {road.endAddress}
                      </div>

                    </article>
                  )
                })}

              </div>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/40">

                <span>
                  🟢 正常
                </span>

                <span>
                  🟡 較慢
                </span>

                <span>
                  🔴 擠塞
                </span>

                <span>
                  ⚪ 沒有數據
                </span>

                <span>
                  📹 CCTV 80m
                </span>

                <span>
                  TD 即時交通資料
                </span>

                {updatedAt && (
                  <span>
                    交通更新：
                    {new Date(
                      updatedAt,
                    ).toLocaleTimeString(
                      "zh-HK",
                      {
                        hour: "2-digit",
                        minute:
                          "2-digit",
                        second:
                          "2-digit",
                      },
                    )}
                  </span>
                )}

                {journeyUpdatedAt && (
                  <span>
                    TDAS：
                    {new Date(
                      journeyUpdatedAt,
                    ).toLocaleTimeString(
                      "zh-HK",
                      {
                        hour: "2-digit",
                        minute:
                          "2-digit",
                        second:
                          "2-digit",
                      },
                    )}
                  </span>
                )}

              </div>

            </section>
{/* Boundary Street Local Map */}
<section className="rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-xl sm:p-4">

  <div className="mb-3 flex items-center justify-between gap-3">

    <div>
      <div className="text-[9px] font-bold tracking-[0.18em] text-cyan-300">
        BOUNDARY STREET · LOCAL SEGMENT
      </div>

      <div className="mt-1 text-sm font-bold">
        界限街 131–174 號
      </div>

      <div className="mt-1 text-[10px] text-white/40">
        只顯示目標道路局部範圍
      </div>
    </div>

    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] text-white/60">
      LOCAL MAP
    </div>

  </div>

  <div
  ref={boundaryMapElement}
  style={{
    width: "100%",
    height: "300px",
    minHeight: "300px",
  }}
  className="w-full overflow-hidden rounded-xl border border-white/10"
/>

</section>
            {/* Bus ETA */}
<LocalBusEtaPanel />
            {/* CCTV */}
            <LocalCctvPanel
              roads={LOCAL_ROADS.map(
                (road) =>
                  road.coordinates,
              )}
              radiusMetres={
  CCTV_PANEL_RADIUS_METRES
}
            />

            {/* Road Works */}
            <LocalRoadAlertsPanel
              roads={LOCAL_ROADS.map(
                (road) =>
                  road.coordinates,
              )}
              radiusMetres={500}
            />

            {/* Incidents */}
            <LocalTrafficIncidentsPanel
              roads={LOCAL_ROADS.map(
                (road) =>
                  road.coordinates,
              )}
              radiusMetres={500}
            />

            <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 text-[10px] text-white/50 backdrop-blur-md">
              LIVE TRAFFIC · CCTV ·
              ROAD WORKS · INCIDENTS ·
              ETA

              <span className="ml-2 text-cyan-300">
                Phase 2
              </span>
            </div>

          </div>
        </div>
      </div>

    </main>
  )
}
