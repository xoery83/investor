import type { SupabaseClient } from "@supabase/supabase-js"

import { getCachedPrice } from "../market/get-cached-price"
import { normalizeMarketSymbol } from "../market/normalize-symbol"
import type { Agent, AgentHolding } from "../types/agent"

const MAX_AGENTS_PER_RUN = 100

export type MarketDataRefreshResult = {
  symbol: string
  status: "updated" | "failed"
  price?: number
  currency?: string
  market_state?: string
  error?: string
}

export async function refreshActiveAgentMarketDataCron({
  supabase,
  maxAgents = MAX_AGENTS_PER_RUN,
}: {
  supabase: SupabaseClient
  maxAgents?: number
}) {
  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, visibility, lifecycle_status, is_active")
    .eq("lifecycle_status", "active")
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(maxAgents)

  if (agentsError) throw new Error(agentsError.message)

  const activeAgents = ((agents || []) as Agent[]).filter(
    (agent) => agent.visibility !== "system"
  )
  const agentIds = activeAgents.map((agent) => agent.id)
  if (agentIds.length === 0) return []

  const { data: holdings, error: holdingsError } = await supabase
    .from("agent_holdings")
    .select("symbol, asset_type")
    .in("agent_id", agentIds)

  if (holdingsError) throw new Error(holdingsError.message)

  const symbols = Array.from(
    new Set(
      ((holdings || []) as AgentHolding[])
        .filter((holding) => shouldRefreshQuote(holding))
        .map((holding) => normalizeMarketSymbol(holding.symbol))
    )
  ).sort()

  const results: MarketDataRefreshResult[] = []

  for (const symbol of symbols) {
    try {
      const quote = await getCachedPrice(supabase, symbol, { force: true })
      results.push({
        symbol,
        status: "updated",
        price: quote.price,
        currency: quote.currency,
        market_state: quote.marketState,
      })
    } catch (error) {
      results.push({
        symbol,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown quote error",
      })
    }
  }

  return results
}

function shouldRefreshQuote(holding: AgentHolding) {
  const symbol = String(holding.symbol || "").trim()
  const assetType = String(holding.asset_type || "").toLowerCase()

  if (!symbol) return false
  if (assetType === "cash" || symbol.toUpperCase() === "CASH") return false
  if (assetType === "unresolved_13f") return false
  if (symbol.toUpperCase().startsWith("CUSIP.")) return false
  if (symbol.toUpperCase().startsWith("UNRESOLVED13F.")) return false

  return true
}
