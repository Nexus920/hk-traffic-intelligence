
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
              : "九巴／城巴"}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-cyan-200">
                  {station.name}
                </h3>

                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] text-slate-400">
                  {station.buses.length} 條路線
                </span>
              </div>

              {station.buses.length === 0 ? (
                <p className="rounded-lg border border-white/5 bg-black/10 p-3 text-xs leading-5 text-slate-400">
                  附近暫時沒有指定路線的到站資料。
                </p>
              ) : (
                <div className="divide-y divide-white/[0.07]">
                  {station.buses.map((bus, index) => {
                    const firstEta = bus.arrivals[0]
                    const secondEta = bus.arrivals[1]

                    const minutes = firstEta
                      ? minutesUntil(firstEta)
                      : null

                    return (
                      <div
                        key={
                          station.id + "-" +
                          bus.operator + "-" +
                          bus.route + "-" +
                          bus.stopName + "-" +
                          bus.destination + "-" +
                          index
                        }
                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-3 first:pt-1 last:pb-1"
                      >
                        <div className="min-w-12">
                          <div className="inline-flex min-w-11 justify-center rounded-md bg-yellow-400/10 px-2 py-1 text-sm font-bold tabular-nums text-yellow-300">
                            {bus.route}
                          </div>

                          <div className="mt-1 text-[10px] text-slate-500">
                            {bus.operator}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-slate-200">
                            {bus.destination}
                          </div>

                          <div className="mt-1 truncate text-[10px] text-slate-500">
                            {bus.stopName}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                            {firstEta ? (
                              <span className="text-yellow-300">
                                到站 {formatTime(firstEta)}
                                {minutes !== null
                                  ? "（" +
                                    (minutes === 0
                                      ? "即將到站"
                                      : "約 " + minutes + " 分鐘") +
                                    "）"
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
              )}
            </section>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>
          資料來源：九巴及城巴官方到站時間 API
        </span>

        <span>
          {updatedAt
            ? "最後更新：" + formatTime(updatedAt)
            : "等待更新"}
        </span>
      </div>
    </section>
  )
}
