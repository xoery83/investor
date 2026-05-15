import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../../../src/lib/agents/default-config"
import { generateInvestmentUniverse } from "../../../../../src/lib/agents/investment-universe"
import {
  buildManualInterventionProposal,
  buildStagedRemediationProposal,
} from "../../../../../src/lib/agents/build-staged-remediation-proposal"
import { diagnosePortfolio } from "../../../../../src/lib/agents/diagnose-portfolio"
import {
  reviseAgentRecommendation,
  runAgent,
  runInitialBuildAgent,
  runResearchAgent,
} from "../../../../../src/lib/agents/run-agent"
import { validateTradeProposal } from "../../../../../src/lib/agents/validate-trade-proposal"
import {
  canManualRunToday,
  canRunAgent,
} from "../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../src/lib/auth/server"
import type {
  AgentRunType,
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
  WorkflowConfig,
} from "../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const body = await request.json().catch(() => ({}))
  const requestedRunType = readRunType(body.run_type)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to run an agent" },
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

  const runPermission = canRunAgent(requestUser, agent)
  if (!runPermission.allowed) {
    return NextResponse.json(
      { success: false, error: runPermission.reason },
      { status: 403 }
    )
  }

  try {
    const todayRunCount = await countManualRunsToday(requestUser.id)
    const quotaPermission = canManualRunToday({
      user: requestUser,
      runCount: todayRunCount,
    })

    if (!quotaPermission.allowed) {
      return NextResponse.json(
        { success: false, error: quotaPermission.reason },
        { status: 403 }
      )
    }

    const { data: holdings } = await supabase
      .from("agent_holdings")
      .select("*")
      .eq("agent_id", id)

    const { data: valuations } = await supabase
      .from("agent_valuations")
      .select("*")
      .eq("agent_id", id)
      .order("recorded_at", { ascending: true })

    const { data: recentRuns } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(3)

    const [profile, riskPolicy, workflowConfig, existingUniverse] = await Promise.all([
      getAgentProfile(id),
      getRiskPolicy(id),
      getWorkflowConfig(id),
      getInvestmentUniverse(id),
    ])
    const universe =
      existingUniverse ||
      (await createInvestmentUniverse({
        agent,
        profile,
        riskPolicy,
      }))
    const holdingsList = holdings || []
    const valuationsList = valuations || []
    const recentRunsList = recentRuns || []
    const holdingsValue = holdingsList.reduce(
      (sum, holding) =>
        sum + Number(holding.market_value_base || holding.market_value || 0),
      0
    )
    const isInitialBuildCandidate = holdingsList.length === 0 || holdingsValue <= 1
    const runType =
      requestedRunType === "rebalance" && isInitialBuildCandidate
        ? "initial_build"
        : requestedRunType

    const diagnostic = diagnosePortfolio({
      agent,
      holdings: holdingsList,
      profile,
      riskPolicy,
    })

    if (isResearchRunType(runType)) {
      const result = await runResearchAgent({
        agent,
        holdings: holdingsList,
        valuations: valuationsList,
        recentRuns: recentRunsList,
        profile,
        riskPolicy,
        workflowConfig,
        runType,
      })

      const { data: runRecord, error: runError } = await supabase
        .from("agent_runs")
        .insert({
          agent_id: id,
          run_type: runType,
          summary: result.summary || `${runType} research run completed.`,
          recommendation: result,
          risks: result.risks || [],
          status: "completed",
        })
        .select()
        .single()

      if (runError) {
        return NextResponse.json(
          { success: false, error: runError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        result,
        run: runRecord,
        trade_proposal: null,
        validation: null,
      })
    }

    if (runType === "initial_build" && !isInitialBuildCandidate) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Initial build is only available before this agent has active holdings. Use Rebalance instead.",
        },
        { status: 400 }
      )
    }

    const validationMode =
      runType === "initial_build" ? "initial_build" : "rebalance"

    let result = runType === "initial_build"
      ? await runInitialBuildAgent({
          agent,
          holdings: holdingsList,
          valuations: valuationsList,
          recentRuns: recentRunsList,
          profile,
          riskPolicy,
          workflowConfig,
          universe,
        })
      : diagnostic.manual_required
      ? buildManualInterventionProposal({ diagnostic })
      : await runAgent({
          agent,
          holdings: holdingsList,
          valuations: valuationsList,
          recentRuns: recentRunsList,
          profile,
          riskPolicy,
          workflowConfig,
          diagnostic,
          universe,
        })

    let validation = validateTradeProposal({
      agent,
      proposal: result,
      holdings: holdingsList,
      riskPolicy,
      profile,
      universe,
      validationMode,
    })

    let revisionAttempt = 0
    const maxRevisionAttempts = workflowConfig.validator_enabled
      ? Number(workflowConfig.max_revision_attempts || 0)
      : 0

    while (
      validation.violations.length > 0 &&
      revisionAttempt < maxRevisionAttempts
    ) {
      revisionAttempt += 1
      result = await reviseAgentRecommendation({
        agent,
        recommendation: result,
        validation,
        riskPolicy,
        profile,
        universe,
        diagnostic,
        validationMode,
      })
      validation = validateTradeProposal({
        agent,
        proposal: result,
        holdings: holdingsList,
        riskPolicy,
        profile,
        universe,
        validationMode,
      })
    }

    if (runType === "rebalance" && validation.violations.length > 0) {
      result = buildStagedRemediationProposal({
        agent,
        holdings: holdingsList,
        profile,
        riskPolicy,
        universe,
      })
      validation = validateTradeProposal({
        agent,
        proposal: result,
        holdings: holdingsList,
        riskPolicy,
        profile,
        universe,
        validationMode,
      })
    }

    const { data: runRecord, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        agent_id: id,
        run_type: runType,
        summary: result.summary || "Agent generated a recommendation.",
        recommendation: result,
        risks: result.risks || [],
        status: "completed",
      })
      .select()
      .single()

    if (runError) {
      return NextResponse.json(
        { success: false, error: runError.message },
        { status: 500 }
      )
    }

    const { data: proposalRecord, error: proposalError } = await supabase
      .from("trade_proposals")
      .insert({
        agent_id: id,
        source_run_id: runRecord.id,
        status: "pending",
        proposal: result,
        validator_status: validation.validation_status,
      })
      .select()
      .single()

    if (proposalError) {
      return NextResponse.json(
        { success: false, error: proposalError.message },
        { status: 500 }
      )
    }

    const { data: validatorRecord, error: validatorError } = await supabase
      .from("validator_results")
      .insert({
        agent_id: id,
        run_id: runRecord.id,
        trade_proposal_id: proposalRecord.id,
        validation_status: validation.validation_status,
        violations: validation.violations,
        final_action_allowed: validation.final_action_allowed,
        revision_attempt: revisionAttempt,
        result: {
          ...validation.result,
          run_type: runType,
          max_revision_attempts: maxRevisionAttempts,
        },
      })
      .select()
      .single()

    if (validatorError) {
      return NextResponse.json(
        { success: false, error: validatorError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      result,
      run: runRecord,
      trade_proposal: proposalRecord,
      validation: validatorRecord,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to run agent",
      },
      { status: 500 }
    )
  }
}

async function countManualRunsToday(userId: string) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from("agent_runs")
    .select("id, agents!inner(owner_user_id)", { count: "exact", head: true })
    .eq("agents.owner_user_id", userId)
    .gte("created_at", start.toISOString())

  return count || 0
}

function readRunType(value: unknown): AgentRunType {
  return value === "daily" ||
    value === "weekly" ||
    value === "escalation" ||
    value === "rebalance" ||
    value === "initial_build"
    ? value
    : "rebalance"
}

function isResearchRunType(
  runType: AgentRunType
): runType is Extract<AgentRunType, "daily" | "weekly" | "escalation"> {
  return runType === "daily" || runType === "weekly" || runType === "escalation"
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

async function createInvestmentUniverse({
  agent,
  profile,
  riskPolicy,
}: {
  agent: Record<string, unknown>
  profile: AgentProfile
  riskPolicy: RiskPolicy
}): Promise<AgentInvestmentUniverse | null> {
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

  const { data, error } = await supabase
    .from("agent_investment_universes")
    .insert({
      ...universe,
      agent_id: agent.id,
      version: nextVersion,
      status: "active",
    })
    .select()
    .single()

  if (error || !data) return null

  return data as AgentInvestmentUniverse
}
