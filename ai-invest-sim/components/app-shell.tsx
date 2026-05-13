"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bot,
  BriefcaseBusiness,
  ChartCandlestick,
  FlaskConical,
  LayoutDashboard,
  Settings,
  Sparkles,
} from "lucide-react"

import { cn } from "../lib/utils"

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

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_60%_at_0%_0%,oklch(0.46_0.11_245/0.15),transparent_58%),radial-gradient(ellipse_75%_58%_at_100%_0%,oklch(0.6_0.13_200/0.08),transparent_56%)]"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1680px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-border/60 bg-background/80 px-4 py-6 backdrop-blur-xl lg:block">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary/90 to-primary/60 shadow-lg shadow-primary/20 ring-1 ring-white/10">
              <ChartCandlestick className="size-4.5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">AI Invest OS</p>
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Simulated Environment
              </p>
            </div>
          </div>
          <nav className="space-y-5">
            {navSections.map((section) => (
              <div key={section.title}>
                <p className="px-2 pb-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  {section.title}
                </p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const active = isActive(pathname, item)
                    const Icon = item.icon

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-all",
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
                        <span>{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
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
