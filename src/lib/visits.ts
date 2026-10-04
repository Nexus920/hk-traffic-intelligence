import { env } from "cloudflare:workers"
import { isNewVisit, visitDay } from "@/lib/visit-day"

type VisitLog = {
  writeDataPoint: (point: { indexes: string[]; blobs: string[]; doubles: number[] }) => void
}

export function recordPageView(headerList: { get(name: string): string | null }, seenDay: string | undefined, now = new Date()): void {
  if (headerList.get("sec-fetch-dest") !== "document") return
  const visits = visitLog()
  if (!visits) return
  const day = visitDay(now)
  try {
    visits.writeDataPoint({
      indexes: [day],
      blobs: [isNewVisit(seenDay, day) ? "new" : "return"],
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
