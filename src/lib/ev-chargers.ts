import { kmbReachMetres } from "./kmb-reach.ts"
import { metresPerPixel } from "./nearest.ts"
import { loadClpStations, type ClpStation } from "./clp-chargers.ts"
import catalogueFile from "../../data/ev-chargers.json" with { type: "json" }

export type ChargerPlace = {
  id: string
  nameTc: string
  nameEn: string
  districtTc: string
  lng: number
  lat: number
  standard: number
  medium: number
  quick: number
  fast: number
  free: number | null
}

export type ChargerPlacesResponse = { ok: true; places: ChargerPlace[] } | { ok: false; error?: string; places: ChargerPlace[] }

export const CHARGER_CAP = 40
export const CHARGER_WIDE_CAP = 600
export const PARKED_CHARGER_M = 15
const WIDE_RADIUS_M = 80_000

const catalogue = parseChargerPlaces(catalogueFile)

export function parseChargerPlaces(body: unknown): ChargerPlace[] {
  const rows = body && typeof body === "object" && "places" in body && Array.isArray(body.places) ? body.places : []
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const id = text(row.id)
    const lng = number(row.lng)
    const lat = number(row.lat)
    if (!id || lng == null || lat == null) return []
    if (lng < 113.82 || lng > 114.45 || lat < 22.15 || lat > 22.58) return []
    return [
      {
        id,
        nameTc: text(row.nameTc),
        nameEn: text(row.nameEn),
        districtTc: text(row.districtTc),
        lng,
        lat,
        standard: count(row.standard),
        medium: count(row.medium),
        quick: count(row.quick),
        fast: count(row.fast),
        free: null,
      },
    ]
  })
}

export async function loadChargerPlaces(lng: number, lat: number, zoom = Number.NaN, wide = false): Promise<{ ok: true; places: ChargerPlace[] }> {
  const live = await loadClpStations()
  const places = joinChargers(catalogue, live)
  return {
    ok: true,
    places: wide
      ? chargersNear(places, lng, lat, soloChargerRadiusMetres(zoom, lat), CHARGER_WIDE_CAP)
      : chargersNear(places, lng, lat, kmbReachMetres(zoom, lat)),
  }
}

const CHARGER_NAME_M = 80
const CHARGER_POINT_M = 15

export function joinChargers(june: readonly ChargerPlace[], live: readonly ClpStation[]): ChargerPlace[] {
  const used = new Set<string>()
  const places = june.map((place) => {
    const match = live.find((station) => !used.has(station.id) && sameCharger(place, station))
    if (!match) return place
    used.add(match.id)
    return { ...place, free: match.free }
  })
  for (const station of live) {
    if (used.has(station.id)) continue
    places.push({
      id: `clp:${station.id}`,
      nameTc: station.name,
      nameEn: station.name,
      districtTc: "",
      lng: station.lng,
      lat: station.lat,
      standard: 0,
      medium: station.semiQuick,
      quick: station.quick,
      fast: 0,
      free: station.free,
    })
  }
  return places
}

function sameCharger(place: ChargerPlace, station: ClpStation): boolean {
  const metres = metresBetween(place.lng, place.lat, station.lng, station.lat)
  if (metres <= CHARGER_POINT_M) return true
  if (metres > CHARGER_NAME_M) return false
  return namesMatch(place.nameEn, station.name) || namesMatch(place.nameTc, station.name)
}

function namesMatch(left: string, right: string): boolean {
  const a = left.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "")
  const b = right.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "")
  if (a.length < 4 || b.length < 4) return false
  return a === b || a.includes(b) || b.includes(a)
}

export function soloChargerRadiusMetres(zoom: number, lat: number): number {
  if (!Number.isFinite(zoom)) return WIDE_RADIUS_M
  return Math.min(WIDE_RADIUS_M, Math.max(800, metresPerPixel(zoom, lat) * 1_600))
}

export function chargersNear(
  places: readonly ChargerPlace[],
  lng: number,
  lat: number,
  radiusM: number,
  cap = CHARGER_CAP,
): ChargerPlace[] {
  const near = places.flatMap((place) => {
    const metres = metresBetween(lng, lat, place.lng, place.lat)
    if (metres > radiusM) return []
    return [{ place, metres }]
  })
  near.sort((left, right) => left.metres - right.metres)
  return near.slice(0, cap).map((item) => item.place)
}

export function chargersInsideParks<T extends { id: string; lng: number; lat: number }>(
  places: readonly ChargerPlace[],
  parks: readonly T[],
): Map<string, ChargerPlace> {
  const hosted = new Map<string, { place: ChargerPlace; metres: number }>()
  for (const place of places) {
    let nearest: { id: string; metres: number } | null = null
    for (const park of parks) {
      const metres = metresBetween(place.lng, place.lat, park.lng, park.lat)
      if (metres > PARKED_CHARGER_M) continue
      if (!nearest || metres < nearest.metres) nearest = { id: park.id, metres }
    }
    if (!nearest) continue
    const current = hosted.get(nearest.id)
    if (!current || nearest.metres < current.metres) hosted.set(nearest.id, { place, metres: nearest.metres })
  }
  return new Map([...hosted].map(([id, hit]) => [id, hit.place]))
}

function metresBetween(lng: number, lat: number, placeLng: number, placeLat: number): number {
  const radius = 6_371_000
  const fromLat = (lat * Math.PI) / 180
  const toLat = (placeLat * Math.PI) / 180
  const dLat = ((placeLat - lat) * Math.PI) / 180
  const dLng = ((placeLng - lng) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(a))
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function number(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return value
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}
