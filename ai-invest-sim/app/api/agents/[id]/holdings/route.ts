import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const body = await request.json()

  const {
    symbol,
    asset_name,
    asset_type,
    quantity,
    average_cost,
    current_price,
  } = body

  const numericQuantity = Number(quantity)
  const numericAverageCost = Number(average_cost || 0)
  const numericCurrentPrice = Number(current_price)

  if (!symbol || numericQuantity <= 0 || numericCurrentPrice <= 0) {
    return NextResponse.json(
      {
        success: false,
        error: "Symbol, quantity, and current price are required.",
      },
      { status: 400 }
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

  const marketValue = numericQuantity * numericCurrentPrice
  const currentCash = Number(agent.cash_balance || 0)

  if (marketValue > currentCash) {
    return NextResponse.json(
      {
        success: false,
        error: "Not enough cash balance to add this holding.",
      },
      { status: 400 }
    )
  }

  const newCashBalance = currentCash - marketValue

  const { data: newHolding, error: holdingError } = await supabase
    .from("agent_holdings")
    .insert({
      agent_id: id,
      symbol: String(symbol).toUpperCase(),
      asset_name,
      asset_type: asset_type || "stock",
      quantity: numericQuantity,
      average_cost: numericAverageCost,
      current_price: numericCurrentPrice,
      market_value: marketValue,
      weight: 0,
    })
    .select()
    .single()

  if (holdingError) {
    return NextResponse.json(
      { success: false, error: holdingError.message },
      { status: 500 }
    )
  }

  const { data: allHoldings, error: holdingsError } = await supabase
    .from("agent_holdings")
    .select("*")
    .eq("agent_id", id)

  if (holdingsError) {
    return NextResponse.json(
      { success: false, error: holdingsError.message },
      { status: 500 }
    )
  }

  const holdingsValue = (allHoldings || []).reduce((sum, holding) => {
    return sum + Number(holding.market_value || 0)
  }, 0)

  const totalValue = newCashBalance + holdingsValue

  for (const holding of allHoldings || []) {
    const holdingWeight =
      totalValue > 0
        ? (Number(holding.market_value || 0) / totalValue) * 100
        : 0

    await supabase
      .from("agent_holdings")
      .update({
        weight: holdingWeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", holding.id)
  }

  const { error: agentUpdateError } = await supabase
    .from("agents")
    .update({
      cash_balance: newCashBalance,
      current_value: totalValue,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)

  if (agentUpdateError) {
    return NextResponse.json(
      { success: false, error: agentUpdateError.message },
      { status: 500 }
    )
  }

  await supabase.from("agent_valuations").insert({
    agent_id: id,
    total_value: totalValue,
    cash_value: newCashBalance,
    holdings_value: holdingsValue,
    daily_return: 0,
    cumulative_return:
      Number(agent.initial_capital) > 0
        ? ((totalValue - Number(agent.initial_capital)) /
            Number(agent.initial_capital)) *
          100
        : 0,
    annualized_return: 0,
  })

  return NextResponse.json({
    success: true,
    holding: newHolding,
    cash_balance: newCashBalance,
    holdings_value: holdingsValue,
    total_value: totalValue,
  })
}