import { parseCsv } from "./csv.ts"
import { groundMetres, pointsWithin, spreadWithin } from "./nearest.ts"

export type MeterKind = "general" | "goods" | "coach"

export type MeterSpace = {
  id: string
  kind: MeterKind
  vacant: boolean | null
  updated: string
}

export type MeterSite = {
  id: string
  lng: number
  lat: number
  streetTc: string
  streetEn: string
  sectionTc: string
  sectionEn: string
  spaces: { id: string; kind: MeterKind }[]
}

export type MeterPole = {
  id: string
  lng: number
  lat: number
  streetTc: string
  streetEn: string
  sectionTc: string
  sectionEn: string
  spaces: MeterSpace[]
}

export type MeterPlacesResponse = { ok: true; poles: MeterPole[] } | { ok: false; error?: string; poles: MeterPole[] }

export const METER_CAP = 40
export const METER_WIDE_CAP = 600
export const METER_POLL_MS = 60_000

export function parseMeterSites(spaceCsv: string): MeterSite[] {
  const poles = new Map<string, MeterSite>()
  for (const row of table(spaceCsv, "PoleId")) {
    const poleId = row.PoleId
    const spaceId = row.ParkingSpaceId
    const kind = kindOf(row.VehicleType ?? "")
    const lng = Number(row.Longitude)
    const lat = Number(row.Latitude)
    if (!poleId || !spaceId || !kind || !Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const space = { id: spaceId, kind }
    const pole = poles.get(poleId)
    if (!pole) {
      poles.set(poleId, {
        id: poleId,
        lng,
        lat,
        streetTc: row.Street_tc ?? "",
        streetEn: row.Street ?? "",
        sectionTc: row.SectionOfStreet_tc ?? "",
        sectionEn: row.SectionOfStreet ?? "",
        spaces: [space],
      })
      continue
    }
    pole.spaces.push(space)
  }
  for (const pole of poles.values()) {
    pole.spaces.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  }
  return [...poles.values()]
}

export function joinMeterOccupancy(sites: readonly MeterSite[], occupancyCsv: string): MeterPole[] {
  const occupancy = new Map<string, { status: string; occupied: string; updated: string }>()
  for (const row of table(occupancyCsv, "ParkingSpaceId")) {
    const id = row.ParkingSpaceId
    if (!id) continue
    occupancy.set(id, {
      status: row.ParkingMeterStatus ?? "",
      occupied: row.OccupancyStatus ?? "",
      updated: row.OccupancyDateChanged ?? "",
    })
  }
  return sites.map((site) => ({
    id: site.id,
    lng: site.lng,
    lat: site.lat,
    streetTc: site.streetTc,
    streetEn: site.streetEn,
    sectionTc: site.sectionTc,
    sectionEn: site.sectionEn,
    spaces: site.spaces.map((space) => {
      const reading = occupancy.get(space.id)
      return {
        id: space.id,
        kind: space.kind,
        vacant: vacantOf(reading?.status ?? "", reading?.occupied ?? ""),
        updated: reading?.updated ?? "",
      }
    }),
  }))
}

export function parseMeterPoles(spaceCsv: string, occupancyCsv: string): MeterPole[] {
  return joinMeterOccupancy(parseMeterSites(spaceCsv), occupancyCsv)
}

export function meterClock(updated: string): string {
  const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(updated)
  if (!match?.[1] || !match[2]) return ""
  let hour = Number(match[1])
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return ""
  const meridiem = match[3]?.toUpperCase()
  if (meridiem && hour > 12) return ""
  if (meridiem === "PM" && hour < 12) hour += 12
  if (meridiem === "AM" && hour === 12) hour = 0
  return `${String(hour).padStart(2, "0")}:${match[2]}`
}

export function meterPolesNear(poles: readonly MeterPole[], lng: number, lat: number, radiusMetres: number, limit = METER_CAP): MeterPole[] {
  return pointsWithin(poles, lng, lat, radiusMetres, limit)
}

export function meterPolesWide(poles: readonly MeterPole[], lng: number, lat: number, radiusMetres: number, limit = METER_WIDE_CAP): MeterPole[] {
  return spreadWithin(poles, lng, lat, radiusMetres, limit)
}

export function meterFree(pole: MeterPole): number {
  return pole.spaces.filter((space) => space.vacant === true).length
}

export function meterTone(pole: MeterPole): "open" | "full" | "closed" {
  let occupied = false
  for (const space of pole.spaces) {
    if (space.vacant === true) return "open"
    if (space.vacant === false) occupied = true
  }
  return occupied ? "full" : "closed"
}

export function meterPlateCount(pole: MeterPole): string | null {
  if (meterTone(pole) === "closed") return null
  return String(meterFree(pole))
}

export const METER_STRETCH_METRES = 40

export type MeterStretch = {
  id: string
  lng: number
  lat: number
  streetTc: string
  streetEn: string
  free: number
  tone: "open" | "full" | "closed"
  spaces: MeterSpace[]
}

export function meterStretches(poles: readonly MeterPole[], metres = METER_STRETCH_METRES): MeterStretch[] {
  const parent = poles.map((_, index) => index)
  const find = (index: number): number => {
    let cursor = index
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]] ?? cursor
      cursor = parent[cursor] ?? cursor
    }
    return cursor
  }
  const cell = 0.0005
  const cells = new Map<string, number[]>()
  poles.forEach((pole, index) => {
    const key = `${Math.floor(pole.lng / cell)},${Math.floor(pole.lat / cell)}`
    const list = cells.get(key) ?? []
    list.push(index)
    cells.set(key, list)
  })
  for (let index = 0; index < poles.length; index += 1) {
    const pole = poles[index]
    if (!pole) continue
    const cx = Math.floor(pole.lng / cell)
    const cy = Math.floor(pole.lat / cell)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const otherIndex of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (otherIndex <= index) continue
          const other = poles[otherIndex]
          if (!other || other.streetEn !== pole.streetEn || other.streetTc !== pole.streetTc) continue
          if (groundMetres(pole.lng, pole.lat, other.lng, other.lat) > metres) continue
          const left = find(index)
          const right = find(otherIndex)
          if (left !== right) parent[right] = left
        }
      }
    }
  }
  const groups = new Map<number, MeterPole[]>()
  poles.forEach((pole, index) => {
    const root = find(index)
    const list = groups.get(root) ?? []
    list.push(pole)
    groups.set(root, list)
  })
  return [...groups.values()].map((members) => {
    const first = members[0]
    if (!first) return null
    let id = first.id
    let lng = 0
    let lat = 0
    let free = 0
    let taken = false
    for (const member of members) {
      if (member.id.localeCompare(id, undefined, { numeric: true }) < 0) id = member.id
      lng += member.lng
      lat += member.lat
      free += meterFree(member)
      if (member.spaces.some((space) => space.vacant === false)) taken = true
    }
    const tone = free > 0 ? "open" : taken ? "full" : "closed"
    return {
      id,
      lng: lng / members.length,
      lat: lat / members.length,
      streetTc: first.streetTc,
      streetEn: first.streetEn,
      free,
      tone,
      spaces: members.flatMap((member) => member.spaces),
    }
  }).flatMap((stretch) => stretch ? [stretch] : [])
}

function kindOf(type: string): MeterKind | null {
  switch (type.toUpperCase()) {
    case "A":
      return "general"
    case "G":
      return "goods"
    case "C":
      return "coach"
    default:
      return null
  }
}

function vacantOf(status: string, occupied: string): boolean | null {
  if (status.toUpperCase() === "NU") return null
  if (occupied === "V") return true
  if (occupied === "O") return false
  return null
}

function table(text: string, headerName: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`${headerName},`) || line.startsWith(`${headerName}\r`))
  if (start < 0) return []
  return parseCsv(lines.slice(start).join("\n"))
}
