import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { getRequestUser } from "../../../../src/lib/auth/server"
import {
  getCachedFxRate,
  normalizeCurrency,
} from "../../../../src/lib/market/get-cached-fx-rate"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

type PortfolioRow = {
  user_id: string
  cash_balance: number | string
  total_value: number | string
  currency: string
  updated_at?: string
}

type ProfileRow = {
  id: string
  email: string | null
  display_name: string | null
  role: string | null
}

type PositionRow = {
  user_id: string
  agent_id: string
  shares: number | string
  current_nav: number | string
  market_value: number | string
  status: string
}

type AgentRow = {
  id: string
  name: string
  visibility: string
  lifecycle_status: string
  current_value?: number | string | null
  initial_capital?: number | string | null
  base_currency?: string | null
  agent_mode?: string | null
}

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to view leaderboard." },
      { status: 401 }
    )
  }

  const supabase = createLeaderboardClient(request)

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("user_portfolios")
    .select("user_id,cash_balance,total_value,currency,updated_at")

  if (portfoliosError) {
    return NextResponse.json(
      { success: false, error: portfoliosError.message },
      { status: 500 }
    )
  }

  const userIds = (portfolios || []).map((portfolio) => String(portfolio.user_id))
  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("user_profiles")
          .select("id,email,display_name,role")
          .in("id", userIds)
      : { data: [] }

  const { data: positions } =
    userIds.length > 0
      ? await supabase
          .from("user_agent_positions")
          .select("user_id,agent_id,shares,current_nav,market_value,status")
          .in("user_id", userIds)
          .in("status", ["open", "sell_only", "frozen"])
      : { data: [] }

  const agentIds = Array.from(
    new Set((positions || []).map((position) => String(position.agent_id)))
  )
  const { data: agents } =
    agentIds.length > 0
      ? await supabase
          .from("agents")
          .select("id,name,visibility,lifecycle_status,current_value,initial_capital,base_currency,agent_mode")
          .in("id", agentIds)
      : { data: [] }

  const profileMap = new Map(
    ((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile])
  )
  const agentMap = new Map(
    ((agents || []) as AgentRow[]).map((agent) => [agent.id, agent])
  )
  const positionsByUser = new Map<string, PositionRow[]>()

  for (const position of (positions || []) as PositionRow[]) {
    const agent = agentMap.get(String(position.agent_id))
    if (
      agent &&
      ["archived", "retired"].includes(String(agent.lifecycle_status).toLowerCase())
    ) {
      continue
    }

    const userPositions = positionsByUser.get(String(position.user_id)) || []
    userPositions.push(position)
    positionsByUser.set(String(position.user_id), userPositions)
  }

  const rankedEntries = await Promise.all(
    ((portfolios || []) as PortfolioRow[]).map(async (portfolio) => {
      const userPositions = positionsByUser.get(String(portfolio.user_id)) || []
      const portfolioCurrency = String(portfolio.currency || "USD")
      const enrichedPositions = await Promise.all(
        userPositions.map(async (position) => {
          const agent = agentMap.get(String(position.agent_id))
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
            position,
            agent,
            shares,
            currentNav,
            marketValue,
          }
        })
      )
      const positionsValue = enrichedPositions.reduce(
        (sum, item) => sum + Number(item.marketValue || 0),
        0
      )
      const cashBalance = Number(portfolio.cash_balance || 0)
      const totalValue = cashBalance + positionsValue
      const initialValue = 100000
      const profile = profileMap.get(String(portfolio.user_id))

      return {
        user_id: String(portfolio.user_id),
        display_name: resolveDisplayName(profile),
        role: profile?.role || "free",
        currency: portfolioCurrency,
        cash_balance: cashBalance,
        positions_value: positionsValue,
        total_value: totalValue,
        return_amount: totalValue - initialValue,
        return_pct:
          initialValue > 0 ? ((totalValue - initialValue) / initialValue) * 100 : 0,
        agent_count: userPositions.length,
        updated_at: portfolio.updated_at || null,
        positions: enrichedPositions.map((item) => ({
          agent_id: String(item.position.agent_id),
          agent_name: item.agent?.name || "Agent",
          agent_mode: item.agent?.agent_mode || "ai",
          shares: item.shares,
          current_nav: item.currentNav,
          market_value: item.marketValue,
          weight_pct: totalValue > 0 ? (item.marketValue / totalValue) * 100 : 0,
        })),
      }
    })
  )

  const ranked = rankedEntries
    .sort((a, b) => b.total_value - a.total_value)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  const me = ranked.find((entry) => entry.user_id === requestUser.id) || null

  return NextResponse.json({
    success: true,
    me,
    top: ranked.slice(0, 50),
    access_mode: supabaseServiceKey ? "service" : "rls",
  })
}

function createLeaderboardClient(request: Request) {
  if (supabaseServiceKey) {
    return createClient(supabaseUrl, supabaseServiceKey)
  }

  const authorization = request.headers.get("authorization") || ""

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

function resolveDisplayName(profile?: ProfileRow) {
  const displayName = profile?.display_name?.trim()
  if (displayName) return displayName

  const emailPrefix = profile?.email?.split("@")[0]?.trim()
  if (emailPrefix) return emailPrefix

  return "Investor"
}

function calculateAgentNav(agent?: {
  current_value?: number | string | null
  initial_capital?: number | string | null
}) {
  const currentValue = Number(agent?.current_value || 0)
  const initialCapital = Number(agent?.initial_capital || 0)

  if (initialCapital <= 0) return 100
  return Math.max(0.0001, (currentValue / initialCapital) * 100)
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}
