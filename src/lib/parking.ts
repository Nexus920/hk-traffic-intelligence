import { fetchUpstream } from "@/lib/upstream"
import { kmbReachMetres } from "@/lib/kmb-reach"
import { parseParkingParks, parseParkingSpaces, parksNear, publishedMotorcycleVacancies, publishedPrivateVacancies, soloParkingRadiusMetres, type ParkingPark, type ParkingSpace } from "@/lib/parking-parks"

export type ParkingPlace = ParkingPark & { cars: number | null }
export type ParkingPlacesResponse = { ok: true; parks: ParkingPlace[] } | { ok: false; error?: string; parks: ParkingPlace[] }
export type MotorcyclePark = ParkingPark & { motorcycle: number }
export type MotorcyclePlacesResponse = { ok: true; parks: MotorcyclePark[] } | { ok: false; error?: string; parks: MotorcyclePark[] }

const INFO_URL = "https://resource.data.one.gov.hk/td/carpark/basic_info_all.json"
const VACANCY_URL = "https://resource.data.one.gov.hk/td/carpark/vacancy_all.json"
const INFO_MS = 12 * 60 * 60 * 1000
const VACANCY_MS = 60_000
export const MOTORCYCLE_POLL_MS = VACANCY_MS
export const PARKING_POLL_MS = VACANCY_MS
const WIDE_CAP = 600

export async function loadParkingPlaces(
  lng: number,
  lat: number,
  zoom = Number.NaN,
  wide = false,
): Promise<{ ok: true; parks: ParkingPlace[] } | { ok: false }> {
  const [parks, vacancy] = await Promise.all([catalogue(), readJson(VACANCY_URL, VACANCY_MS)])
  if (!parks) return { ok: false }
  const counts = vacancy ? publishedPrivateVacancies(vacancy) : new Map<string, number>()
  const listed = parks.map((park) => ({ ...park, cars: counts.get(park.id) ?? null }))
  return {
    ok: true,
    parks: wide
      ? parksNear(listed, lng, lat, soloParkingRadiusMetres(zoom, lat), WIDE_CAP)
      : parksNear(listed, lng, lat, kmbReachMetres(zoom, lat)),
  }
}

export async function loadMotorcyclePlaces(
  lng: number,
  lat: number,
  zoom = Number.NaN,
  wide = false,
): Promise<{ ok: true; parks: MotorcyclePark[] } | { ok: false }> {
  const [parks, vacancy] = await Promise.all([catalogue(), readJson(VACANCY_URL, VACANCY_MS)])
  if (!parks || !vacancy) return { ok: false }
  const counts = publishedMotorcycleVacancies(vacancy)
  const listed = parks.flatMap((park) => {
    const motorcycle = counts.get(park.id)
    return motorcycle == null ? [] : [{ ...park, motorcycle }]
  })
  return {
    ok: true,
    parks: wide
      ? parksNear(listed, lng, lat, soloParkingRadiusMetres(zoom, lat), WIDE_CAP)
      : parksNear(listed, lng, lat, kmbReachMetres(zoom, lat)),
  }
}

export async function loadParkingVacancy(id: string): Promise<{ ok: true; spaces: ParkingSpace[] } | { ok: false }> {
  const body = await readJson(VACANCY_URL, VACANCY_MS)
  if (!body) return { ok: false }
  return { ok: true, spaces: parseParkingSpaces(body, id) }
}

async function catalogue(): Promise<ParkingPark[] | null> {
  const body = await readJson(INFO_URL, INFO_MS)
  if (!body) return null
  return parseParkingParks(body)
}

async function readJson(url: string, ttlMs: number): Promise<unknown | null> {
  try {
    const response = await fetchUpstream(url, ttlMs, { timeoutMs: 8_000 })
    if (response.status !== 200) return null
    const text = new TextDecoder().decode(response.body).replace(/^\uFEFF/, "")
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
