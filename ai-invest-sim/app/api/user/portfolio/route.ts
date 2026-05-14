import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { getRequestUser } from "../../../../src/lib/auth/server"

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
      "*, agents(id,name,description,visibility,lifecycle_status,current_value,initial_capital)"
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

  const normalizedPositions = (positions || []).map((position) => {
    const agent = position.agents as
      | { current_value?: number; initial_capital?: number }
      | undefined
    const currentNav = calculateAgentNav(agent)
    const shares = Number(position.shares || 0)
    const marketValue = shares * currentNav

    return {
      ...position,
      current_nav: currentNav,
      market_value: marketValue,
    }
  })
  const positionsValue = normalizedPositions.reduce(
    (sum, position) => sum + Number(position.market_value || 0),
    0
  )
  const cashBalance = Number(portfolio.portfolio.cash_balance || 0)
  const { data: follows, error: followsError } = await supabase
    .from("agent_follows")
    .select(
      "*, agents(id,name,description,visibility,lifecycle_status,current_value,initial_capital)"
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
    normalizedPositions.map((position) => String(position.agent_id))
  )
  const normalizedFollows = (follows || []).map((follow) => ({
    ...follow,
    has_position: positionAgentIds.has(String(follow.agent_id)),
  }))

  return NextResponse.json({
    success: true,
    portfolio: {
      ...portfolio.portfolio,
      total_value: cashBalance + positionsValue,
    },
    positions: normalizedPositions,
    follows: normalizedFollows,
    summary: {
      cash_balance: cashBalance,
      positions_value: positionsValue,
      total_value: cashBalance + positionsValue,
    },
  })
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
