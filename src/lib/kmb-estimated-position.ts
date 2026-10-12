export type KmbDirection = "I" | "O"

export type KmbRouteStopCoordinate = {
  route: string
  bound: KmbDirection
  serviceType: string
  stopSeq: number
  stopId: string
  lng: number
  lat: number
}

export type KmbEtaRecord = {
  route?: string
  dir?: string
  service_type?: string | number
  seq?: string | number
  eta_seq?: string | number
  eta?: string | null
  dest_tc?: string
  dest_en?: string
  rmk_tc?: string
  rmk_en?: string
  data_timestamp?: string
}

export type KmbMonitoringPoint = {
  id: string
  name: string
  point: [number, number]
  routes: readonly string[]
}

export type KmbEstimatedPositionDiagnostics = {
  routeVariants: number
  localRouteVariants: number
  localStops: number
  etaRowsChecked: number
  observedSegments: number
  fallbackSegments: number
  routesWithFallback: number
  anchorsExamined: number
  anchorsLocated: number
  anchorsWithoutTiming: number
  anchorsOutsideLocalArea: number
  estimatedVehicles: number
  apiErrors: number
}

type Segment = {
  from: KmbRouteStopCoordinate
  to: KmbRouteStopCoordinate
  etaMinutes: number
  segmentMinutes: number
  destination: string
}

const MAX_ETA_AGE_MS = 3 * 60_000
const MAX_ETA_AHEAD_MS = 20 * 60_000
const MIN_SEGMENT_MINUTES = 0.4
const MAX_SEGMENT_MINUTES = 8
const MIN_SEGMENT_METRES = 15
const MAX_SEGMENT_METRES = 800

function routeKey(stop: KmbRouteStopCoordinate): string {
  return [stop.route, stop.bound, stop.serviceType].join("|")
}

function segmentKey(fromSeq: number, toSeq: number): string {
  return String(fromSeq) + "/" + String(toSeq)
}

function distanceMetres(a: [number, number], b: [number, number]): number {
  const latitude = (a[1] * Math.PI) / 180
  const dx = (a[0] - b[0]) * 111_320 * Math.cos(latitude)
  const dy = (a[1] - b[1]) * 111_320
  return Math.sqrt(dx * dx + dy * dy)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? null
}

function validCoordinate(stop: KmbRouteStopCoordinate): boolean {
  return Number.isFinite(stop.lng) &&
    Number.isFinite(stop.lat) &&
    stop.lng >= -180 &&
    stop.lng <= 180 &&
    stop.lat >= -90 &&
    stop.lat <= 90
}

function usableEta(row: KmbEtaRecord, now: number): boolean {
  const etaMs = Date.parse(row.eta ?? "")
  const rank = Number(row.eta_seq)
  if (
    !Number.isFinite(etaMs) ||
    etaMs <= now ||
    etaMs > now + MAX_ETA_AHEAD_MS ||
    !Number.isInteger(rank) ||
    rank < 1 ||
    rank > 3
  ) return false

  if (row.data_timestamp) {
    const dataMs = Date.parse(row.data_timestamp)
    if (
      !Number.isFinite(dataMs) ||
      dataMs > now + 30_000 ||
      now - dataMs > MAX_ETA_AGE_MS
    ) return false
  }

  const remarksTc = (row.rmk_tc ?? "").trim()
  const remarksEn = (row.rmk_en ?? "").trim().toLowerCase()
  if (
    /未開出|已取消|取消班次|暫停服務|停駛/.test(remarksTc) ||
    /scheduled|cancelled|canceled|suspended/.test(remarksEn)
  ) return false

  return true
}

function etaKey(stop: KmbRouteStopCoordinate): string {
  return routeKey(stop) + "|" + String(stop.stopSeq)
}

