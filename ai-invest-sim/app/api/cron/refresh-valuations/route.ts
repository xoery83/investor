import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { calculateAndStoreValuation } from "../../../../src/lib/agents/calculate-valuation"
import { validateAgentPublicationReadiness } from "../../../../src/lib/agents/publication-readiness"
import { validateCronRequest } from "../../../../src/lib/cron/guard"
import type {
  Agent,
  AgentHolding,
  AgentValuation,
} from "../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const VALUATION_CRON_TTL_MS = 15 * 60_000
const MAX_AGENTS_PER_RUN = 25

export async function GET(request: Request) {
  const guard = validateCronRequest(request)
  if (!guard.allowed) {
    return NextResponse.json(
      { success: false, error: guard.error },
      { status: guard.status }
    )
  }

  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .eq("visibility", "public")
    .eq("lifecycle_status", "active")
    .order("updated_at", { ascending: true })
    .limit(MAX_AGENTS_PER_RUN)

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  const results = []

  for (const agent of (agents || []) as Agent[]) {
    results.push(await refreshAgentValuation(agent))
  }

  return NextResponse.json({
    success: true,
    job: "refresh-valuations",
    processed: results.length,
    results,
  })
}

async function refreshAgentValuation(agent: Agent) {
  try {
    const readiness = await validateAgentPublicationReadiness({
      supabase,
      agent,
    })

    if (!readiness.ready) {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: readiness.blockers[0] || "Publication readiness failed.",
      }
    }

    const { data: previousValuations, error: valuationError } = await supabase
      .from("agent_valuations")
      .select("*")
      .eq("agent_id", agent.id)
      .order("recorded_at", { ascending: false })
      .limit(1)

    if (valuationError) throw new Error(valuationError.message)

    const previousValuation =
      ((previousValuations || [])[0] as AgentValuation | undefined) || null

    if (previousValuation && isFreshSnapshot(previousValuation)) {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: "valuation snapshot is still fresh",
      }
    }

    const { data: holdings, error: holdingsError } = await supabase
      .from("agent_holdings")
      .select("*")
      .eq("agent_id", agent.id)
      .order("weight", { ascending: false })

    if (holdingsError) throw new Error(holdingsError.message)

    const snapshot = await calculateAndStoreValuation({
      supabase,
      agent,
      holdings: (holdings || []) as AgentHolding[],
      previousValuation,
    })

    return {
      agent_id: agent.id,
      status: "updated",
      total_value: snapshot.total_value,
      holdings_value: snapshot.holdings_value,
      valuation_id: snapshot.valuation.id,
    }
  } catch (error) {
    return {
      agent_id: agent.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

function isFreshSnapshot(valuation: AgentValuation) {
  const recordedAt = new Date(valuation.recorded_at).getTime()
  return (
    Boolean(recordedAt) && Date.now() - recordedAt < VALUATION_CRON_TTL_MS
  )
}
