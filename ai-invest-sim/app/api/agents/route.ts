import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../src/lib/agents/investment-universe"
import {
  canActivateMoreAgents,
  canCreateMoreAgents,
} from "../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)
  const authedSupabase = createAuthedClient(request)
  let query = supabase
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false })

  if (!requestUser) {
    query = query.eq("visibility", "public")
  } else if (requestUser.profile.role !== "admin") {
    query = query.or(`visibility.eq.public,owner_user_id.eq.${requestUser.id}`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  const visibleAgents = data || []

  const ownerIds = Array.from(
    new Set(
      visibleAgents
        .map((agent) => agent.owner_user_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  const visibleAgentIds = visibleAgents.map((agent) => agent.id)
  const [profileMap, publicStats, followingSet] = await Promise.all([
    loadCreatorProfiles(ownerIds),
    loadAgentPublicStats(visibleAgentIds, authedSupabase),
    requestUser
      ? loadUserFollowingSet(authedSupabase, requestUser.id)
      : Promise.resolve(new Set<string>()),
  ])
  const agents = visibleAgents.map((agent) => {
    const profile = agent.owner_user_id
      ? profileMap.get(agent.owner_user_id)
      : null

    return {
      ...agent,
      creator_display_name: resolveCreatorDisplayName(agent, profile),
      creator_role:
        profile?.role ||
        (agent.creator_type === "admin" || agent.visibility === "system"
          ? "admin"
          : "user"),
      follower_count: publicStats.get(agent.id)?.follower_count || 0,
      is_following: followingSet.has(agent.id),
      follower_position_value:
        publicStats.get(agent.id)?.follower_position_value || 0,
    }
  })

  return NextResponse.json({
    success: true,
    agents,
  })
}

export async function POST(request: Request) {
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to create an agent" },
      { status: 401 }
    )
  }

  const body = await request.json()

  const {
    name,
    description,
    philosophy,
    risk_level,
    initial_capital,
    base_currency,
    rebalance_frequency,
    profile,
    risk_policy,
    workflow_config,
    visibility,
    lifecycle_status,
  } = body

  if (!name || !initial_capital) {
    return NextResponse.json(
      { success: false, error: "Missing required fields" },
      { status: 400 }
    )
  }

  const { count: ownedAgentCount, error: ownedAgentCountError } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", requestUser.id)

  if (ownedAgentCountError) {
    return NextResponse.json(
      { success: false, error: ownedAgentCountError.message },
      { status: 500 }
    )
  }

  const createPermission = canCreateMoreAgents({
    user: requestUser,
    agentCount: ownedAgentCount || 0,
  })

  if (!createPermission.allowed) {
    return NextResponse.json(
      { success: false, error: createPermission.reason },
      { status: 403 }
    )
  }

  const { count: activeAgentCount, error: activeAgentCountError } =
    await supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", requestUser.id)
      .eq("lifecycle_status", "active")

  if (activeAgentCountError) {
    return NextResponse.json(
      { success: false, error: activeAgentCountError.message },
      { status: 500 }
    )
  }

  const activePermission = canActivateMoreAgents({
    user: requestUser,
    activeAgentCount: activeAgentCount || 0,
  })
  const resolvedBaseCurrency = String(base_currency || "USD")
    .trim()
    .toUpperCase()
  const resolvedLifecycleStatus =
    lifecycle_status === "active" || !lifecycle_status
      ? activePermission.allowed
        ? "active"
        : "draft"
      : lifecycle_status

  const { data, error } = await supabase
    .from("agents")
    .insert({
      name,
      description,
      philosophy,
      risk_level: risk_level || "medium",
      owner_user_id: requestUser.id,
      visibility: resolveAgentVisibility(
        visibility,
        requestUser.profile.role
      ),
      creator_type: requestUser.profile.role === "admin" ? "admin" : "user",
      lifecycle_status: resolvedLifecycleStatus,
      initial_capital,
      cash_balance: initial_capital,
      current_value: initial_capital,
      base_currency: resolvedBaseCurrency,
      rebalance_frequency: rebalance_frequency || "daily",
      is_active: resolvedLifecycleStatus === "active",
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
    base_currency: resolvedBaseCurrency,
    daily_return: 0,
    cumulative_return: 0,
    annualized_return: 0,
  })

  const config = await createDefaultAgentConfig(data.id, {
    profile,
    risk_policy,
    workflow_config,
  })

  await createInvestmentUniverse({
    agent: data,
    profile: config.profile,
    riskPolicy: config.riskPolicy,
  })

  return NextResponse.json({
    success: true,
    agent: data,
  })
}

function resolveAgentVisibility(value: unknown, role: string) {
  if (role === "admin" && value === "system") return "system"
  if ((role === "admin" || role === "pro") && value === "public") {
    return "public"
  }
  return "private"
}

type CreatorProfile = {
  id: string
  email: string | null
  display_name: string | null
  role: string | null
}

async function loadCreatorProfiles(ownerIds: string[]) {
  if (ownerIds.length === 0) {
    return new Map<string, CreatorProfile>()
  }

  const { data } = await supabase
    .from("user_profiles")
    .select("id,email,display_name,role")
    .in("id", ownerIds)

  return new Map<string, CreatorProfile>(
    ((data || []) as CreatorProfile[]).map((profile) => [profile.id, profile])
  )
}

async function loadFollowCounts(
  client: typeof supabase,
  agentIds: string[]
) {
  if (agentIds.length === 0) return new Map<string, number>()

  const { data, error } = await client
    .from("agent_follows")
    .select("agent_id")
    .in("agent_id", agentIds)
    .eq("status", "active")

  if (error) return new Map<string, number>()

  return (data || []).reduce((counts, follow) => {
    const agentId = String(follow.agent_id)
    counts.set(agentId, (counts.get(agentId) || 0) + 1)
    return counts
  }, new Map<string, number>())
}

type AgentPublicStats = {
  follower_count: number
  follower_position_value: number
}

async function loadAgentPublicStats(
  agentIds: string[],
  fallbackClient: typeof supabase
) {
  if (agentIds.length === 0) return new Map<string, AgentPublicStats>()

  const { data, error } = await supabase.rpc("get_agent_public_stats", {
    agent_ids: agentIds,
  })

  if (!error && data) {
    return (data as Array<{
      agent_id: string
      follower_count: number | string
      follower_position_value: number | string
    }>).reduce((stats, row) => {
      stats.set(String(row.agent_id), {
        follower_count: Number(row.follower_count || 0),
        follower_position_value: Number(row.follower_position_value || 0),
      })
      return stats
    }, new Map<string, AgentPublicStats>())
  }

  const [followCounts, followerPositionValues] = await Promise.all([
    loadFollowCounts(fallbackClient, agentIds),
    loadFollowerPositionValues(fallbackClient, agentIds),
  ])

  return agentIds.reduce((stats, agentId) => {
    stats.set(agentId, {
      follower_count: followCounts.get(agentId) || 0,
      follower_position_value: followerPositionValues.get(agentId) || 0,
    })
    return stats
  }, new Map<string, AgentPublicStats>())
}

async function loadUserFollowingSet(client: typeof supabase, userId: string) {
  const { data, error } = await client
    .from("agent_follows")
    .select("agent_id")
    .eq("user_id", userId)
    .eq("status", "active")

  if (error) return new Set<string>()

  return new Set((data || []).map((follow) => String(follow.agent_id)))
}

async function loadFollowerPositionValues(
  client: typeof supabase,
  agentIds: string[]
) {
  if (agentIds.length === 0) return new Map<string, number>()

  const { data, error } = await client
    .from("user_agent_positions")
    .select("agent_id,market_value")
    .in("agent_id", agentIds)
    .in("status", ["open", "sell_only", "frozen"])

  if (error) return new Map<string, number>()

  return (data || []).reduce((values, position) => {
    const agentId = String(position.agent_id)
    values.set(agentId, (values.get(agentId) || 0) + Number(position.market_value || 0))
    return values
  }, new Map<string, number>())
}

function createAuthedClient(request: Request) {
  const authorization = request.headers.get("authorization") || ""

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
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

async function createDefaultAgentConfig(
  agentId: string,
  overrides: {
    profile?: Record<string, unknown>
    risk_policy?: Record<string, unknown>
    workflow_config?: Record<string, unknown>
  }
) {
  const profile = {
    ...defaultAgentProfile(agentId),
    ...(overrides.profile || {}),
    agent_id: agentId,
  }
  const riskPolicy = {
    ...defaultRiskPolicy(agentId),
    ...(overrides.risk_policy || {}),
    agent_id: agentId,
  }
  const workflowConfig = {
    ...defaultWorkflowConfig(agentId),
    ...(overrides.workflow_config || {}),
    agent_id: agentId,
  }

  await Promise.all([
    supabase
      .from("agent_profiles")
      .upsert(profile, { onConflict: "agent_id" }),
    supabase
      .from("risk_policies")
      .upsert(riskPolicy, { onConflict: "agent_id" }),
    supabase
      .from("workflow_configs")
      .upsert(workflowConfig, { onConflict: "agent_id" }),
  ])

  return { profile, riskPolicy, workflowConfig }
}

async function createInvestmentUniverse({
  agent,
  profile,
  riskPolicy,
}: {
  agent: Record<string, unknown>
  profile: ReturnType<typeof defaultAgentProfile>
  riskPolicy: ReturnType<typeof defaultRiskPolicy>
}) {
  const { universe } = await generateInvestmentUniverse({
    agent: agent as Parameters<typeof generateInvestmentUniverse>[0]["agent"],
    profile: profile as Parameters<typeof generateInvestmentUniverse>[0]["profile"],
    riskPolicy:
      riskPolicy as Parameters<typeof generateInvestmentUniverse>[0]["riskPolicy"],
  })

  await supabase
    .from("agent_investment_universes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("agent_id", agent.id)
    .eq("status", "active")

  await supabase.from("agent_investment_universes").insert({
    ...universe,
    agent_id: agent.id,
    version: 1,
    status: "active",
  })
}
