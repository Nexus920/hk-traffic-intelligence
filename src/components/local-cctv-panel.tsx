"use client"

import { useEffect, useMemo, useState } from "react"

type Coordinate = readonly [number, number]

type LocalCctvPanelProps = {
  roads: readonly (readonly Coordinate[])[]
  radiusMetres?: number
}

type CameraFeature = {
  type?: string
  geometry?: {
    type?: string
    coordinates?: number[]
  }
  properties?: {
    KEY?: string
    key?: string
    DESCRIPTION?: string
    description?: string
    DISTRICT?: string
    district?: string
    TD_REGION?: string
    URL?: string
    url?: string
    ROTATION?: string | number
  }
}

type CameraResponse = {
  cameras?: {
    type?: string
    features?: CameraFeature[]
  }
}

type CameraItem = {
  id: string
  description: string
  district: string
  imageUrl: string
  longitude: number
  latitude: number
  distanceMetres: number
}

/**
 * Approximate distance between two WGS84 coordinates.
 * Returns metres.
 */
function distanceMetres(
  a: Coordinate,
  b: Coordinate,
): number {
  const R = 6371000

  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLon = ((b[0] - a[0]) * Math.PI) / 180

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon

  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * Distance from a point to a road polyline.
 *
 * The calculation uses a local equirectangular projection around
 * the camera position, which is accurate enough for these short
 * Kowloon road segments.
 */
function distancePointToPolylineMetres(
  point: Coordinate,
  line: readonly Coordinate[],
): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY

  if (line.length === 1) {
    return distanceMetres(point, line[0])
  }

  const lat0 = (point[1] * Math.PI) / 180
  const metersPerDegLat = 111320
  const metersPerDegLon = 111320 * Math.cos(lat0)

  const px = (point[0] - point[0]) * metersPerDegLon
  const py = (point[1] - point[1]) * metersPerDegLat

  let best = Number.POSITIVE_INFINITY

  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]
    const b = line[i + 1]

    const ax = (a[0] - point[0]) * metersPerDegLon
    const ay = (a[1] - point[1]) * metersPerDegLat

    const bx = (b[0] - point[0]) * metersPerDegLon
    const by = (b[1] - point[1]) * metersPerDegLat

    const abx = bx - ax
    const aby = by - ay

    const apx = px - ax
    const apy = py - ay

    const ab2 = abx * abx + aby * aby

    let t = 0

    if (ab2 > 0) {
      t = (apx * abx + apy * aby) / ab2
      t = Math.max(0, Math.min(1, t))
    }

    const closestX = ax + abx * t
    const closestY = ay + aby * t

    const dx = px - closestX
    const dy = py - closestY

    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < best) {
      best = distance
    }
  }

  return best
}

/**
 * Find the nearest target-road distance for a CCTV camera.
 */
function nearestRoadDistance(
  point: Coordinate,
  roads: readonly (readonly Coordinate[])[],
): number {
  let best = Number.POSITIVE_INFINITY

  for (const road of roads) {
    const distance = distancePointToPolylineMetres(point, road)

    if (distance < best) {
      best = distance
    }
  }

  return best
}

/**
 * Extract a usable camera image URL.
 */
function getCameraUrl(
  properties: CameraFeature["properties"],
): string {
  return String(
    properties?.URL ??
      properties?.url ??
      "",
  ).trim()
}

/**
 * Extract camera ID.
 */
function getCameraId(
  properties: CameraFeature["properties"],
  index: number,
): string {
  return String(
    properties?.KEY ??
      properties?.key ??
      `local-cctv-${index}`,
  ).trim()
}

/**
 * Extract description.
 */
function getCameraDescription(
  properties: CameraFeature["properties"],
): string {
  return String(
    properties?.DESCRIPTION ??
      properties?.description ??
      "Traffic Camera",
  ).trim()
}

/**
 * Extract district.
 */
function getCameraDistrict(
  properties: CameraFeature["properties"],
): string {
  return String(
    properties?.DISTRICT ??
      properties?.district ??
      "",
  ).trim()
}

function formatDistance(distance: number): string {
  if (!Number.isFinite(distance)) return "—"

  if (distance < 1000) {
    return `${Math.round(distance)}m`
  }

  return `${(distance / 1000).toFixed(1)}km`
}

