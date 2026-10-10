import { LOCAL_GMB_MONITORING } from "@/lib/local-gmb-monitoring"
import { gmbOfficialRouteIdsNearPoint } from "@/lib/gmb-reach"
import { loadGmbRouteStopCoordinates, getGmbRouteStopCoordinateDiagnostics } from "@/lib/gmb-route-stops"
import { getGmbRouteStopQualityStatus } from "@/lib/gmb-route-stop-diagnostics-validation"
import { isGmbRouteDirection } from "@/lib/gmb-route-sequence-validation"

export const dynamic = "force-dynamic"

function distanceMetres(a: [number, number], b: [number, number]): number {
  const toRadians = (value: number) => value * Math.PI / 180
  const dLat = toRadians(b[1] - a[1])
  const dLng = toRadians(b[0] - a[0])
  const lat1 = toRadians(a[1])
  const lat2 = toRadians(b[1])
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)))
}

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
      const nearbyStops = (diagnostics?.stops ?? [])
        .map((stop) => ({
          stopSeq: stop.stopSeq,
          stopId: stop.stopId,
          lng: stop.lng,
          lat: stop.lat,
          distanceMetres: Math.round(distanceMetres([lng, lat], [stop.lng, stop.lat])),
        }))
        .filter((stop) => stop.distanceMetres <= 1000)
        .sort((a, b) => a.distanceMetres - b.distanceMetres || a.stopSeq - b.stopSeq)
        .slice(0, 8)
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
    note: "Nearby-stop distances are measured from the configured monitoring reference point, which is approximate. Route-stop diagnostics only; no live vehicle position is inferred.",
  })
}
