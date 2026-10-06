import { fetchUpstream } from "./upstream.ts"

export type ClpStation = {
  id: string
  name: string
  provider: string
  lng: number
  lat: number
  address: string
  free: number | null
  updated: string
  quick: number
  semiQuick: number
}

const LIST_URL = "https://api.clp.com.hk/evcharger/list"
const LIST_MS = 60_000

export function parseClpStations(body: unknown): ClpStation[] {
  if (!body || typeof body !== "object") return []
  const root = body as Record<string, unknown>
  if (root.code !== 200) return []
  const data = root.data
  if (!data || typeof data !== "object" || !("geoLocationResult" in data) || !Array.isArray(data.geoLocationResult)) return []
  return data.geoLocationResult.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const lng = numeric(row.longitude)
    const lat = numeric(row.latitude)
    const id = text(row.itemId)
    if (!id || lng == null || lat == null) return []
    const plugs = Array.isArray(row.chargerList) ? row.chargerList : []
    let quick = 0
    let semiQuick = 0
    for (const plug of plugs) {
      if (!plug || typeof plug !== "object") continue
      const kind = text((plug as Record<string, unknown>).chargerType)
      if (kind === "Quick") quick += 1
      if (kind === "Semi-Quick") semiQuick += 1
    }
    return [
      {
        id,
        name: text(row.title),
        provider: text(row.provider),
        lng,
        lat,
        address: text(row.detailedAddress),
        free: liveFree(row),
        updated: text(row.lastUpdate),
        quick,
        semiQuick,
      },
    ]
  })
}

export async function loadClpStations(): Promise<ClpStation[]> {
  try {
    const response = await fetchUpstream(LIST_URL, LIST_MS, {
      timeoutMs: 8_000,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Referer: "https://data.gov.hk/",
        Origin: "https://data.gov.hk",
      },
    })
    if (response.status !== 200) return []
    const body = JSON.parse(new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")) as unknown
    return parseClpStations(body)
  } catch {
    return []
  }
}

function liveFree(row: Record<string, unknown>): number | null {
  const total = numeric(row.totalNumberOfCharger) ?? 0
  const unknown = numeric(row.totalNumberOfStatusNotAvailableCharger) ?? 0
  const available = numeric(row.totalNumberOfAvailableCharger)
  if (available == null) return null
  if (total > 0 && unknown >= total) return null
  return available
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value)
  return null
}
