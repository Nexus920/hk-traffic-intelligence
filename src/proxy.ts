import { NextResponse, type NextRequest } from "next/server"
import { visitDay } from "@/lib/visit-day"

const DAY_SECONDS = 60 * 60 * 36

export function proxy(request: NextRequest) {
  if (request.headers.get("sec-fetch-dest") !== "document") return NextResponse.next()
  const day = visitDay(new Date())
  if (request.cookies.get("hk-visit")?.value === day) return NextResponse.next()
  const response = NextResponse.next()
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
