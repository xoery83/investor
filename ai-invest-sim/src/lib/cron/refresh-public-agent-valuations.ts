import type { SupabaseClient } from "@supabase/supabase-js"

import { calculateAndStoreValuation } from "../agents/calculate-valuation"
import { validateAgentPublicationReadiness } from "../agents/publication-readiness"
import type {
  Agent,
  AgentHolding,
  AgentValuation,
} from "../types/agent"

const VALUATION_CRON_TTL_MS = 15 * 60_000
const MAX_AGENTS_PER_RUN = 25

export async function refreshPublicAgentValuationsCron({
  supabase,
}: {
  supabase: SupabaseClient
}) {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .eq("lifecycle_status", "active")
    .eq("is_active", true)
    .order("updated_at", { ascending: true })
    .limit(MAX_AGENTS_PER_RUN)

  if (error) throw new Error(error.message)

  const results = []

  for (const agent of (agents || []) as Agent[]) {
    results.push(await refreshAgentValuation({ supabase, agent }))
  }

  return results
}

async function refreshAgentValuation({
  supabase,
  agent,
}: {
  supabase: SupabaseClient
  agent: Agent
}) {
  try {
    if (agent.visibility === "public") {
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
    }

    if (agent.visibility === "system") {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: "system templates do not need portfolio valuation refresh",
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
