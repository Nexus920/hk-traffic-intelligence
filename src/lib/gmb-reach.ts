import networkFile from "../../data/gmb-network.json" with { type: "json" }
import { pointsWithin, spreadWithin } from "@/lib/nearest"
import { indexPoints, mates } from "@/lib/point-index"

type StopRecord = {
  tc: string
  en: string
  lng: number
  lat: number
  routes: string[]
  ids: Record<string, string>
}

type NetworkFile = { stops: Record<string, StopRecord> }

export type GmbStopPoint = { id: string; lng: number; lat: number; routes: string[] }

const network = networkFile as NetworkFile
const stopList: GmbStopPoint[] = []
for (const [id, stop] of Object.entries(network.stops)) {
  if (!Number.isFinite(stop.lng) || !Number.isFinite(stop.lat)) continue
  stopList.push({ id, lng: stop.lng, lat: stop.lat, routes: stop.routes ?? [] })
}

const pointIndex = indexPoints(stopList)

export function gmbStop(id: string): StopRecord | null {
  return network.stops[id] ?? null
}

export function gmbPoleIds(id: string): string[] {
  const stop = network.stops[id]
  if (!stop) return []
  return mates(pointIndex, id, stop.lng, stop.lat)
}

export function gmbStopsWithin(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return pointsWithin(stopList, lng, lat, radiusMetres, limit)
}

export function gmbStopsSpread(lng: number, lat: number, radiusMetres: number, limit: number): GmbStopPoint[] {
  return spreadWithin(stopList, lng, lat, radiusMetres, limit)
}
/**
 * Resolve public route labels to official numeric route IDs using the
 * bundled official stop catalogue. A label may map to multiple IDs; callers
 * must preserve all matches and validate direction/stop coverage separately.
 */
export function gmbOfficialRouteIdsForLabels(labels: readonly string[]): Record<string, number[]> {
  const wanted = new Set(labels.map((label) => label.trim()).filter(Boolean))
  const matches = new Map<string, Set<number>>()
  for (const stop of Object.values(network.stops)) {
    for (const [rawId, label] of Object.entries(stop.ids ?? {})) {
      if (!wanted.has(label)) continue
      const routeId = Number(rawId)
      if (!Number.isSafeInteger(routeId) || routeId <= 0) continue
      const ids = matches.get(label) ?? new Set<number>()
      ids.add(routeId)
      matches.set(label, ids)
    }
  }
  return Object.fromEntries([...wanted].sort().map((label) => [label, [...(matches.get(label) ?? [])].sort((a, b) => a - b)]))
}
