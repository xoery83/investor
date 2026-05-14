"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../../src/lib/supabase"

type UserAgentPosition = {
  id: string
  agent_id: string
  shares: number
  average_nav: number
  current_nav: number
  market_value: number
  status: string
  agents?: {
    id: string
    name: string
    description: string | null
    visibility: string
    lifecycle_status: string
  }
}

type FollowedAgent = {
  id: string
  agent_id: string
  status: string
  has_position?: boolean
  agents?: {
    id: string
    name: string
    description: string | null
    visibility: string
    lifecycle_status: string
  }
}

type PortfolioPayload = {
  success: boolean
  portfolio?: {
    cash_balance: number
    total_value: number
    currency: string
  }
  positions?: UserAgentPosition[]
  follows?: FollowedAgent[]
  summary?: {
    cash_balance: number
    positions_value: number
    total_value: number
  }
  error?: string
}

export default function PortfolioPage() {
  const [payload, setPayload] = useState<PortfolioPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sellingId, setSellingId] = useState<string | null>(null)

  const loadPortfolio = useCallback(async () => {
    setLoading(true)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in to view your simulated portfolio.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/user/portfolio", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as PortfolioPayload

    if (!data.success) {
      setError(data.error || "Failed to load portfolio.")
      setPayload(null)
    } else {
      setPayload(data)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(loadPortfolio, 0)
    return () => window.clearTimeout(timer)
  }, [loadPortfolio])

  async function sellPosition(position: UserAgentPosition) {
    setSellingId(position.id)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before selling.")
      setSellingId(null)
      return
    }

    const res = await fetch("/api/user/portfolio/positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "sell",
        agent_id: position.agent_id,
        shares: position.shares,
      }),
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to sell position.")
    } else {
      await loadPortfolio()
    }

    setSellingId(null)
  }

  const summary = payload?.summary
  const positions = payload?.positions || []
  const follows = payload?.follows || []
  const followedWithoutPosition = follows.filter((follow) => !follow.has_position)
  const followedWithPosition = follows.filter((follow) => follow.has_position)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Invest / Portfolio
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Portfolio Simulator
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your personal simulated cash pool and Agent ETF positions.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading portfolio...</p>
      ) : (
        <>
          <section className="mb-6 grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Net Asset Value"
              value={formatCurrency(summary?.total_value || 0)}
            />
            <MetricCard
              label="Cash Balance"
              value={formatCurrency(summary?.cash_balance || 0)}
            />
            <MetricCard
              label="Agent Positions"
              value={formatCurrency(summary?.positions_value || 0)}
            />
          </section>

          <Card className="border-border/60 bg-card/55 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Agent ETF Positions</CardTitle>
              <CardDescription>
                Simulated holdings in followed public/system agents.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
                  No Agent ETF positions yet. Browse public agents and buy a simulated allocation.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[860px] grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-border/70 pb-2 text-sm text-muted-foreground">
                    <span>Agent</span>
                    <span>Status</span>
                    <span>Shares</span>
                    <span>Avg NAV</span>
                    <span>Market Value</span>
                    <span className="text-right">Action</span>
                  </div>

                  {positions.map((position) => (
                    <div
                      key={position.id}
                      className="grid min-w-[860px] grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-border/60 py-3 text-sm"
                    >
                      <div>
                        <Link
                          href={`/agents/${position.agent_id}`}
                          className="font-medium text-blue-300 hover:text-blue-200"
                        >
                          {position.agents?.name || "Agent"}
                        </Link>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {position.agents?.description || "No description"}
                        </p>
                      </div>
                      <span className="capitalize text-muted-foreground">
                        {formatToken(position.status)}
                      </span>
                      <span>{formatNumber(position.shares)}</span>
                      <span>{formatCurrency(position.average_nav)}</span>
                      <span>{formatCurrency(position.market_value)}</span>
                      <span className="text-right">
                        <button
                          type="button"
                          onClick={() => sellPosition(position)}
                          disabled={sellingId === position.id}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:border-slate-700 disabled:text-slate-500"
                        >
                          {sellingId === position.id ? "Selling..." : "Sell all"}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6 border-border/60 bg-card/55 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Following Agents</CardTitle>
              <CardDescription>
                Agents you follow, separated from simulated Agent ETF holdings.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <FollowList
                title="Followed, not held"
                emptyText="No watch-only followed agents."
                follows={followedWithoutPosition}
              />
              <FollowList
                title="Followed and held"
                emptyText="No followed agents with active positions."
                follows={followedWithPosition}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function FollowList({
  title,
  emptyText,
  follows,
}: {
  title: string
  emptyText: string
  follows: FollowedAgent[]
}) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
      {follows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {follows.map((follow) => (
            <Link
              key={follow.id}
              href={`/agents/${follow.agent_id}`}
              className="block rounded-lg border border-border/60 bg-muted/20 px-3 py-2 transition hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{follow.agents?.name || "Agent"}</p>
                <span className="rounded-md border border-border/70 px-2 py-0.5 text-xs capitalize text-muted-foreground">
                  {formatToken(follow.status)}
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                {follow.agents?.description || "No description"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-card/55 backdrop-blur-md">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(Number(value || 0))
}

function formatToken(value: string) {
  return value.replaceAll("_", " ")
}
