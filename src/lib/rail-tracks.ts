import tableFile from "../../data/rail-tracks.json" with { type: "json" }
import { lineMetres, orientLine, pointAlong, fractionAlong } from "./rail-geometry.ts"
import type { GeoPoint } from "./mtr-estimate.ts"

type TrackFile = { edges: Record<string, [number, number][]> }

let edges = (tableFile as TrackFile).edges

export function useTrackEdges(next: Record<string, [number, number][]>): void {
  edges = next
}

export function segmentSpan(fromCode: string, toCode: string, start: GeoPoint, end: GeoPoint): GeoPoint[] {
  const stored = edges[[fromCode, toCode].sort().join(">")]
  if (!stored || stored.length < 2) return [start, end]
  const line = stored.map(([lng, lat]) => ({ lng, lat }))
  return orientLine(line, start)
}

export function segmentLength(fromCode: string, toCode: string, start: GeoPoint, end: GeoPoint): number {
  return lineMetres(segmentSpan(fromCode, toCode, start, end))
}

export function pointOnSpan(fromCode: string, toCode: string, start: GeoPoint, end: GeoPoint, mix: number): GeoPoint {
  const line = segmentSpan(fromCode, toCode, start, end)
  return pointAlong(line, lineMetres(line) * Math.min(1, Math.max(0, mix)))
}

export function mixOnSpan(fromCode: string, toCode: string, start: GeoPoint, end: GeoPoint, point: GeoPoint): number {
  return fractionAlong(segmentSpan(fromCode, toCode, start, end), point)
}
