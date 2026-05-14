import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../../src/lib/agents/investment-universe"
import {
  canActivateMoreAgents,
  canEditAgent,
  canFollowAgent,
  canPublishAgent,
  canRunAgent,
  canTradeAgentPortfolio,
  canViewAgent,
} from "../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../src/lib/auth/server"
import type {
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
  WorkflowConfig,
} from "../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)

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

  const viewPermission = canViewAgent(requestUser, agent)
  if (!viewPermission.allowed) {
    return NextResponse.json(
      { success: false, error: viewPermission.reason },
      { status: 403 }
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

  const { data: tradeProposals, error: tradeProposalsError } = await supabase
    .from("trade_proposals")
    .select("*, validator_results(*)")
    .eq("agent_id", id)
    .order("created_at", { ascending: false })
    .limit(5)

  if (tradeProposalsError) {
    return NextResponse.json(
      { success: false, error: tradeProposalsError.message },
      { status: 500 }
    )
  }

  const [profile, riskPolicy, workflowConfig, investmentUniverse] = await Promise.all([
    getAgentProfile(id),
    getRiskPolicy(id),
    getWorkflowConfig(id),
    getInvestmentUniverse(id),
  ])

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
    trade_proposals: tradeProposals || [],
    profile,
    risk_policy: riskPolicy,
    workflow_config: workflowConfig,
    investment_universe: investmentUniverse,
    permissions: {
      canEdit: canEditAgent(requestUser, agent).allowed,
      canRun: canRunAgent(requestUser, agent).allowed,
      canTrade: canTradeAgentPortfolio(requestUser, agent).allowed,
      canFollow: canFollowAgent(requestUser, agent).allowed,
    },
    portfolio_summary: {
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      total_value: totalValue,
    },
  })
}

async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle()

  if (error || !data) {
    return defaultAgentProfile(agentId) as AgentProfile
  }

  return data as AgentProfile
}

async function getRiskPolicy(agentId: string): Promise<RiskPolicy> {
  const { data, error } = await supabase
    .from("risk_policies")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle()

  if (error || !data) {
    return defaultRiskPolicy(agentId) as RiskPolicy
  }

  return data as RiskPolicy
}

async function getWorkflowConfig(agentId: string): Promise<WorkflowConfig> {
  const { data, error } = await supabase
    .from("workflow_configs")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle()

  if (error || !data) {
    return defaultWorkflowConfig(agentId) as WorkflowConfig
  }

  return data as WorkflowConfig
}

