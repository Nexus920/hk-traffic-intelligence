export type GmbRouteStopEta = {
  etaSeq: number
  diffMinutes: number
  timestamp: string
}

type RawEtaEntry = {
  eta_seq?: unknown
  diff?: unknown
  timestamp?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Validates the official /eta/route-stop/{route_id}/{route_seq}/{stop_seq}
 * response payload. This validates arrival predictions only; it deliberately
 * does not infer vehicle coordinates or segment travel time from an ETA.
 */
export function parseGmbRouteStopEtaResponse(
  input: unknown,
  expectedStopId?: string | number,
): GmbRouteStopEta[] {
  if (!isRecord(input) || !isRecord(input.data)) return []
  const data = input.data
  if (data.enabled !== true || !Array.isArray(data.eta)) return []

  const stopId = data.stop_id
  if (
    typeof stopId !== "number" || !Number.isSafeInteger(stopId) || stopId <= 0
  ) return []

  if (expectedStopId !== undefined) {
    const expected = typeof expectedStopId === "number"
      ? expectedStopId
      : /^[1-9]\d*$/.test(expectedStopId)
        ? Number(expectedStopId)
        : Number.NaN
    if (!Number.isSafeInteger(expected) || expected <= 0 || stopId !== expected) return []
  }

  const entries = data.eta.filter(isRecord) as RawEtaEntry[]
  const sequenceCounts = new Map<number, number>()
  for (const raw of entries) {
    const etaSeq = raw.eta_seq
    if (typeof etaSeq === "number" && Number.isSafeInteger(etaSeq) && etaSeq > 0) {
      sequenceCounts.set(etaSeq, (sequenceCounts.get(etaSeq) ?? 0) + 1)
    }
  }

  const rows: GmbRouteStopEta[] = []
  for (const raw of entries) {
    const etaSeq = raw.eta_seq
    const diff = raw.diff
    const timestamp = raw.timestamp
    if (
      typeof etaSeq !== "number" ||
      !Number.isSafeInteger(etaSeq) ||
      etaSeq <= 0 ||
      sequenceCounts.get(etaSeq) !== 1 ||
      typeof diff !== "number" ||
      !Number.isSafeInteger(diff) ||
      diff < 0 ||
      typeof timestamp !== "string" ||
      !timestamp.trim() ||
      !Number.isFinite(Date.parse(timestamp))
    ) continue

    rows.push({ etaSeq, diffMinutes: diff, timestamp })
  }

  return rows.sort((a, b) => a.etaSeq - b.etaSeq)
}
