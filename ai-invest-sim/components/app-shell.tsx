"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import {
  Bot,
  BriefcaseBusiness,
  FlaskConical,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserCircle,
} from "lucide-react"

import { cn } from "../lib/utils"
import { useI18n, type I18nKey } from "./i18n-provider"
import { supabase } from "../src/lib/supabase"

type NavItem = {
  labelKey: I18nKey
  href: string
  icon: React.ComponentType<{ className?: string }>
  aliases?: string[]
}

type NavSection = {
  titleKey: I18nKey
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    titleKey: "nav.overview",
    items: [
      {
        labelKey: "nav.dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        aliases: ["/"],
      },
    ],
  },
  {
    titleKey: "nav.invest",
    items: [
      { labelKey: "nav.agents", href: "/agents", icon: Bot },
      { labelKey: "nav.strategies", href: "/strategies", icon: FlaskConical },
      { labelKey: "nav.portfolio", href: "/portfolio", icon: BriefcaseBusiness },
    ],
  },
  {
    titleKey: "nav.intelligence",
    items: [{ labelKey: "nav.research", href: "/research", icon: Sparkles }],
  },
  {
    titleKey: "nav.system",
    items: [{ labelKey: "nav.settings", href: "/settings", icon: Settings }],
  },
]

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true
  if (item.aliases?.includes(pathname)) return true
  return pathname.startsWith(`${item.href}/`)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { locale, setLocale, t } = useI18n()
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,oklch(0.46_0.11_245/0.15),transparent_58%),radial-gradient(ellipse_75%_58%_at_100%_0%,oklch(0.6_0.13_200/0.08),transparent_56%)]"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px]">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 border-r border-border/60 bg-background/80 py-6 backdrop-blur-xl transition-[width] duration-200 lg:block",
            collapsed ? "w-20 px-3" : "w-72 px-4"
          )}
        >
          <div
            className={cn(
              "mb-6 flex items-center px-2",
              collapsed ? "justify-center" : "justify-between gap-3"
            )}
          >
            <div
              className={cn(
                "flex items-center",
                collapsed ? "justify-center" : "gap-3"
              )}
            >
              <Image
                src="/brand/logoimage.png"
                alt="Quantara"
                width={40}
                height={40}
                className="size-10 rounded-xl object-contain"
                priority
              />
              {!collapsed && (
                <div className="min-w-0">
                  <Image
                    src={
                      locale === "zh"
                        ? "/brand/logofontchinese.png"
                        : "/brand/logofont.png"
                    }
                    alt={t("app.name")}
                    width={154}
                    height={28}
                    className="h-auto max-h-7 w-[154px] object-contain object-left"
                    priority
                  />
                  <p className="whitespace-nowrap font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    {t("app.subtitle")}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="rounded-lg border border-border/70 p-2 text-muted-foreground hover:bg-card hover:text-foreground"
                title={t("layout.collapse")}
              >
                <PanelLeftClose className="size-4" />
              </button>
            )}
          </div>
          {collapsed && (
            <div className="mb-5 flex justify-center">
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="rounded-lg border border-border/70 p-2 text-muted-foreground hover:bg-card hover:text-foreground"
                title={t("layout.expand")}
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </div>
          )}
          <nav className="space-y-5">
            {navSections.map((section) => (
              <div key={section.titleKey}>
                {!collapsed && (
                  <p className="px-2 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    {t(section.titleKey)}
                  </p>
                )}
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item)
                    const Icon = item.icon

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={collapsed ? t(item.labelKey) : undefined}
                        className={cn(
                          "group flex items-center rounded-xl border text-sm transition-all",
                          collapsed
                            ? "justify-center px-0 py-3"
                            : "gap-2.5 px-3 py-2.5",
                          active
                            ? "border-primary/30 bg-primary/10 text-foreground shadow-[0_8px_24px_-16px_oklch(0.7_0.15_230/0.8)]"
                            : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground"
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 transition-colors",
                            active
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground"
                          )}
                        />
                        {!collapsed && <span>{t(item.labelKey)}</span>}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div
            className={cn(
              "absolute inset-x-3 bottom-20",
              collapsed && "flex justify-center"
            )}
          >
            <div
              className={cn(
                "flex rounded-xl border border-border/70 bg-card/50 p-1",
                collapsed ? "flex-col" : "items-center gap-1"
              )}
              aria-label={t("language.label")}
            >
              {(["en", "zh"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLocale(option)}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    locale === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {t(option === "en" ? "language.en" : "language.zh")}
                </button>
              ))}
            </div>
          </div>
          <div
            className={cn(
              "absolute inset-x-3 bottom-4",
              collapsed && "flex justify-center"
            )}
          >
            {user ? (
              <button
                type="button"
                onClick={signOut}
                title={collapsed ? t("auth.signOut") : undefined}
                className={cn(
                  "flex w-full items-center rounded-xl border border-border/70 bg-card/40 text-sm text-muted-foreground hover:bg-card hover:text-foreground",
                  collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"
                )}
              >
                <UserCircle className="size-4" />
                {!collapsed && (
                  <span className="truncate">
                    {user.email || t("auth.signedIn")} · {t("auth.signOut")}
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={loginHref(pathname)}
                title={collapsed ? t("auth.logIn") : undefined}
                className={cn(
                  "flex w-full items-center rounded-xl border border-primary/30 bg-primary/10 text-sm text-primary hover:bg-primary/15",
                  collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"
                )}
              >
                <UserCircle className="size-4" />
                {!collapsed && <span>{t("auth.logIn")}</span>}
              </Link>
            )}
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {navSections.flatMap((section) => section.items).map((item) => {
                const active = isActive(pathname, item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "shrink-0 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] tracking-wider uppercase",
                      active
                        ? "border-primary/35 bg-primary/12 text-primary"
                        : "border-border/70 bg-muted/20 text-muted-foreground"
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                )
              })}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

function loginHref(pathname: string) {
  const next = pathname && pathname !== "/auth/login" ? pathname : "/agents"
  return `/auth/login?next=${encodeURIComponent(next)}`
}
