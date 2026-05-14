import type { SupabaseClient } from "@supabase/supabase-js"

import { getCachedPrice } from "../market/get-cached-price"
import type { Agent, AgentHolding, AgentValuation } from "../types/agent"

type CalculateValuationInput = {
  supabase: SupabaseClient
  agent: Agent
  holdings: AgentHolding[]
  previousValuation?: AgentValuation | null
}

export type UpdatedHolding = AgentHolding & {
  price_source?: "pre" | "regular" | "post" | "manual" | "cash"
  market_state?: string
  quote_error?: string
}

export type ValuationSnapshot = {
  valuation: AgentValuation
  holdings: UpdatedHolding[]
  cash_balance: number
  holdings_value: number
  total_value: number
}

export async function calculateAndStoreValuation({
  supabase,
  agent,
  holdings,
  previousValuation,
}: CalculateValuationInput): Promise<ValuationSnapshot> {
  const refreshedHoldings = await refreshHoldingPrices(
    supabase,
    holdings
  )
  const cashBalance = Number(agent.cash_balance || 0)
  const holdingsValue = refreshedHoldings.reduce(
    (sum, holding) => sum + Number(holding.market_value || 0),
    0
  )
  const totalValue = cashBalance + holdingsValue
  const now = new Date()

  const weightedHoldings = refreshedHoldings.map((holding) => ({
    ...holding,
    weight: totalValue > 0
      ? (Number(holding.market_value || 0) / totalValue) * 100
      : 0,
  }))

  for (const holding of weightedHoldings) {
    const { error } = await supabase
      .from("agent_holdings")
      .update({
        current_price: holding.current_price,
        market_value: holding.market_value,
        weight: holding.weight,
        updated_at: now.toISOString(),
      })
      .eq("id", holding.id)

    if (error) {
      throw new Error(`Failed to update holding ${holding.symbol}: ${error.message}`)
    }
  }

  const cumulativeReturn = Number(agent.initial_capital) > 0
    ? ((totalValue - Number(agent.initial_capital)) / Number(agent.initial_capital)) * 100
    : 0

  const dailyReturn = previousValuation?.total_value
    ? ((totalValue - Number(previousValuation.total_value)) /
        Number(previousValuation.total_value)) *
      100
    : 0

  const annualizedReturn = calculateAnnualizedReturn({
    initialCapital: Number(agent.initial_capital || 0),
    totalValue,
    createdAt: agent.created_at,
    now,
  })

  const { error: agentError } = await supabase
    .from("agents")
    .update({
      current_value: totalValue,
      cash_balance: cashBalance,
      updated_at: now.toISOString(),
    })
    .eq("id", agent.id)

  if (agentError) {
    throw new Error(`Failed to update agent valuation: ${agentError.message}`)
  }

  const { data: valuation, error: valuationError } = await supabase
    .from("agent_valuations")
    .insert({
      agent_id: agent.id,
      total_value: totalValue,
      cash_value: cashBalance,
      holdings_value: holdingsValue,
      daily_return: dailyReturn,
      cumulative_return: cumulativeReturn,
      annualized_return: annualizedReturn,
      recorded_at: now.toISOString(),
    })
    .select()
    .single()

  if (valuationError || !valuation) {
    throw new Error(
      valuationError?.message || "Failed to store valuation snapshot"
    )
  }

  return {
    valuation: valuation as AgentValuation,
    holdings: weightedHoldings,
    cash_balance: cashBalance,
    holdings_value: holdingsValue,
    total_value: totalValue,
  }
}

async function refreshHoldingPrices(
  supabase: SupabaseClient,
  holdings: AgentHolding[]
): Promise<UpdatedHolding[]> {
  return Promise.all(
    holdings.map(async (holding) => {
      if (isCashHolding(holding)) {
        const quantity = Number(holding.quantity || 0)
        const price = Number(holding.current_price || 1) || 1

        return {
          ...holding,
          current_price: price,
          market_value: quantity * price,
          price_source: "cash",
          market_state: "CASH",
        }
      }

      try {
        const quote = await getCachedPrice(supabase, holding.symbol)
        const price = quote.price || Number(holding.current_price || 0)

        return {
          ...holding,
          asset_name: holding.asset_name || quote.name,
          current_price: price,
          market_value: Number(holding.quantity || 0) * price,
          price_source: quote.priceSource,
          market_state: quote.marketState,
        }
      } catch (error) {
        return {
          ...holding,
          market_value:
            Number(holding.quantity || 0) * Number(holding.current_price || 0),
          price_source: "manual",
          market_state: "STALE",
          quote_error:
            error instanceof Error
              ? error.message
              : `Failed to refresh quote for ${holding.symbol}`,
        }
      }
    })
  )
}

function isCashHolding(holding: AgentHolding) {
  return (
    holding.asset_type === "cash" ||
    holding.symbol.toUpperCase() === "CASH"
  )
}

function calculateAnnualizedReturn({
  initialCapital,
  totalValue,
  createdAt,
  now,
}: {
  initialCapital: number
  totalValue: number
  createdAt: string
  now: Date
}) {
  if (initialCapital <= 0 || totalValue <= 0) return 0

  const created = new Date(createdAt)
  const elapsedDays = Math.max(
    1,
    (now.getTime() - created.getTime()) / 86_400_000
  )
  const years = elapsedDays / 365

  return (Math.pow(totalValue / initialCapital, 1 / years) - 1) * 100
}
