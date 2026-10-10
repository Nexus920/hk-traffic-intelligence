import { uniqueGmbRouteStopRows, type GmbRouteStopRow } from "./gmb-route-stop-validation.ts"

export type GmbStopCoordinate = { lng: number; lat: number }
export type GmbRouteStopCoordinate = {
  stopSeq: number
  stopId: string
  lng: number
  lat: number
}
export type GmbRouteStopJoinResult = {
  stops: GmbRouteStopCoordinate[]
  inputRows: number
  validRows: number
  matchedRows: number
  unmatchedStopIds: string[]
  duplicateSequences: number[]
  isComplete: boolean
}

/**
 * Joins official route-stop rows to a local coordinate lookup and reports
 * incomplete or ambiguous route geometry instead of silently hiding it.
 */
export function joinGmbRouteStopCoordinates(
  rows: GmbRouteStopRow[],
  resolveStop: (stopId: string) => GmbStopCoordinate | null | undefined,
): GmbRouteStopJoinResult {
  const sequenceCounts = new Map<number, number>()
  for (const row of rows) {
    if (Number.isSafeInteger(row.stop_seq) && (row.stop_seq as number) > 0) {
      const seq = row.stop_seq as number
      sequenceCounts.set(seq, (sequenceCounts.get(seq) ?? 0) + 1)
    }
  }

  const duplicateSequences = [...sequenceCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([seq]) => seq)
    .sort((a, b) => a - b)

  const validRows = uniqueGmbRouteStopRows(rows)
  const stops: GmbRouteStopCoordinate[] = []
  const unmatchedStopIds: string[] = []

  for (const row of validRows) {
    const stop = resolveStop(row.stopId)
    if (
      !stop ||
      !Number.isFinite(stop.lng) ||
      !Number.isFinite(stop.lat) ||
      stop.lng < -180 ||
      stop.lng > 180 ||
      stop.lat < -90 ||
      stop.lat > 90
    ) {
      unmatchedStopIds.push(row.stopId)
      continue
    }
    stops.push({
      stopSeq: row.stopSeq,
      stopId: row.stopId,
      lng: stop.lng,
      lat: stop.lat,
    })
  }

  return {
    stops,
    inputRows: rows.length,
    validRows: validRows.length,
    matchedRows: stops.length,
    unmatchedStopIds,
    duplicateSequences,
    isComplete: rows.length === validRows.length && validRows.length === stops.length && duplicateSequences.length === 0,
  }
}
