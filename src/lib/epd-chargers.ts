import { fetchUpstream } from "./upstream.ts"

export type EpdStation = {
  id: string
  name: string
  nameTc: string
  lng: number
  lat: number
  free: number | null
  standard: number
  medium: number
  quick: number
  fast: number
  publishCounts: boolean
}

const LIST_URL = "https://ev-charger.epd.gov.hk/resource/ev_charger_avail/evca_ver_1_0.json"
export const CHARGER_POLL_MS = 60_000

export function parseEpdStations(body: unknown): EpdStation[] {
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) return []
  return body.data.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const location = row.location
    if (!location || typeof location !== "object") return []
    const point = location as Record<string, unknown>
    const lng = numeric(point.lng)
    const lat = numeric(point.lat)
    const id = text(row.carParkId) || text(row.id)
    if (!id || lng == null || lat == null) return []
    if (lng < 113.82 || lng > 114.45 || lat < 22.15 || lat > 22.58) return []
    const nameTc = text(row.carParkCName)
    const nameEn = text(row.carParkEName)
    const counts = plugCounts(row.chargerTotalByCombinations)
    const free = numeric(row.availableCharger)
    return [
      {
        id,
        name: nameEn || nameTc,
        nameTc: nameTc || nameEn,
        lng,
        lat,
        free: free != null && free >= 0 ? free : null,
        standard: counts.standard,
        medium: counts.medium,
        quick: counts.quick,
        fast: counts.fast,
        publishCounts: counts.known > 0,
      },
    ]
  })
}

export async function loadEpdStations(): Promise<{ ok: true; stations: EpdStation[] } | { ok: false; stations: [] }> {
  try {
    const response = await fetchUpstream(LIST_URL, CHARGER_POLL_MS, {
      timeoutMs: 12_000,
      headers: {
        Accept: "application/json",
        "Accept-Language": "zh-HK,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    })
    if (response.status !== 200) return { ok: false, stations: [] }
    const body = JSON.parse(new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")) as unknown
    return { ok: true, stations: parseEpdStations(body) }
  } catch {
    return { ok: false, stations: [] }
  }
}

function plugCounts(value: unknown): { standard: number; medium: number; quick: number; fast: number; known: number } {
  const counts = { standard: 0, medium: 0, quick: 0, fast: 0, known: 0 }
  if (!Array.isArray(value)) return counts
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const kind = plugKind(text(row.typeEName))
    if (!kind) continue
    const plugs = numeric(row.numOfCharger)
    counts[kind] += plugs != null && plugs > 0 ? Math.round(plugs) : 0
    counts.known += 1
  }
  return counts
}

function plugKind(name: string): "standard" | "medium" | "quick" | "fast" | null {
  const kind = name.trim().toLowerCase()
  if (kind.startsWith("standard")) return "standard"
  if (kind.startsWith("medium")) return "medium"
  if (kind.startsWith("quick")) return "quick"
  if (kind.startsWith("fast")) return "fast"
  return null
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : ""
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}