async function getInvestmentUniverse(
  agentId: string
): Promise<AgentInvestmentUniverse | null> {
  const { data, error } = await supabase
    .from("agent_investment_universes")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return data as AgentInvestmentUniverse
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to update an agent" },
      { status: 401 }
    )
  }

  const body = await request.json()

  const {
    name,
    description,
    philosophy,
    risk_level,
    rebalance_frequency,
    model_name,
    visibility,
    lifecycle_status,
    manual_trade_allowed,
    proposal_execution_required,
    profile,
    risk_policy,
    workflow_config,
  } = body

  const now = new Date().toISOString()

  const { data: existingAgent, error: existingAgentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (existingAgentError || !existingAgent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, existingAgent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const resolvedVisibility = resolveAgentVisibility(
    visibility,
    requestUser.profile.role,
    existingAgent.visibility
  )
  const resolvedLifecycleStatus = lifecycle_status || "active"
  const lifecyclePermission = await validateLifecycleTransition({
    agent: existingAgent,
    userId: requestUser.id,
    nextVisibility: resolvedVisibility,
    nextLifecycleStatus: resolvedLifecycleStatus,
  })

  if (!lifecyclePermission.allowed) {
    return NextResponse.json(
      { success: false, error: lifecyclePermission.reason },
      { status: 403 }
    )
  }

  if (
    resolvedVisibility === "public" &&
    existingAgent.visibility !== "public"
  ) {
    const publishPermission = canPublishAgent(requestUser)
    if (!publishPermission.allowed) {
      return NextResponse.json(
        { success: false, error: publishPermission.reason },
        { status: 403 }
      )
    }
  }

  if (
    resolvedLifecycleStatus === "active" &&
    existingAgent.lifecycle_status !== "active"
  ) {
    const { count: activeAgentCount, error: activeAgentCountError } =
      await supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", requestUser.id)
        .eq("lifecycle_status", "active")
        .neq("id", id)

    if (activeAgentCountError) {
      return NextResponse.json(
        { success: false, error: activeAgentCountError.message },
        { status: 500 }
      )
    }

    const activatePermission = canActivateMoreAgents({
      user: requestUser,
      activeAgentCount: activeAgentCount || 0,
    })

    if (!activatePermission.allowed) {
      return NextResponse.json(
        { success: false, error: activatePermission.reason },
        { status: 403 }
      )
    }
  }

  const { data, error } = await supabase
    .from("agents")
    .update({
      name,
      description,
      philosophy,
      risk_level,
      rebalance_frequency,
      model_name,
      visibility: resolvedVisibility,
      lifecycle_status: resolvedLifecycleStatus,
      is_active: resolvedLifecycleStatus === "active",
      manual_trade_allowed:
        manual_trade_allowed === undefined
          ? existingAgent.manual_trade_allowed
          : Boolean(manual_trade_allowed),
      proposal_execution_required:
        proposal_execution_required === undefined
          ? existingAgent.proposal_execution_required
          : Boolean(proposal_execution_required),
      updated_at: now,
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

  const configUpdates = []
  const profilePayload =
    profile && typeof profile === "object"
      ? {
          ...defaultAgentProfile(id),
          ...profile,
          agent_id: id,
          updated_at: now,
        }
      : null
  const riskPolicyPayload =
    risk_policy && typeof risk_policy === "object"
      ? {
          ...defaultRiskPolicy(id),
          ...risk_policy,
          agent_id: id,
          updated_at: now,
        }
      : null

  if (profilePayload) {
    configUpdates.push(
      supabase
        .from("agent_profiles")
        .upsert(profilePayload, { onConflict: "agent_id" })
    )
  }

  if (riskPolicyPayload) {
    configUpdates.push(
      supabase
        .from("risk_policies")
        .upsert(riskPolicyPayload, { onConflict: "agent_id" })
    )
  }

  if (workflow_config && typeof workflow_config === "object") {
    configUpdates.push(
      supabase
        .from("workflow_configs")
        .upsert(
          {
            ...defaultWorkflowConfig(id),
            ...workflow_config,
            agent_id: id,
            updated_at: now,
          },
          { onConflict: "agent_id" }
        )
    )
  }

  const configResults = await Promise.all(configUpdates)
  const configError = configResults.find((result) => result.error)?.error

  if (configError) {
    return NextResponse.json(
      { success: false, error: configError.message },
      { status: 500 }
    )
  }

  if (profilePayload || riskPolicyPayload) {
    await regenerateInvestmentUniverse({
      agent: data,
      profile: (profilePayload || (await getAgentProfile(id))) as AgentProfile,
      riskPolicy: (riskPolicyPayload || (await getRiskPolicy(id))) as RiskPolicy,
    })
  }

  await syncFollowStatusForLifecycle(id, resolvedLifecycleStatus)

  return NextResponse.json({
    success: true,
    agent: data,
  })
}

async function validateLifecycleTransition({
  agent,
  userId,
  nextVisibility,
  nextLifecycleStatus,
}: {
  agent: Record<string, unknown>
  userId: string
  nextVisibility: string
  nextLifecycleStatus: string
}) {
  const currentVisibility = String(agent.visibility || "private")
  const hasFollowers =
    currentVisibility === "public" || currentVisibility === "system"
      ? await agentHasFollowers(String(agent.id))
      : false

  if (
    hasFollowers &&
    currentVisibility === "public" &&
    nextVisibility === "private"
  ) {
    return {
      allowed: false,
      reason:
        "Public agents with followers cannot be made private. Pause or retire the agent first.",
    }
  }

  if (hasFollowers && ["draft", "archived"].includes(nextLifecycleStatus)) {
    return {
      allowed: false,
      reason:
        "Agents with followers cannot move directly to draft or archived.",
    }
  }

  if (
    String(agent.lifecycle_status) === "archived" &&
    nextLifecycleStatus !== "archived"
  ) {
    return {
      allowed: false,
      reason: "Archived agents are read-only.",
    }
  }

  if (
    String(agent.lifecycle_status) === "retired" &&
    nextLifecycleStatus === "active"
  ) {
    return {
      allowed: false,
      reason: "Retired agents cannot return to active without admin override.",
    }
  }

  void userId
  return { allowed: true }
}

async function agentHasFollowers(agentId: string) {
  const { count, error } = await supabase
    .from("agent_follows")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .in("status", ["active", "paused_by_agent"])

  if (error) return false
  return Boolean(count && count > 0)
}

async function syncFollowStatusForLifecycle(
  agentId: string,
  lifecycleStatus: string
) {
  if (lifecycleStatus === "paused" || lifecycleStatus === "retired") {
    await supabase
      .from("agent_follows")
      .update({
        status: "paused_by_agent",
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agentId)
      .eq("status", "active")
  }

  if (lifecycleStatus === "active") {
    await supabase
      .from("agent_follows")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agentId)
      .eq("status", "paused_by_agent")
  }
}

async function regenerateInvestmentUniverse({
  agent,
  profile,
  riskPolicy,
}: {
  agent: Record<string, unknown>
  profile: AgentProfile
  riskPolicy: RiskPolicy
}) {
  const { data: latestUniverse } = await supabase
    .from("agent_investment_universes")
    .select("version")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = Number(latestUniverse?.version || 0) + 1
  const { universe } = await generateInvestmentUniverse({
    agent: agent as Parameters<typeof generateInvestmentUniverse>[0]["agent"],
    profile,
    riskPolicy,
  })

  await supabase
    .from("agent_investment_universes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("agent_id", agent.id)
    .eq("status", "active")

  await supabase.from("agent_investment_universes").insert({
    ...universe,
    agent_id: agent.id,
    version: nextVersion,
    status: "active",
  })
}

function resolveAgentVisibility(
  value: unknown,
  role: string,
  fallback: string
) {
  if (role === "admin" && value === "system") return "system"
  if ((role === "admin" || role === "pro") && value === "public") {
    return "public"
  }
  if (value === "private") return "private"
  return fallback || "private"
}