export function LocalCctvPanel({
  roads,
  radiusMetres = 80,
}: LocalCctvPanelProps) {
  const [cameras, setCameras] = useState<CameraItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const targetRoads = useMemo(
    () =>
      roads.filter(
        (road) => Array.isArray(road) && road.length >= 2,
      ),
    [roads],
  )

  useEffect(() => {
    let cancelled = false

    async function loadCameras() {
      try {
        setError(null)

        const response = await fetch("/api/picture", {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(
            `CCTV API returned ${response.status}`,
          )
        }

        const body =
          (await response.json()) as CameraResponse

        const features = Array.isArray(body.cameras?.features)
          ? body.cameras.features
          : []

        const matched: CameraItem[] = []

        features.forEach((feature, index) => {
          const coordinates = feature.geometry?.coordinates

          if (
            !Array.isArray(coordinates) ||
            coordinates.length < 2
          ) {
            return
          }

          const longitude = Number(coordinates[0])
          const latitude = Number(coordinates[1])

          if (
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude)
          ) {
            return
          }

          const imageUrl = getCameraUrl(
            feature.properties,
          )

          if (!imageUrl) {
            return
          }

          const point: Coordinate = [
            longitude,
            latitude,
          ]

          const distance = nearestRoadDistance(
            point,
            targetRoads,
          )

          /**
           * IMPORTANT:
           *
           * This is intentionally strict.
           *
           * We only show cameras within the target road
           * corridor. We do NOT show general nearby Kowloon
           * cameras.
           */
          if (distance > radiusMetres) {
            return
          }

          matched.push({
            id: getCameraId(
              feature.properties,
              index,
            ),
            description: getCameraDescription(
              feature.properties,
            ),
            district: getCameraDistrict(
              feature.properties,
            ),
            imageUrl,
            longitude,
            latitude,
            distanceMetres: distance,
          })
        })

        matched.sort(
          (a, b) =>
            a.distanceMetres -
            b.distanceMetres,
        )

        if (!cancelled) {
          setCameras(matched.slice(0, 8))
          setLastUpdated(new Date())
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return

        console.error(
          "Failed to load local CCTV:",
          err,
        )

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load CCTV",
        )

        setLoading(false)
      }
    }

    loadCameras()

    /**
     * Transport Department traffic snapshot images
     * are updated approximately every 2 minutes.
     *
     * We refresh this panel every 5 minutes to avoid
     * excessive requests.
     */
    const timer = window.setInterval(
      loadCameras,
      5 * 60 * 1000,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [targetRoads, radiusMetres])

  return (
    <section className="rounded-2xl border border-white/10 bg-[#020514]/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
            CCTV MONITORING
          </div>

          <h2 className="mt-1 text-lg font-semibold text-white">
            附近交通攝影機
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            只顯示距離兩段目標道路中心線 {radiusMetres}m
            內的 CCTV
          </p>
        </div>

        <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {loading
            ? "載入中"
            : `${cameras.length} 部目標路段 CCTV`}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
          正在搜尋目標道路附近 CCTV…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
          <div className="font-medium">
            CCTV 暫時無法載入
          </div>

          <div className="mt-1 text-xs text-red-200/70">
            {error}
          </div>
        </div>
      )}

      {!loading &&
        !error &&
        cameras.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <div className="text-sm font-medium text-slate-300">
              目標道路附近暫時沒有符合條件的 CCTV
            </div>

            <div className="mt-2 text-xs leading-5 text-slate-500">
              篩選範圍：
              <span className="text-slate-400">
                {" "}
                兩段目標道路中心線 {radiusMetres}m 內
              </span>
            </div>
          </div>
        )}

      {!loading &&
        !error &&
        cameras.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cameras.map((camera) => (
              <article
                key={camera.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
                  <img
                    src={`/api/camera?url=${encodeURIComponent(
                      camera.imageUrl,
                    )}`}
                    alt={camera.description}
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.opacity =
                        "0.25"
                    }}
                  />

                  <div className="absolute left-2 top-2 rounded-full border border-cyan-300/20 bg-black/70 px-2 py-1 text-[10px] font-medium text-cyan-200 backdrop-blur">
                    距道路 {formatDistance(camera.distanceMetres)}
                  </div>
                </div>

                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                    {camera.description}
                  </div>

                  {camera.district && (
                    <div className="mt-1 text-xs text-slate-500">
                      {camera.district}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                    <span>
                      TD CCTV
                    </span>

                    <span>
                      {camera.id}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          資料來源：香港運輸署交通情況快拍圖像
        </span>

        <span>
          {lastUpdated
            ? `更新：${lastUpdated.toLocaleTimeString(
                "zh-HK",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}`
            : "等待更新"}
        </span>
      </div>
    </section>
  )
}
