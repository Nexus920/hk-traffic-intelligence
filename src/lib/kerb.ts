import { fetchUpstream } from "@/lib/upstream"
import { kmbReachMetres } from "@/lib/kmb-reach"
import { soloParkingRadiusMetres } from "@/lib/parking-parks"
import { clusterKerbBays, kerbRowsNear, kerbRowsWide, parseKerbBays, type KerbRow } from "@/lib/kerb-bays"

export type KerbPlacesResponse = { ok: true; rows: KerbRow[] } | { ok: false; error?: string; rows: KerbRow[] }

const BAYS_URL = "https://static.data.gov.hk/td/road-network-v2/ON_STREET_PARK.csv"
const CATALOGUE_MS = 12 * 60 * 60 * 1000
export const KERB_POLL_MS = CATALOGUE_MS

let catalogue: { at: number; rows: KerbRow[] } | null = null

export async function loadKerbRows(
  lng: number,
  lat: number,
  zoom = Number.NaN,
  wide = false,
): Promise<{ ok: true; rows: KerbRow[] } | { ok: false }> {
  const rows = await readCatalogue()
  if (!rows) return { ok: false }
  return {
    ok: true,
    rows: wide
      ? kerbRowsWide(rows, lng, lat, soloParkingRadiusMetres(zoom, lat))
      : kerbRowsNear(rows, lng, lat, kmbReachMetres(zoom, lat)),
  }
}

async function readCatalogue(): Promise<KerbRow[] | null> {
  const now = Date.now()
  if (catalogue && now - catalogue.at < CATALOGUE_MS) return catalogue.rows
  try {
    const response = await fetchUpstream(BAYS_URL, CATALOGUE_MS, { timeoutMs: 20_000 })
    if (response.status !== 200) return catalogue?.rows ?? null
    const text = new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")
    const rows = clusterKerbBays(parseKerbBays(text))
    if (rows.length === 0) return catalogue?.rows ?? null
    catalogue = { at: now, rows }
    return rows
  } catch {
    return catalogue?.rows ?? null
  }
}
