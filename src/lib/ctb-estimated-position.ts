import {
  buildKmbEstimatedPositions,
  type KmbEtaRecord,
  type KmbMonitoringPoint,
  type KmbRouteStopCoordinate,
} from "./kmb-estimated-position.ts"

/** CTB uses the same validated adjacent-stop ETA estimator, with CTB-specific labels. */
export type CtbRouteStopCoordinate = KmbRouteStopCoordinate
export type CtbEtaRecord = KmbEtaRecord
export type CtbMonitoringPoint = KmbMonitoringPoint

export function buildCtbEstimatedPositions(
  routeStops: CtbRouteStopCoordinate[],
  etaRecords: CtbEtaRecord[],
  monitoringPoints: readonly CtbMonitoringPoint[],
  now = Date.now(),
  radiusMetres = 450,
) {
  return buildKmbEstimatedPositions(
    routeStops,
    etaRecords,
    monitoringPoints,
    now,
    radiusMetres,
    "CTB",
    3,
  )
}
