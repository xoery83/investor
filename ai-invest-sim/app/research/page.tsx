"use client"

import * as React from "react"
import Link from "next/link"
import { Trophy } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatCurrencyAmount } from "../../src/lib/format/currency"
import { supabase } from "../../src/lib/supabase"

type LeaderboardPosition = {
  agent_id: string
  agent_name: string
  agent_mode: string
  shares: number
  current_nav: number
  market_value: number
  weight_pct: number
}

type LeaderboardEntry = {
  user_id: string
  rank: number
  display_name: string
  role: string
  currency: string
  cash_balance: number
  positions_value: number
  total_value: number
  return_amount: number
  return_pct: number
  agent_count: number
  updated_at: string | null
  positions: LeaderboardPosition[]
}

type LeaderboardPayload = {
  success: boolean
  me?: LeaderboardEntry | null
  top?: LeaderboardEntry[]
  access_mode?: "service" | "rls"
  error?: string
}

export default function ResearchPage() {
  const [payload, setPayload] = React.useState<LeaderboardPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [expandedUserId, setExpandedUserId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function loadLeaderboard() {
      setLoading(true)
      setError("")

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Please log in to view the portfolio leaderboard.")
        setLoading(false)
        return
      }

      const res = await fetch("/api/leaderboard/portfolio", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = (await res.json()) as LeaderboardPayload

      if (cancelled) return

      if (!data.success) {
        setError(data.error || "Failed to load leaderboard.")
        setPayload(null)
      } else {
        setPayload(data)
      }

      setLoading(false)
    }

    loadLeaderboard()

    return () => {
      cancelled = true
    }
  }, [])

  const entries = payload?.top || []
  const me = payload?.me || null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Community / Portfolio Leaderboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Portfolio Leaderboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            All users start with USD 100,000 in simulated capital. Rankings compare
            current net asset value across the community.
          </p>
        </div>
        <Button asChild className="gap-2 bg-primary/90 shadow-lg shadow-primary/20 hover:bg-primary">
          <Link href="/agents">
            <Trophy className="size-4" />
            Browse Agents
          </Link>
        </Button>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/10">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Your Rank"
          value={loading ? "..." : me ? `#${me.rank}` : "--"}
          detail={me ? `${formatSignedPercent(me.return_pct)} since start` : "No portfolio yet"}
        />
        <MetricCard
          label="Your Net Asset Value"
          value={loading || !me ? "--" : formatCurrency(me.total_value, me.currency)}
          detail={me ? `${formatCurrency(me.return_amount, me.currency)} P/L` : ""}
        />
        <MetricCard
          label="Top 50 Cut"
          value={
            loading || entries.length === 0
              ? "--"
              : formatCurrency(entries[entries.length - 1].total_value, entries[0].currency)
          }
          detail={`${entries.length} ranked investors`}
        />
      </section>

      {payload?.access_mode === "rls" && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            Leaderboard is using RLS-limited access. If only your own row appears in
            production, configure a service-role backed API or a secure leaderboard RPC.
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/55 backdrop-blur-md">
        <CardHeader>
          <CardTitle>Top Portfolio Managers</CardTitle>
          <CardDescription>
            Expand a row to inspect that user&apos;s simulated Agent ETF holdings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading leaderboard...</p>
          ) : entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              No ranked portfolios yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[980px] grid-cols-[0.42fr_1.2fr_0.9fr_0.8fr_0.8fr_0.65fr_0.6fr] gap-3 border-b border-border/70 pb-2 text-sm text-muted-foreground">
                <span>Rank</span>
                <span>User</span>
                <span>Total Asset</span>
                <span>Return</span>
                <span>Agent Capital</span>
                <span>Agents</span>
                <span className="text-right">View</span>
              </div>

              {entries.map((entry) => {
                const expanded = expandedUserId === entry.user_id

                return (
                  <div key={entry.user_id} className="border-b border-border/60">
                    <div className="grid min-w-[980px] grid-cols-[0.42fr_1.2fr_0.9fr_0.8fr_0.8fr_0.65fr_0.6fr] gap-3 py-3 text-sm">
                      <span className="font-semibold">#{entry.rank}</span>
                      <div>
                        <p className="font-medium">{entry.display_name}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {entry.role}
                        </p>
                      </div>
                      <span>{formatCurrency(entry.total_value, entry.currency)}</span>
                      <ChangeValue value={entry.return_pct} suffix="%" />
                      <span>
                        {formatCurrency(entry.positions_value, entry.currency)}
                      </span>
                      <span>{entry.agent_count}</span>
                      <span className="text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedUserId(expanded ? null : entry.user_id)
                          }
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                        >
                          {expanded ? "Hide" : "View"}
                        </button>
                      </span>
                    </div>

                    {expanded && (
                      <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                        {entry.positions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            This user has no active Agent ETF positions.
                          </p>
                        ) : (
                          <div className="grid gap-2 md:grid-cols-2">
                            {entry.positions.map((position) => (
                              <Link
                                key={position.agent_id}
                                href={`/agents/${position.agent_id}`}
                                className="rounded-lg border border-blue-100 bg-white p-3 transition hover:border-blue-300"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium">
                                      {position.agent_name}
                                    </p>
                                    <p className="text-xs capitalize text-muted-foreground">
                                      {formatToken(position.agent_mode)}
                                    </p>
                                  </div>
                                  <span className="text-sm font-medium">
                                    {formatPercent(position.weight_pct)}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                  <span>Shares {formatNumber(position.shares)}</span>
                                  <span className="text-right">
                                    {formatCurrency(
                                      position.market_value,
                                      entry.currency
                                    )}
                                  </span>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
  detail?: string
}) {
  return (
    <Card className="border-border/60 bg-card/55 backdrop-blur-md">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      </CardHeader>
    </Card>
  )
}

function ChangeValue({ value, suffix }: { value: number; suffix: string }) {
  const positive = value >= 0

  return (
    <span className={positive ? "text-emerald-600" : "text-red-600"}>
      {positive ? "+" : ""}
      {value.toFixed(2)}
      {suffix}
    </span>
  )
}

function formatCurrency(value: number, currency: string) {
  return formatCurrencyAmount(value, currency, {
    maximumFractionDigits: 2,
  })
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(Number(value || 0))
}

function formatToken(value: string) {
  return value.replaceAll("_", " ")
}
