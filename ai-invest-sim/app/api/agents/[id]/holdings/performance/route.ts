import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { canViewAgent } from "../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../src/lib/auth/server"
import type {
  Agent,
  AgentHoldingSnapshot,
} from "../../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

type PerformanceRange = "day" | "week" | "month"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const url = new URL(request.url)
  const range = readRange(url.searchParams.get("range"))

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

  const viewPermission = canViewAgent(requestUser, agent as Agent)
  if (!viewPermission.allowed) {
    return NextResponse.json(
      { success: false, error: viewPermission.reason },
      { status: 403 }
    )
  }

  const cutoff = getCutoff(range)
  const { data, error } = await supabase
    .from("agent_holding_snapshots")
    .select("*")
    .eq("agent_id", id)
    .gte("recorded_at", cutoff.toISOString())
    .order("recorded_at", { ascending: true })
    .limit(5000)

  if (error) {
    if (isMissingSnapshotTableError(error.message)) {
      return NextResponse.json({
        success: true,
        range,
        performance: [],
        warning:
          "Holding performance history is not available until the snapshot migration is applied.",
      })
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    range,
    performance: buildPerformance((data || []) as AgentHoldingSnapshot[]),
  })
}

function buildPerformance(snapshots: AgentHoldingSnapshot[]) {
  const bySymbol = new Map<string, AgentHoldingSnapshot[]>()

  for (const snapshot of snapshots) {
    const symbol = snapshot.symbol.toUpperCase()
    bySymbol.set(symbol, [...(bySymbol.get(symbol) || []), snapshot])
  }

  return [...bySymbol.entries()].map(([symbol, rows]) => {
    const first = rows[0]
    const latest = rows[rows.length - 1]
    const firstValue = Number(first?.market_value_base || 0)
    const latestValue = Number(latest?.market_value_base || 0)
    const valueChange = latestValue - firstValue
    const valueChangePct = firstValue > 0 ? (valueChange / firstValue) * 100 : 0
    const firstPrice = Number(first?.price_local || 0)
    const latestPrice = Number(latest?.price_local || 0)
    const priceChange = latestPrice - firstPrice
    const priceChangePct = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0

    return {
      symbol,
      asset_type: latest?.asset_type || null,
      currency: latest?.currency || "USD",
      base_currency: latest?.base_currency || "USD",
      first_recorded_at: first?.recorded_at || null,
      latest_recorded_at: latest?.recorded_at || null,
      first_value: firstValue,
      latest_value: latestValue,
      value_change: valueChange,
      value_change_pct: valueChangePct,
      first_price: firstPrice,
      latest_price: latestPrice,
      price_change: priceChange,
      price_change_pct: priceChangePct,
      latest_weight: Number(latest?.weight || 0),
    }
  })
}

function readRange(value: string | null): PerformanceRange {
  return value === "week" || value === "month" || value === "day"
    ? value
    : "day"
}

function getCutoff(range: PerformanceRange) {
  const cutoff = new Date()
  if (range === "month") cutoff.setDate(cutoff.getDate() - 30)
  else if (range === "week") cutoff.setDate(cutoff.getDate() - 7)
  else cutoff.setDate(cutoff.getDate() - 1)
  return cutoff
}

function isMissingSnapshotTableError(message: string) {
  return (
    message.includes("agent_holding_snapshots") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
