import destFile from "../../data/gmb-destinations.json" with { type: "json" }

type Dest = { tc: string; en: string }
type DestFile = { routes: Record<string, Record<string, Dest>> }

const routes = (destFile as DestFile).routes

export function gmbDestination(routeId: number, routeSeq: number): Dest | null {
  if (!Number.isSafeInteger(routeId) || routeId <= 0 || !Number.isSafeInteger(routeSeq) || routeSeq <= 0) return null
  const item = routes[String(routeId)]
  if (!item) return null
  const exact = item[String(routeSeq)]
  if (exact && (exact.tc || exact.en)) return exact
  return null
}
