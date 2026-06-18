"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrencyAmount } from "../../src/lib/format/currency"
import { supabase } from "../../src/lib/supabase"

type UserAgentPosition = {
  id: string
  agent_id: string
  shares: number
  average_nav: number
  current_nav: number
  market_value: number
  cost_basis?: number
  portfolio_weight_pct?: number
  unrealized_pnl?: number
  unrealized_return_pct?: number
  currency?: string
  status: string
  created_at?: string
  agents?: {
    id: string
    name: string
    description: string | null
    visibility: string
    lifecycle_status: string
    initial_capital?: number
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
    initial_value?: number
    nav_change_amount?: number
    nav_change_pct?: number
  }
  history?: {
    agent_valuations?: AgentValuationPoint[]
    transactions?: UserAgentTransaction[]
  }
  error?: string
}

type AgentValuationPoint = {
  id: string
  agent_id: string
  total_value: number
  base_currency?: string
  recorded_at: string
}

type UserAgentTransaction = {
  id: string
  agent_id: string
  action: "buy" | "sell" | "liquidation"
  shares: number
  nav: number
  amount: number
  created_at: string
}

type PortfolioTab = "positions" | "chart" | "following"

export default function PortfolioPage() {
  const [payload, setPayload] = useState<PortfolioPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sellingId, setSellingId] = useState<string | null>(null)
  const [sellShares, setSellShares] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<PortfolioTab>("positions")

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

  async function sellPosition(position: UserAgentPosition, sharesToSell?: number) {
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
        shares: sharesToSell && sharesToSell > 0 ? sharesToSell : position.shares,
      }),
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to sell position.")
    } else {
      setSellShares((prev) => ({ ...prev, [position.id]: "" }))
      await loadPortfolio()
    }

    setSellingId(null)
  }

  const summary = payload?.summary
  const positions = useMemo(() => payload?.positions || [], [payload?.positions])
  const follows = useMemo(() => payload?.follows || [], [payload?.follows])
  const followedWithoutPosition = follows.filter((follow) => !follow.has_position)
  const followedWithPosition = follows.filter((follow) => follow.has_position)
  const portfolioCurrency = payload?.portfolio?.currency || "USD"
  const chartData = useMemo(
    () => buildPortfolioChartData(payload, positions),
    [payload, positions]
  )
  const lineKeys = useMemo(
    () => positions.map((position) => position.agent_id),
    [positions]
  )

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
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
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
              value={formatCurrency(summary?.total_value || 0, portfolioCurrency)}
              detail={
                <ChangeText
                  amount={Number(summary?.nav_change_amount || 0)}
                  pct={Number(summary?.nav_change_pct || 0)}
                  currency={portfolioCurrency}
                  suffix="since portfolio start"
                />
              }
            />
            <MetricCard
              label="Cash Balance"
              value={formatCurrency(summary?.cash_balance || 0, portfolioCurrency)}
            />
            <MetricCard
              label="Agent Positions"
              value={formatCurrency(summary?.positions_value || 0, portfolioCurrency)}
            />
          </section>

          <Card className="border-border/60 bg-card/55 backdrop-blur-md">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Agent ETF Positions</CardTitle>
                  <CardDescription>
                    Simulated holdings in followed public agents.
                  </CardDescription>
                </div>
                <div className="inline-flex overflow-hidden rounded-lg border border-blue-200 bg-white">
                  <TabButton
                    active={activeTab === "positions"}
                    onClick={() => setActiveTab("positions")}
                  >
                    Holdings
                  </TabButton>
                  <TabButton
                    active={activeTab === "chart"}
                    onClick={() => setActiveTab("chart")}
                  >
                    Chart
                  </TabButton>
                  <TabButton
                    active={activeTab === "following"}
                    onClick={() => setActiveTab("following")}
                  >
                    Following
                  </TabButton>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activeTab === "positions" && positions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
                  No Agent ETF positions yet. Browse public agents and buy a simulated allocation.
                </div>
              ) : activeTab === "positions" ? (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[1120px] grid-cols-[1.35fr_0.58fr_0.58fr_0.7fr_0.7fr_0.85fr_0.85fr_1.1fr] gap-3 border-b border-border/70 pb-2 text-sm text-muted-foreground">
                    <span>Agent</span>
                    <span>Status</span>
                    <span>Shares</span>
                    <span>Avg NAV</span>
                    <span>Weight</span>
                    <span>Market Value</span>
                    <span>P/L</span>
                    <span className="text-right">Action</span>
                  </div>

                  {positions.map((position) => (
                    <div
                      key={position.id}
                      className="grid min-w-[1120px] grid-cols-[1.35fr_0.58fr_0.58fr_0.7fr_0.7fr_0.85fr_0.85fr_1.1fr] gap-3 border-b border-border/60 py-3 text-sm"
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
                      <span>
                        {formatCurrency(
                          position.average_nav,
                          position.currency || portfolioCurrency
                        )}
                      </span>
                      <span>{formatPercent(position.portfolio_weight_pct || 0)}</span>
                      <span>
                        {formatCurrency(
                          position.market_value,
                          position.currency || portfolioCurrency
                        )}
                      </span>
                      <span>
                        <ChangeText
                          amount={Number(position.unrealized_pnl || 0)}
                          pct={Number(position.unrealized_return_pct || 0)}
                          currency={position.currency || portfolioCurrency}
                          compact
                        />
                      </span>
                      <span className="flex items-center justify-end gap-2 text-right">
                        <input
                          type="number"
                          min="0"
                          max={position.shares}
                          step="0.000001"
                          value={sellShares[position.id] || ""}
                          onChange={(event) =>
                            setSellShares((prev) => ({
                              ...prev,
                              [position.id]: event.target.value,
                            }))
                          }
                          placeholder="Shares"
                          className="h-8 w-24 rounded-md border border-blue-200 bg-white px-2 text-xs text-slate-900 outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            sellPosition(
                              position,
                              Number(sellShares[position.id] || 0)
                            )
                          }
                          disabled={
                            sellingId === position.id ||
                            Number(sellShares[position.id] || 0) <= 0
                          }
                          className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 disabled:border-slate-200 disabled:text-slate-400"
                        >
                          Sell
                        </button>
                        <button
                          type="button"
                          onClick={() => sellPosition(position)}
                          disabled={sellingId === position.id}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400"
                        >
                          {sellingId === position.id ? "Selling..." : "Sell all"}
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ) : activeTab === "chart" ? (
                <PortfolioTrendChart
                  data={chartData}
                  positions={positions}
                  lineKeys={lineKeys}
                  currency={portfolioCurrency}
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
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
                </div>
              )}
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

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: ReactNode
}) {
  return (
    <Card className="border-border/60 bg-card/55 backdrop-blur-md">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
        {detail && <div className="pt-1 text-sm">{detail}</div>}
      </CardHeader>
    </Card>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "bg-blue-600 px-4 py-2 text-sm font-medium text-white"
          : "px-4 py-2 text-sm text-slate-600 hover:bg-blue-50 hover:text-blue-700"
      }
    >
      {children}
    </button>
  )
}

