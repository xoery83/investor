import type { SupabaseClient } from "@supabase/supabase-js"

import { getCachedPrice } from "../market/get-cached-price"
import {
  getCachedFxRate,
  normalizeCurrency,
} from "../market/get-cached-fx-rate"
import type { Agent, AgentHolding, AgentValuation } from "../types/agent"

type CalculateValuationInput = {
  supabase: SupabaseClient
  agent: Agent
  holdings: AgentHolding[]
  previousValuation?: AgentValuation | null
  forceMarketRefresh?: boolean
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
  base_currency: string
}

export async function calculateAndStoreValuation({
  supabase,
  agent,
  holdings,
  previousValuation,
  forceMarketRefresh = false,
}: CalculateValuationInput): Promise<ValuationSnapshot> {
  const refreshedHoldings = await refreshHoldingPrices(
    supabase,
    holdings,
    normalizeCurrency(agent.base_currency),
    forceMarketRefresh
  )
  const cashBalance = Number(agent.cash_balance || 0)
  const holdingsValue = refreshedHoldings.reduce(
    (sum, holding) => sum + baseMarketValue(holding),
    0
  )
  const totalValue = cashBalance + holdingsValue
  const now = new Date()

  const weightedHoldings = refreshedHoldings.map((holding) => ({
    ...holding,
    weight: totalValue > 0
      ? (baseMarketValue(holding) / totalValue) * 100
      : 0,
  }))

  for (const holding of weightedHoldings) {
    const { error } = await supabase
      .from("agent_holdings")
      .update({
        current_price: holding.current_price,
        currency: holding.currency,
        current_price_base: holding.current_price_base,
        market_value: holding.market_value,
        market_value_local: holding.market_value_local,
        market_value_base: holding.market_value_base,
        fx_rate_to_base: holding.fx_rate_to_base,
        fx_fetched_at: holding.fx_fetched_at,
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
      base_currency: normalizeCurrency(agent.base_currency),
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
      base_currency: normalizeCurrency(agent.base_currency),
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

  await storeHoldingSnapshots({
    supabase,
    agent,
    holdings: weightedHoldings,
    baseCurrency: normalizeCurrency(agent.base_currency),
    recordedAt: now,
  })

  return {
    valuation: valuation as AgentValuation,
    holdings: weightedHoldings,
    cash_balance: cashBalance,
    holdings_value: holdingsValue,
    total_value: totalValue,
    base_currency: normalizeCurrency(agent.base_currency),
  }
}

async function storeHoldingSnapshots({
  supabase,
  agent,
  holdings,
  baseCurrency,
  recordedAt,
}: {
  supabase: SupabaseClient
  agent: Agent
  holdings: UpdatedHolding[]
  baseCurrency: string
  recordedAt: Date
}) {
  if (holdings.length === 0) return

  const { error } = await supabase.from("agent_holding_snapshots").insert(
    holdings.map((holding) => ({
      agent_id: agent.id,
      holding_id: holding.id,
      symbol: holding.symbol,
      asset_type: holding.asset_type,
      quantity: Number(holding.quantity || 0),
      price_local: Number(holding.current_price || 0),
      currency: normalizeCurrency(holding.currency || baseCurrency),
      fx_rate_to_base: Number(holding.fx_rate_to_base || 1),
      market_value_local: Number(
        holding.market_value_local || holding.market_value || 0
      ),
      market_value_base: Number(
        holding.market_value_base || holding.market_value || 0
      ),
      weight: Number(holding.weight || 0),
      base_currency: baseCurrency,
      price_source: holding.price_source || "manual",
      market_state: holding.market_state || null,
      recorded_at: recordedAt.toISOString(),
    }))
  )

  if (error && !isMissingSnapshotTableError(error.message)) {
    throw new Error(`Failed to store holding snapshots: ${error.message}`)
  }
}

function isMissingSnapshotTableError(message: string) {
  return (
    message.includes("agent_holding_snapshots") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}

async function refreshHoldingPrices(
  supabase: SupabaseClient,
  holdings: AgentHolding[],
  baseCurrency: string,
  forceMarketRefresh: boolean
): Promise<UpdatedHolding[]> {
  return Promise.all(
    holdings.map(async (holding) => {
      if (isCashHolding(holding)) {
        const quantity = Number(holding.quantity || 0)
        const price = Number(holding.current_price || 1) || 1
        const marketValue = quantity * price

        return {
          ...holding,
          currency: baseCurrency,
          current_price: price,
          current_price_base: price,
          market_value: marketValue,
          market_value_local: marketValue,
          market_value_base: marketValue,
          fx_rate_to_base: 1,
          fx_fetched_at: new Date().toISOString(),
          price_source: "cash",
          market_state: "CASH",
        }
      }

      try {
        const quote = await getCachedPrice(supabase, holding.symbol, {
          force: forceMarketRefresh,
        })
        const price = quote.price || Number(holding.current_price || 0)
        const currency = normalizeCurrency(quote.currency || holding.currency)
        const fxRate = await getCachedFxRate(supabase, currency, baseCurrency, {
          force: forceMarketRefresh,
        })
        const marketValueLocal = Number(holding.quantity || 0) * price
        const marketValueBase = marketValueLocal * fxRate.rate

        return {
          ...holding,
          asset_name: holding.asset_name || quote.name,
          currency,
          current_price: price,
          current_price_base: price * fxRate.rate,
          market_value: marketValueBase,
          market_value_local: marketValueLocal,
          market_value_base: marketValueBase,
          fx_rate_to_base: fxRate.rate,
          fx_fetched_at: fxRate.fetchedAt,
          price_source: quote.priceSource,
          market_state: quote.marketState,
        }
      } catch (error) {
        const currency = normalizeCurrency(holding.currency || baseCurrency)
        const fxRate = Number(holding.fx_rate_to_base || 1)
        const price = Number(holding.current_price || 0)
        const marketValueLocal = Number(holding.quantity || 0) * price
        const marketValueBase = marketValueLocal * fxRate

        return {
          ...holding,
          currency,
          current_price_base: price * fxRate,
          market_value: marketValueBase,
          market_value_local: marketValueLocal,
          market_value_base: marketValueBase,
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

function baseMarketValue(holding: AgentHolding) {
  return Number(holding.market_value_base || holding.market_value || 0)
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
