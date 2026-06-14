import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../../src/lib/agents/investment-universe"
import { validateAgentPublicationReadiness } from "../../../../src/lib/agents/publication-readiness"
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

type CreatorProfile = {
  id: string
  email: string | null
  display_name: string | null
  role: string | null
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const authedSupabase = createAuthedClient(request)

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

  const followingPromise = requestUser
    ? authedSupabase
        .from("agent_follows")
        .select("id")
        .eq("agent_id", id)
        .eq("user_id", requestUser.id)
        .eq("status", "active")
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })
  const creatorProfilePromise = agent.owner_user_id
    ? supabase
        .from("user_profiles")
        .select("id,email,display_name,role")
        .eq("id", agent.owner_user_id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })
  const publicStatsPromise = loadAgentPublicStats(id, authedSupabase)

  const valuationCutoff = new Date()
  valuationCutoff.setFullYear(valuationCutoff.getFullYear() - 1)

  const [
    followingResult,
    creatorProfileResult,
    publicStats,
    holdingsResult,
    runsResult,
    valuationsResult,
    tradeProposalsResult,
    initializationSession,
    profile,
    riskPolicy,
    workflowConfig,
    investmentUniverse,
  ] = await Promise.all([
    followingPromise,
    creatorProfilePromise,
    publicStatsPromise,
    supabase
      .from("agent_holdings")
      .select("*")
      .eq("agent_id", id)
      .order("weight", { ascending: false }),
    supabase
      .from("agent_runs")
      .select("*")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("agent_valuations")
      .select("*")
      .eq("agent_id", id)
      .gte("recorded_at", valuationCutoff.toISOString())
      .order("recorded_at", { ascending: true })
      .limit(2000),
    supabase
      .from("trade_proposals")
      .select("*, validator_results(*), portfolio_evaluations(*)")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    loadInitializationSession(id),
    getAgentProfile(id),
    getRiskPolicy(id),
    getWorkflowConfig(id),
    getInvestmentUniverse(id),
  ])

  if (holdingsResult.error) {
    return NextResponse.json(
      { success: false, error: holdingsResult.error.message },
      { status: 500 }
    )
  }

  if (runsResult.error) {
    return NextResponse.json(
      { success: false, error: runsResult.error.message },
      { status: 500 }
    )
  }

  if (valuationsResult.error) {
    return NextResponse.json(
      { success: false, error: valuationsResult.error.message },
      { status: 500 }
    )
  }

  if (tradeProposalsResult.error) {
    return NextResponse.json(
      { success: false, error: tradeProposalsResult.error.message },
      { status: 500 }
    )
  }

  const holdings = holdingsResult.data || []
  const runs = runsResult.data || []
  const valuations = valuationsResult.data || []
  const tradeProposals = tradeProposalsResult.data || []

  const holdingsValue = (holdings || []).reduce((sum, holding) => {
    return sum + Number(holding.market_value_base || holding.market_value || 0)
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
      creator_display_name: resolveCreatorDisplayName(
        agent,
        creatorProfileResult.data
      ),
      creator_role:
        creatorProfileResult.data?.role ||
        (agent.creator_type === "admin" || agent.visibility === "system"
          ? "admin"
          : "user"),
      follower_count: publicStats.follower_count,
      follower_position_value: publicStats.follower_position_value,
    },
    holdings,
    runs,
    valuations,
    trade_proposals: tradeProposals,
    initialization_session: initializationSession,
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
    is_following: Boolean(followingResult.data),
    publication_readiness: await validateAgentPublicationReadiness({
      supabase,
      agent,
    }),
    portfolio_summary: {
      cash_balance: cashBalance,
      holdings_value: holdingsValue,
      total_value: totalValue,
    },
  })
}

function createAuthedClient(request: Request) {
  const authorization = request.headers.get("authorization") || ""

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}

