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
    action,
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
  const tradeAction = action === "sell" ? "sell" : "buy"
  const normalizedSymbol = String(symbol || "").toUpperCase()

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

  if (tradeAction === "buy" && marketValue > currentCash) {
    return NextResponse.json(
      {
        success: false,
        error: "Not enough cash balance to buy this holding.",
      },
      { status: 400 }
    )
  }

  const { data: existingHoldings, error: existingHoldingsError } = await supabase
    .from("agent_holdings")
    .select("*")
    .eq("agent_id", id)
    .eq("symbol", normalizedSymbol)
    .order("updated_at", { ascending: false })

  if (existingHoldingsError) {
    return NextResponse.json(
      { success: false, error: existingHoldingsError.message },
      { status: 500 }
    )
  }

  const existingQuantity = (existingHoldings || []).reduce(
    (sum, holding) => sum + Number(holding.quantity || 0),
    0
  )
  const existingCostBasis = (existingHoldings || []).reduce(
    (sum, holding) =>
      sum + Number(holding.quantity || 0) * Number(holding.average_cost || 0),
    0
  )
  let newCashBalance = currentCash
  let changedHolding = null
  let holdingError = null

  if (tradeAction === "sell") {
    if (existingQuantity <= 0) {
      return NextResponse.json(
        { success: false, error: "No existing holding found for this symbol." },
        { status: 400 }
      )
    }

    if (numericQuantity > existingQuantity) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot sell ${numericQuantity} shares. Current position is ${existingQuantity} shares.`,
        },
        { status: 400 }
      )
    }

    const remainingQuantity = existingQuantity - numericQuantity
    newCashBalance = currentCash + marketValue

    if (remainingQuantity <= 0.0000001) {
      const { error } = await supabase
        .from("agent_holdings")
        .delete()
        .eq("agent_id", id)
        .eq("symbol", normalizedSymbol)
      holdingError = error
    } else {
      const primaryHolding = existingHoldings?.[0]
      const { data, error } = await supabase
        .from("agent_holdings")
        .update({
          asset_name: asset_name || primaryHolding?.asset_name,
          asset_type: asset_type || primaryHolding?.asset_type || "stock",
          quantity: remainingQuantity,
          average_cost:
            existingQuantity > 0
              ? existingCostBasis / existingQuantity
              : numericAverageCost,
          current_price: numericCurrentPrice,
          market_value: remainingQuantity * numericCurrentPrice,
          weight: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", primaryHolding.id)
        .select()
        .single()

      changedHolding = data
      holdingError = error

      const duplicateIds = (existingHoldings || [])
        .slice(1)
        .map((holding) => holding.id)

      if (duplicateIds.length > 0) {
        await supabase.from("agent_holdings").delete().in("id", duplicateIds)
      }
    }
  } else {
    newCashBalance = currentCash - marketValue

    if ((existingHoldings || []).length > 0) {
      const primaryHolding = existingHoldings?.[0]
      const newQuantity = existingQuantity + numericQuantity
      const tradeCost = numericQuantity * (numericAverageCost || numericCurrentPrice)
      const newAverageCost =
        newQuantity > 0 ? (existingCostBasis + tradeCost) / newQuantity : 0

      const { data, error } = await supabase
        .from("agent_holdings")
        .update({
          asset_name: asset_name || primaryHolding?.asset_name,
          asset_type: asset_type || primaryHolding?.asset_type || "stock",
          quantity: newQuantity,
          average_cost: newAverageCost,
          current_price: numericCurrentPrice,
          market_value: newQuantity * numericCurrentPrice,
          weight: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", primaryHolding.id)
        .select()
        .single()

      changedHolding = data
      holdingError = error

      const duplicateIds = (existingHoldings || [])
        .slice(1)
        .map((holding) => holding.id)

      if (duplicateIds.length > 0) {
        await supabase.from("agent_holdings").delete().in("id", duplicateIds)
      }
    } else {
      const { data, error } = await supabase
        .from("agent_holdings")
        .insert({
          agent_id: id,
          symbol: normalizedSymbol,
          asset_name,
          asset_type: asset_type || "stock",
          quantity: numericQuantity,
          average_cost: numericAverageCost || numericCurrentPrice,
          current_price: numericCurrentPrice,
          market_value: marketValue,
          weight: 0,
        })
        .select()
        .single()

      changedHolding = data
      holdingError = error
    }
  }

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

  const weightedHoldings = (allHoldings || []).map((holding) => {
    const holdingWeight =
      totalValue > 0
        ? (Number(holding.market_value || 0) / totalValue) * 100
        : 0

    return {
      ...holding,
      weight: holdingWeight,
      updated_at: new Date().toISOString(),
    }
  })

  for (const holding of weightedHoldings) {
    await supabase
      .from("agent_holdings")
      .update({
        weight: holding.weight,
        updated_at: holding.updated_at,
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
    holding: changedHolding,
    action: tradeAction,
    holdings: weightedHoldings,
    cash_balance: newCashBalance,
    holdings_value: holdingsValue,
    total_value: totalValue,
  })
}
