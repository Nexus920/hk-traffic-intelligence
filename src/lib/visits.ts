import { env } from "cloudflare:workers"
import { visitDay } from "@/lib/visit-day"

type VisitLog = {
  writeDataPoint: (point: { indexes: string[]; blobs: string[]; doubles: number[] }) => void
}

export function recordPageView(mark: string | null, now = new Date()): void {
  if (mark !== "new" && mark !== "return") return
  const visits = visitLog()
  if (!visits) return
  try {
    visits.writeDataPoint({
      indexes: [visitDay(now)],
      blobs: [mark],
      doubles: [1],
    })
  } catch {
    // A missed tally must not stop the page.
  }
}

function visitLog(): VisitLog | null {
  try {
    const bound = (env as { VISITS?: VisitLog }).VISITS
    if (!bound || typeof bound.writeDataPoint !== "function") return null
    return bound
  } catch {
    return null
  }
}
