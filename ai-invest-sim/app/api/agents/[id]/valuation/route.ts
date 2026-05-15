import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { calculateAndStoreValuation } from "../../../../../src/lib/agents/calculate-valuation"
import { canEditAgent } from "../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../src/lib/auth/server"
import { getCachedPrice } from "../../../../../src/lib/market/get-cached-price"
import type {
  Agent,
  AgentHolding,
  AgentValuation,
} from "../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const VALUATION_SNAPSHOT_TTL_MS = 5 * 60_000

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to refresh valuation" },
      { status: 401 }
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const { data: holdings, error: holdingsError } = await supabase
    .from("agent_holdings")
    .select("*")
    .eq("agent_id", id)
    .order("weight", { ascending: false })

  if (holdingsError) {
    return NextResponse.json(
      { success: false, error: holdingsError.message },
      { status: 500 }
    )
  }

  const { data: previousValuations, error: valuationError } = await supabase
    .from("agent_valuations")
    .select("*")
    .eq("agent_id", id)
    .order("recorded_at", { ascending: false })
    .limit(1)

  if (valuationError) {
    return NextResponse.json(
      { success: false, error: valuationError.message },
      { status: 500 }
    )
  }

  const previousValuation =
    ((previousValuations || [])[0] as AgentValuation | undefined) || null

  if (previousValuation && isFreshSnapshot(previousValuation)) {
    await hydrateQuoteCache((holdings || []) as AgentHolding[])

    const holdingsValue = (holdings || []).reduce((sum, holding) => {
      return sum + Number(holding.market_value_base || holding.market_value || 0)
    }, 0)
    const cashBalance = Number((agent as Agent).cash_balance || 0)
    const totalValue = cashBalance + holdingsValue

    const { data: valuations, error: historyError } = await supabase
      .from("agent_valuations")
      .select("*")
      .eq("agent_id", id)
      .order("recorded_at", { ascending: true })

    if (historyError) {
      return NextResponse.json(
        { success: false, error: historyError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      cached: true,
      snapshot: {
        valuation: previousValuation,
        holdings: holdings || [],
        cash_balance: cashBalance,
        holdings_value: holdingsValue,
        total_value: totalValue,
      },
      valuations: valuations || [],
    })
  }

  try {
    const snapshot = await calculateAndStoreValuation({
      supabase,
      agent: agent as Agent,
      holdings: (holdings || []) as AgentHolding[],
      previousValuation,
    })

    const { data: valuations, error: historyError } = await supabase
      .from("agent_valuations")
      .select("*")
      .eq("agent_id", id)
      .order("recorded_at", { ascending: true })

    if (historyError) {
      return NextResponse.json(
        { success: false, error: historyError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      snapshot,
      valuations: valuations || [],
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to refresh valuation",
      },
      { status: 500 }
    )
  }
}

function isFreshSnapshot(valuation: AgentValuation) {
  const recordedAt = new Date(valuation.recorded_at).getTime()

  return Boolean(recordedAt) && Date.now() - recordedAt < VALUATION_SNAPSHOT_TTL_MS
}

async function hydrateQuoteCache(holdings: AgentHolding[]) {
  await Promise.all(
    holdings
      .filter((holding) => !isCashHolding(holding))
      .map((holding) =>
        getCachedPrice(supabase, holding.symbol).catch(() => null)
      )
  )
}

function isCashHolding(holding: AgentHolding) {
  return (
    holding.asset_type === "cash" ||
    holding.symbol.toUpperCase() === "CASH"
  )
}
