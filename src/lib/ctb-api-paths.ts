/**
 * Citybus V2 endpoints use the lowercase company path segment "ctb".
 * Keep these builders shared by ETA display and estimated-position queries.
 */
export type CtbDirectionPath = "inbound" | "outbound"

export function buildCtbRouteStopApiUrl(
  baseUrl: string,
  route: string,
  direction: CtbDirectionPath,
): string {
  return `${baseUrl}/route-stop/ctb/${encodeURIComponent(route)}/${direction}`
}

export function buildCtbEtaApiUrl(
  baseUrl: string,
  stopId: string,
  route: string,
): string {
  return `${baseUrl}/eta/ctb/${encodeURIComponent(stopId)}/${encodeURIComponent(route)}`
}
