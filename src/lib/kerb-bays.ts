import { parseCsv } from "./csv.ts"
import { groundMetres, spreadWithin } from "./nearest.ts"

export type KerbBay = {
  id: string
  streetTc: string
  streetEn: string
  lng: number
  lat: number
}

export type KerbRow = {
  id: string
  streetTc: string
  streetEn: string
  lng: number
  lat: number
  bays: number
}

export const KERB_CAP = 40
export const KERB_WIDE_CAP = 600
export const KERB_ROW_METRES = 15

const A = 6_378_388
const F = 1 / 297
const E2 = F * (2 - F)
const EP2 = E2 / (1 - E2)
const LAT0 = (22.31213333333334 * Math.PI) / 180
const LON0 = (114.1785555555556 * Math.PI) / 180
const X0 = 836_694.05
const Y0 = 819_069.8
const DX = -162.619
const DY = -276.959
const DZ = -161.764
const RX = (0.067753 / 3600) * (Math.PI / 180)
const RY = (-2.24365 / 3600) * (Math.PI / 180)
const RZ = (-1.15883 / 3600) * (Math.PI / 180)
const DS = -1.09425e-6
const WGS_A = 6_378_137
const WGS_F = 1 / 298.257223563
const WGS_E2 = WGS_F * (2 - WGS_F)

export function hk80ToWgs84(x: number, y: number): { lng: number; lat: number } {
  const easting = x - X0
  const northing = y - Y0
  const mu = (meridian(LAT0) + northing) / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 * E2 * E2) / 256))
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2))
  const phi = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)
  const cos = Math.cos(phi)
  const tan = Math.tan(phi)
  const c1 = EP2 * cos * cos
  const t1 = tan * tan
  const n1 = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2)
  const r1 = A * (1 - E2) / (1 - E2 * Math.sin(phi) ** 2) ** 1.5
  const d = easting / n1
  const lat = phi - (n1 * tan / r1) * (
    d * d / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720
  )
  const lon = LON0 + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120
  ) / cos
  const normal = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2)
  const ecefX = normal * Math.cos(lat) * Math.cos(lon)
  const ecefY = normal * Math.cos(lat) * Math.sin(lon)
  const ecefZ = normal * (1 - E2) * Math.sin(lat)
  const scale = 1 + DS
  const outX = DX + scale * (ecefX - RZ * ecefY + RY * ecefZ)
  const outY = DY + scale * (RZ * ecefX + ecefY - RX * ecefZ)
  const outZ = DZ + scale * (-RY * ecefX + RX * ecefY + ecefZ)
  const level = Math.hypot(outX, outY)
  let wgsLat = Math.atan2(outZ, level * (1 - WGS_E2))
  for (let pass = 0; pass < 6; pass += 1) {
    const radius = WGS_A / Math.sqrt(1 - WGS_E2 * Math.sin(wgsLat) ** 2)
    wgsLat = Math.atan2(outZ + WGS_E2 * radius * Math.sin(wgsLat), level)
  }
  return { lng: Math.atan2(outY, outX) * 180 / Math.PI, lat: wgsLat * 180 / Math.PI }
}

export function parseKerbBays(csv: string): KerbBay[] {
  return parseCsv(csv).flatMap((row) => {
    if (row.METER_NONMETER !== "N" || row.VEHICLE_TYPE_DESCRIPTION_1 !== "Motor Cycles") return []
    if (row.IRNP_REMARKS_ENG === "FRANCHISED BUSES ONLY") return []
    const id = row.FEATUREID?.trim() ?? ""
    const easting = Number(row.X_COOR)
    const northing = Number(row.Y_COOR)
    if (!id || !Number.isFinite(easting) || !Number.isFinite(northing)) return []
    const point = hk80ToWgs84(easting, northing)
    return [{ id, streetTc: row.STREET_NAME_CHI?.trim() ?? "", streetEn: row.STREET_NAME_ENG?.trim() ?? "", lng: point.lng, lat: point.lat }]
  })
}

export function clusterKerbBays(bays: readonly KerbBay[], metres = KERB_ROW_METRES): KerbRow[] {
  const parent = bays.map((_, index) => index)
  const find = (index: number): number => {
    let cursor = index
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]] ?? cursor
      cursor = parent[cursor] ?? cursor
    }
    return cursor
  }
  const cell = 0.0002
  const cells = new Map<string, number[]>()
  for (let index = 0; index < bays.length; index += 1) {
    const bay = bays[index]
    if (!bay) continue
    const key = `${Math.floor(bay.lng / cell)},${Math.floor(bay.lat / cell)}`
    const list = cells.get(key) ?? []
    list.push(index)
    cells.set(key, list)
  }
  for (let index = 0; index < bays.length; index += 1) {
    const bay = bays[index]
    if (!bay) continue
    const cx = Math.floor(bay.lng / cell)
    const cy = Math.floor(bay.lat / cell)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const otherIndex of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (otherIndex <= index) continue
          const other = bays[otherIndex]
          if (!other || other.streetEn !== bay.streetEn || other.streetTc !== bay.streetTc) continue
          if (groundMetres(bay.lng, bay.lat, other.lng, other.lat) > metres) continue
          const left = find(index)
          const right = find(otherIndex)
          if (left !== right) parent[right] = left
        }
      }
    }
  }
  const groups = new Map<number, number[]>()
  for (let index = 0; index < bays.length; index += 1) {
    const root = find(index)
    const list = groups.get(root) ?? []
    list.push(index)
    groups.set(root, list)
  }
  return [...groups.values()].map((members) => {
    const sample = bays[members[0] ?? 0]
    if (!sample) throw new Error("Empty kerb row")
    let id = sample.id
    let lng = 0
    let lat = 0
    for (const member of members) {
      const bay = bays[member]
      if (!bay) continue
      if (bay.id.localeCompare(id, undefined, { numeric: true }) < 0) id = bay.id
      lng += bay.lng
      lat += bay.lat
    }
    return { id, streetTc: sample.streetTc, streetEn: sample.streetEn, lng: lng / members.length, lat: lat / members.length, bays: members.length }
  })
}

export function kerbRowsNear(rows: readonly KerbRow[], lng: number, lat: number, radiusM: number, cap = KERB_CAP): KerbRow[] {
  return rows
    .flatMap((row) => {
      const distance = groundMetres(lng, lat, row.lng, row.lat)
      return distance <= radiusM ? [{ row, distance }] : []
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, cap)
    .map((item) => item.row)
}

export function kerbRowsWide(rows: readonly KerbRow[], lng: number, lat: number, radiusM: number, cap = KERB_WIDE_CAP): KerbRow[] {
  return spreadWithin(rows, lng, lat, radiusM, cap)
}

function meridian(phi: number): number {
  return A * (
    (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256) * phi
    - (3 * E2 / 8 + 3 * E2 * E2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * E2 * E2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi)
  )
}
