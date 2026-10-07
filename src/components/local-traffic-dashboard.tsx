"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import maplibregl, { type GeoJSONSource, type Map } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

type RoadBand = "free" | "slow" | "congested" | "unknown"

type Road = {
  id: string
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string
  coordinates: [number, number][]
  band: RoadBand
  speedKmh: number | null
}

const ROADS: Road[] = [
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
    band: "unknown",
    speedKmh: null,
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
    band: "unknown",
    speedKmh: null,
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
  unknown: "等待數據",
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

export function LocalTrafficDashboard() {
  const mapElement = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)

  const [roads] = useState<Road[]>(ROADS)
  const [mapReady, setMapReady] = useState(false)

  const featureCollection = useMemo(
    () => makeFeatureCollection(roads),
    [roads],
  )

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapElement.current,
      style: "https://tiles.openfreemap.org/styles/bright",
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

      // Dark outline
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

      // Traffic status line
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

      // Road labels
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
          "text-font": ["Noto Sans Regular"],
          "text-offset": [0, -1.4],
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#111827",
          "text-halo-color": "#ffffff",
          "text-halo-width": 2,
        },
      })

      // Fit both roads
      const bounds = new maplibregl.LngLatBounds()

      for (const road of ROADS) {
        for (const point of road.coordinates) {
          bounds.extend(point)
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: {
            top: 260,
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

      {/* Dashboard */}
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
                  界限街 131–174 號 ／ 喇沙利道 1E–1B 號
                </p>
              </div>

              <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2 text-right">
                <div className="text-[9px] uppercase tracking-wider text-white/40">
                  DATA SOURCE
                </div>
                <div className="text-xs font-semibold text-cyan-200">
                  TD Road Network
                </div>
              </div>

            </div>

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
                        backgroundColor: STATUS_COLOR[road.band],
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
                        TRAFFIC DATA
                      </div>

                      <div className="mt-1 text-sm font-semibold text-white/70">
                        尚未接駁
                      </div>
                    </div>

                  </div>

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
              <span>⚪ 等待數據</span>
              <span>道路範圍：TD Road Network</span>
            </div>

          </section>
        </div>
      </div>

      {/* Bottom information */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-5">
        <div className="mx-auto max-w-6xl">
          <div className="inline-flex rounded-lg border border-white/10 bg-slate-950/85 px-3 py-2 text-[10px] text-white/50 backdrop-blur-md">
            LIVE TRAFFIC · CCTV · ROAD WORKS · INCIDENTS
            <span className="ml-2 text-cyan-300">
              Phase 1
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
