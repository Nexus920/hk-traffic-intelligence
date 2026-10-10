import { LOCAL_GMB_MONITORING } from "@/lib/local-gmb-monitoring"
import { gmbOfficialRouteIdsNearPoint } from "@/lib/gmb-reach"
import { loadGmbRouteStopCoordinates, getGmbRouteStopCoordinateDiagnostics } from "@/lib/gmb-route-stops"
import { getGmbRouteStopQualityStatus, rankNearbyGmbRouteStops } from "@/lib/gmb-route-stop-diagnostics-validation"
import { isGmbRouteDirection } from "@/lib/gmb-route-sequence-validation"
import { readEtaJson } from "@/lib/eta-read"
import { parseGmbRouteStopEtaResponse } from "@/lib/gmb-route-eta-validation"

export const dynamic = "force-dynamic"

/**
 * Read-only diagnostic for local-dashboard GMB candidates.
 * This endpoint audits official route-stop coordinate coverage; it does not
 * infer vehicle locations or claim ETA is GPS.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const areaId = url.searchParams.get("area") ?? ""
  const routeSeqRaw = url.searchParams.get("routeSeq") ?? "1"

  if (!Object.hasOwn(LOCAL_GMB_MONITORING, areaId) || !/^[12]$/.test(routeSeqRaw) || !isGmbRouteDirection(Number(routeSeqRaw))) {
    return Response.json(
      { ok: false, error: "Provide area=lasalle|beverly and routeSeq=1|2" },
      { status: 400 },
    )
  }

  const area = LOCAL_GMB_MONITORING[areaId as keyof typeof LOCAL_GMB_MONITORING]
  const [lng, lat] = area.point
  const routeSeq = Number(routeSeqRaw)
  const routeIdsByLabel = gmbOfficialRouteIdsNearPoint(area.gmbRoutes, lng, lat, 300)
  const results: Array<Record<string, unknown>> = []

  // Keep upstream requests bounded and sequential for this diagnostic endpoint.
  const labelsByRouteId = new Map<number, string[]>()
  for (const [label, ids] of Object.entries(routeIdsByLabel)) {
    for (const id of ids) {
      const labels = labelsByRouteId.get(id) ?? []
      labels.push(label)
      labelsByRouteId.set(id, labels)
    }
  }
  const uniqueRouteIds = [...labelsByRouteId.keys()].sort((a, b) => a - b)
  for (const routeId of uniqueRouteIds) {
    try {
      await loadGmbRouteStopCoordinates(routeId, routeSeq)
      const diagnostics = getGmbRouteStopCoordinateDiagnostics(routeId, routeSeq)
      const nearbyStops = rankNearbyGmbRouteStops(diagnostics?.stops ?? [], [lng, lat])
      const etaChecks: Array<Record<string, unknown>> = []
      // Probe only the two closest stops per route to keep upstream traffic bounded.
      for (const stop of nearbyStops.slice(0, 2)) {
        try {
          const etaPayload = await readEtaJson<unknown>(
            `https://data.etagmb.gov.hk/eta/route-stop/${routeId}/${routeSeq}/${stop.stopSeq}`,
          )
          const eta = parseGmbRouteStopEtaResponse(etaPayload)
          etaChecks.push({
            stopSeq: stop.stopSeq,
            stopId: stop.stopId,
            enabled: eta.length > 0,
            eta: eta.slice(0, 3),
          })
        } catch {
          etaChecks.push({ stopSeq: stop.stopSeq, stopId: stop.stopId, enabled: false, eta: [], status: "unavailable" })
        }
      }
      results.push({
        routeId,
        routeLabels: labelsByRouteId.get(routeId) ?? [],
        routeSeq,
        qualityStatus: diagnostics ? getGmbRouteStopQualityStatus(diagnostics) : "unavailable",
        inputRows: diagnostics?.inputRows ?? null,
        validRows: diagnostics?.validRows ?? null,
        matchedRows: diagnostics?.matchedRows ?? null,
        coverageRate: diagnostics?.coverageRate ?? null,
        isComplete: diagnostics?.isComplete ?? false,
        unmatchedStopIds: diagnostics?.unmatchedStopIds ?? [],
        duplicateSequences: diagnostics?.duplicateSequences ?? [],
        nearbyStops,
        etaChecks,
      })
    } catch {
      results.push({ routeId, routeLabels: labelsByRouteId.get(routeId) ?? [], routeSeq, qualityStatus: "unavailable" })
    }
  }

  return Response.json({
    ok: true,
    area: area.id,
    areaName: area.name,
    routeSeq,
    radiusMetres: 300,
    routeIdsByLabel,
    results,
    note: "ETA checks query up to two nearby official stops per candidate route. ETA is an arrival prediction, not GPS or a segment travel-time measurement. Nearby-stop distances use an approximate monitoring reference point.",
  })
}
