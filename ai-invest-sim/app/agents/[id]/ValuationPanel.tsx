"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import {
  CartesianGrid,
  ReferenceLine,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "../../../components/ui/button"
import { supabase } from "../../../src/lib/supabase"
import type { PortfolioSummary } from "./AgentPortfolioPanel"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import type { AgentValuation } from "../../../src/lib/types/agent"

type ValuationPanelProps = {
  agentId: string
  initialValuations: AgentValuation[]
  embedded?: boolean
  canRefresh?: boolean
  onHoldingsUpdated?: (holdings: UpdatedHolding[]) => void
  onSummaryUpdated?: (summary: PortfolioSummary) => void
}

type ValuationResponse = {
  success: boolean
  snapshot?: {
    holdings: UpdatedHolding[]
    cash_balance: number
    holdings_value: number
    total_value: number
  }
  valuations?: AgentValuation[]
  error?: string
}

type ValuationRange = "day" | "week" | "month" | "year"

const REFRESH_INTERVAL_MS = 60_000
const RANGE_OPTIONS: Array<{ value: ValuationRange; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
]

export default function ValuationPanel({
  agentId,
  initialValuations,
  embedded = false,
  canRefresh = false,
  onHoldingsUpdated,
  onSummaryUpdated,
}: ValuationPanelProps) {
  const [valuations, setValuations] = React.useState(initialValuations)
  const [range, setRange] = React.useState<ValuationRange>("day")
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [lastUpdated, setLastUpdated] = React.useState<number | null>(null)
  const [error, setError] = React.useState("")

  const refreshValuation = React.useCallback(async () => {
    if (!canRefresh) return

    setIsRefreshing(true)
    setError("")

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        throw new Error("Please log in before refreshing valuation.")
      }

      const response = await fetch(`/api/agents/${agentId}/valuation`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const payload = (await response.json()) as ValuationResponse

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to refresh valuation")
      }

      setValuations(payload.valuations || [])
      if (payload.snapshot?.holdings) {
        onHoldingsUpdated?.(payload.snapshot.holdings)
      }
      if (payload.snapshot) {
        onSummaryUpdated?.({
          cash_balance: payload.snapshot.cash_balance,
          holdings_value: payload.snapshot.holdings_value,
          total_value: payload.snapshot.total_value,
        })
      }
      setLastUpdated(Date.now())
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh valuation"
      )
    } finally {
      setIsRefreshing(false)
    }
  }, [agentId, canRefresh, onHoldingsUpdated, onSummaryUpdated])

  React.useEffect(() => {
    if (!canRefresh) return

    const initialRefresh = window.setTimeout(refreshValuation, 0)
    const interval = window.setInterval(refreshValuation, REFRESH_INTERVAL_MS)

    return () => {
      window.clearTimeout(initialRefresh)
      window.clearInterval(interval)
    }
  }, [canRefresh, refreshValuation])

  const chartData = buildChartData(valuations, range)
  const chartDomain = getValueDomain(chartData.map((point) => point.value))
  const baselineValue = chartData[0]?.value

  const latest = valuations[valuations.length - 1]

  return (
    <section
      className={
        embedded
          ? "rounded-xl"
          : "mt-8 rounded-xl border border-blue-200 p-6"
      }
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Valuation History</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canRefresh
              ? "Auto-refreshes every 60 seconds while this dashboard is open."
              : "Showing stored valuation history. Refresh is limited to owners and admins."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-blue-200 bg-white">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={
                  range === option.value
                    ? "bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                    : "px-3 py-1.5 text-xs text-slate-500 hover:bg-blue-50 hover:text-white"
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={refreshValuation}
            disabled={isRefreshing || !canRefresh}
            className="gap-2 border-blue-200 bg-blue-50 text-white hover:bg-blue-100"
          >
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Updating" : "Update now"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="h-72 rounded-lg border border-blue-200 bg-white/80 p-3">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              No valuation history yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 12 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  stroke="#64748b"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                  domain={chartDomain}
                  width={86}
                />
                {baselineValue != null && (
                  <ReferenceLine
                    y={baselineValue}
                    stroke="#94a3b8"
                    strokeDasharray="5 5"
                    strokeOpacity={0.55}
                  />
                )}
                <Tooltip
                  contentStyle={{
                    background: "#020617",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    color: "#f8fafc",
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      | { recordedAt?: string }
                      | undefined

                    return point?.recordedAt
                      ? new Date(point.recordedAt).toLocaleString()
                      : ""
                  }}
                  formatter={(value) => [
                    `$${Number(value).toLocaleString()}`,
                    "Total value",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#60a5fa", strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-lg border border-blue-200 bg-white/80 p-4">
          <p className="text-sm text-slate-500">Latest Snapshot</p>
          <p className="mt-2 text-2xl font-bold">
            ${Number(latest?.total_value || 0).toLocaleString()}
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Holdings</span>
              <span>${Number(latest?.holdings_value || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Cash</span>
              <span>${Number(latest?.cash_value || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Cumulative</span>
              <span>{Number(latest?.cumulative_return || 0).toFixed(2)}%</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            {lastUpdated
              ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}`
              : "Waiting for first refresh..."}
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </section>
  )
}

function buildChartData(
  valuations: AgentValuation[],
  range: ValuationRange
) {
  const cutoff = getRangeCutoff(range)
  const scoped = valuations.filter((valuation) => {
    return new Date(valuation.recorded_at).getTime() >= cutoff
  })
  const source = scoped.length > 0 ? scoped : valuations
  const buckets = new Map<string, AgentValuation>()

  for (const valuation of source) {
    const recordedAt = new Date(valuation.recorded_at)
    const key = getBucketKey(recordedAt, range)
    const existing = buckets.get(key)

    if (
      !existing ||
      new Date(valuation.recorded_at).getTime() >
        new Date(existing.recorded_at).getTime()
    ) {
      buckets.set(key, valuation)
    }
  }

  return Array.from(buckets.values()).map((valuation) => {
    const recordedAt = new Date(valuation.recorded_at)

    return {
      id: valuation.id,
      value: Number(valuation.total_value || 0),
      label: formatRangeLabel(recordedAt, range),
      recordedAt: valuation.recorded_at,
    }
  })
}

function getRangeCutoff(range: ValuationRange) {
  const now = Date.now()
  const dayMs = 86_400_000

  if (range === "day") return now - dayMs
  if (range === "week") return now - 7 * dayMs
  if (range === "month") return now - 31 * dayMs
  return now - 365 * dayMs
}

function formatRangeLabel(date: Date, range: ValuationRange) {
  if (range === "day") {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (range === "week") {
    const weekday = date.toLocaleDateString("en-US", {
      weekday: "short",
    })
    const hour = date.toLocaleTimeString("en-US", {
      hour: "numeric",
    })

    return `${weekday} ${hour}`
  }

  if (range === "year") {
    return `Week of ${formatShortDate(getWeekStart(date))}`
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function getBucketKey(date: Date, range: ValuationRange) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hour = String(date.getHours()).padStart(2, "0")

  if (range === "day") {
    const minute = String(date.getMinutes()).padStart(2, "0")

    return `${year}-${month}-${day}T${hour}:${minute}`
  }

  if (range === "week") {
    return `${year}-${month}-${day}T${hour}`
  }

  if (range === "year") {
    return formatDateKey(getWeekStart(date))
  }

  return `${year}-${month}-${day}`
}

function getWeekStart(date: Date) {
  const out = new Date(date)
  const day = out.getDay()

  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - day)

  return out
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

function getValueDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const midpoint = (min + max) / 2
  const minimumVisibleSpan = Math.max(midpoint * 0.01, 1)
  const paddedSpan = Math.max(span * 1.35, minimumVisibleSpan)
  const lower = midpoint - paddedSpan / 2
  const upper = midpoint + paddedSpan / 2

  return [
    Math.max(0, Math.floor(lower)),
    Math.ceil(upper),
  ]
}
