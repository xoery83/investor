import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { calculateAndStoreValuation } from "../../../../../src/lib/agents/calculate-valuation"
import type {
  Agent,
  AgentHolding,
  AgentValuation,
} from "../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
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

  try {
    const snapshot = await calculateAndStoreValuation({
      supabase,
      agent: agent as Agent,
      holdings: (holdings || []) as AgentHolding[],
      previousValuation:
        ((previousValuations || [])[0] as AgentValuation | undefined) || null,
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