function medianObservedSegmentTimes(
  stops: KmbRouteStopCoordinate[],
  etaBySequence: Map<string, KmbEtaRecord[]>,
  now: number,
  diagnostics: KmbEstimatedPositionDiagnostics,
): { times: Map<string, number>; speeds: number[] } {
  const samplesBySegment = new Map<string, number[]>()
  const distanceBySegment = new Map<string, number>()
  const ordered = stops.slice().sort((a, b) => a.stopSeq - b.stopSeq)

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index]
    const to = ordered[index + 1]
    if (!from || !to || to.stopSeq !== from.stopSeq + 1) continue
    if (!validCoordinate(from) || !validCoordinate(to)) continue

    const metres = distanceMetres([from.lng, from.lat], [to.lng, to.lat])
    if (metres < MIN_SEGMENT_METRES || metres > MAX_SEGMENT_METRES) continue
    const key = segmentKey(from.stopSeq, to.stopSeq)
    distanceBySegment.set(key, metres)

    const fromRows = (etaBySequence.get(etaKey(from)) ?? []).filter((row) => usableEta(row, now))
    const toRows = (etaBySequence.get(etaKey(to)) ?? []).filter((row) => usableEta(row, now))
    diagnostics.etaRowsChecked += fromRows.length + toRows.length

    // KMB eta_seq is an ordering rank, not a vehicle ID. Treat matching ranks
    // as noisy samples only, then retain them only when travel time and speed
    // are plausible. Never claim that the two records identify the same bus.
    const toByRank = new Map<number, KmbEtaRecord>()
    for (const row of toRows) {
      const rank = Number(row.eta_seq)
      if (!toByRank.has(rank)) toByRank.set(rank, row)
    }

    for (const fromRow of fromRows) {
      const rank = Number(fromRow.eta_seq)
      const toRow = toByRank.get(rank)
      if (!toRow?.eta || !fromRow.eta) continue

      const minutes = (Date.parse(toRow.eta) - Date.parse(fromRow.eta)) / 60_000
      const speedKmh = minutes > 0
        ? (metres / 1000 / minutes) * 60
        : Number.POSITIVE_INFINITY

      if (
        minutes < MIN_SEGMENT_MINUTES ||
        minutes > MAX_SEGMENT_MINUTES ||
        speedKmh < 4 ||
        speedKmh > 60
      ) continue

      const samples = samplesBySegment.get(key) ?? []
      samples.push(minutes)
      samplesBySegment.set(key, samples)
    }
  }

  const times = new Map<string, number>()
  const speeds: number[] = []
  for (const [key, samples] of samplesBySegment) {
    const minutes = median(samples)
    const metres = distanceBySegment.get(key)
    if (minutes === null || metres === undefined) continue
    times.set(key, minutes)
    diagnostics.observedSegments += 1
    const speedKmh = (metres / 1000 / minutes) * 60
    if (speedKmh >= 4 && speedKmh <= 45) speeds.push(speedKmh)
  }

  return { times, speeds }
}

function locateFromUpcomingEta(
  stops: KmbRouteStopCoordinate[],
  anchorSeq: number,
  etaMinutes: number,
  times: Map<string, number>,
  destination: string,
): Segment | null {
  let remaining = etaMinutes
  let toSeq = anchorSeq
  const ordered = stops.slice().sort((a, b) => a.stopSeq - b.stopSeq)

  for (let hops = 0; hops < ordered.length; hops += 1) {
    const fromSeq = toSeq - 1
    if (fromSeq <= 0) return null

    const segmentMinutes = times.get(segmentKey(fromSeq, toSeq))
    if (
      segmentMinutes === undefined ||
      !Number.isFinite(segmentMinutes) ||
      segmentMinutes < MIN_SEGMENT_MINUTES ||
      segmentMinutes > MAX_SEGMENT_MINUTES
    ) return null

    const fromMatches = ordered.filter((stop) => stop.stopSeq === fromSeq)
    const toMatches = ordered.filter((stop) => stop.stopSeq === toSeq)
    if (fromMatches.length !== 1 || toMatches.length !== 1) return null
    const from = fromMatches[0]
    const to = toMatches[0]
    if (!from || !to || !validCoordinate(from) || !validCoordinate(to)) return null

    if (remaining <= segmentMinutes) {
      return { from, to, etaMinutes: remaining, segmentMinutes, destination }
    }

    remaining -= segmentMinutes
    toSeq = fromSeq
  }

  return null
}

/**
 * Estimate local KMB positions from official KMB route-stop sequence and ETA
 * responses. It emits only points supported by recent ETAs and a validated
 * adjacent-stop travel-time sample or a conservative local ETA-derived speed
 * profile. These points are estimates, not vehicle GPS fixes.
 */
