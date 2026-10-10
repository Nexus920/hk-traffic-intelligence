import { loadGmbRouteStopCoordinates, getGmbRouteStopCoordinateDiagnostics } from "@/lib/gmb-route-stops"
import { parseGmbRouteStopDiagnosticsParams } from "@/lib/gmb-route-stop-diagnostics-validation"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const params = parseGmbRouteStopDiagnosticsParams(
    url.searchParams.get("routeId"),
    url.searchParams.get("routeSeq"),
  )

  if (!params) {
    return Response.json(
      { ok: false, error: "Valid routeId and routeSeq (1 or 2) are required" },
      { status: 400 },
    )
  }

  const { routeId, routeSeq } = params
  try {
    await loadGmbRouteStopCoordinates(routeId, routeSeq)
    const diagnostics = getGmbRouteStopCoordinateDiagnostics(routeId, routeSeq)
    if (!diagnostics) {
      return Response.json(
        { ok: false, error: "Official route-stop data is unavailable" },
        { status: 502 },
      )
    }

    return Response.json({
      ok: true,
      routeId,
      routeSeq,
      inputRows: diagnostics.inputRows,
      validRows: diagnostics.validRows,
      matchedRows: diagnostics.matchedRows,
      coverageRate: diagnostics.coverageRate,
      isComplete: diagnostics.isComplete,
      unmatchedStopIds: diagnostics.unmatchedStopIds,
      duplicateSequences: diagnostics.duplicateSequences,
    })
  } catch {
    return Response.json(
      { ok: false, error: "Unable to load route-stop diagnostics" },
      { status: 502 },
    )
  }
}
