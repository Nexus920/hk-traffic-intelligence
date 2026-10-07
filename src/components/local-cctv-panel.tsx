"use client"

import { useEffect, useMemo, useState } from "react"

type Camera = {
  id: string
  name?: string
  district?: string
  url?: string
  coordinates: [number, number]
}

type Props = {
  roads: [number, number][][]
  radiusMetres?: number
}

function distanceMetres(
  a: [number, number],
  b: [number, number],
) {
  const dx =
    (a[0] - b[0]) *
    111320 *
    Math.cos(
      ((a[1] + b[1]) * Math.PI) / 360,
    )

  const dy =
    (a[1] - b[1]) * 110540

  return Math.hypot(dx, dy)
}

function nearestRoadDistance(
  point: [number, number],
  roads: [number, number][][],
) {
  let best = Number.POSITIVE_INFINITY

  for (const road of roads) {
    for (const coordinate of road) {
      best = Math.min(
        best,
        distanceMetres(point, coordinate),
      )
    }
  }

  return best
}

export function LocalCctvPanel({
  roads,
  radiusMetres = 500,
}: Props) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadCameras() {
    try {
      setLoading(true)

      const response = await fetch(
        "/api/picture",
        {
          cache: "no-store",
        },
      )

      const body = await response.json()

      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ??
            "CCTV data unavailable",
        )
      }

      const nearby: Camera[] = (
        body.cameras?.features ?? []
      )
        .map((feature: any) => {
          const coordinates =
            feature.geometry
              ?.coordinates

          if (
            !Array.isArray(coordinates) ||
            coordinates.length < 2
          ) {
            return null
          }

          const [lng, lat] =
            coordinates

          if (
            typeof lng !== "number" ||
            typeof lat !== "number"
          ) {
            return null
          }

          return {
            id:
              feature.properties?.id ??
              "unknown",
            name:
              feature.properties?.name ??
              feature.properties?.id,
            district:
              feature.properties?.district ??
              "",
            url:
              feature.properties?.url ??
              "",
            coordinates: [
              lng,
              lat,
            ] as [number, number],
          }
        })
        .filter(Boolean)
        .map((camera: Camera) => ({
          ...camera,
          distance: nearestRoadDistance(
            camera.coordinates,
            roads,
          ),
        }))
        .filter(
          (camera: any) =>
            camera.distance <=
            radiusMetres,
        )
        .sort(
          (a: any, b: any) =>
            a.distance -
            b.distance,
        )
        .slice(0, 8)

      setCameras(nearby)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "CCTV data unavailable",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCameras()

    const timer =
      window.setInterval(
        loadCameras,
        5 * 60 * 1000,
      )

    return () =>
      window.clearInterval(timer)
  }, [])

  const countText = useMemo(() => {
    if (loading) return "搜尋中..."
    return `${cameras.length} 部附近 CCTV`
  }, [loading, cameras.length])

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl">

      <div className="flex items-center justify-between gap-3">

        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-cyan-300">
            CCTV MONITORING
          </div>

          <h2 className="mt-1 text-base font-bold">
            附近交通攝影機
          </h2>

          <div className="mt-1 text-[10px] text-white/40">
            自動搜尋兩段指定道路
            {` ${radiusMetres}m `}
            範圍內 CCTV
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold text-white/60">
          {countText}
        </div>

      </div>

      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-[10px] text-red-100">
          ⚠️ {error}
        </div>
      )}

      {!loading &&
        cameras.length === 0 &&
        !error && (
          <div className="mt-4 rounded-lg border border-white/5 bg-black/20 p-4 text-center text-xs text-white/40">
            目前搜尋範圍內沒有可用 CCTV。
          </div>
        )}

      {cameras.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

          {cameras.map((camera: any) => (
            <article
              key={camera.id}
              className="overflow-hidden rounded-xl border border-white/10 bg-black/20"
            >

              {camera.url ? (
                <img
                  src={`/api/camera?url=${encodeURIComponent(
                    camera.url,
                  )}`}
                  alt={
                    camera.name ??
                    camera.id
                  }
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-black/30 text-[10px] text-white/30">
                  NO IMAGE
                </div>
              )}

              <div className="p-3">

                <div className="truncate text-xs font-semibold">
                  {camera.name ??
                    camera.id}
                </div>

                <div className="mt-1 text-[10px] text-white/40">
                  {camera.district ||
                    "Kowloon"}
                </div>

                <div className="mt-2 text-[10px] font-semibold text-cyan-300">
                  約{" "}
                  {Math.round(
                    camera.distance,
                  )}
                  m
                </div>

              </div>

            </article>
          ))}

        </div>
      )}

      <div className="mt-3 text-[9px] text-white/30">
        資料來源：Hong Kong Transport Department /
        HKeMobility CCTV
      </div>

    </section>
  )
}
