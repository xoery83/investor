"use client"

import * as React from "react"

import AddHoldingForm from "./AddHoldingForm"
import ValuationPanel from "./ValuationPanel"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import type {
  AgentHolding,
  AgentValuation,
} from "../../../src/lib/types/agent"

export type PortfolioSummary = {
  cash_balance: number
  holdings_value: number
  total_value: number
}

type AgentPortfolioPanelProps = {
  agentId: string
  initialHoldings: AgentHolding[]
  initialValuations: AgentValuation[]
  onSummaryUpdated?: (summary: PortfolioSummary) => void
}

export default function AgentPortfolioPanel({
  agentId,
  initialHoldings,
  initialValuations,
  onSummaryUpdated,
}: AgentPortfolioPanelProps) {
  const [holdings, setHoldings] = React.useState<UpdatedHolding[]>(
    initialHoldings.map((holding) => ({
      ...holding,
      price_source: "manual",
      market_state: "LOADED",
    }))
  )

  return (
    <>
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="border border-slate-800 rounded-xl p-6 lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Holdings</h2>

          {holdings.length === 0 ? (
            <p className="text-slate-500">No holdings yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-3 text-sm text-slate-500 border-b border-slate-800 pb-2">
                <span>Symbol</span>
                <span>Shares</span>
                <span>Weight</span>
                <span>Price</span>
                <span>Source</span>
                <span className="text-right">Market Value</span>
              </div>

              {holdings.map((holding) => (
                <div
                  key={holding.id}
                  className="grid grid-cols-6 gap-3 border-b border-slate-800 pb-2 text-sm"
                >
                  <span className="font-medium">{holding.symbol}</span>
                  <span>{formatShares(holding.quantity)}</span>
                  <span>{Number(holding.weight || 0).toFixed(2)}%</span>
                  <span>${Number(holding.current_price || 0).toLocaleString()}</span>
                  <span>
                    <PriceSourceBadge
                      source={holding.price_source || "manual"}
                      marketState={holding.market_state}
                    />
                  </span>
                  <span className="text-right">
                    ${Number(holding.market_value || 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <AddHoldingForm agentId={agentId} />
      </section>

      <ValuationPanel
        agentId={agentId}
        initialValuations={initialValuations}
        onHoldingsUpdated={setHoldings}
        onSummaryUpdated={onSummaryUpdated}
      />
    </>
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
    regular: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    post: "border-violet-500/30 bg-violet-500/10 text-violet-300",
    manual: "border-slate-600 bg-slate-800 text-slate-300",
    cash: "border-amber-500/30 bg-amber-500/10 text-amber-300",
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
