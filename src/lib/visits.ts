import { addVisit, parseVisitDays } from "@/lib/visit-counts"
import { visitDay } from "@/lib/visit-day"

type VisitLog = {
  writeDataPoint: (point: { indexes: string[]; blobs: string[]; doubles: number[] }) => void
}

type VisitCounts = {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}

type CloudflareWorkers = {
  env: { VISITS?: VisitLog; VISIT_COUNTS?: VisitCounts }
  waitUntil: (promise: Promise<unknown>) => void
}

const WORKERS_MODULE = "cloudflare:workers"

export const VISIT_DAYS_KEY = "days"

async function getWorkers(): Promise<CloudflareWorkers | null> {
  try {
    // Use a runtime import so the Next.js build can run outside Workers.
    return await import(WORKERS_MODULE) as unknown as CloudflareWorkers
  } catch {
    return null
  }
}

export function recordPageView(mark: string | null, now = new Date()): void {
  if (mark !== "new" && mark !== "return") return
  const day = visitDay(now)
  void (async () => {
    const workers = await getWorkers()
    try {
      const log = workers?.env.VISITS
      if (log && typeof log.writeDataPoint === "function") {
        log.writeDataPoint({ indexes: [day], blobs: [mark], doubles: [1] })
      }
    } catch {
      // A missed tally must not stop the page.
    }
    const saved = saveVisit(day, mark, workers)
    try {
      workers?.waitUntil(saved)
    } catch {
      void saved
    }
  })()
}

async function saveVisit(
  day: string,
  mark: "new" | "return",
  workers: CloudflareWorkers | null,
): Promise<void> {
  const counts = workers?.env.VISIT_COUNTS
  if (!counts) return
  try {
    const days = addVisit(parseVisitDays(await counts.get(VISIT_DAYS_KEY)), day, mark)
    await counts.put(VISIT_DAYS_KEY, JSON.stringify(days))
  } catch {
    // The page is already on its way.
  }
}

export async function readVisitDays(): Promise<ReturnType<typeof parseVisitDays> | null> {
  const workers = await getWorkers()
  const counts = workers?.env.VISIT_COUNTS
  if (!counts) return null
  return parseVisitDays(await counts.get(VISIT_DAYS_KEY))
}
