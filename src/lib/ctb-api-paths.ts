/**
 * Citybus V2 endpoints use the uppercase company ID "CTB", as shown in Citybus API Specification v2.01, pages 12 and 19.
 * Keep these builders shared by ETA display and estimated-position queries.
 */
export type CtbDirectionPath = "inbound" | "outbound"

export function buildCtbRouteStopApiUrl(
  baseUrl: string,
  route: string,
  direction: CtbDirectionPath,
): string {
  return `${baseUrl}/route-stop/CTB/${encodeURIComponent(route)}/${direction}`
}

export function buildCtbEtaApiUrl(
  baseUrl: string,
  stopId: string,
  route: string,
): string {
  return `${baseUrl}/eta/CTB/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`
}
