import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { getRequestUser } from "../../../../src/lib/auth/server"
import {
  getCachedFxRate,
  normalizeCurrency,
} from "../../../../src/lib/market/get-cached-fx-rate"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to view portfolio" },
      { status: 401 }
    )
  }

  const supabase = createAuthedClient(request)
  const portfolio = await ensureUserPortfolio(supabase, requestUser.id)

  if (!portfolio.success) {
    return NextResponse.json(portfolio, { status: 500 })
  }

  const { data: positions, error: positionsError } = await supabase
    .from("user_agent_positions")
    .select(
      "*, agents(id,name,description,visibility,lifecycle_status,current_value,initial_capital,base_currency)"
    )
    .eq("user_id", requestUser.id)
    .neq("status", "closed")
    .order("updated_at", { ascending: false })

  if (positionsError) {
    return NextResponse.json(
      { success: false, error: positionsError.message },
      { status: 500 }
    )
  }

  const portfolioCurrency = String(portfolio.portfolio.currency || "USD")
  const normalizedPositions = await Promise.all(
    (positions || []).map(async (position) => {
      const agent = position.agents as
        | {
            current_value?: number
            initial_capital?: number
            base_currency?: string
          }
        | undefined
      const agentBaseCurrency = normalizeCurrency(agent?.base_currency)
      const navInAgentBaseCurrency = calculateAgentNav(agent)
      const fxRate = await getCachedFxRate(
        supabase,
        agentBaseCurrency,
        portfolioCurrency
      ).catch(() => null)
      const storedNav = Number(position.current_nav || 0)
      const currentNav = fxRate
        ? roundMoney(navInAgentBaseCurrency * fxRate.rate)
        : storedNav > 0
          ? storedNav
          : roundMoney(navInAgentBaseCurrency)
      const shares = Number(position.shares || 0)
      const marketValue = shares * currentNav

      return {
        ...position,
        current_nav: currentNav,
        market_value: marketValue,
        currency: portfolioCurrency,
        agent_base_currency: agentBaseCurrency,
        fx_rate_to_portfolio_currency: fxRate?.rate || null,
      }
    })
  )
  const positionsValue = normalizedPositions.reduce(
    (sum, position) => sum + Number(position.market_value || 0),
    0
  )
  const cashBalance = Number(portfolio.portfolio.cash_balance || 0)
  const totalValue = cashBalance + positionsValue
  const positionsWithMetrics = normalizedPositions.map((position) => {
    const shares = Number(position.shares || 0)
    const averageNav = Number(position.average_nav || 0)
    const marketValue = Number(position.market_value || 0)
    const costBasis = shares * averageNav
    const unrealizedPnl = marketValue - costBasis

    return {
      ...position,
      cost_basis: costBasis,
      unrealized_pnl: unrealizedPnl,
      unrealized_return_pct:
        costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0,
      portfolio_weight_pct:
        totalValue > 0 ? (marketValue / totalValue) * 100 : 0,
    }
  })
  const { data: follows, error: followsError } = await supabase
    .from("agent_follows")
    .select(
      "*, agents(id,name,description,visibility,lifecycle_status,current_value,initial_capital,base_currency)"
    )
    .eq("user_id", requestUser.id)
    .in("status", ["active", "paused_by_agent"])
    .order("updated_at", { ascending: false })

  if (followsError) {
    return NextResponse.json(
      { success: false, error: followsError.message },
      { status: 500 }
    )
  }

  const positionAgentIds = new Set(
    positionsWithMetrics.map((position) => String(position.agent_id))
  )
  const normalizedFollows = (follows || [])
    .map((follow) => ({
      ...follow,
      has_position: positionAgentIds.has(String(follow.agent_id)),
    }))
    .filter((follow) => {
      const lifecycle = String(
        (follow.agents as { lifecycle_status?: string } | null)?.lifecycle_status ||
          ""
      ).toLowerCase()

      return !["archived", "retired"].includes(lifecycle)
    })

  const agentIds = Array.from(positionAgentIds)
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

  const { data: valuationHistory } =
    agentIds.length > 0
      ? await supabase
          .from("agent_valuations")
          .select("id,agent_id,total_value,base_currency,recorded_at")
          .in("agent_id", agentIds)
          .gte("recorded_at", oneYearAgo.toISOString())
          .order("recorded_at", { ascending: true })
      : { data: [] }

  const { data: transactions } =
    agentIds.length > 0
      ? await supabase
          .from("user_agent_transactions")
          .select("id,agent_id,action,shares,nav,amount,created_at")
          .eq("user_id", requestUser.id)
          .in("agent_id", agentIds)
          .order("created_at", { ascending: true })
      : { data: [] }

  const initialValue = Number(portfolio.portfolio.initial_value || 100000)
  const navChangeAmount = totalValue - initialValue

  return NextResponse.json({
    success: true,
    portfolio: {
      ...portfolio.portfolio,
      total_value: totalValue,
    },
    positions: positionsWithMetrics,
    follows: normalizedFollows,
    history: {
      agent_valuations: valuationHistory || [],
      transactions: transactions || [],
    },
    summary: {
      cash_balance: cashBalance,
      positions_value: positionsValue,
      total_value: totalValue,
      initial_value: initialValue,
      nav_change_amount: navChangeAmount,
      nav_change_pct: initialValue > 0 ? (navChangeAmount / initialValue) * 100 : 0,
    },
  })
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export async function ensureUserPortfolio(
  supabase: ReturnType<typeof createAuthedClient>,
  userId: string
) {
  const { data: existing, error: existingError } = await supabase
    .from("user_portfolios")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (existingError) {
    return { success: false as const, error: existingError.message }
  }

  if (existing) {
    return { success: true as const, portfolio: existing }
  }

  const { data, error } = await supabase
    .from("user_portfolios")
    .insert({
      user_id: userId,
      cash_balance: 100000,
      total_value: 100000,
      currency: "USD",
    })
    .select()
    .single()

  if (error) {
    return { success: false as const, error: error.message }
  }

  return { success: true as const, portfolio: data }
}

export function createAuthedClient(request: Request) {
  const authorization = request.headers.get("authorization") || ""

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

export function calculateAgentNav(agent?: {
  current_value?: number | string
  initial_capital?: number | string
}) {
  const currentValue = Number(agent?.current_value || 0)
  const initialCapital = Number(agent?.initial_capital || 0)

  if (initialCapital <= 0) return 100
  return Math.max(0.0001, (currentValue / initialCapital) * 100)
}