async function loadAgentPublicStats(
  agentId: string,
  fallbackClient: ReturnType<typeof createAuthedClient>
) {
  const { data, error } = await supabase.rpc("get_agent_public_stats", {
    agent_ids: [agentId],
  })

  if (!error && Array.isArray(data) && data[0]) {
    return {
      follower_count: Number(data[0].follower_count || 0),
      follower_position_value: Number(data[0].follower_position_value || 0),
    }
  }

  const [followerCountResult, followerPositionValueResult] = await Promise.all([
    fallbackClient
      .from("agent_follows")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("status", "active"),
    fallbackClient
      .from("user_agent_positions")
      .select("market_value")
      .eq("agent_id", agentId)
      .in("status", ["open", "sell_only", "frozen"]),
  ])

  return {
    follower_count: followerCountResult.count || 0,
    follower_position_value: (followerPositionValueResult.data || []).reduce(
      (sum, position) => sum + Number(position.market_value || 0),
      0
    ),
  }
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

async function loadInitializationSession(agentId: string) {
  const { data: session, error } = await supabase
    .from("agent_initialization_sessions")
    .select("*")
    .eq("agent_id", agentId)
    .in("status", ["draft", "in_review", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingInitializationTableError(error.message)) return null
    throw new Error(error.message)
  }

  if (!session) return null

  const [versionsResult, messagesResult] = await Promise.all([
    supabase
      .from("agent_initialization_versions")
      .select("*, trade_proposals(*, validator_results(*))")
      .eq("session_id", session.id)
      .order("version_number", { ascending: true }),
    supabase
      .from("agent_initialization_messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true }),
  ])

  if (versionsResult.error) {
    if (isMissingInitializationTableError(versionsResult.error.message)) {
      return null
    }
    throw new Error(versionsResult.error.message)
  }

  if (messagesResult.error) {
    if (isMissingInitializationTableError(messagesResult.error.message)) {
      return null
    }
    throw new Error(messagesResult.error.message)
  }

  return {
    ...session,
    versions: versionsResult.data || [],
    messages: messagesResult.data || [],
  }
}

function isMissingInitializationTableError(message: string) {
  return (
    (message.includes("agent_initialization_sessions") ||
      message.includes("agent_initialization_versions") ||
      message.includes("agent_initialization_messages")) &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
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
    base_currency,
    visibility,
    lifecycle_status,
    manual_trade_allowed,
    proposal_execution_required,
    agent_mode,
    copycat_source_id,
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
  const resolvedBaseCurrency = String(
    base_currency || existingAgent.base_currency || "USD"
  )
    .trim()
    .toUpperCase()
  const resolvedAgentMode =
    agent_mode === "copycat" ? "copycat" : "ai_manager"

  if (
    resolvedAgentMode !== (existingAgent.agent_mode || "ai_manager") &&
    requestUser.profile.role !== "admin"
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Only admins can change agent mode in this phase.",
      },
      { status: 403 }
    )
  }

  if (resolvedAgentMode === "copycat") {
    const resolvedCopycatSourceId =
      copycat_source_id || existingAgent.copycat_source_id

    if (!resolvedCopycatSourceId) {
      return NextResponse.json(
        {
          success: false,
          error: "Copycat source is required for copycat agents.",
        },
        { status: 400 }
      )
    }

    const { data: copycatSource, error: copycatSourceError } = await supabase
      .from("copycat_sources")
      .select("id,status")
      .eq("id", resolvedCopycatSourceId)
      .single()

    if (copycatSourceError || !copycatSource) {
      return NextResponse.json(
        { success: false, error: "Copycat source not found." },
        { status: 404 }
      )
    }

    if (copycatSource.status !== "active") {
      return NextResponse.json(
        { success: false, error: "Copycat source is not active." },
        { status: 400 }
      )
    }
  }

  if (resolvedBaseCurrency !== String(existingAgent.base_currency || "USD")) {
    const { count: holdingsCount, error: holdingsCountError } = await supabase
      .from("agent_holdings")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", id)

    if (holdingsCountError) {
      return NextResponse.json(
        { success: false, error: holdingsCountError.message },
        { status: 500 }
      )
    }

    if ((holdingsCount || 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Base currency can only be changed before the agent has holdings.",
        },
        { status: 400 }
      )
    }
  }

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

  const publishingToPublic =
    resolvedVisibility === "public" && existingAgent.visibility !== "public"

  if (publishingToPublic) {
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
      base_currency: resolvedBaseCurrency,
      agent_mode: resolvedAgentMode,
      copycat_source_id:
        resolvedAgentMode === "copycat"
          ? copycat_source_id || existingAgent.copycat_source_id
          : null,
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

  if (publishingToPublic) {
    const readiness = await validateAgentPublicationReadiness({
      supabase,
      agent: data,
    })

    if (!readiness.ready) {
      await supabase
        .from("agents")
        .update({
          visibility: existingAgent.visibility,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      return NextResponse.json(
        {
          success: false,
          error: `Agent cannot be published yet. ${readiness.blockers[0]}`,
          publication_readiness: readiness,
        },
        { status: 403 }
      )
    }
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

function resolveCreatorDisplayName(
  agent: { creator_type?: string | null; visibility?: string | null },
  profile?: CreatorProfile | null
) {
  const displayName = profile?.display_name?.trim()
  if (displayName) return displayName

  const emailPrefix = profile?.email?.split("@")[0]?.trim()
  if (emailPrefix) return emailPrefix

  if (agent.visibility === "system") return "System"
  if (agent.creator_type === "admin") return "Admin"
  return "Unknown user"
}
