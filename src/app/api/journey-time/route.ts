import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const TDAS_ROUTE_URL =
  "https://tdas-api.hkemobility.gov.hk/tdas/api/route"

type Point = {
  lat: number
  long: number
}

type JourneyRequest = {
  id: string
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string
  start: Point
  end: Point
}

type JourneyResult = {
  id: string
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string

  ok: boolean

  eta: string | null
  journeyTimeMinutes: number | null
  distanceMetres: number | null
  distanceText: string | null
  speedKmh: number | null

  status:
    | "LIVE"
    | "NO_DATA"
    | "ERROR"

  source: "TDAS" | "NONE"

  error?: string
}

/*
 * Official TD road-centreline coordinates used by the local dashboard.
 *
 * Boundary Street:
 * 131 Boundary Street → 174 Boundary Street
 *
 * La Salle Road:
 * 1E La Salle Road → 1B La Salle Road
 *
 * Coordinates are WGS84 [longitude, latitude] in the source GeoJSON.
 * TDAS requires { lat, long }, so they are converted below.
 */
const JOURNEY_ROUTES: JourneyRequest[] = [
  {
    id: "boundary-131-174",
    nameTc: "界限街",
    nameEn: "Boundary Street",
    startAddress: "131 Boundary Street",
    endAddress: "174 Boundary Street",

    start: {
      lat: 22.3286457991516,
      long: 114.1794446737888,
    },

    end: {
      lat: 22.32882430423036,
      long: 114.1833711857157,
    },
  },

  {
    id: "la-salle-1e-1b",
    nameTc: "喇沙利道",
    nameEn: "La Salle Road",
    startAddress: "1E La Salle Road",
    endAddress: "1B La Salle Road",

    start: {
      lat: 22.32795327540832,
      long: 114.1794975466469,
    },

    end: {
      lat: 22.3286457991516,
      long: 114.1794446737888,
    },
  },
]

function parseJourneyTimeMinutes(
  eta: unknown,
): number | null {
  if (typeof eta !== "string") {
    return null
  }

  const value = eta.trim()

  /*
   * TDAS normally returns hh:mm.
   *
   * Examples:
   * "00:02"
   * "00:05"
   * "01:15"
   */

  const match = value.match(
    /^(\d+):(\d{2})(?::(\d{2}))?$/,
  )

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = match[3]
    ? Number(match[3])
    : 0

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return null
  }

  return (
    hours * 60 +
    minutes +
    seconds / 60
  )
}

function parseSpeed(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const number = Number(
    value.replace(/[^\d.+-]/g, ""),
  )

  return Number.isFinite(number)
    ? number
    : null
}

function parseDistance(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const number = Number(
    value.replace(/[^\d.+-]/g, ""),
  )

  return Number.isFinite(number)
    ? number
    : null
}

function formatDistance(
  metres: number | null,
): string | null {
  if (metres == null) {
    return null
  }

  if (metres < 1000) {
    return `${Math.round(metres)} m`
  }

  return `${(metres / 1000).toFixed(2)} km`
}

function noDataResult(
  route: JourneyRequest,
  error?: string,
): JourneyResult {
  return {
    id: route.id,
    nameTc: route.nameTc,
    nameEn: route.nameEn,
    startAddress: route.startAddress,
    endAddress: route.endAddress,

    ok: false,

    eta: null,
    journeyTimeMinutes: null,
    distanceMetres: null,
    distanceText: null,
    speedKmh: null,

    status: error
      ? "ERROR"
      : "NO_DATA",

    source: "NONE",

    ...(error ? { error } : {}),
  }
}

async function fetchTdasRoute(
  route: JourneyRequest,
): Promise<JourneyResult> {
  try {
    const response = await fetch(
      TDAS_ROUTE_URL,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },

        body: JSON.stringify({
          start: route.start,
          end: route.end,

          /*
           * Ask TDAS for current traffic conditions.
           *
           * departIn = 0 means departure now.
           */
          departIn: 0,

          lang: "en",

          /*
           * ST = shortest-time route.
           */
          type: "ST",
        }),

        cache: "no-store",

        signal: AbortSignal.timeout(
          15_000,
        ),
      },
    )

    if (!response.ok) {
      return noDataResult(
        route,
        `TDAS HTTP ${response.status}`,
      )
    }

    const payload: unknown =
      await response.json()

    if (
      typeof payload !== "object" ||
      payload === null
    ) {
      return noDataResult(
        route,
        "Invalid TDAS response",
      )
    }

    const data =
      payload as Record<string, unknown>

    /*
     * TDAS may return an error message instead
     * of a route when the short road segment
     * cannot be matched.
     */
    const responseText =
      typeof data.message === "string"
        ? data.message
        : typeof data.error === "string"
          ? data.error
          : null

    if (
      responseText &&
      !data.eta &&
      !data.route
    ) {
      return noDataResult(
        route,
        responseText,
      )
    }

    const eta =
      typeof data.eta === "string"
        ? data.eta
        : null

    const journeyTimeMinutes =
      parseJourneyTimeMinutes(eta)

    const distanceMetres =
      parseDistance(data.distM)

    const distanceText =
      typeof data.distU === "string"
        ? data.distU
        : formatDistance(distanceMetres)

    const speedKmh =
      parseSpeed(data.jSpeed)

    /*
     * If TDAS gives no route/ETA,
     * treat it as no usable data.
     */
    if (
      !eta &&
      distanceMetres == null &&
      speedKmh == null
    ) {
      return noDataResult(
        route,
        "TDAS returned no usable route data",
      )
    }

    return {
      id: route.id,
      nameTc: route.nameTc,
      nameEn: route.nameEn,
      startAddress: route.startAddress,
      endAddress: route.endAddress,

      ok: true,

      eta,
      journeyTimeMinutes,
      distanceMetres,
      distanceText,
      speedKmh,

      status: "LIVE",

      source: "TDAS",
    }
  } catch (error) {
    return noDataResult(
      route,
      error instanceof Error
        ? error.message
        : "TDAS request failed",
    )
  }
}

export async function GET() {
  const observedAt =
    new Date().toISOString()

  const results =
    await Promise.all(
      JOURNEY_ROUTES.map(
        fetchTdasRoute,
      ),
    )

  const liveCount =
    results.filter(
      (item) =>
        item.status === "LIVE",
    ).length

  const body = {
    ok: true,

    observedAt,

    source: "TDAS",

    routes: results,

    summary: {
      total: results.length,
      live: liveCount,
      noData:
        results.filter(
          (item) =>
            item.status ===
            "NO_DATA",
        ).length,
      error:
        results.filter(
          (item) =>
            item.status ===
            "ERROR",
        ).length,
    },
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control":
        "no-store, max-age=0",
    },
  })
}
