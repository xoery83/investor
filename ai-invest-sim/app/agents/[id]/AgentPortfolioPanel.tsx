"use client"

import * as React from "react"

import AddHoldingForm from "./AddHoldingForm"
import ValuationPanel from "./ValuationPanel"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import { formatCurrencyAmount } from "../../../src/lib/format/currency"
import { supabase } from "../../../src/lib/supabase"
import type { AgentValuation } from "../../../src/lib/types/agent"

export type PortfolioSummary = {
  cash_balance: number
  holdings_value: number
  total_value: number
}

export type TradeDraft = {
  key: string
  action: "buy" | "sell"
  symbol: string
  assetType?: string
  targetWeight?: number
  currentWeight?: number
  estimatedPortfolioPctChange?: number
}

type AgentPortfolioPanelProps = {
  agentId: string
  holdings: UpdatedHolding[]
  initialValuations: AgentValuation[]
  tradeDraft?: TradeDraft | null
  totalValue: number
  baseCurrency: string
  onUseHolding?: (holding: UpdatedHolding) => void
  onHoldingsUpdated?: (holdings: UpdatedHolding[]) => void
  onSummaryUpdated?: (summary: PortfolioSummary) => void
  canTrade?: boolean
  canRefreshValuation?: boolean
}

type HoldingPerformanceRange = "day" | "week" | "month"

type HoldingPerformance = {
  symbol: string
  currency: string
  base_currency: string
  value_change: number
  value_change_pct: number
  price_change: number
  price_change_pct: number
  latest_weight: number
}

