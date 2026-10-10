import { loadGmbRouteStopCoordinates, getGmbRouteStopCoordinateDiagnostics } from "@/lib/gmb-route-stops"
import {
  getGmbRouteStopQualityStatus,
  parseGmbRouteStopDiagnosticsBatchParams,
} from "@/lib/gmb-route-stop-diagnostics-validation"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = parseGmbRouteStopDiagnosticsBatchParams(
    url.searchParams.get("routeIds"),
    url.searchParams.get("routeSeq"),
  )

  if (!params) {
    return Response.json(
      { ok: false, error: "Provide 1-5 unique routeIds and routeSeq (1 or 2)" },
      { status: 400 },
    )
  }

  const results = []
  // Deliberately sequential: this diagnostic endpoint must not fan out upstream requests.
  for (const routeId of params.routeIds) {
    try {
      await loadGmbRouteStopCoordinates(routeId, params.routeSeq)
      const diagnostics = getGmbRouteStopCoordinateDiagnostics(routeId, params.routeSeq)
      if (!diagnostics) {
        results.push({ routeId, routeSeq: params.routeSeq, qualityStatus: "unavailable" })
        continue
      }
      results.push({
        routeId,
        routeSeq: params.routeSeq,
        qualityStatus: getGmbRouteStopQualityStatus(diagnostics),
        inputRows: diagnostics.inputRows,
        validRows: diagnostics.validRows,
        matchedRows: diagnostics.matchedRows,
        coverageRate: diagnostics.coverageRate,
        isComplete: diagnostics.isComplete,
        unmatchedStopIds: diagnostics.unmatchedStopIds,
        duplicateSequences: diagnostics.duplicateSequences,
      })
    } catch {
      results.push({ routeId, routeSeq: params.routeSeq, qualityStatus: "unavailable" })
    }
  }

  return Response.json({ ok: true, routeSeq: params.routeSeq, results })
}
