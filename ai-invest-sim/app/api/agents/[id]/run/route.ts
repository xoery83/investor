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
  addMemoryCards,
  buildProposalMemoryCards,
  getActiveMemoryCards,
} from "../../../../../src/lib/agents/memory-cards"
import { evaluateAndStorePortfolio } from "../../../../../src/lib/agents/portfolio-evaluation"
import {
  reviseAgentRecommendation,
  runAgent,
  runInitialBuildAgent,
  runResearchAgent,
} from "../../../../../src/lib/agents/run-agent"
import { storeInitializationVersion } from "../../../../../src/lib/agents/initialization-workflow"
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
    const memoryCards = await getActiveMemoryCards(supabase, id)
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
    const isCapitalDeploymentCandidate =
      requestedRunType === "rebalance" &&
      diagnostic.workflow === "deploy_excess_cash" &&
      !diagnostic.manual_required

    if (isResearchRunType(runType)) {
      const result = await runResearchAgent({
        agent,
        holdings: holdingsList,
        valuations: valuationsList,
        recentRuns: recentRunsList,
        profile,
        riskPolicy,
        workflowConfig,
        memoryCards,
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
      runType === "initial_build"
        ? "initial_build"
        : isCapitalDeploymentCandidate
          ? "capital_deployment"
          : "rebalance"

    const copycatProposal =
      agent.agent_mode === "copycat"
        ? await buildCopycatSnapshotProposal({
            agent,
            holdings: holdingsList,
          })
        : null

    let result = copycatProposal
      ? copycatProposal
      : runType === "initial_build" || isCapitalDeploymentCandidate
        ? await runInitialBuildAgent({
            agent,
            holdings: holdingsList,
            valuations: valuationsList,
            recentRuns: recentRunsList,
            profile,
            riskPolicy,
            workflowConfig,
            universe,
            memoryCards,
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
              memoryCards,
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
      agent.agent_mode !== "copycat" &&
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

    if (
      runType === "rebalance" &&
      !isCapitalDeploymentCandidate &&
      validation.violations.length > 0
    ) {
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

    const initialization =
      validationMode === "initial_build" || validationMode === "capital_deployment"
        ? await storeInitializationVersion({
            supabase,
            agent,
            userId: requestUser.id,
            proposalId: proposalRecord.id,
            proposal: result,
            validation: validatorRecord,
            source: "initial",
          })
        : null

    const evaluation = await evaluateAndStorePortfolio({
      supabase,
      agent,
      holdings: holdingsList,
      proposal: result,
      riskPolicy,
      evaluationScope:
        agent.agent_mode === "copycat"
          ? "copycat_snapshot"
          : validationMode === "initial_build" ||
              validationMode === "capital_deployment"
            ? "initial_proposal"
            : "rebalance_proposal",
      sourceRunId: runRecord.id,
      tradeProposalId: proposalRecord.id,
      initializationVersionId: initialization?.version?.id || null,
      period: "1Y",
    })

    await addMemoryCards(
      supabase,
      buildProposalMemoryCards({
        agentId: id,
        proposal: result,
        validation: validatorRecord,
        sourceRunId: runRecord.id,
        sourceTradeProposalId: proposalRecord.id,
        sourceInitializationVersionId: initialization?.version?.id || null,
      })
    )

    return NextResponse.json({
      success: true,
      result,
      run: runRecord,
      trade_proposal: proposalRecord,
      validation: validatorRecord,
      evaluation,
      initialization,
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

async function buildCopycatSnapshotProposal({
  agent,
  holdings,
}: {
  agent: Record<string, unknown>
  holdings: Array<Record<string, unknown>>
}) {
  const sourceId =
    typeof agent.copycat_source_id === "string" ? agent.copycat_source_id : null

  if (!sourceId) {
    throw new Error("Copycat agent is missing copycat_source_id.")
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("copycat_source_snapshots")
    .select("*, copycat_sources(*)")
    .eq("source_id", sourceId)
    .eq("status", "active")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapshotError || !snapshot) {
    throw new Error(
      snapshotError?.message ||
        "No active copycat snapshot is available for this source."
    )
  }

  const { data: sourceHoldings, error: holdingsError } = await supabase
    .from("copycat_source_holdings")
    .select("*")
    .eq("snapshot_id", snapshot.id)
    .order("weight", { ascending: false })

  if (holdingsError) throw new Error(holdingsError.message)

  const currentWeights = new Map(
    holdings.map((holding) => [
      String(holding.symbol || "").toUpperCase(),
      Number(holding.weight || 0),
    ])
  )
  const targetAllocation = (sourceHoldings || [])
    .map((holding) => ({
      symbol: String(holding.symbol || "").toUpperCase(),
      asset_name: holding.asset_name || null,
      asset_type: holding.asset_type || "stock",
      target_weight: roundWeight(Number(holding.weight || 0)),
    }))
    .filter((holding) => holding.symbol && holding.target_weight > 0)

  const allocatedWeight = targetAllocation.reduce(
    (sum, item) => sum + item.target_weight,
    0
  )
  const cashWeight = Math.max(0, roundWeight(100 - allocatedWeight))
  const allocationWithCash =
    cashWeight > 0
      ? [
          ...targetAllocation,
          {
            symbol: "CASH",
            asset_name: "Cash",
            asset_type: "cash",
            target_weight: cashWeight,
          },
        ]
      : targetAllocation

  const suggestedActions = targetAllocation
    .map((target) => {
      const currentWeight = currentWeights.get(target.symbol) || 0
      const delta = roundWeight(target.target_weight - currentWeight)
      if (Math.abs(delta) < 0.25) return null
      return {
        action: delta > 0 ? "BUY" : "SELL",
        symbol: target.symbol,
        asset_name: target.asset_name,
        asset_type: target.asset_type,
        current_weight: currentWeight,
        target_weight: target.target_weight,
        target_base_amount:
          Math.abs(delta) > 0
            ? roundCurrency(
                (Math.abs(delta) / 100) *
                  resolveCopycatPortfolioBaseValue(agent, holdings)
              )
            : 0,
        estimated_portfolio_pct_change: Math.abs(delta),
        rationale:
          "Align simulated portfolio with the latest active copycat source snapshot.",
      }
    })
    .filter(Boolean)

  const source = snapshot.copycat_sources || {}
  const reportingLagDays = calculateDateLagDays(snapshot.report_date)

  return {
    run_type: "copycat_snapshot",
    proposal_type: "copycat_snapshot",
    summary: `Track ${source.name || "copycat source"} using the latest active snapshot from ${snapshot.report_date}.`,
    market_summary:
      "Copycat agents use reported source holdings rather than discretionary AI stock selection.",
    risk_analysis:
      "This proposal may inherit concentration and reporting-lag risks from the tracked manager or fund.",
    source_snapshot: {
      source_id: sourceId,
      source_name: source.name || null,
      manager_name: source.manager_name || null,
      report_date: snapshot.report_date,
      effective_date: snapshot.effective_date,
      reporting_lag_days: reportingLagDays,
      source_url: snapshot.source_url || source.source_url || null,
    },
    suggested_actions: suggestedActions,
    target_allocation: allocationWithCash,
    risks: [
      "Copycat holdings can be delayed relative to the manager's current portfolio.",
      "Concentrated source portfolios may fail this agent's standard risk policy.",
      "Reported holdings may exclude cash, derivatives, shorts, or private positions.",
    ],
    key_assumptions: [
      "Latest active snapshot is the authoritative source for this run.",
      "Weights are interpreted as target portfolio weights.",
    ],
    allocation_comment:
      "The target allocation mirrors the latest active copycat snapshot and reserves residual weight as cash when holdings do not sum to 100%.",
  }
}

function resolveCopycatPortfolioBaseValue(
  agent: Record<string, unknown>,
  holdings: Array<Record<string, unknown>>
) {
  const currentValue = Number(agent.current_value || 0)
  if (Number.isFinite(currentValue) && currentValue > 0) return currentValue

  const holdingsValue = holdings.reduce(
    (sum, holding) =>
      sum + Number(holding.market_value_base || holding.market_value || 0),
    0
  )
  const cashBalance = Number(agent.cash_balance || 0)
  const totalValue = holdingsValue + cashBalance
  if (Number.isFinite(totalValue) && totalValue > 0) return totalValue

  const initialCapital = Number(agent.initial_capital || 0)
  return Number.isFinite(initialCapital) && initialCapital > 0
    ? initialCapital
    : 0
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
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

function calculateDateLagDays(dateValue: unknown) {
  if (typeof dateValue !== "string" || !dateValue) return null
  const date = new Date(`${dateValue}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  )
}

function roundWeight(value: number) {
  return Math.round(value * 10000) / 10000
}