function ChangeText({
  amount,
  pct,
  currency,
  suffix,
  compact = false,
}: {
  amount: number
  pct: number
  currency: string
  suffix?: string
  compact?: boolean
}) {
  const positive = amount >= 0
  const color = positive ? "text-emerald-600" : "text-red-600"
  const sign = positive ? "+" : ""

  return (
    <span className={color}>
      {sign}
      {formatCurrency(amount, currency)} ({sign}
      {pct.toFixed(2)}%){suffix && !compact ? ` ${suffix}` : ""}
    </span>
  )
}

function PortfolioTrendChart({
  data,
  positions,
  lineKeys,
  currency,
}: {
  data: Array<Record<string, number | string>>
  positions: UserAgentPosition[]
  lineKeys: string[]
  currency: string
}) {
  if (data.length === 0 || positions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
        No trend data yet. Refresh the underlying agents&apos; valuations to build a chart.
      </div>
    )
  }

  const labels = new Map(
    positions.map((position) => [
      position.agent_id,
      position.agents?.name || position.agent_id.slice(0, 8),
    ])
  )

  return (
    <div className="min-w-0 space-y-4">
      <div className="overflow-x-auto rounded-xl border border-blue-200 bg-white p-4">
        <AreaChart
          width={1000}
          height={320}
          data={data}
          margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
        >
            <CartesianGrid stroke="#dbeafe" strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              tickFormatter={(value) =>
                formatCurrency(Number(value), currency).replace(`${currency} `, "")
              }
              width={78}
            />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                color: "#0f172a",
              }}
              formatter={(value, name) => {
                if (String(name) === "total") {
                  return [formatCurrency(Number(value), currency), "Total Agent Positions"]
                }

                return [
                  formatCurrency(Number(value), currency),
                  labels.get(String(name)) || String(name),
                ]
              }}
            />
            <Legend
              formatter={(value) => labels.get(String(value)) || String(value)}
              wrapperStyle={{ fontSize: 12 }}
            />
            {lineKeys.map((key, index) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="agentPositions"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                fillOpacity={0.22}
              />
            ))}
        </AreaChart>
      </div>
      <p className="text-xs text-muted-foreground">
        Trend uses agent valuation history and your transaction history. Stacked
        areas add up to estimated total Agent ETF positions for each date.
      </p>
    </div>
  )
}

