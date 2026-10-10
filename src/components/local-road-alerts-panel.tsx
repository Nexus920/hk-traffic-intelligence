"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

type Alert = {
  id: string
  road: string
  place: string
  status: string
  kind: string
  lane: string
  bound: string
  district: string
  start: string
  end: string
}

type RoadWorkFeature = {
  geometry?: { coordinates?: unknown } | null
  properties?: Record<string, unknown> | null
}
type RoadWorkResponse = {
  ok?: boolean
  error?: string
  works?: { features?: RoadWorkFeature[] }
}
type NearbyAlert = Alert & { point: [number, number]; distance: number }
function textValue(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value)
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

export function LocalRoadAlertsPanel({
  roads,
  radiusMetres = 500,
}: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true)

      const response = await fetch(
        "/api/picture",
        {
          cache: "no-store",
        },
      )

      const body = (await response.json()) as RoadWorkResponse

      if (!response.ok || !body.ok) {
        throw new Error(
          body.error ??
            "Road works data unavailable",
        )
      }

      const nearby = (
        body.works?.features ?? []
      )
        .map((feature): Omit<NearbyAlert, "distance"> | null => {
          const coordinates =
            feature.geometry?.coordinates

          if (
            !Array.isArray(coordinates) ||
            coordinates.length < 2
          ) {
            return null
          }

          const point: [number, number] = [
            Number(coordinates[0]),
            Number(coordinates[1]),
          ]

          return {
            id:
              String(
                feature.properties?.id ??
                  feature.properties?.roadworksId ??
                  `${String(feature.properties?.road ?? "road")}-${String(coordinates[0])}-${String(coordinates[1])}`,
              ),
            road: textValue(feature.properties?.road, 未知道路),
            place: textValue(feature.properties?.place, ),
            status: textValue(feature.properties?.status, ),
            kind: textValue(feature.properties?.kind, 道路工程),
            lane: textValue(feature.properties?.lane, ),
            bound: textValue(feature.properties?.bound, ),
            district: textValue(feature.properties?.district, ),
            start: textValue(feature.properties?.start, ),
            end: textValue(feature.properties?.end, ),
            point,
          }
        })
        .filter(Boolean)
        .map((item): NearbyAlert | null => item ? ({
          ...item,
          distance: nearestRoadDistance(
            item.point,
            roads,
          ),
        }) : null)
        .filter((item): item is NearbyAlert => item !== null && item.distance <= radiusMetres)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12)

      setAlerts(nearby)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Road works unavailable",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()

    const timer =
      window.setInterval(
        loadAlerts,
        5 * 60 * 1000,
      )

    return () =>
      window.clearInterval(timer)
  }, [])

  const countText = useMemo(() => {
    if (loading) return "搜尋中..."
    return `${alerts.length} 項附近工程`
  }, [loading, alerts.length])

  return (
    <section className="mt-3 rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl">

      <div className="flex items-center justify-between gap-3">

        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-amber-300">
            ROAD WORKS
          </div>

          <h2 className="mt-1 text-base font-bold">
            附近道路工程
          </h2>

          <div className="mt-1 text-[10px] text-white/40">
            自動搜尋指定道路附近 {radiusMetres}m
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
        alerts.length === 0 &&
        !error && (
          <div className="mt-4 rounded-lg border border-white/5 bg-black/20 p-4 text-center text-xs text-white/40">
            目前附近沒有已發現的道路工程。
          </div>
        )}

      {alerts.length > 0 && (
        <div className="mt-4 space-y-2">

          {alerts.map((alert) => (
            <article
              key={alert.id}
              className="rounded-xl border border-white/10 bg-black/20 p-3"
            >

              <div className="flex items-start justify-between gap-3">

                <div>
                  <div className="text-xs font-bold">
                    🚧 {alert.road}
                  </div>

                  {alert.place && (
                    <div className="mt-1 text-[10px] text-white/45">
                      {alert.place}
                    </div>
                  )}
                </div>

                <div className="rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-bold text-amber-300">
                  {alert.status || "進行中"}
                </div>

              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-white/45">

                <div>
                  類型：
                  <span className="text-white/70">
                    {" "}
                    {alert.kind}
                  </span>
                </div>

                <div>
                  距離：
                  <span className="text-amber-300">
                    {" "}
                    {Math.round(
                      alert.distance,
                    )}
                    m
                  </span>
                </div>

                {alert.lane && (
                  <div>
                    車道：
                    <span className="text-white/70">
                      {" "}
                      {alert.lane}
                    </span>
                  </div>
                )}

                {alert.bound && (
                  <div>
                    方向：
                    <span className="text-white/70">
                      {" "}
                      {alert.bound}
                    </span>
                  </div>
                )}

              </div>

            </article>
          ))}

        </div>
      )}

      <div className="mt-3 text-[9px] text-white/30">
        資料來源：Hong Kong Transport Department /
        HKeMobility
      </div>

    </section>
  )
}
