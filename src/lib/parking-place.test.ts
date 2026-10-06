import assert from "node:assert/strict"
import { publishedPrivateVacancies } from "./parking-parks.ts"

const counts = publishedPrivateVacancies({
  car_park: [
    { park_id: "a", vehicle_type: [{ type: "P", service_category: [{ category: "HOURLY", vacancy_type: "A", vacancy: 12 }] }] },
  ],
})

function withCars<T extends { id: string }>(parks: T[], vacancies: Map<string, number>): (T & { cars: number | null })[] {
  return parks.map((park) => ({ ...park, cars: vacancies.get(park.id) ?? null }))
}

assert.deepEqual(withCars([{ id: "a" }, { id: "b" }], counts), [
  { id: "a", cars: 12 },
  { id: "b", cars: null },
])
assert.deepEqual(withCars([{ id: "a" }], new Map()), [{ id: "a", cars: null }])

console.log("parking place ok")
