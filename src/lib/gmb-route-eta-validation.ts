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
export function parseGmbRouteStopEtaResponse(input: unknown): GmbRouteStopEta[] {
  if (!isRecord(input) || !isRecord(input.data)) return []
  const data = input.data
  if (data.enabled !== true || !Array.isArray(data.eta)) return []

  const stopId = data.stop_id
  if (
    !(typeof stopId === "number" && Number.isSafeInteger(stopId) && stopId > 0)
  ) return []

  const rows: GmbRouteStopEta[] = []
  const seen = new Set<number>()
  for (const raw of data.eta as RawEtaEntry[]) {
    if (!isRecord(raw)) continue
    const etaSeq = raw.eta_seq
    const diff = raw.diff
    const timestamp = raw.timestamp
    if (
      typeof etaSeq !== "number" ||
      !Number.isSafeInteger(etaSeq) ||
      etaSeq <= 0 ||
      seen.has(etaSeq) ||
      typeof diff !== "number" ||
      !Number.isSafeInteger(diff) ||
      diff < 0 ||
      typeof timestamp !== "string" ||
      !timestamp.trim() ||
      !Number.isFinite(Date.parse(timestamp))
    ) continue

    seen.add(etaSeq)
    rows.push({ etaSeq, diffMinutes: diff, timestamp })
  }

  return rows.sort((a, b) => a.etaSeq - b.etaSeq)
}
