export type LocalRoadId =
  | "boundary-131-174"
  | "la-salle-1e-1b"

export type LocalRoadTarget = {
  id: LocalRoadId
  nameTc: string
  nameEn: string
  startAddress: string
  endAddress: string
  district: string
  geometrySource: "td-road-network-v2"

  /**
   * Endpoint coordinates will be populated after
   * snapping the addresses to the official TD road centerline.
   *
   * Do not hard-code estimated coordinates here.
   */
  start: null
  end: null
}

export const LOCAL_ROADS: readonly LocalRoadTarget[] = [
  {
    id: "boundary-131-174",
    nameTc: "界限街",
    nameEn: "Boundary Street",
    startAddress: "131 Boundary Street",
    endAddress: "174 Boundary Street",
    district: "Kowloon City",
    geometrySource: "td-road-network-v2",
    start: null,
    end: null,
  },
  {
    id: "la-salle-1e-1b",
    nameTc: "喇沙利道",
    nameEn: "La Salle Road",
    startAddress: "1E La Salle Road",
    endAddress: "1B La Salle Road",
    district: "Kowloon City",
    geometrySource: "td-road-network-v2",
    start: null,
    end: null,
  },
]

export const LOCAL_ROAD_SOURCE_URL =
  "https://data.gov.hk/en-data/dataset/hk-td-tis_15-road-network-v2"

export function localRoadById(
  id: LocalRoadId,
): LocalRoadTarget | undefined {
  return LOCAL_ROADS.find((road) => road.id === id)
}
