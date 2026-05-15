import type { SupabaseClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "./default-config"
import type {
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
  WorkflowConfig,
} from "../types/agent"

export async function getAgentProfile(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentProfile> {
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

export async function getRiskPolicy(
  supabase: SupabaseClient,
  agentId: string
): Promise<RiskPolicy> {
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

export async function getWorkflowConfig(
  supabase: SupabaseClient,
  agentId: string
): Promise<WorkflowConfig> {
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

export async function getInvestmentUniverse(
  supabase: SupabaseClient,
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
