import type { SupabaseClient } from "@supabase/supabase-js"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "./default-config"
import type {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentProfile,
  AgentRun,
  RiskPolicy,
  TradeProposalWithValidation,
  WorkflowConfig,
} from "../types/agent"

export type PublicationReadinessCheck = {
  key: string
  label: string
  passed: boolean
  severity: "blocker" | "warning"
  message: string
}

export type PublicationReadiness = {
  ready: boolean
  status: "ready" | "blocked"
  checks: PublicationReadinessCheck[]
  blockers: string[]
  warnings: string[]
}

export async function validateAgentPublicationReadiness({
  supabase,
  agent,
}: {
  supabase: SupabaseClient
  agent: Agent | Record<string, unknown>
}): Promise<PublicationReadiness> {
  const agentId = String(agent.id || "")

  const [
    profileResult,
    riskPolicyResult,
    workflowResult,
    universeResult,
    holdingsResult,
    latestRunResult,
    latestProposalResult,
  ] = await Promise.all([
    supabase
      .from("agent_profiles")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle(),
    supabase
      .from("risk_policies")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle(),
    supabase
      .from("workflow_configs")
      .select("*")
      .eq("agent_id", agentId)
      .maybeSingle(),
    supabase
      .from("agent_investment_universes")
      .select("*")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("agent_holdings")
      .select("*")
      .eq("agent_id", agentId),
    supabase
      .from("agent_runs")
      .select("*")
      .eq("agent_id", agentId)
      .eq("run_type", "rebalance")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("trade_proposals")
      .select("*, validator_results(*)")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const profile = (profileResult.data ||
    defaultAgentProfile(agentId)) as AgentProfile
  const riskPolicy = (riskPolicyResult.data ||
    defaultRiskPolicy(agentId)) as RiskPolicy
  const workflow = (workflowResult.data ||
    defaultWorkflowConfig(agentId)) as WorkflowConfig
  const universe = universeResult.data as AgentInvestmentUniverse | null
  const holdings = ((holdingsResult as { data?: unknown }).data ||
    []) as AgentHolding[]
  const latestRun = latestRunResult.data as AgentRun | null
  const latestProposal =
    latestProposalResult.data as TradeProposalWithValidation | null

  const checks: PublicationReadinessCheck[] = []
  const addCheck = (
    key: string,
    label: string,
    passed: boolean,
    message: string,
    severity: "blocker" | "warning" = "blocker"
  ) => {
    checks.push({ key, label, passed, severity, message })
  }

  addCheck(
    "basic_profile",
    "Basic profile",
    Boolean(
      stringValue(agent.name) &&
        stringValue(agent.description) &&
        stringValue(agent.philosophy)
    ),
    "Agent needs name, description, and investment philosophy before publication."
  )

  addCheck(
    "target_markets",
    "Target markets",
    arrayValue(profile.target_markets).length > 0,
    "Investment profile must define target markets."
  )

  addCheck(
    "allowed_assets",
    "Allowed assets",
    arrayValue(profile.allowed_assets).length > 0,
    "Investment profile must define allowed asset classes."
  )

  addCheck(
    "return_risk_objective",
    "Return and drawdown objective",
    numberValue(profile.target_annual_return_min) > 0 &&
      numberValue(profile.target_annual_return_max) >=
        numberValue(profile.target_annual_return_min) &&
      numberValue(profile.max_drawdown_pct) > 0,
    "Return target and maximum drawdown must be configured coherently."
  )

  addCheck(
    "risk_limits",
    "Risk policy limits",
    numberValue(riskPolicy.max_cash_pct) > 0 &&
      numberValue(riskPolicy.max_single_stock_pct) > 0 &&
      numberValue(riskPolicy.max_one_trade_pct) > 0 &&
      numberValue(riskPolicy.max_weekly_turnover_pct) > 0 &&
      numberValue(riskPolicy.max_drawdown_pct) > 0,
    "Cash, concentration, trade-size, turnover, and drawdown limits are required."
  )

  addCheck(
    "risk_validator",
    "Risk validator",
    workflow.validator_enabled === true,
    "Risk validator must be enabled before publication."
  )

  addCheck(
    "investment_universe",
    "Investment universe",
    Boolean(universe && universeSymbols(universe).size > 0),
    "Agent needs an active investment universe with investable symbols."
  )

  if (universe) {
    addCheck(
      "universe_scope",
      "Universe scope",
      universeMatchesTargetMarkets(universe, profile),
      "Investment universe appears inconsistent with the target market scope."
    )
  }

  const totalValue = portfolioTotalValue(agent, holdings)
  const cashWeight = totalValue > 0
    ? (numberValue(agent.cash_balance) / totalValue) * 100
    : 100

  addCheck(
    "cash_policy",
    "Cash policy",
    totalValue > 0 && cashWeight <= numberValue(riskPolicy.max_cash_pct),
    `Cash weight ${formatPct(cashWeight)} must be at or below max cash policy ${formatPct(
      numberValue(riskPolicy.max_cash_pct)
    )}.`
  )

  const maxSingleWeight = holdings.reduce(
    (max, holding) => Math.max(max, numberValue(holding.weight)),
    0
  )
  addCheck(
    "concentration_policy",
    "Concentration policy",
    maxSingleWeight <= numberValue(riskPolicy.max_single_stock_pct),
    `Largest holding ${formatPct(
      maxSingleWeight
    )} must be at or below single-position limit ${formatPct(
      numberValue(riskPolicy.max_single_stock_pct)
    )}.`
  )

  if (universe && holdings.length > 0) {
    const allowedSymbols = universeSymbols(universe)
    const outOfUniverse = holdings.filter(
      (holding) => !allowedSymbols.has(String(holding.symbol || "").toUpperCase())
    )
    addCheck(
      "holdings_in_universe",
      "Holdings in universe",
      outOfUniverse.length === 0,
      `Holdings must belong to the active investment universe. Out of scope: ${outOfUniverse
        .map((holding) => holding.symbol)
        .join(", ")}.`
    )
  }

  const successfulRebalance =
    latestRun?.status === "completed" || latestRun?.status === "success"
  addCheck(
    "successful_rebalance",
    "Successful rebalance run",
    successfulRebalance,
    "At least one successful rebalance run is required before publication."
  )

  const proposalApproved =
    latestProposal?.validator_status === "approved" ||
    latestProposal?.status === "approved" ||
    Boolean(
      latestProposal?.validator_results?.some(
        (result) =>
          result.final_action_allowed &&
          result.validation_status === "approved"
      )
    )

  addCheck(
    "risk_approved_proposal",
    "Risk-approved proposal",
    proposalApproved,
    "Latest trade proposal must pass risk validation before publication."
  )

  const blockers = checks
    .filter((check) => !check.passed && check.severity === "blocker")
    .map((check) => check.message)
  const warnings = checks
    .filter((check) => !check.passed && check.severity === "warning")
    .map((check) => check.message)

  return {
    ready: blockers.length === 0,
    status: blockers.length === 0 ? "ready" : "blocked",
    checks,
    blockers,
    warnings,
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function arrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function numberValue(value: unknown) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function portfolioTotalValue(
  agent: Agent | Record<string, unknown>,
  holdings: AgentHolding[]
) {
  const holdingsValue = holdings.reduce(
    (sum, holding) => sum + numberValue(holding.market_value),
    0
  )
  return numberValue(agent.cash_balance) + holdingsValue
}

function universeSymbols(universe: AgentInvestmentUniverse) {
  return new Set(
    [
      ...arrayValue(universe.core_etfs),
      ...arrayValue(universe.core_stocks),
      ...arrayValue(universe.watchlist),
    ].map((symbol) => symbol.toUpperCase())
  )
}

function universeMatchesTargetMarkets(
  universe: AgentInvestmentUniverse,
  profile: AgentProfile
) {
  const targetMarkets = arrayValue(profile.target_markets)
  const marketScope = arrayValue(universe.market_scope)

  if (targetMarkets.length === 0 || marketScope.length === 0) return false

  const targetText = targetMarkets.join(" ").toLowerCase()
  const scopeText = marketScope.join(" ").toLowerCase()

  if (containsUsMarket(targetText)) return containsUsMarket(scopeText)
  if (targetText.includes("australia")) {
    return scopeText.includes("australia") || scopeText.includes("asx")
  }
  if (
    targetText.includes("china") ||
    targetText.includes("hong kong") ||
    targetText.includes("hk")
  ) {
    return (
      scopeText.includes("china") ||
      scopeText.includes("hong kong") ||
      scopeText.includes("hk") ||
      scopeText.includes("adr")
    )
  }

  return targetMarkets.some((market) => {
    const normalized = market.toLowerCase()
    return normalized && scopeText.includes(normalized)
  })
}

function containsUsMarket(value: string) {
  return (
    value.includes("united states") ||
    value.includes("us ") ||
    value === "us" ||
    value.includes("usa") ||
    value.includes("america")
  )
}

function formatPct(value: number) {
  return `${round(value)}%`
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