export default function AgentPortfolioPanel({
  agentId,
  holdings,
  initialValuations,
  tradeDraft,
  totalValue,
  baseCurrency,
  onUseHolding,
  onHoldingsUpdated,
  onSummaryUpdated,
  canTrade = false,
  canRefreshValuation = false,
}: AgentPortfolioPanelProps) {
  const [activeTab, setActiveTab] = React.useState<"holdings" | "valuation">(
    "holdings"
  )
  const [performanceRange, setPerformanceRange] =
    React.useState<HoldingPerformanceRange>("day")
  const [performanceBySymbol, setPerformanceBySymbol] = React.useState<
    Record<string, HoldingPerformance>
  >({})
  const [performanceWarning, setPerformanceWarning] = React.useState("")
  const [tradeDrawerOpen, setTradeDrawerOpen] = React.useState(false)
  const [dismissedDraftKey, setDismissedDraftKey] = React.useState<string | null>(
    null
  )
  const activeDraftKey = tradeDraft?.key || null
  const drawerOpen =
    tradeDrawerOpen || Boolean(activeDraftKey && dismissedDraftKey !== activeDraftKey)
  const performanceRefreshKey = React.useMemo(
    () =>
      holdings
        .map((holding) =>
          [
            holding.id,
            holding.symbol,
            holding.current_price,
            holding.market_value_base,
            holding.weight,
            holding.updated_at,
          ].join(":")
        )
        .join("|"),
    [holdings]
  )

  React.useEffect(() => {
    let cancelled = false

    async function loadPerformance() {
      setPerformanceWarning("")

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const res = await fetch(
          `/api/agents/${agentId}/holdings/performance?range=${performanceRange}`,
          {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        )
        const data = await res.json()

        if (cancelled) return

        if (!data.success) {
          setPerformanceWarning(data.error || "Performance data unavailable.")
          setPerformanceBySymbol({})
          return
        }

        const next: Record<string, HoldingPerformance> = {}
        for (const item of data.performance || []) {
          next[String(item.symbol || "").toUpperCase()] = item
        }
        setPerformanceBySymbol(next)
        setPerformanceWarning(data.warning || "")
      } catch {
        if (!cancelled) {
          setPerformanceWarning("Performance data unavailable.")
          setPerformanceBySymbol({})
        }
      }
    }

    if (activeTab === "holdings" && holdings.length > 0) {
      loadPerformance()
    }

    return () => {
      cancelled = true
    }
  }, [activeTab, agentId, holdings.length, performanceRange, performanceRefreshKey])

  return (
    <section className="grid grid-cols-1 gap-6">
      <div className="rounded-xl border border-blue-200 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Portfolio Workspace</h2>
          <div className="flex flex-wrap items-center gap-2">
            {canTrade && (
              <button
                type="button"
                onClick={() => setTradeDrawerOpen(true)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Trade
              </button>
            )}
            <div className="inline-flex overflow-hidden rounded-lg border border-blue-200 bg-white">
              <TabButton
                active={activeTab === "holdings"}
                onClick={() => setActiveTab("holdings")}
              >
                Holdings
              </TabButton>
              <TabButton
                active={activeTab === "valuation"}
                onClick={() => setActiveTab("valuation")}
              >
                Valuation
              </TabButton>
            </div>
          </div>
        </div>

        {activeTab === "holdings" ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Price and contribution changes are based on stored valuation snapshots.
              </p>
              <div className="inline-flex overflow-hidden rounded-lg border border-blue-200 bg-white">
                {(["day", "week", "month"] as HoldingPerformanceRange[]).map(
                  (range) => (
                    <TabButton
                      key={range}
                      active={performanceRange === range}
                      onClick={() => setPerformanceRange(range)}
                    >
                      {range === "day" ? "Day" : range === "week" ? "Week" : "Month"}
                    </TabButton>
                  )
                )}
              </div>
            </div>
            {performanceWarning && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                {performanceWarning}
              </p>
            )}
            <HoldingsTable
              holdings={holdings}
              baseCurrency={baseCurrency}
              performanceBySymbol={performanceBySymbol}
              onUseHolding={onUseHolding}
            />
          </>
        ) : (
          <ValuationPanel
            agentId={agentId}
            initialValuations={initialValuations}
            baseCurrency={baseCurrency}
            embedded
            onHoldingsUpdated={onHoldingsUpdated}
            onSummaryUpdated={onSummaryUpdated}
            canRefresh={canRefreshValuation}
          />
        )}
      </div>

      {canTrade && drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close trade drawer"
            onClick={() => {
              setTradeDrawerOpen(false)
              setDismissedDraftKey(activeDraftKey)
            }}
          />
          <div className="relative h-full w-full max-w-[460px] overflow-y-auto border-l border-blue-200 bg-background p-4 shadow-2xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setTradeDrawerOpen(false)
                  setDismissedDraftKey(activeDraftKey)
                }}
                className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-blue-50"
              >
                Close
              </button>
            </div>
            <AddHoldingForm
              agentId={agentId}
              holdings={holdings}
              tradeDraft={tradeDraft}
              totalValue={totalValue}
              baseCurrency={baseCurrency}
              onTradeCompleted={(payload) => {
                onHoldingsUpdated?.(payload.holdings)
                onSummaryUpdated?.({
                  cash_balance: payload.cash_balance,
                  holdings_value: payload.holdings_value,
                  total_value: payload.total_value,
                })
              }}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function HoldingsTable({
  holdings,
  baseCurrency,
  performanceBySymbol,
  onUseHolding,
}: {
  holdings: UpdatedHolding[]
  baseCurrency: string
  performanceBySymbol: Record<string, HoldingPerformance>
  onUseHolding?: (holding: UpdatedHolding) => void
}) {
  return (
    <div>
      {holdings.length === 0 ? (
        <p className="text-slate-500">No holdings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[1180px] grid-cols-[1.1fr_0.75fr_0.7fr_0.75fr_0.8fr_0.75fr_0.75fr_0.65fr_0.75fr_0.8fr_1fr] gap-3 border-b border-blue-200 pb-2 text-sm text-slate-500">
            <span>Symbol</span>
            <span>Asset Type</span>
            <span>Shares</span>
            <span>Weight</span>
            <span>Price</span>
            <span>Price Chg</span>
            <span>Value Chg</span>
            <span>CCY</span>
            <span>FX</span>
            <span>Source</span>
            <span className="text-right">Base Value ({baseCurrency})</span>
          </div>

          {holdings.map((holding) => {
            const performance =
              performanceBySymbol[holding.symbol.toUpperCase()] || null

            return (
              <div
                key={holding.id}
                className="grid min-w-[1180px] grid-cols-[1.1fr_0.75fr_0.7fr_0.75fr_0.8fr_0.75fr_0.75fr_0.65fr_0.75fr_0.8fr_1fr] gap-3 border-b border-blue-200 py-2 text-sm"
              >
                <button
                  type="button"
                  onClick={() => onUseHolding?.(holding)}
                  className="text-left font-medium text-blue-600 hover:text-blue-700"
                  title="Load this holding into the trade form"
                >
                  {holding.symbol}
                </button>
                <span className="capitalize text-slate-700">
                  {holding.asset_type || "stock"}
                </span>
                <span>{formatShares(holding.quantity)}</span>
                <span>{Number(holding.weight || 0).toFixed(2)}%</span>
                <span>
                  {formatCurrencyAmount(
                    Number(holding.current_price || 0),
                    holding.currency || baseCurrency
                  )}
                </span>
                <PerformanceCell value={performance?.price_change_pct} />
                <PerformanceCell
                  value={performance?.value_change_pct}
                  detail={
                    performance
                      ? formatCurrencyAmount(
                          Number(performance.value_change || 0),
                          baseCurrency
                        )
                      : undefined
                  }
                />
                <span className="font-mono text-xs">
                  {(holding.currency || "USD").toUpperCase()}
                </span>
                <span>{Number(holding.fx_rate_to_base || 1).toFixed(4)}</span>
                <span>
                  <PriceSourceBadge
                    source={holding.price_source || "manual"}
                    marketState={holding.market_state}
                  />
                </span>
                <span className="text-right">
                  {formatCurrencyAmount(
                    Number(holding.market_value_base || holding.market_value || 0),
                    baseCurrency
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PerformanceCell({
  value,
  detail,
}: {
  value?: number
  detail?: string
}) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return <span className="text-slate-400">--</span>
  }

  const positive = value >= 0

  return (
    <span className={positive ? "text-emerald-700" : "text-red-600"}>
      {positive ? "+" : ""}
      {value.toFixed(2)}%
      {detail && <span className="block text-[11px] text-slate-500">{detail}</span>}
    </span>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
          : "px-3 py-1.5 text-xs text-slate-500 hover:bg-blue-50 hover:text-white"
      }
    >
      {children}
    </button>
  )
}

function PriceSourceBadge({
  source,
  marketState,
}: {
  source: NonNullable<UpdatedHolding["price_source"]>
  marketState?: string
}) {
  const labelBySource = {
    pre: "PRE",
    regular: "REG",
    post: "POST",
    manual: "MANUAL",
    cash: "CASH",
  } satisfies Record<NonNullable<UpdatedHolding["price_source"]>, string>

  const classBySource = {
    pre: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    regular: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    post: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    manual: "border-blue-200 bg-blue-100 text-slate-700",
    cash: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  } satisfies Record<NonNullable<UpdatedHolding["price_source"]>, string>

  return (
    <span
      title={marketState ? `Market state: ${marketState}` : undefined}
      className={`inline-flex rounded-md border px-2 py-0.5 font-mono text-[10px] tracking-wider ${classBySource[source]}`}
    >
      {labelBySource[source]}
    </span>
  )
}

function formatShares(quantity: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(Number(quantity || 0))
}
