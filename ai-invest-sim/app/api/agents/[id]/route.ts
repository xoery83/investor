import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

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

  const { data: runs, error: runsError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(10)

  if (runsError) {
    return NextResponse.json(
      { success: false, error: runsError.message },
      { status: 500 }
    )
  }

  const { data: valuations, error: valuationsError } = await supabase
    .from("agent_valuations")
    .select("*")
    .eq("agent_id", id)
    .order("recorded_at", { ascending: true })

  if (valuationsError) {
    return NextResponse.json(
      { success: false, error: valuationsError.message },
      { status: 500 }
    )
  }

  const holdingsValue = (holdings || []).reduce((sum, holding) => {
    return sum + Number(holding.market_value || 0)
  }, 0)

  const cashBalance = Number(agent.cash_balance || 0)
  const totalValue = cashBalance + holdingsValue

  return NextResponse.json({
    success: true,
    agent: {
      ...agent,
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      current_value: totalValue,
    },
    holdings: holdings || [],
    runs: runs || [],
    valuations: valuations || [],
    portfolio_summary: {
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      total_value: totalValue,
    },
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await request.json()

  const {
    name,
    description,
    philosophy,
    risk_level,
    is_active,
    rebalance_frequency,
    model_name,
  } = body

  const { data, error } = await supabase
    .from("agents")
    .update({
      name,
      description,
      philosophy,
      risk_level,
      is_active,
      rebalance_frequency,
      model_name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    agent: data,
  })
}