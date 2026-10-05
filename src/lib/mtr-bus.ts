import { pointsWithin } from "./nearest.ts"
import { pointKey } from "./point-index.ts"

export type MtrBusPole = {
  id: string
  nameTc: string
  nameEn: string
  lng: number
  lat: number
  routes: string[]
  stopIds: string[]
}

export type MtrBusVisit = {
  route: string
  minutes: number
  scheduled: boolean
}

const SENTINEL_SECONDS = 100_000

export function parseMtrBusStops(csv: string): MtrBusPole[] {
  const table = parseCsv(csv)
  const header = table[0]?.map((cell) => cell.trim()) ?? []
  if (header.length === 0) return []
  const index = new Map(header.map((name, position) => [name, position]))
  const poles = new Map<string, MtrBusPole>()
  for (const row of table.slice(1)) {
    const route = cell(row, index, "ROUTE_ID")
    const stopId = cell(row, index, "STATION_ID")
    const lat = Number(cell(row, index, "STATION_LATITUDE"))
    const lng = Number(cell(row, index, "STATION_LONGITUDE"))
    if (!route || !stopId || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const key = pointKey(lng, lat)
    const nameTc = cell(row, index, "STATION_NAME_CHI")
    const nameEn = cell(row, index, "STATION_NAME_ENG")
    const pole = poles.get(key)
    if (!pole) {
      poles.set(key, { id: key, nameTc, nameEn, lng, lat, routes: [route], stopIds: [stopId] })
      continue
    }
    if (!pole.routes.includes(route)) pole.routes.push(route)
    if (!pole.stopIds.includes(stopId)) pole.stopIds.push(stopId)
    if (!pole.nameTc && nameTc) pole.nameTc = nameTc
    if (!pole.nameEn && nameEn) pole.nameEn = nameEn
  }
  for (const pole of poles.values()) pole.routes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return [...poles.values()]
}

export function mtrBusPolesNear(poles: readonly MtrBusPole[], lng: number, lat: number, radiusMetres: number, limit: number): MtrBusPole[] {
  return pointsWithin(poles, lng, lat, radiusMetres, limit)
}

export function mtrBusMinutes(arrival: string | undefined, departure: string | undefined): number | null {
  const arrivalSeconds = Number(arrival)
  const departureSeconds = Number(departure)
  const seconds = Number.isFinite(arrivalSeconds) && arrivalSeconds >= 0 && arrivalSeconds < SENTINEL_SECONDS
    ? arrivalSeconds
    : Number.isFinite(departureSeconds) && departureSeconds >= 0 && departureSeconds < SENTINEL_SECONDS
      ? departureSeconds
      : Number.NaN
  if (!Number.isFinite(seconds)) return null
  return Math.max(0, Math.round(seconds / 60))
}

export function mtrBusVisits(stopIds: readonly string[], route: string, body: unknown): MtrBusVisit[] {
  if (!body || typeof body !== "object" || !("busStop" in body) || !Array.isArray(body.busStop)) return []
  const wanted = new Set(stopIds)
  const visits: MtrBusVisit[] = []
  for (const stop of body.busStop) {
    if (!stop || typeof stop !== "object") continue
    const row = stop as { busStopId?: unknown; bus?: unknown }
    if (typeof row.busStopId !== "string" || !wanted.has(row.busStopId) || !Array.isArray(row.bus)) continue
    for (const bus of row.bus) {
      if (!bus || typeof bus !== "object") continue
      const item = bus as { arrivalTimeInSecond?: unknown; departureTimeInSecond?: unknown; isScheduled?: unknown }
      const minutes = mtrBusMinutes(
        typeof item.arrivalTimeInSecond === "string" ? item.arrivalTimeInSecond : undefined,
        typeof item.departureTimeInSecond === "string" ? item.departureTimeInSecond : undefined,
      )
      if (minutes == null) continue
      visits.push({ route, minutes, scheduled: item.isScheduled === "1" })
    }
  }
  visits.sort((a, b) => a.minutes - b.minutes || a.route.localeCompare(b.route, undefined, { numeric: true }))
  return visits
}

function cell(row: string[], index: Map<string, number>, name: string): string {
  const position = index.get(name)
  if (position == null) return ""
  return row[position]?.trim() ?? ""
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  const source = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === "\"") {
        if (source[i + 1] === "\"") {
          value += "\""
          i += 1
        } else quoted = false
      } else value += char
      continue
    }
    if (char === "\"") {
      quoted = true
      continue
    }
    if (char === ",") {
      row.push(value)
      value = ""
      continue
    }
    if (char === "\n") {
      row.push(value)
      rows.push(row)
      row = []
      value = ""
      continue
    }
    if (char !== "\r") value += char
  }
  if (value.length > 0 || row.length > 0) {
    row.push(value)
    rows.push(row)
  }
  return rows.filter((item) => item.some((entry) => entry.trim()))
}