export function buildKmbEstimatedPositions(
  routeStops: KmbRouteStopCoordinate[],
  etaRecords: KmbEtaRecord[],
  monitoringPoints: readonly KmbMonitoringPoint[],
  now = Date.now(),
  radiusMetres = 450,
): { collection: GeoJSON.FeatureCollection; diagnostics: KmbEstimatedPositionDiagnostics } {
  const diagnostics: KmbEstimatedPositionDiagnostics = {
    routeVariants: 0,
    localRouteVariants: 0,
    localStops: 0,
    etaRowsChecked: 0,
    observedSegments: 0,
    fallbackSegments: 0,
    routesWithFallback: 0,
    anchorsExamined: 0,
    anchorsLocated: 0,
    anchorsWithoutTiming: 0,
    anchorsOutsideLocalArea: 0,
    estimatedVehicles: 0,
    apiErrors: 0,
  }

  const variants = new Map<string, KmbRouteStopCoordinate[]>()
  for (const stop of routeStops) {
    if (
      !stop.route ||
      (stop.bound !== "I" && stop.bound !== "O") ||
      !stop.serviceType ||
      !Number.isInteger(stop.stopSeq) ||
      stop.stopSeq <= 0 ||
      !stop.stopId ||
      !validCoordinate(stop)
    ) continue
    const key = routeKey(stop)
    const stops = variants.get(key) ?? []
    stops.push(stop)
    variants.set(key, stops)
  }
  diagnostics.routeVariants = variants.size

  const routeContexts = new Map<string, {
    localStops: KmbRouteStopCoordinate[]
    contextStops: KmbRouteStopCoordinate[]
  }>()
  for (const [key, stops] of variants) {
    const ordered = stops.slice().sort((a, b) => a.stopSeq - b.stopSeq)
    const duplicateSequence = ordered.some((stop, index) =>
      index > 0 && ordered[index - 1]?.stopSeq === stop.stopSeq
    )
    if (duplicateSequence) continue

    const localStops = ordered.filter((stop) =>
      monitoringPoints.some((point) =>
        point.routes.includes(stop.route) &&
        distanceMetres([stop.lng, stop.lat], point.point) <= radiusMetres
      )
    )
    if (localStops.length === 0) continue

    const minSeq = Math.min(...localStops.map((stop) => stop.stopSeq))
    const maxSeq = Math.max(...localStops.map((stop) => stop.stopSeq))
    const contextStops = ordered.filter((stop) =>
      stop.stopSeq >= Math.max(1, minSeq - 8) &&
      stop.stopSeq <= maxSeq + 2
    )
    routeContexts.set(key, { localStops, contextStops })
    diagnostics.localRouteVariants += 1
    diagnostics.localStops += localStops.length
  }

  const etaBySequence = new Map<string, KmbEtaRecord[]>()
  for (const row of etaRecords) {
    const route = String(row.route ?? "")
    const direction = String(row.dir ?? "")
    const serviceType = String(row.service_type ?? "")
    const sequence = Number(row.seq)
    if (!route || (direction !== "I" && direction !== "O") || !serviceType || !Number.isInteger(sequence)) continue
    const key = [route, direction, serviceType, String(sequence)].join("|")
    const rows = etaBySequence.get(key) ?? []
    rows.push(row)
    etaBySequence.set(key, rows)
  }

  const candidates: Array<{
    key: string
    distance: number
    from: KmbRouteStopCoordinate
    to: KmbRouteStopCoordinate
    etaMinutes: number
    segmentMinutes: number
    route: string
    bound: KmbDirection
    serviceType: string
    destination: string
  }> = []

  const observedSpeedsByVariant = new Map<string, number[]>()
  const timesByVariant = new Map<string, Map<string, number>>()
  const allObservedSpeeds: number[] = []

  for (const [key, context] of routeContexts) {
    const measured = medianObservedSegmentTimes(context.contextStops, etaBySequence, now, diagnostics)
    timesByVariant.set(key, measured.times)
    observedSpeedsByVariant.set(key, measured.speeds)
    allObservedSpeeds.push(...measured.speeds)
  }

  const pooledFallbackSpeed = allObservedSpeeds.length >= 5
    ? median(allObservedSpeeds)
    : null

  for (const [key, context] of routeContexts) {
    const times = timesByVariant.get(key)
    if (!times) continue
    const routeSamples = observedSpeedsByVariant.get(key) ?? []
    const fallbackSpeed = routeSamples.length >= 2
      ? median(routeSamples)
      : pooledFallbackSpeed

    let filledAny = false
    if (fallbackSpeed !== null && fallbackSpeed !== undefined) {
      const ordered = context.contextStops.slice().sort((a, b) => a.stopSeq - b.stopSeq)
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index]
        const to = ordered[index + 1]
        if (!from || !to || to.stopSeq !== from.stopSeq + 1) continue
        const segment = segmentKey(from.stopSeq, to.stopSeq)
        if (times.has(segment)) continue

        const metres = distanceMetres([from.lng, from.lat], [to.lng, to.lat])
        if (metres < MIN_SEGMENT_METRES || metres > MAX_SEGMENT_METRES) continue
        const minutes = (metres / 1000 / fallbackSpeed) * 60
        if (!Number.isFinite(minutes) || minutes < MIN_SEGMENT_MINUTES || minutes > MAX_SEGMENT_MINUTES) continue
        times.set(segment, minutes)
        diagnostics.fallbackSegments += 1
        filledAny = true
      }
    }
    if (filledAny) diagnostics.routesWithFallback += 1

    const anchors: Array<{ stop: KmbRouteStopCoordinate; etaMinutes: number; destination: string }> = []
    for (const stop of context.localStops) {
      const rows = (etaBySequence.get(etaKey(stop)) ?? [])
        .filter((row) => usableEta(row, now))
        .sort((a, b) => Date.parse(a.eta ?? "") - Date.parse(b.eta ?? ""))
      for (const row of rows) {
        const etaMinutes = (Date.parse(row.eta ?? "") - now) / 60_000
        if (etaMinutes <= 0.05 || etaMinutes > 8) continue
        anchors.push({
          stop,
          etaMinutes,
          destination: row.dest_tc?.trim() || row.dest_en?.trim() || "方向未明",
        })
      }
    }
    anchors.sort((a, b) => a.etaMinutes - b.etaMinutes)

    for (const anchor of anchors) {
      diagnostics.anchorsExamined += 1
      const segment = locateFromUpcomingEta(
        context.contextStops,
        anchor.stop.stopSeq,
        anchor.etaMinutes,
        times,
        anchor.destination,
      )
      if (!segment) {
        diagnostics.anchorsWithoutTiming += 1
        continue
      }

      const progress = 1 - segment.etaMinutes / segment.segmentMinutes
      const estimatePoint: [number, number] = [
        segment.from.lng + (segment.to.lng - segment.from.lng) * progress,
        segment.from.lat + (segment.to.lat - segment.from.lat) * progress,
      ]
      const matchingPointDistances = monitoringPoints
        .filter((point) => point.routes.includes(anchor.stop.route))
        .map((point) => distanceMetres(estimatePoint, point.point))
      const nearestDistance = matchingPointDistances.length
        ? Math.min(...matchingPointDistances)
        : Number.POSITIVE_INFINITY
      if (nearestDistance > radiusMetres) {
        diagnostics.anchorsOutsideLocalArea += 1
        continue
      }

      diagnostics.anchorsLocated += 1
      candidates.push({
        key,
        distance: nearestDistance,
        from: segment.from,
        to: segment.to,
        etaMinutes: segment.etaMinutes,
        segmentMinutes: segment.segmentMinutes,
        route: anchor.stop.route,
        bound: anchor.stop.bound,
        serviceType: anchor.stop.serviceType,
        destination: segment.destination,
      })
      break
    }
  }

  const bestByVariant = new Map<string, typeof candidates[number]>()
  for (const candidate of candidates) {
    const current = bestByVariant.get(candidate.key)
    if (!current || candidate.distance < current.distance) bestByVariant.set(candidate.key, candidate)
  }

  const observedAt = new Date(now).toISOString()
  const features: GeoJSON.Feature<GeoJSON.Point, GeoJSON.GeoJsonProperties>[] = []
  for (const item of bestByVariant.values()) {
    const progress = 1 - item.etaMinutes / item.segmentMinutes
    const lng = item.from.lng + (item.to.lng - item.from.lng) * progress
    const lat = item.from.lat + (item.to.lat - item.from.lat) * progress
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        operator: "KMB",
        route: item.route,
        bound: item.bound,
        serviceType: item.serviceType,
        label: "九巴 " + item.route + "（ETA 估算，非 GPS）",
        destination: item.destination,
        positionType: "estimated",
        observedAt,
        etaMinutes: item.etaMinutes,
        segmentMinutes: item.segmentMinutes,
        fromLng: item.from.lng,
        fromLat: item.from.lat,
        toLng: item.to.lng,
        toLat: item.to.lat,
      },
    })
  }

  diagnostics.estimatedVehicles = features.length
  return {
    collection: { type: "FeatureCollection", features },
    diagnostics,
  }
}
