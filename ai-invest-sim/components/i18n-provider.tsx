"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type AppLocale = "en" | "zh"

type I18nContextValue = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: I18nKey) => string
}

const STORAGE_KEY = "ai-invest:locale"

const messages = {
  en: {
    "app.name": "AI Invest OS",
    "app.subtitle": "Simulated Environment",
    "nav.overview": "Overview",
    "nav.dashboard": "Dashboard",
    "nav.invest": "Invest",
    "nav.agents": "Agents",
    "nav.strategies": "Strategies",
    "nav.portfolio": "Portfolio",
    "nav.intelligence": "Intelligence",
    "nav.research": "Research",
    "nav.system": "System",
    "nav.settings": "Settings",
    "auth.signOut": "Sign out",
    "auth.signedIn": "Signed in",
    "auth.logIn": "Log in",
    "language.label": "Language",
    "language.en": "EN",
    "language.zh": "中",
    "layout.collapse": "Collapse sidebar",
    "layout.expand": "Expand sidebar",
  },
  zh: {
    "app.name": "AI 投资 OS",
    "app.subtitle": "模拟投资环境",
    "nav.overview": "总览",
    "nav.dashboard": "仪表盘",
    "nav.invest": "投资",
    "nav.agents": "Agent",
    "nav.strategies": "策略",
    "nav.portfolio": "组合",
    "nav.intelligence": "智能",
    "nav.research": "研究",
    "nav.system": "系统",
    "nav.settings": "设置",
    "auth.signOut": "退出",
    "auth.signedIn": "已登录",
    "auth.logIn": "登录",
    "language.label": "语言",
    "language.en": "EN",
    "language.zh": "中",
    "layout.collapse": "收起侧栏",
    "layout.expand": "展开侧栏",
  },
} as const

export type I18nKey = keyof typeof messages.en

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => {
    if (typeof window === "undefined") return "en"

    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === "zh" || saved === "en") return saved

    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
  })

  const value = useMemo<I18nContextValue>(() => {
    function setLocale(nextLocale: AppLocale) {
      setLocaleState(nextLocale)
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
      document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en"
    }

    function t(key: I18nKey) {
      return messages[locale][key] || messages.en[key]
    }

    return { locale, setLocale, t }
  }, [locale])

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider")
  }
  return value
}
