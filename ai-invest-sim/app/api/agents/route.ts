import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../src/lib/agents/investment-universe"
import { getRequestUser } from "../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)
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

  const visibleAgents = (data || []).filter((agent) => {
    if (requestUser?.profile.role === "admin") return true
    if (agent.visibility === "public" || agent.visibility === "system") {
      return true
    }
    return Boolean(requestUser && agent.owner_user_id === requestUser.id)
  })

  const ownerIds = Array.from(
    new Set(
      visibleAgents
        .map((agent) => agent.owner_user_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  const profileMap = await loadCreatorProfiles(ownerIds)
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
      lifecycle_status: lifecycle_status || "active",
      initial_capital,
      cash_balance: initial_capital,
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
