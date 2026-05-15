"use client"

import * as React from "react"

import AddHoldingForm from "./AddHoldingForm"
import ValuationPanel from "./ValuationPanel"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
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
  onUseHolding?: (holding: UpdatedHolding) => void
  onHoldingsUpdated?: (holdings: UpdatedHolding[]) => void
  onSummaryUpdated?: (summary: PortfolioSummary) => void
  canTrade?: boolean
  canRefreshValuation?: boolean
}

export default function AgentPortfolioPanel({
  agentId,
  holdings,
  initialValuations,
  tradeDraft,
  totalValue,
  onUseHolding,
  onHoldingsUpdated,
  onSummaryUpdated,
  canTrade = false,
  canRefreshValuation = false,
}: AgentPortfolioPanelProps) {
  const [activeTab, setActiveTab] = React.useState<"holdings" | "valuation">(
    "holdings"
  )

  return (
    <section
      className={
        canTrade
          ? "grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"
          : "grid grid-cols-1 gap-6"
      }
    >
      <div className="rounded-xl border border-blue-200 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Portfolio Workspace</h2>
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

        {activeTab === "holdings" ? (
          <HoldingsTable holdings={holdings} onUseHolding={onUseHolding} />
        ) : (
          <ValuationPanel
            agentId={agentId}
            initialValuations={initialValuations}
            embedded
            onHoldingsUpdated={onHoldingsUpdated}
            onSummaryUpdated={onSummaryUpdated}
            canRefresh={canRefreshValuation}
          />
        )}
      </div>

      {canTrade && (
        <AddHoldingForm
          agentId={agentId}
          holdings={holdings}
          tradeDraft={tradeDraft}
          totalValue={totalValue}
          onTradeCompleted={(payload) => {
            onHoldingsUpdated?.(payload.holdings)
            onSummaryUpdated?.({
              cash_balance: payload.cash_balance,
              holdings_value: payload.holdings_value,
              total_value: payload.total_value,
            })
          }}
        />
      )}
    </section>
  )
}

function HoldingsTable({
  holdings,
  onUseHolding,
}: {
  holdings: UpdatedHolding[]
  onUseHolding?: (holding: UpdatedHolding) => void
}) {
  return (
    <div>
      {holdings.length === 0 ? (
        <p className="text-slate-500">No holdings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[1.1fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_1fr] gap-3 border-b border-blue-200 pb-2 text-sm text-slate-500">
            <span>Symbol</span>
            <span>Asset Type</span>
            <span>Shares</span>
            <span>Weight</span>
            <span>Price</span>
            <span>CCY</span>
            <span>FX</span>
            <span>Source</span>
            <span className="text-right">Base Value</span>
          </div>

          {holdings.map((holding) => (
            <div
              key={holding.id}
              className="grid min-w-[980px] grid-cols-[1.1fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr_0.7fr_0.8fr_1fr] gap-3 border-b border-blue-200 py-2 text-sm"
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
              <span>{Number(holding.current_price || 0).toLocaleString()}</span>
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
                ${Number(
                  holding.market_value_base || holding.market_value || 0
                ).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
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
