/** Green minibus routes monitored by the Local Traffic Dashboard only. */
export const LOCAL_GMB_MONITORING = {
  lasalle: {
    id: "lasalle",
    name: "喇沙小學附近",
    point: [114.1811, 22.3271] as [number, number],
    keywords: ["喇沙小學", "la salle primary"] as const,
    routes: ["113", "12A", "1", "22", "7B"] as const,
    gmbRoutes: ["2", "2A", "69A", "70", "70A"] as const,
  },
  beverly: {
    id: "beverly",
    name: "碧華花園",
    point: [114.1827, 22.32715] as [number, number],
    keywords: ["碧華花園", "beverly villas"] as const,
    routes: ["1A", "20A", "22", "6D", "6E", "6P", "42", "98E"] as const,
    gmbRoutes: ["2", "2A", "25A", "25B", "25M", "70", "70A"] as const,
  },
} as const

export const LOCAL_GMB_ROUTE_ALLOWLIST: Record<string, readonly string[]> = {
  lasalle: LOCAL_GMB_MONITORING.lasalle.gmbRoutes,
  beverly: LOCAL_GMB_MONITORING.beverly.gmbRoutes,
}
