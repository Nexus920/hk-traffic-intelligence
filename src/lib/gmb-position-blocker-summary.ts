export function summarizeGmbPositionBlockers(
  blockerLists: readonly (readonly string[])[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const blockers of blockerLists) {
    for (const blocker of new Set(blockers)) {
      counts[blocker] = (counts[blocker] ?? 0) + 1
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)))
}
