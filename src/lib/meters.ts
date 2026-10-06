import { fetchUpstream } from "@/lib/upstream"
import { kmbReachMetres } from "@/lib/kmb-reach"
import { joinMeterOccupancy, meterPolesWide, parseMeterSites, METER_MAP_CAP, type MeterPole, type MeterSite } from "@/lib/meter-poles"

const SPACE_URL = "https://resource.data.one.gov.hk/td/psiparkingspaces/spaceinfo/parkingspaces.csv"
const OCCUPANCY_URL = "https://resource.data.one.gov.hk/td/psiparkingspaces/occupancystatus/occupancystatus.csv"
const SPACE_MS = 12 * 60 * 60 * 1000
const OCCUPANCY_MS = 60_000

let sites: { at: number; rows: MeterSite[] } | null = null
let joined: { at: number; poles: MeterPole[] } | null = null

export async function loadMeterPlaces(
  lng: number,
  lat: number,
  zoom = Number.NaN,
  wide = false,
): Promise<{ ok: true; poles: MeterPole[] } | { ok: false }> {
  const poles = await catalogue()
  if (!poles) return { ok: false }
  const radius = kmbReachMetres(zoom, lat)
  return { ok: true, poles: meterPolesWide(poles, lng, lat, radius, wide ? undefined : METER_MAP_CAP) }
}

async function catalogue(): Promise<MeterPole[] | null> {
  const now = Date.now()
  if (joined && now - joined.at < OCCUPANCY_MS) return joined.poles
  try {
    const needSites = !sites || now - sites.at >= SPACE_MS
    const [spaces, occupancy] = await Promise.all([
      needSites ? readText(SPACE_URL, SPACE_MS, 20_000) : Promise.resolve(null),
      readText(OCCUPANCY_URL, OCCUPANCY_MS, 8_000),
    ])
    if (needSites) {
      if (!spaces) return joined?.poles ?? null
      const rows = parseMeterSites(spaces)
      if (rows.length === 0) return joined?.poles ?? null
      sites = { at: now, rows }
    }
    if (!sites) return joined?.poles ?? null
    if (!occupancy?.includes("ParkingSpaceId")) return joined?.poles ?? joinMeterOccupancy(sites.rows, "")
    const poles = joinMeterOccupancy(sites.rows, occupancy)
    if (poles.length === 0) return joined?.poles ?? null
    joined = { at: now, poles }
    return poles
  } catch {
    return joined?.poles ?? null
  }
}

async function readText(url: string, ttlMs: number, timeoutMs: number): Promise<string | null> {
  const response = await fetchUpstream(url, ttlMs, { timeoutMs })
  if (response.status !== 200) return null
  return new TextDecoder().decode(response.body)
}
