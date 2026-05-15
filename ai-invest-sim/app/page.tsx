"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Bot, BriefcaseBusiness, ChartSpline, Sparkles } from "lucide-react"

import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { formatCompactCurrencyAmount } from "../src/lib/format/currency"
import { supabase } from "../src/lib/supabase"

type AgentListItem = {
  id: string
  name: string
  visibility: string
  lifecycle_status: string
  current_value: number
  is_following?: boolean
}

type PortfolioSummary = {
  cash_balance: number
  positions_value: number
  total_value: number
}

export default function Home() {
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {}

      const [agentsRes, portfolioRes] = await Promise.all([
        fetch("/api/agents", { headers, cache: "no-store" }),
        token
          ? fetch("/api/user/portfolio", { headers, cache: "no-store" })
          : Promise.resolve(null),
      ])
      const agentsPayload = await agentsRes.json()
      const portfolioPayload = portfolioRes ? await portfolioRes.json() : null

      if (cancelled) return

      if (agentsPayload.success) {
        setAgents(agentsPayload.agents || [])
      }
      if (portfolioPayload?.success) {
        setSummary(portfolioPayload.summary)
      }
      setLoading(false)
    }

    loadDashboard()

    return () => {
      cancelled = true
    }
  }, [])

  const activeAgents = agents.filter(
    (agent) => agent.lifecycle_status === "active"
  )
  const followedAgents = agents.filter((agent) => agent.is_following)
  const systemAgents = agents.filter(
    (agent) => agent.visibility === "system" || agent.visibility === "public"
  )

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
        <div className="mb-6">
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Overview / Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            AI Investment Operating System
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A live workspace for agents, follow relationships, and your simulated Agent ETF portfolio.
          </p>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <MetricCard
            label="Visible Agents"
            value={loading ? "..." : String(agents.length)}
            detail={`${activeAgents.length} active`}
          />
          <MetricCard
            label="Discoverable Agents"
            value={loading ? "..." : String(systemAgents.length)}
            detail="Available to discover"
          />
          <MetricCard
            label="Following"
            value={loading ? "..." : String(followedAgents.length)}
            detail="Agents tracked by you"
          />
          <MetricCard
            label="Portfolio NAV"
            value={
              summary ? formatCompactCurrencyAmount(summary.total_value, "USD") : "--"
            }
            detail={
              summary
                ? `${formatCompactCurrencyAmount(summary.cash_balance, "USD")} cash`
                : "Log in to initialize"
            }
          />
        </section>

        <Card className="mb-8 border-border/60 bg-card/55 shadow-xl shadow-black/20 backdrop-blur-md">
          <CardHeader>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-wider text-primary uppercase">
              <Sparkles className="size-3" />
              Next Actions
            </div>
            <CardTitle className="mt-2 text-2xl tracking-tight">
              Build, follow, and simulate agent portfolios
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-relaxed">
              Create private agents, discover public agents, follow them, and allocate simulated cash into Agent ETF positions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/agents" className="gap-1.5">
                Browse Agents
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portfolio">Open Portfolio</Link>
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2">
          <ModuleCard
            icon={<Bot className="size-4 text-primary" />}
            name="Agents"
            href="/agents"
            desc="Create, manage, follow, and run investment agents."
          />
          <ModuleCard
            icon={<BriefcaseBusiness className="size-4 text-primary" />}
            name="Portfolio"
            href="/portfolio"
            desc="Track your simulated Agent ETF cash and positions."
          />
          <ModuleCard
            icon={<Sparkles className="size-4 text-primary" />}
            name="Research"
            href="/research"
            desc="Review recent daily, weekly, and escalation runs."
          />
          <ModuleCard
            icon={<ChartSpline className="size-4 text-primary" />}
            name="Strategies"
            href="/strategies"
            desc="Use live agents as the current strategy catalog."
          />
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-md">
      <CardHeader>
        <CardDescription className="font-mono text-[11px] uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  )
}

function ModuleCard({
  icon,
  name,
  href,
  desc,
}: {
  icon: ReactNode
  name: string
  href: string
  desc: string
}) {
  return (
    <Card className="group border-border/60 bg-card/50 transition-colors hover:bg-card/65">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {name}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="ghost" size="sm" className="px-0 text-primary hover:bg-transparent">
          <Link href={href} className="gap-1.5">
            Open
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
