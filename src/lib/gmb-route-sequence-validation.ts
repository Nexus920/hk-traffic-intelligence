export type GmbRouteDirection = 1 | 2

/**
 * Official GMB route sequence values: 1 and 2 identify the two route
 * directions (some routes may only expose one direction). Do not accept
 * arbitrary positive integers as direction identifiers.
 */
export function isGmbRouteDirection(value: unknown): value is GmbRouteDirection {
  return value === 1 || value === 2
}
