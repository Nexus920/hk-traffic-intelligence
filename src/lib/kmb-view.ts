import type { WatchLayer } from "@/lib/types"

export const KMB_MIN_ZOOM = 13
// Green minibus names start with the other bus names. The list is still the nearest 24.
export const GMB_MIN_ZOOM = 16.5
// One layer on its own can appear from the city view and show more pins than the mixed map.
export const SOLO_PIN_ZOOM = 10
// Cameras and free-count pins wait until the harbour frame has been left behind.
export const AVAILABILITY_MIN_ZOOM = 14
export const KMB_POLL_MS = 60_000
export const PLACE_POLL_MS = 12 * 60 * 60 * 1000

const AVAILABILITY_LAYERS = new Set<WatchLayer>(["cameras", "parking", "motorcycle", "meter", "charger"])

export function placePinZoom(layer: WatchLayer, sole: WatchLayer | null): number {
  if (sole === layer) return SOLO_PIN_ZOOM
  if (layer === "gmb") return GMB_MIN_ZOOM
  if (AVAILABILITY_LAYERS.has(layer)) return AVAILABILITY_MIN_ZOOM
  return KMB_MIN_ZOOM
}

export function mapViewKey(lng: number, lat: number, zoom: number): string {
  if (!Number.isFinite(zoom) || zoom < SOLO_PIN_ZOOM) return "far"
  const band = zoom < KMB_MIN_ZOOM ? "overview" : zoom < 16 ? "wide" : zoom < 17 ? "street" : "close"
  return `${lng.toFixed(3)},${lat.toFixed(3)},${band}`
}
