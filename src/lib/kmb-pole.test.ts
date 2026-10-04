import assert from "node:assert/strict"
import { mergeSamePoles } from "./kmb-pole.ts"

const merged = mergeSamePoles([
  {
    id: "b",
    nameTc: "中港城 戲曲中心 (YT646)",
    nameEn: "Xiqu",
    lng: 114.1681,
    lat: 22.30034,
    routes: ["HK1"],
    clock: "ready" as const,
    calls: [{ route: "HK1", destTc: "尖沙咀及旺角", destEn: "Tsim Sha Tsui", minutes: null }],
  },
  {
    id: "a",
    nameTc: "中港城 戲曲中心 (YT646)",
    nameEn: "Xiqu",
    lng: 114.1681,
    lat: 22.30034,
    routes: ["HK1"],
    clock: "ready" as const,
    calls: [{ route: "HK1", destTc: "尖沙咀、旺角及黃大仙", destEn: "Wong Tai Sin", minutes: 13 }],
  },
])

assert.equal(merged.length, 1)
assert.equal(merged[0]?.id, "a")
assert.equal(merged[0]?.calls?.[0]?.minutes, 13)
assert.equal(merged[0]?.clock, "ready")

const waiting = mergeSamePoles([
  { id: "a", nameTc: "同站", nameEn: "Same", lng: 114.1, lat: 22.3, routes: ["1"], clock: "ready" as const, calls: [] },
  { id: "b", nameTc: "同站", nameEn: "Same", lng: 114.1, lat: 22.3, routes: ["2"], clock: "waiting" as const, calls: [] },
])
assert.equal(waiting[0]?.clock, "waiting")
assert.deepEqual(waiting[0]?.routes, ["1", "2"])
