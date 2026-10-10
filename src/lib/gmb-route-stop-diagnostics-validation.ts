export type GmbRouteStopDiagnosticsParams = {
  routeId: number
  routeSeq: 1 | 2
}

export type GmbRouteStopQualityStatus = "complete" | "partial" | "no-valid-stops"

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

export function getGmbRouteStopQualityStatus(diagnostics: {
  validRows: number
  isComplete: boolean
}): GmbRouteStopQualityStatus {
  if (diagnostics.validRows === 0) return "no-valid-stops"
  return diagnostics.isComplete ? "complete" : "partial"
}

export type GmbRouteStopDiagnosticsBatchParams = {
  routeIds: number[]
  routeSeq: 1 | 2
}

/** Accepts a small, unique route sample to avoid excessive upstream requests. */
export function parseGmbRouteStopDiagnosticsBatchParams(
  routeIdsRaw: string | null,
  routeSeqRaw: string | null,
): GmbRouteStopDiagnosticsBatchParams | null {
  if (!routeIdsRaw || !routeSeqRaw || !/^[12]$/.test(routeSeqRaw)) return null
  const rawIds = routeIdsRaw.split(",")
  if (rawIds.length < 1 || rawIds.length > 5) return null
  const routeIds: number[] = []
  for (const rawId of rawIds) {
    if (!/^[1-9]\\d*$/.test(rawId)) return null
    const routeId = Number(rawId)
    if (!Number.isSafeInteger(routeId) || routeId <= 0 || routeIds.includes(routeId)) return null
    routeIds.push(routeId)
  }
  return { routeIds, routeSeq: Number(routeSeqRaw) as 1 | 2 }
}
