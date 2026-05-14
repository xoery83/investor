import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
} from "../../../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../../../src/lib/agents/investment-universe"
import { canEditAgent } from "../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../src/lib/auth/server"
import type {
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
} from "../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const { data, error } = await supabase
    .from("agent_investment_universes")
    .select("*")
    .eq("agent_id", id)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    universe: (data || null) as AgentInvestmentUniverse | null,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to regenerate universe" },
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
      { success: false, error: "Agent not found" },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const [profile, riskPolicy] = await Promise.all([
    getAgentProfile(id),
    getRiskPolicy(id),
  ])
  const { data: latestUniverse } = await supabase
    .from("agent_investment_universes")
    .select("version")
    .eq("agent_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextVersion = Number(latestUniverse?.version || 0) + 1
  const { universe } = await generateInvestmentUniverse({
    agent,
    profile,
    riskPolicy,
  })

  await supabase
    .from("agent_investment_universes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("agent_id", id)
    .eq("status", "active")

  const { data, error } = await supabase
    .from("agent_investment_universes")
    .insert({
      ...universe,
      agent_id: id,
      version: nextVersion,
      status: "active",
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    universe: data as AgentInvestmentUniverse,
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
