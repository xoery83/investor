"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import {
  Bot,
  BriefcaseBusiness,
  ChartCandlestick,
  FlaskConical,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserCircle,
} from "lucide-react"

import { cn } from "../lib/utils"
import { supabase } from "../src/lib/supabase"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  aliases?: string[]
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        aliases: ["/"],
      },
    ],
  },
  {
    title: "Invest",
    items: [
      { label: "Agents", href: "/agents", icon: Bot },
      { label: "Strategies", href: "/strategies", icon: FlaskConical },
      { label: "Portfolio", href: "/portfolio", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "Intelligence",
    items: [{ label: "Research", href: "/research", icon: Sparkles }],
  },
  {
    title: "System",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
]

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true
  if (item.aliases?.includes(pathname)) return true
  return pathname.startsWith(`${item.href}/`)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
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
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/90 to-primary/60 shadow-lg shadow-primary/20 ring-1 ring-white/10">
                <ChartCandlestick className="size-4.5 text-primary-foreground" />
              </div>
              {!collapsed && (
                <div>
                  <p className="text-sm font-semibold tracking-tight">AI Invest OS</p>
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    Simulated Environment
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="rounded-lg border border-border/70 p-2 text-muted-foreground hover:bg-card hover:text-foreground"
                title="Collapse sidebar"
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
                title="Expand sidebar"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </div>
          )}
          <nav className="space-y-5">
            {navSections.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <p className="px-2 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                    {section.title}
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
                        title={collapsed ? item.label : undefined}
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
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
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
                title={collapsed ? "Sign out" : undefined}
                className={cn(
                  "flex w-full items-center rounded-xl border border-border/70 bg-card/40 text-sm text-muted-foreground hover:bg-card hover:text-foreground",
                  collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"
                )}
              >
                <UserCircle className="size-4" />
                {!collapsed && (
                  <span className="truncate">
                    {user.email || "Signed in"} · Sign out
                  </span>
                )}
              </button>
            ) : (
              <Link
                href={loginHref(pathname)}
                title={collapsed ? "Log in" : undefined}
                className={cn(
                  "flex w-full items-center rounded-xl border border-primary/30 bg-primary/10 text-sm text-primary hover:bg-primary/15",
                  collapsed ? "justify-center px-0 py-3" : "gap-2.5 px-3 py-2.5"
                )}
              >
                <UserCircle className="size-4" />
                {!collapsed && <span>Log in</span>}
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
                    {item.label}
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
