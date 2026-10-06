import { kmbReachMetres } from "./kmb-reach.ts"
import { metresPerPixel } from "./nearest.ts"
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
}

export type ChargerPlacesResponse = { ok: true; places: ChargerPlace[] } | { ok: false; error?: string; places: ChargerPlace[] }

export const CHARGER_CAP = 40
export const CHARGER_WIDE_CAP = 600
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
      },
    ]
  })
}

export function loadChargerPlaces(lng: number, lat: number, zoom = Number.NaN, wide = false): { ok: true; places: ChargerPlace[] } {
  return {
    ok: true,
    places: wide
      ? chargersNear(catalogue, lng, lat, soloChargerRadiusMetres(zoom, lat), CHARGER_WIDE_CAP)
      : chargersNear(catalogue, lng, lat, kmbReachMetres(zoom, lat)),
  }
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
