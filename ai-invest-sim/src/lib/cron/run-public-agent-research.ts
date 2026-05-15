import type { SupabaseClient } from "@supabase/supabase-js"

import { validateAgentPublicationReadiness } from "../agents/publication-readiness"
import {
  getAgentProfile,
  getRiskPolicy,
  getWorkflowConfig,
} from "../agents/read-agent-config"
import { runResearchAgent } from "../agents/run-agent"
import type {
  Agent,
  AgentHolding,
  AgentRun,
  AgentRunType,
  AgentValuation,
} from "../types/agent"

const MAX_AGENTS_PER_RUN = 15

export async function runPublicAgentResearchCron({
  supabase,
  runType,
}: {
  supabase: SupabaseClient
  runType: Extract<AgentRunType, "daily" | "weekly">
}) {
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .eq("visibility", "public")
    .eq("lifecycle_status", "active")
    .order("updated_at", { ascending: true })
    .limit(MAX_AGENTS_PER_RUN)

  if (error) throw new Error(error.message)

  const results = []
  for (const agent of (agents || []) as Agent[]) {
    results.push(await runPublicAgentResearch({ supabase, agent, runType }))
  }

  return results
}

async function runPublicAgentResearch({
  supabase,
  agent,
  runType,
}: {
  supabase: SupabaseClient
  agent: Agent
  runType: Extract<AgentRunType, "daily" | "weekly">
}) {
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

    const workflowConfig = await getWorkflowConfig(supabase, agent.id)
    if (runType === "daily" && !workflowConfig.daily_enabled) {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: "daily workflow disabled",
      }
    }
    if (runType === "weekly" && !workflowConfig.weekly_enabled) {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: "weekly workflow disabled",
      }
    }

    const latestRun = await getLatestRun(supabase, agent.id, runType)
    if (latestRun && isFreshRun(latestRun, runType)) {
      return {
        agent_id: agent.id,
        status: "skipped",
        reason: `${runType} run already completed recently`,
      }
    }

    const [holdingsResult, valuationsResult, recentRunsResult, profile, riskPolicy] =
      await Promise.all([
        supabase.from("agent_holdings").select("*").eq("agent_id", agent.id),
        supabase
          .from("agent_valuations")
          .select("*")
          .eq("agent_id", agent.id)
          .order("recorded_at", { ascending: true })
          .limit(500),
        supabase
          .from("agent_runs")
          .select("*")
          .eq("agent_id", agent.id)
          .order("created_at", { ascending: false })
          .limit(3),
        getAgentProfile(supabase, agent.id),
        getRiskPolicy(supabase, agent.id),
      ])

    if (holdingsResult.error) throw new Error(holdingsResult.error.message)
    if (valuationsResult.error) throw new Error(valuationsResult.error.message)
    if (recentRunsResult.error) throw new Error(recentRunsResult.error.message)

    const result = await runResearchAgent({
      agent,
      holdings: (holdingsResult.data || []) as AgentHolding[],
      valuations: (valuationsResult.data || []) as AgentValuation[],
      recentRuns: (recentRunsResult.data || []) as AgentRun[],
      profile,
      riskPolicy,
      workflowConfig,
      runType,
    })

    const { data: runRecord, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        agent_id: agent.id,
        run_type: runType,
        summary: result.summary || `${runType} research run completed.`,
        recommendation: result,
        risks: result.risks || [],
        status: "completed",
      })
      .select()
      .single()

    if (runError) throw new Error(runError.message)

    return {
      agent_id: agent.id,
      status: "completed",
      run_id: runRecord.id,
      summary: runRecord.summary,
    }
  } catch (error) {
    return {
      agent_id: agent.id,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

async function getLatestRun(
  supabase: SupabaseClient,
  agentId: string,
  runType: "daily" | "weekly"
) {
  const { data } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("run_type", runType)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as AgentRun | null
}

function isFreshRun(run: AgentRun, runType: "daily" | "weekly") {
  const createdAt = new Date(run.created_at).getTime()
  if (!createdAt) return false

  const ttl = runType === "daily" ? 20 * 60 * 60_000 : 6 * 24 * 60 * 60_000
  return Date.now() - createdAt < ttl
}
