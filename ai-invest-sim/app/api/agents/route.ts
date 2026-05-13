import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET() {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    agents: data,
  })
}

export async function POST(request: Request) {
  const body = await request.json()

  const {
    name,
    description,
    philosophy,
    risk_level,
    initial_capital,
    rebalance_frequency,
  } = body

  if (!name || !initial_capital) {
    return NextResponse.json(
      { success: false, error: "Missing required fields" },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from("agents")
    .insert({
      name,
      description,
      philosophy,
      risk_level: risk_level || "medium",
      initial_capital,
      current_value: initial_capital,
      rebalance_frequency: rebalance_frequency || "daily",
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  await supabase.from("agent_valuations").insert({
    agent_id: data.id,
    total_value: initial_capital,
    cash_value: initial_capital,
    holdings_value: 0,
    daily_return: 0,
    cumulative_return: 0,
    annualized_return: 0,
  })

  return NextResponse.json({
    success: true,
    agent: data,
  })
}