const CHART_COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
]

function buildPortfolioChartData(
  payload: PortfolioPayload | null,
  positions: UserAgentPosition[]
) {
  const valuations = payload?.history?.agent_valuations || []
  const transactions = payload?.history?.transactions || []
  if (positions.length === 0 || valuations.length === 0) return []

  const positionMap = new Map(positions.map((position) => [position.agent_id, position]))
  const valuationsByAgent = new Map<string, AgentValuationPoint[]>()

  for (const valuation of valuations) {
    const agentId = String(valuation.agent_id)
    if (!positionMap.has(agentId)) continue
    const existing = valuationsByAgent.get(agentId) || []
    existing.push(valuation)
    valuationsByAgent.set(agentId, existing)
  }

  for (const list of valuationsByAgent.values()) {
    list.sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
    )
  }

  const dateKeys = new Set<string>()
  for (const valuation of valuations) {
    if (positionMap.has(String(valuation.agent_id))) {
      dateKeys.add(formatDateKey(new Date(valuation.recorded_at)))
    }
  }
  for (const transaction of transactions) {
    if (positionMap.has(String(transaction.agent_id))) {
      dateKeys.add(formatDateKey(new Date(transaction.created_at)))
    }
  }

  const rows = Array.from(dateKeys)
    .sort()
    .map((dateKey) => {
      const endOfDay = new Date(`${dateKey}T23:59:59.999`)
      const row: Record<string, number | string> = {
        label: formatShortDate(endOfDay),
        total: 0,
      }

      for (const position of positions) {
        const agentId = position.agent_id
        const shares = getSharesAtDate(transactions, agentId, endOfDay)
        if (shares <= 0) {
          row[agentId] = 0
          continue
        }

        const valuation = getLatestValuationAtDate(
          valuationsByAgent.get(agentId) || [],
          endOfDay
        )
        const nav = valuation
          ? calculateAgentNavFromValuation(valuation, position)
          : Number(position.current_nav || 0)
        const value = shares * nav
        row[agentId] = value
        row.total = Number(row.total || 0) + value
      }

      return row
    })
    .filter((row) => Number(row.total || 0) > 0)

  const latest: Record<string, number | string> = {
    label: "Now",
    total: 0,
  }

  for (const position of positions) {
    const value = Number(position.market_value || 0)
    latest[position.agent_id] = value
    latest.total = Number(latest.total || 0) + value
  }

  rows.push(latest)

  return rows.slice(-40)
}

function getSharesAtDate(
  transactions: UserAgentTransaction[],
  agentId: string,
  date: Date
) {
  const cutoff = date.getTime()
  const shares = transactions.reduce((sum, transaction) => {
    if (String(transaction.agent_id) !== agentId) return sum
    if (new Date(transaction.created_at).getTime() > cutoff) return sum

    const shares = Number(transaction.shares || 0)
    return transaction.action === "buy" ? sum + shares : sum - shares
  }, 0)

  return Math.max(0, shares)
}

function getLatestValuationAtDate(
  valuations: AgentValuationPoint[],
  date: Date
) {
  const cutoff = date.getTime()
  let latest: AgentValuationPoint | null = null

  for (const valuation of valuations) {
    if (new Date(valuation.recorded_at).getTime() <= cutoff) {
      latest = valuation
    }
  }

  return latest
}

function calculateAgentNavFromValuation(
  valuation: AgentValuationPoint,
  position: UserAgentPosition
) {
  const initialCapital = Number(position.agents?.initial_capital || 0)
  const totalValue = Number(valuation.total_value || 0)
  if (initialCapital <= 0 || totalValue <= 0) return Number(position.current_nav || 0)

  return (totalValue / initialCapital) * 100
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function formatCurrency(value: number, currency: string) {
  return formatCurrencyAmount(value, currency, {
    maximumFractionDigits: 2,
  })
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(Number(value || 0))
}

function formatToken(value: string) {
  return value.replaceAll("_", " ")
}
