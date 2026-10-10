type EstimatedMinibus = {
  route: string
  routeSeq: number
  stopSeq: number
  from: { lng: number; lat: number }
  to: { lng: number; lat: number }
  etaMinutes: number
  observedAt: string
  positionType: "estimated"
}
