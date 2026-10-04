import { NextResponse, type NextRequest } from "next/server"
import { isNewVisit, visitDay } from "@/lib/visit-day"

const DAY_SECONDS = 60 * 60 * 36

export function proxy(request: NextRequest) {
  if (request.headers.get("sec-fetch-dest") !== "document") return NextResponse.next()
  const day = visitDay(new Date())
  const fresh = isNewVisit(request.cookies.get("hk-visit")?.value, day)
  const headers = new Headers(request.headers)
  headers.set("x-hk-visit", fresh ? "new" : "return")
  const response = NextResponse.next({ request: { headers } })
  if (!fresh) return response
  response.cookies.set("hk-visit", day, {
    httpOnly: true,
    maxAge: DAY_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: true,
  })
  return response
}

export const config = {
  matcher: "/",
}
