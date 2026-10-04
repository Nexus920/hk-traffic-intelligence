import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { IBM_Plex_Mono, Newsreader, Outfit } from "next/font/google"
import { htmlLang, localeOf } from "@/lib/i18n"
import { recordPageView } from "@/lib/visits"
import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
})

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
})

const hud = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-hud",
})

export const metadata: Metadata = {
  title: "香港智慧城市交通情報網 by Keith Li",
  description:
    "Live strategic-road speeds, harbour crossings, land control points, and weather warnings over Hong Kong.",
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies()
  const headerList = await headers()
  recordPageView(headerList, store.get("hk-visit")?.value)
  const locale = localeOf(store.get("locale")?.value)
  return (
    <html lang={htmlLang(locale)} data-locale={locale} className={`${outfit.variable} ${newsreader.variable} ${hud.variable} dark h-full antialiased`}>
      <body className={`${outfit.className} min-h-full`}>{children}</body>
    </html>
  )
}
