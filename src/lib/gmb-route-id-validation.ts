export type GmbRouteIdCandidate = {
  localRouteId: string
  officialRouteId: number
}

/**
 * Matches route identifiers only when the local route key is an exact
 * positive-integer representation of the official API route_id.
 * Human-facing route labels (for example "Green Minibus 12") are not IDs and
 * must never be guessed into official route IDs.
 */
export function matchGmbOfficialRouteId(
  localRouteId: string,
  officialRouteIds: number[],
): number | null {
  const key = localRouteId.trim()
  if (!/^[1-9]\d*$/.test(key)) return null
  const numeric = Number(key)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) return null
  const matches = officialRouteIds.filter((id) => Number.isSafeInteger(id) && id > 0 && id === numeric)
  return matches.length === 1 ? matches[0] : null
}

/**
 * Audits candidate local route keys without fuzzy matching. Ambiguous or
 * malformed official IDs are never accepted.
 */
export function auditGmbRouteIdCandidates(
  localRouteIds: string[],
  officialRouteIds: number[],
): GmbRouteIdCandidate[] {
  const output: GmbRouteIdCandidate[] = []
  for (const localRouteId of localRouteIds) {
    const officialRouteId = matchGmbOfficialRouteId(localRouteId, officialRouteIds)
    if (officialRouteId !== null) output.push({ localRouteId, officialRouteId })
  }
  return output
}
