"use client"

import { useEffect, useMemo, useState } from "react"

type RoadPoint = [number, number]

type IncidentFeature = {
  type: "Feature"
  properties?: {
    name?: string
    nameTc?: string
    location?: string
    locationEn?: string
    landmark?: string
    landmarkEn?: string
    direction?: string
    directionTc?: string
    content?: string
    contentTc?: string
    announced?: string
  }
  geometry?: {
    type: "Point"
    coordinates: [number, number]
  }
}

type IncidentsResponse = {
  ok: boolean
  error?: string
  observedAt?: string | null
  incidents?: {
    type: "FeatureCollection"
    features: IncidentFeature[]
  }
}

type Props = {
  roads: RoadPoint[][]
  radiusMetres?: number
}

export function LocalTrafficIncidentsPanel({
  roads,
  radiusMetres = 500,
}: Props) {
  const [data, setData] = useState<IncidentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError("")

        const response = await fetch("/api/incidents", {
          cache: "no-store",
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const body = (await response.json()) as IncidentsResponse

        if (!cancelled) {
          setData(body)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Traffic incidents failed")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    const timer = window.setInterval(load, 60_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const incidents = useMemo(() => {
    const features = data?.incidents?.features ?? []

    return features
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates
        if (!coordinates) return null

        const distance = nearestRoadDistance(coordinates, roads)

        return {
          feature,
          distance,
        }
      })
      .filter(
        (
          item,
        ): item is {
          feature: IncidentFeature
          distance: number
        } => item !== null && item.distance <= radiusMetres,
      )
      .sort((a, b) => a.distance - b.distance)
  }, [data, roads, radiusMetres])

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 text-white shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            Traffic Incidents / 交通事故及消息
          </div>
          <div className="mt-1 text-xs text-white/55">
            Local roads · {radiusMetres}m radius
          </div>
        </div>

        <div className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">
          {loading ? "Loading…" : `${incidents.length} nearby`}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">
          Unable to load traffic incidents.
          <div className="mt-1 text-red-200/70">{error}</div>
        </div>
      ) : loading && incidents.length === 0 ? (
        <div className="rounded-xl bg-white/5 p-4 text-sm text-white/50">
          Loading traffic incidents…
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-4">
          <div className="text-sm font-medium text-emerald-200">
            No nearby traffic incidents
          </div>
          <div className="mt-1 text-xs text-white/50">
            No active TD traffic messages were found within the monitored road
            area.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map(({ feature, distance }, index) => {
            const properties = feature.properties ?? {}

            const title =
              properties.nameTc ||
              properties.name ||
              "Traffic Incident"

            const location =
              properties.location ||
              properties.locationEn ||
              properties.landmark ||
              properties.landmarkEn ||
              ""

            const content =
              properties.contentTc ||
              properties.content ||
              ""

            const direction =
              properties.directionTc ||
              properties.direction ||
              ""

            return (
              <article
                key={`${title}-${location}-${index}`}
                className="rounded-xl border border-orange-400/15 bg-orange-400/5 p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-sm">
                    ⚠️
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-orange-100">
                      {title}
                    </div>

                    {location ? (
                      <div className="mt-1 text-xs text-white/65">
                        📍 {location}
                      </div>
                    ) : null}

                    {direction ? (
                      <div className="mt-1 text-xs text-white/50">
                        Direction: {direction}
                      </div>
                    ) : null}

                    {content ? (
                      <div className="mt-2 text-xs leading-5 text-white/75">
                        {content}
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
                      <span>
                        Distance: {formatDistance(distance)}
                      </span>

                      {properties.announced ? (
                        <span>
                          Updated: {formatTime(properties.announced)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {data?.observedAt ? (
        <div className="mt-3 text-[11px] text-white/35">
          TD traffic news: {formatTime(data.observedAt)}
        </div>
      ) : null}
    </section>
  )
}

function nearestRoadDistance(
  point: RoadPoint,
  roads: RoadPoint[][],
): number {
  let best = Number.POSITIVE_INFINITY

  for (const road of roads) {
    for (let index = 0; index < road.length - 1; index += 1) {
      const distance = pointToSegmentDistance(
        point,
        road[index],
        road[index + 1],
      )

      if (distance < best) {
        best = distance
      }
    }

    if (road.length === 1) {
      best = Math.min(best, metres(point, road[0]))
    }
  }

  return best
}

function pointToSegmentDistance(
  point: RoadPoint,
  start: RoadPoint,
  end: RoadPoint,
): number {
  const latitude = point[1]
  const scaleX = 111_320 * Math.cos((latitude * Math.PI) / 180)
  const scaleY = 110_540

  const px = point[0] * scaleX
  const py = point[1] * scaleY
  const ax = start[0] * scaleX
  const ay = start[1] * scaleY
  const bx = end[0] * scaleX
  const by = end[1] * scaleY

  const dx = bx - ax
  const dy = by - ay

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay)
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy),
    ),
  )

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function metres(a: RoadPoint, b: RoadPoint): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180)
  const dx = (a[0] - b[0]) * 111_320 * Math.cos(latitude)
  const dy = (a[1] - b[1]) * 110_540

  return Math.hypot(dx, dy)
}

function formatDistance(distance: number): string {
  if (!Number.isFinite(distance)) return "—"
  if (distance < 1000) return `${Math.round(distance)} m`
  return `${(distance / 1000).toFixed(1)} km`
}

function formatTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString("en-HK", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
