import { NextResponse } from "next/server"

import {
  canFollowAgent,
  canHoldMoreAgentPositions,
} from "../../../../../src/lib/auth/permissions"
import { validateAgentPublicationReadiness } from "../../../../../src/lib/agents/publication-readiness"
import { getRequestUser } from "../../../../../src/lib/auth/server"
import {
  calculateAgentNav,
  createAuthedClient,
  ensureUserPortfolio,
} from "../route"
import {
  getCachedFxRate,
  normalizeCurrency,
} from "../../../../../src/lib/market/get-cached-fx-rate"

const USER_PORTFOLIO_CURRENCY = "USD"

export async function POST(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to trade Agent ETF positions" },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action === "sell" ? "sell" : "buy"
  const agentId = String(body.agent_id || "")
  const amount = Number(body.amount || 0)
  const requestedShares = Number(body.shares || 0)

  if (!agentId) {
    return NextResponse.json(
      { success: false, error: "agent_id is required" },
      { status: 400 }
    )
  }

  if (amount <= 0 && requestedShares <= 0) {
    return NextResponse.json(
      { success: false, error: "Amount or shares is required" },
      { status: 400 }
    )
  }

  const supabase = createAuthedClient(request)
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", agentId)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    )
  }

  if (action === "buy") {
    const followPermission = canFollowAgent(requestUser, agent)
    if (!followPermission.allowed) {
      return NextResponse.json(
        { success: false, error: followPermission.reason },
        { status: 403 }
      )
    }

    const readiness = await validateAgentPublicationReadiness({
      supabase,
      agent,
    })

    if (!readiness.ready) {
      return NextResponse.json(
        {
          success: false,
          error: `This agent is not ready for new Agent ETF positions. ${readiness.blockers[0]}`,
          publication_readiness: readiness,
        },
        { status: 403 }
      )
    }
  }

  const portfolio = await ensureUserPortfolio(supabase, requestUser.id)
  if (!portfolio.success) {
    return NextResponse.json(portfolio, { status: 500 })
  }

  const { data: existingPosition } = await supabase
    .from("user_agent_positions")
    .select("*")
    .eq("user_id", requestUser.id)
    .eq("agent_id", agentId)
    .maybeSingle()

  if (action === "buy" && !existingPosition) {
    const { count: positionCount, error: positionCountError } = await supabase
      .from("user_agent_positions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", requestUser.id)
      .in("status", ["open", "sell_only", "frozen"])

    if (positionCountError) {
      return NextResponse.json(
        { success: false, error: positionCountError.message },
        { status: 500 }
      )
    }

    const quotaPermission = canHoldMoreAgentPositions({
      user: requestUser,
      positionCount: positionCount || 0,
    })

    if (!quotaPermission.allowed) {
      return NextResponse.json(
        { success: false, error: quotaPermission.reason },
        { status: 403 }
      )
    }
  }

  if (action === "buy" && existingPosition?.status === "sell_only") {
    return NextResponse.json(
      { success: false, error: "This Agent position is sell-only." },
      { status: 403 }
    )
  }

  const agentBaseCurrency = normalizeCurrency(agent.base_currency)
  const navInAgentBaseCurrency = calculateAgentNav(agent)
  const fxRate = await getCachedFxRate(
    supabase,
    agentBaseCurrency,
    USER_PORTFOLIO_CURRENCY
  )
  const nav = roundMoney(navInAgentBaseCurrency * fxRate.rate)
  const cashBalance = Number(portfolio.portfolio.cash_balance || 0)
  const shares =
    requestedShares > 0 ? requestedShares : roundShares(amount / nav)
  const tradeAmount = roundMoney(shares * nav)

  if (shares <= 0 || tradeAmount <= 0) {
    return NextResponse.json(
      { success: false, error: "Trade amount is too small." },
      { status: 400 }
    )
  }

  if (action === "buy" && tradeAmount > cashBalance) {
    return NextResponse.json(
      { success: false, error: "Not enough portfolio cash." },
      { status: 400 }
    )
  }

  if (action === "sell") {
    const currentShares = Number(existingPosition?.shares || 0)
    if (!existingPosition || currentShares <= 0) {
      return NextResponse.json(
        { success: false, error: "No existing Agent ETF position." },
        { status: 400 }
      )
    }

    if (shares > currentShares) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot sell ${shares} shares. Current position is ${currentShares}.`,
        },
        { status: 400 }
      )
    }
  }

  const nextPosition = calculateNextPosition({
    action,
    existingPosition,
    shares,
    nav,
  })
  const nextCash =
    action === "buy" ? cashBalance - tradeAmount : cashBalance + tradeAmount

  const positionResult =
    nextPosition.shares <= 0
      ? await supabase
          .from("user_agent_positions")
          .update({
            shares: 0,
            current_nav: nav,
            market_value: 0,
            status: "closed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingPosition.id)
          .select()
          .maybeSingle()
      : await supabase
          .from("user_agent_positions")
          .upsert(
            {
              user_id: requestUser.id,
              agent_id: agentId,
              shares: nextPosition.shares,
              average_nav: nextPosition.averageNav,
              current_nav: nav,
              market_value: nextPosition.shares * nav,
              status: "open",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,agent_id" }
          )
          .select()
          .single()

  if (positionResult.error) {
    return NextResponse.json(
      { success: false, error: positionResult.error.message },
      { status: 500 }
    )
  }

  await supabase.from("agent_follows").upsert(
    {
      user_id: requestUser.id,
      agent_id: agentId,
      status: action === "buy" ? "active" : "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,agent_id" }
  )

  const { error: transactionError } = await supabase
    .from("user_agent_transactions")
    .insert({
      user_id: requestUser.id,
      agent_id: agentId,
      action,
      shares,
      nav,
      amount: tradeAmount,
    })

  if (transactionError) {
    return NextResponse.json(
      { success: false, error: transactionError.message },
      { status: 500 }
    )
  }

  const totalValue = await calculateUserPortfolioValue({
    supabase,
    userId: requestUser.id,
    cashBalance: nextCash,
  })

  const { error: portfolioError } = await supabase
    .from("user_portfolios")
    .update({
      cash_balance: nextCash,
      total_value: totalValue,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", requestUser.id)

  if (portfolioError) {
    return NextResponse.json(
      { success: false, error: portfolioError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    action,
    position: positionResult.data,
    trade: {
      shares,
      nav,
      amount: tradeAmount,
      currency: USER_PORTFOLIO_CURRENCY,
      agent_base_currency: agentBaseCurrency,
      fx_rate_to_usd: fxRate.rate,
    },
    portfolio: {
      cash_balance: nextCash,
      total_value: totalValue,
    },
  })
}

function calculateNextPosition({
  action,
  existingPosition,
  shares,
  nav,
}: {
  action: "buy" | "sell"
  existingPosition: Record<string, unknown> | null
  shares: number
  nav: number
}) {
  const currentShares = Number(existingPosition?.shares || 0)
  const currentAverageNav = Number(existingPosition?.average_nav || 0)

  if (action === "sell") {
    return {
      shares: roundShares(currentShares - shares),
      averageNav: currentAverageNav,
    }
  }

  const nextShares = currentShares + shares
  const currentCost = currentShares * currentAverageNav
  const newCost = shares * nav

  return {
    shares: roundShares(nextShares),
    averageNav: nextShares > 0 ? (currentCost + newCost) / nextShares : nav,
  }
}

async function calculateUserPortfolioValue({
  supabase,
  userId,
  cashBalance,
}: {
  supabase: ReturnType<typeof createAuthedClient>
  userId: string
  cashBalance: number
}) {
  const { data: positions } = await supabase
    .from("user_agent_positions")
    .select("market_value,status")
    .eq("user_id", userId)
    .in("status", ["open", "sell_only", "frozen"])

  const positionValue = (positions || []).reduce(
    (sum, position) => sum + Number(position.market_value || 0),
    0
  )

  return cashBalance + positionValue
}

function roundShares(value: number) {
  return Math.round(value * 1000000) / 1000000
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
