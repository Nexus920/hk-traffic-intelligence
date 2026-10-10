export type GmbRouteStopDiagnosticsParams = {
  routeId: number
  routeSeq: 1 | 2
}

export function parseGmbRouteStopDiagnosticsParams(
  routeIdRaw: string | null,
  routeSeqRaw: string | null,
): GmbRouteStopDiagnosticsParams | null {
  if (!routeIdRaw || !/^[1-9]\d*$/.test(routeIdRaw)) return null
  if (!routeSeqRaw || !/^[12]$/.test(routeSeqRaw)) return null

  const routeId = Number(routeIdRaw)
  if (!Number.isSafeInteger(routeId) || routeId <= 0) return null

  return { routeId, routeSeq: Number(routeSeqRaw) as 1 | 2 }
}
