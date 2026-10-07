import { LOCAL_ROADS } from "@/lib/local-roads"

export const dynamic = "force-dynamic"

const TDAS_ROUTE_URL =
  "https://tdas-api.hkemobility.gov.hk/tdas/api/route"

type JourneyPoint = {
  lat: number
  long: number
}

type JourneyRoute = {
  id: string
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string
  start: JourneyPoint
  end: JourneyPoint
}

const ROUTES: JourneyRoute[] = [
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

type TdasResponse = {
  eta?: string | number
  distM?: string | number
  distU?: string
  jSpeed?: string | number
  message?: string
  error?: string
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseEtaMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value !== "string") {
    return null
  }

  const text = value.trim()

  const parts = text.split(":").map(Number)

  if (parts.some((part) => !Number.isFinite(part))) {
    return null
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1]
  }

  if (parts.length === 3) {
    return parts[0] * 60 + parts[1] + parts[2] / 60
  }

  const numeric = Number.parseFloat(text)

  return Number.isFinite(numeric) ? numeric : null
}

function formatDistance(distanceMetres: number | null): string | null {
  if (distanceMetres === null) {
    return null
  }

  if (distanceMetres >= 1000) {
    return `${(distanceMetres / 1000).toFixed(1)} km`
  }

  return `${Math.round(distanceMetres)} m`
}

function noDataResult(route: JourneyRoute, error: string) {
  return {
    id: route.id,
    nameTc: route.nameTc,
    nameEn: route.nameEn,
    startAddress: route.startAddress,
    endAddress: route.endAddress,
    eta: null,
    journeyTimeMinutes: null,
    distanceMetres: null,
    distanceText: null,
    speedKmh: null,
    status: "ERROR",
    source: "NONE",
    error,
  }
}

async function fetchTdasRoute(route: JourneyRoute) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(TDAS_ROUTE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "HK-Kowloon-Local-Traffic-Intelligence/1.0",
      },
      body: JSON.stringify({
        start: route.start,
        end: route.end,
        departIn: 0,
        lang: "en",
        type: "ST",
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return noDataResult(
        route,
        `TDAS HTTP ${response.status}`,
      )
    }

    const data = (await response.json()) as TdasResponse

    const speedKmh = parseNumber(data.jSpeed)
    const distanceMetres = parseNumber(data.distM)
    const journeyTimeMinutes = parseEtaMinutes(data.eta)

    return {
      id: route.id,
      nameTc: route.nameTc,
      nameEn: route.nameEn,
      startAddress: route.startAddress,
      endAddress: route.endAddress,
      eta: data.eta ?? null,
      journeyTimeMinutes,
      distanceMetres,
      distanceText:
        data.distU ??
        formatDistance(distanceMetres),
      speedKmh,
      status: "OK",
      source: "TDAS",
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "TDAS request failed"

    return noDataResult(route, message)
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  const observedAt = new Date().toISOString()

  const results = await Promise.all(
    ROUTES.map((route) => fetchTdasRoute(route)),
  )

  const successCount = results.filter(
    (route) => route.status === "OK",
  ).length

  return Response.json({
    ok: successCount > 0,
    observedAt,
    source: "TDAS",
    routes: results,
    summary: {
      total: results.length,
      ok: successCount,
      noData: results.length - successCount,
    },
  })
}
