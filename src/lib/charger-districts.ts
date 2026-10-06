import { canonicalDistrict } from "./i18n.ts"
import { PLACE_POLL_MS } from "./kmb-view.ts"
import { fetchUpstream } from "./upstream.ts"

export type ChargerDistrict = {
  nameTc: string
  nameEn: string
  districtTc: string
}

const LIST_URL = "https://portal.csdi.gov.hk/server/rest/services/common/epd_rcd_1631080339740_69941/MapServer/0/query?where=1%3D1&outFields=LOCATION_TC,LOCATION_EN,NAME_OF_DISTRICT_COUNCIL_DISTRICT_TC&returnGeometry=false&f=json&resultRecordCount=2000"

let cached: { expires: number; rows: ChargerDistrict[] } | null = null

export function parseChargerDistricts(body: unknown): ChargerDistrict[] {
  if (!body || typeof body !== "object" || !("features" in body) || !Array.isArray(body.features)) return []
  return body.features.flatMap((item) => {
    if (!item || typeof item !== "object" || !("attributes" in item)) return []
    const attributes = item.attributes
    if (!attributes || typeof attributes !== "object") return []
    const row = attributes as Record<string, unknown>
    const nameTc = text(row.LOCATION_TC)
    const nameEn = text(row.LOCATION_EN)
    const districtTc = canonicalDistrict(text(row.NAME_OF_DISTRICT_COUNCIL_DISTRICT_TC))
    if ((!nameTc && !nameEn) || !districtTc) return []
    return [{ nameTc, nameEn, districtTc }]
  })
}

export async function loadChargerDistricts(): Promise<ChargerDistrict[]> {
  if (cached && cached.expires > Date.now()) return cached.rows
  try {
    const response = await fetchUpstream(LIST_URL, PLACE_POLL_MS, { timeoutMs: 12_000, headers: { Accept: "application/json" } })
    if (response.status !== 200) return hold(cached?.rows ?? [])
    const rows = parseChargerDistricts(JSON.parse(new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")) as unknown)
    return hold(rows)
  } catch {
    return hold(cached?.rows ?? [])
  }
}

export function withDistricts<T extends { nameTc: string; nameEn: string; districtTc: string }>(
  places: readonly T[],
  rows: readonly ChargerDistrict[],
): T[] {
  const byName = new Map<string, string>()
  for (const row of rows) {
    for (const name of [row.nameTc, row.nameEn]) {
      const key = compact(name)
      if (key.length < 4 || byName.has(key)) continue
      byName.set(key, row.districtTc)
    }
  }
  return places.map((place) => {
    if (place.districtTc) return place
    const districtTc = byName.get(compact(place.nameTc)) || byName.get(compact(place.nameEn))
    return districtTc ? { ...place, districtTc } : place
  })
}

function hold(rows: ChargerDistrict[]): ChargerDistrict[] {
  cached = { expires: Date.now() + PLACE_POLL_MS, rows }
  return rows
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "")
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
