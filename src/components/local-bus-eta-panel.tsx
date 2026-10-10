
"use client"

import { useEffect, useState } from "react"

type BusRow = {
  route: string
  operator: string
  destination: string
  stopName: string
  arrivals: string[]
}

type BusStation = {
  id: string
  name: string
  buses: BusRow[]
}

type BusEtaResponse = {
  ok?: boolean
  observedAt?: string
  stations?: BusStation[]
  error?: string
}

function formatTime(value: string) {
  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    return "--:--"
  }

  return date.toLocaleTimeString("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function minutesUntil(value: string) {
  const time = new Date(value).getTime()

  if (!Number.isFinite(time)) return null

  return Math.max(
    0,
    Math.ceil((time - Date.now()) / 60000),
  )
}

type BusGroup = "CTB" | "KMB" | "GMB"

const BUS_GROUPS: {
  id: BusGroup
  title: string
  color: string
}[] = [
  { id: "CTB", title: "城巴 CTB", color: "#EAB308" },
  { id: "KMB", title: "九巴 KMB", color: "#EF4444" },
  { id: "GMB", title: "綠色專線小巴 GMB", color: "#22C55E" },
]

function getBusGroup(operator: string): BusGroup | null {
  const value = operator.toUpperCase()

  if (value.includes("CTB") || value.includes("城巴")) {
    return "CTB"
  }

  if (value.includes("KMB") || value.includes("九巴")) {
    return "KMB"
  }

  if (
    value.includes("GMB") ||
    value.includes("小巴") ||
    value.includes("專線小巴")
  ) {
    return "GMB"
  }

  return null
}

function sortBusRoutes(a: BusRow, b: BusRow) {
  return a.route.localeCompare(b.route, "en", {
    numeric: true,
    sensitivity: "base",
  })
}


export function LocalBusEtaPanel() {
  const [stations, setStations] =
    useState<BusStation[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] =
    useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadBusEta() {
      try {
        const response = await fetch(
          "/api/bus-eta",
          { cache: "no-store" },
        )

        const body =
          await response.json() as BusEtaResponse

        if (!response.ok || body.ok !== true) {
          throw new Error(
            body.error || "巴士資料暫時無法取得",
          )
        }

        if (!cancelled) {
          setStations(
            Array.isArray(body.stations)
              ? body.stations
              : [],
          )

          setUpdatedAt(
            body.observedAt ||
              new Date().toISOString(),
          )

          setError(null)
          setLoading(false)
        }
      } catch (err) {
        if (cancelled) return

        setError(
          err instanceof Error
            ? err.message
            : "巴士資料暫時無法取得",
        )

        setLoading(false)
      }
    }

    void loadBusEta()

    const timer = window.setInterval(
      () => void loadBusEta(),
      60_000,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
            LIVE BUS ETA
          </div>

          <h2 className="mt-1 text-lg font-semibold text-white">
            附近巴士動態
          </h2>

          <p className="mt-1 text-xs leading-5 text-slate-400">
            喇沙小學及碧華花園附近指定路線
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {loading
            ? "載入中"
            : error
              ? "資料暫不可用"
              : "九巴／城巴／綠色小巴"}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-slate-400">
          正在取得巴士到站時間…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
          巴士動態暫時無法載入：{error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-3 lg:grid-cols-2">
          
{stations.map((station) => (
  <section
    key={station.id}
    className="min-w-0 rounded-xl border border-white/10 bg-[#1E293B]/75 p-3 sm:p-4"
  >
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-cyan-200">
        {station.name}
      </h3>

      <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400">
        {station.buses.length} 條路線
      </span>
    </div>

    {station.buses.length === 0 ? (
      <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs text-slate-400">
        附近暫時沒有指定路線的到站資料。
      </p>
    ) : (
      <div className="space-y-4">
        {BUS_GROUPS.map((group) => {
          const buses = station.buses
            .filter(
              (bus) => getBusGroup(bus.operator) === group.id
            )
            .sort(sortBusRoutes)

          if (buses.length === 0) return null

          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-lg border border-white/10 bg-black/10"
            >
              <div
                className="flex items-center justify-between border-b border-white/10 px-3 py-2"
                style={{
                  borderLeft: `4px solid ${group.color}`,
                }}
              >
                <h4
                  className="text-xs font-bold"
                  style={{ color: group.color }}
                >
                  {group.title}
                </h4>

                <span className="text-[10px] text-slate-400">
                  {buses.length} 條路線
                </span>
              </div>

              <div className="divide-y divide-white/[0.07]">
                {buses.map((bus, index) => {
                  const firstEta = bus.arrivals[0]
                  const secondEta = bus.arrivals[1]
                  const minutes = firstEta
                    ? minutesUntil(firstEta)
                    : null

                  return (
                    <div
                      key={`${station.id}-${group.id}-${bus.route}-${bus.stopName}-${index}`}
                      className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3"
                    >
                      <div className="min-w-12">
                        <div
                          className="inline-flex min-w-11 justify-center rounded-md px-2 py-1 text-sm font-bold tabular-nums"
                          style={{
                            backgroundColor: `${group.color}22`,
                            color: group.color,
                          }}
                        >
                          {bus.route}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-200">
                          {bus.destination}
                        </div>

                        <div className="mt-1 truncate text-[10px] text-slate-500">
                          {bus.stopName}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                          {firstEta ? (
                            <span style={{ color: group.color }}>
                              到站 {formatTime(firstEta)}
                              {minutes !== null
                                ? minutes === 0
                                  ? "（即將到站）"
                                  : `（約 ${minutes} 分鐘）`
                                : ""}
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              暫無到站時間
                            </span>
                          )}

                          {secondEta && (
                            <span className="text-slate-400">
                              次班 {formatTime(secondEta)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )}
  </section>
))}
