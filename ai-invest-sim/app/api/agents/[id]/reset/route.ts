import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { canEditAgent } from "../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../src/lib/auth/server"
import type { Agent } from "../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found." },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent as Agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  if (agent.visibility !== "private") {
    return NextResponse.json(
      {
        success: false,
        error: "Only private agents can be reset from the settings page.",
      },
      { status: 403 }
    )
  }

  const agentId = String(agent.id)
  const now = new Date().toISOString()
  const initialCapital = Number(agent.initial_capital || 0)
  const baseCurrency = String(agent.base_currency || "USD")

  const deleteSteps = [
    () => supabase.from("agent_initialization_messages").delete().eq("agent_id", agentId),
    () => supabase.from("agent_initialization_versions").delete().eq("agent_id", agentId),
    () => supabase.from("agent_initialization_sessions").delete().eq("agent_id", agentId),
    () => supabase.from("validator_results").delete().eq("agent_id", agentId),
    () => supabase.from("trade_proposals").delete().eq("agent_id", agentId),
    () => supabase.from("agent_holding_snapshots").delete().eq("agent_id", agentId),
    () => supabase.from("agent_holdings").delete().eq("agent_id", agentId),
    () => supabase.from("agent_runs").delete().eq("agent_id", agentId),
    () => supabase.from("agent_valuations").delete().eq("agent_id", agentId),
  ]

  for (const step of deleteSteps) {
    const { error } = await step()
    if (error && !isMissingOptionalTableError(error.message)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
  }

  const { data: updatedAgent, error: updateError } = await supabase
    .from("agents")
    .update({
      cash_balance: initialCapital,
      current_value: initialCapital,
      updated_at: now,
    })
    .eq("id", agentId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json(
      { success: false, error: updateError.message },
      { status: 500 }
    )
  }

  await supabase.from("agent_valuations").insert({
    agent_id: agentId,
    total_value: initialCapital,
    cash_value: initialCapital,
    holdings_value: 0,
    base_currency: baseCurrency,
    daily_return: 0,
    cumulative_return: 0,
    annualized_return: 0,
  })

  return NextResponse.json({
    success: true,
    agent: updatedAgent,
    summary: {
      cash_balance: initialCapital,
      holdings_value: 0,
      total_value: initialCapital,
    },
  })
}

function isMissingOptionalTableError(message: string) {
  return (
    (message.includes("agent_initialization_") ||
      message.includes("agent_holding_snapshots")) &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
