"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { DEFAULT_LOCALE, ensureSimplified, MESSAGES, type Locale, type Messages } from "@/lib/i18n"

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  messages: Messages
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initial || DEFAULT_LOCALE)
  const [simplifiedReady, setSimplifiedReady] = useState(false)
  const messages = MESSAGES[locale]
  const setLocale = (next: Locale) => {
    setLocaleState(next)
    document.cookie = `locale=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  }
  useEffect(() => {
    if (locale !== "zh-CN") return
    let cancel = false
    void ensureSimplified().then(() => {
      if (!cancel) setSimplifiedReady(true)
    })
    return () => {
      cancel = true
    }
  }, [locale])
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dataset.locale = locale
    document.title = messages.documentTitle
  }, [locale, messages.documentTitle, simplifiedReady])
  return <LocaleContext.Provider value={{ locale, setLocale, messages }}>{children}</LocaleContext.Provider>
}

export function useI18n(): LocaleContextValue {
  const value = useContext(LocaleContext)
  if (!value) {
    return { locale: DEFAULT_LOCALE, setLocale: () => undefined, messages: MESSAGES[DEFAULT_LOCALE] }
  }
  return value
}

