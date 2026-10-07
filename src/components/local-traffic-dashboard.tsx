"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { LocalCctvPanel } from "./local-cctv-panel"
import maplibregl, {
  type GeoJSONSource,
  type Map,
} from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

type RoadBand = "free" | "slow" | "congested" | "unknown"

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
  dataQuality: "DIRECT" | "NEARBY" | "NO_DATA"
  nearbyRoads: string[]
}

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
      [114.1794446737888, 22.3286457991516],
      [114.1808143767945, 22.32871081402552],
      [114.181594067918, 22.32877297132544],
      [114.1829096244477, 22.32881281223867],
      [114.1833711857157, 22.32882430423036],
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

function distanceKm(
  a: [number, number],
  b: [number, number],
) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const lat = ((a[1] + b[1]) / 2) * rad

  const x = dLng * Math.cos(lat)
  const y = dLat

  return Math.sqrt(x * x + y * y) * 6371
}

function nearestDistanceKm(
  local: [number, number][],
  traffic: [number, number][],
) {
  let best = Number.POSITIVE_INFINITY

  for (const a of local) {
    for (const b of traffic) {
      best = Math.min(best, distanceKm(a, b))
    }
  }

  return best
}

function makeFeatureCollection(roads: Road[]) {
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

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function LocalTrafficDashboard() {
  const mapElement = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)

  const [roads, setRoads] = useState<Road[]>(() =>
    LOCAL_ROADS.map((road) => ({
      ...road,
      band: "unknown",
      speedKmh: null,
      dataQuality: "NO_DATA",
      nearbyRoads: [],
    })),
  )

  const [mapReady, setMapReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  async function loadTraffic() {
    try {
      setLoading(true)

      const response = await fetch("/api/traffic", {
        cache: "no-store",
      })

      const body = await response.json()

      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ?? "Traffic data unavailable",
        )
      }

      const corridors: TrafficCorridor[] =
        body.corridors ?? []

      const updated = LOCAL_ROADS.map((road) => {
        const matches = corridors
          .map((corridor) => ({
            corridor,
            distanceKm: nearestDistanceKm(
              road.coordinates,
              corridor.coordinates,
            ),
          }))
          .filter((item) => item.distanceKm <= 0.25)
          .sort(
            (a, b) =>
              a.distanceKm - b.distanceKm,
          )
          .slice(0, 5)

        const direct = matches.filter(
          (item) =>
            item.corridor.roadTc
              ?.toLowerCase()
              .includes(road.nameTc.toLowerCase()) ||
            item.corridor.roadEn
              ?.toLowerCase()
              .includes(road.nameEn.toLowerCase()),
        )

        const selected =
          direct.length > 0 ? direct : matches

        const speeds = selected
          .map((item) => item.corridor.speedKmh)
          .filter(
            (speed): speed is number =>
              typeof speed === "number" &&
              Number.isFinite(speed),
          )

        const speedKmh = average(speeds)

        const band =
          selected.length > 0
            ? selected
                .map((item) => item.corridor.band)
                .sort((a, b) => {
                  const rank: Record<RoadBand, number> = {
                    congested: 3,
                    slow: 2,
                    free: 1,
                    unknown: 0,
                  }

                  return rank[b] - rank[a]
                })[0] ?? "unknown"
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
              ? "DIRECT"
              : selected.length > 0
                ? "NEARBY"
                : "NO_DATA",
          nearbyRoads: selected
            .map(
              (item) =>
                item.corridor.roadTc ||
                item.corridor.roadEn,
            )
            .filter(Boolean),
        }
      })

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

  useEffect(() => {
    loadTraffic()

    const timer = window.setInterval(
      loadTraffic,
      60_000,
    )

    return () =>
      window.clearInterval(timer)
  }, [])

  const featureCollection = useMemo(
    () => makeFeatureCollection(roads),
    [roads],
  )

  useEffect(() => {
    if (!mapElement.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapElement.current,
      style:
        "https://tiles.openfreemap.org/styles/bright",
      center: [114.1814, 22.3283],
      zoom: 15.8,
      pitch: 0,
    })

    map.addControl(
      new maplibregl.NavigationControl(),
      "top-right",
    )

    mapRef.current = map

    map.on("load", () => {
      map.addSource("local-roads", {
        type: "geojson",
        data: featureCollection,
      })

      map.addLayer({
        id: "local-roads-casing",
        type: "line",
        source: "local-roads",
        paint: {
          "line-color": "#111827",
          "line-width": 11,
          "line-opacity": 0.9,
          "line-cap": "round",
          "line-join": "round",
        },
      })

      map.addLayer({
        id: "local-roads-status",
        type: "line",
        source: "local-roads",
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
          "line-cap": "round",
          "line-join": "round",
        },
      })

      map.addLayer({
        id: "local-road-labels",
        type: "symbol",
        source: "local-roads",
        layout: {
          "symbol-placement": "line",
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
          "text-offset": [0, -1.4],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      })

      const bounds =
        new maplibregl.LngLatBounds()

      for (const road of LOCAL_ROADS) {
        for (const point of road.coordinates) {
          bounds.extend(point)
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: {
            top: 280,
            bottom: 80,
            left: 60,
            right: 60,
          },
          maxZoom: 16.7,
          duration: 0,
        })
      }

      setMapReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current

    if (!map || !mapReady) return

    const source = map.getSource(
      "local-roads",
    ) as GeoJSONSource | undefined

    if (source) {
      source.setData(featureCollection)
    }
  }, [featureCollection, mapReady])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white">

      <div
        ref={mapElement}
        className="absolute inset-0"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 sm:p-5">
        <div className="mx-auto max-w-6xl">

          <section className="pointer-events-auto rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5">

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
                onClick={loadTraffic}
                disabled={loading}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-50"
              >
                {loading
                  ? "更新中..."
                  : "立即更新"}
              </button>

            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                ⚠️ {error}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-2">

              {roads.map((road) => (
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
                          STATUS_COLOR[road.band],
                        color: "#071018",
                      }}
                    >
                      {STATUS_TEXT[road.band]}
                    </span>

                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">

                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-white/40">
                        SPEED
                      </div>

                      <div className="mt-1 text-lg font-bold">
                        {road.speedKmh == null
                          ? "—"
                          : `${road.speedKmh.toFixed(1)} km/h`}
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

                  {road.nearbyRoads.length > 0 && (
                    <div className="mt-2 text-[10px] text-white/35">
                      參考：
                      {road.nearbyRoads
                        .slice(0, 2)
                        .join(" / ")}
                    </div>
                  )}

                  <div className="mt-3 border-t border-white/5 pt-2 text-[10px] text-white/40">
                    {road.startAddress}
                    {" → "}
                    {road.endAddress}
                  </div>

                </article>
              ))}

            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/40">
              <span>🟢 正常</span>
              <span>🟡 較慢</span>
              <span>🔴 擠塞</span>
              <span>⚪ 沒有數據</span>

              <span>
                TD 即時交通資料
              </span>

              {updatedAt && (
                <span>
                  更新：
                  {new Date(
                    updatedAt,
                  ).toLocaleTimeString(
                    "zh-HK",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )}
                </span>
              )}
            </div>

          </section>
          <LocalCctvPanel
  roads={LOCAL_ROADS.map(
    (road) => road.coordinates,
  )}
  radiusMetres={500}
/>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 max-h-dvh overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto max-w-6xl">

          <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 text-[10px] text-white/50 backdrop-blur-md">
            LIVE TRAFFIC · CCTV · ROAD WORKS · INCIDENTS

            <span className="ml-2 text-cyan-300">
              Phase 2
            </span>
          </div>

        </div>
      </div>

    </main>
  )
}
