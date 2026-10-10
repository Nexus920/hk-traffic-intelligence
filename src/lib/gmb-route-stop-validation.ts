export type GmbRouteStopRow = {
  stop_seq?: number
  stop_id?: string | number
  stop?: string | number
}

/**
 * Normalizes route-stop IDs and removes every row whose positive integer
 * sequence is ambiguous. This helper is pure so malformed feed cases can be
 * tested without making upstream requests.
 */
export function uniqueGmbRouteStopRows(rows: GmbRouteStopRow[]): Array<{ stopSeq: number; stopId: string }> {
  const sequenceCounts = new Map<number, number>()
  for (const row of rows) {
    if (Number.isSafeInteger(row.stop_seq) && (row.stop_seq as number) > 0) {
      const sequence = row.stop_seq as number
      sequenceCounts.set(sequence, (sequenceCounts.get(sequence) ?? 0) + 1)
    }
  }

  const valid: Array<{ stopSeq: number; stopId: string }> = []
  for (const row of rows) {
    const sequence = row.stop_seq
    const rawStopId = row.stop_id ?? row.stop
    const stopId =
      typeof rawStopId === "number" && Number.isSafeInteger(rawStopId) && rawStopId > 0
        ? String(rawStopId)
        : typeof rawStopId === "string" && rawStopId.trim()
          ? rawStopId.trim()
          : null
    if (!Number.isSafeInteger(sequence) || (sequence as number) <= 0 || !stopId) continue
    const stopSeq = sequence as number
    if (sequenceCounts.get(stopSeq) !== 1) continue
    valid.push({ stopSeq, stopId })
  }
  return valid.sort((a, b) => a.stopSeq - b.stopSeq)
}
