import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Agent,
  AgentHolding,
  RiskPolicy,
} from "../types/agent"

type EvaluationScope =
  | "current_portfolio"
  | "initial_proposal"
  | "rebalance_proposal"
  | "copycat_snapshot"

type PortfolioEvaluationInput = {
  supabase: SupabaseClient
  agent: Agent
  holdings?: AgentHolding[]
  proposal?: unknown
  riskPolicy: RiskPolicy
  evaluationScope: EvaluationScope
  sourceRunId?: string | null
  tradeProposalId?: string | null
  initializationVersionId?: string | null
  benchmarkSymbol?: string | null
  period?: string
}

type AllocationItem = {
  symbol: string
  target_weight: number
  asset_type?: string
}

type InstrumentExposure = {
  instrument_symbol: string
  instrument_name: string | null
  instrument_type: string
  underlying_symbol: string
  underlying_name: string | null
  underlying_type: string | null
  weight: number
  source: string
  as_of: string | null
  confidence: number
}

export async function evaluateAndStorePortfolio(
  input: PortfolioEvaluationInput
) {
  const evaluation = await evaluatePortfolio(input)

  try {
    const { data, error } = await input.supabase
      .from("portfolio_evaluations")
      .insert({
        agent_id: input.agent.id,
        evaluation_scope: input.evaluationScope,
        source_run_id: input.sourceRunId || null,
        trade_proposal_id: input.tradeProposalId || null,
        initialization_version_id: input.initializationVersionId || null,
        benchmark_symbol: input.benchmarkSymbol || null,
        period: input.period || "1Y",
        base_currency: input.agent.base_currency || "USD",
        metrics: evaluation.metrics,
        effective_exposures: evaluation.effective_exposures,
        overlap_warnings: evaluation.overlap_warnings,
        target_fit_score: evaluation.target_fit_score,
        target_return_probability: evaluation.target_return_probability,
        summary: evaluation.summary,
        source: evaluation.source,
      })
      .select()
      .single()

    if (error) {
      if (isMissingEvaluationTableError(error.message)) return evaluation
      throw new Error(error.message)
    }

    return {
      ...evaluation,
      id: data.id as string,
      created_at: data.created_at as string,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingEvaluationTableError(error.message)
    ) {
      return evaluation
    }
    throw error
  }
}

export async function evaluatePortfolio({
  supabase,
  agent,
  holdings = [],
  proposal,
  riskPolicy,
  evaluationScope,
}: PortfolioEvaluationInput) {
  const allocation = getAllocation({ holdings, proposal })
  const symbols = allocation
    .map((item) => item.symbol)
    .filter((symbol) => symbol !== "CASH")
  const exposures = await getInstrumentExposures(supabase, symbols)
  const effective = calculateEffectiveExposures(allocation, exposures)
  const overlapWarnings = buildOverlapWarnings({
    allocation,
    effective,
    exposures,
    riskPolicy,
  })
  const metrics = buildMetrics({
    allocation,
    effective,
    overlapWarnings,
    riskPolicy,
  })
  const targetFitScore = calculateTargetFitScore(metrics)
  const targetReturnProbability = estimateTargetReturnProbability({
    targetFitScore,
    evaluationScope,
  })

  return {
    evaluation_scope: evaluationScope,
    metrics,
    effective_exposures: effective,
    overlap_warnings: overlapWarnings,
    target_fit_score: targetFitScore,
    target_return_probability: targetReturnProbability,
    summary: buildSummary({
      agent,
      metrics,
      overlapWarnings,
      targetFitScore,
      targetReturnProbability,
      exposures,
    }),
    source: "local" as const,
  }
}

function getAllocation({
  holdings,
  proposal,
}: {
  holdings: AgentHolding[]
  proposal?: unknown
}): AllocationItem[] {
  const proposalAllocation = readProposalAllocation(proposal)
  if (proposalAllocation.length > 0) return proposalAllocation

  const holdingsAllocation = holdings.map((holding) => ({
    symbol: holding.symbol.toUpperCase(),
    target_weight: Number(holding.weight || 0),
    asset_type: holding.asset_type,
  }))
  const holdingsWeight = holdingsAllocation.reduce(
    (sum, item) => sum + item.target_weight,
    0
  )
  const cashWeight = Math.max(0, 100 - holdingsWeight)
  return [
    ...holdingsAllocation,
    { symbol: "CASH", target_weight: round(cashWeight), asset_type: "cash" },
  ]
}

function readProposalAllocation(proposal: unknown): AllocationItem[] {
  if (!isRecord(proposal) || !Array.isArray(proposal.target_allocation)) {
    return []
  }

  return proposal.target_allocation
    .flatMap((item) => {
      if (!isRecord(item)) return []
      const symbol = readString(item.symbol).toUpperCase()
      const targetWeight = Number(item.target_weight)
      if (!symbol || !Number.isFinite(targetWeight)) return []
      return [
        {
          symbol,
          target_weight: targetWeight,
          asset_type: readString(item.asset_type),
        },
      ]
    })
    .filter((item) => item.target_weight > 0)
}

async function getInstrumentExposures(
  supabase: SupabaseClient,
  symbols: string[]
) {
  if (symbols.length === 0) return [] as InstrumentExposure[]

  try {
    const { data, error } = await supabase
      .from("instrument_exposures")
      .select("*")
      .in("instrument_symbol", symbols)

    if (error) {
      if (isMissingExposureTableError(error.message)) return []
      throw new Error(error.message)
    }

    return (data || []) as InstrumentExposure[]
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingExposureTableError(error.message)
    ) {
      return []
    }
    throw error
  }
}

function calculateEffectiveExposures(
  allocation: AllocationItem[],
  exposures: InstrumentExposure[]
) {
  const directBySymbol = new Map<string, number>()
  const indirectBySymbol = new Map<string, number>()
  const exposureByInstrument = groupByInstrument(exposures)

  for (const item of allocation) {
    const symbol = item.symbol.toUpperCase()
    const targetWeight = Number(item.target_weight || 0)
    if (symbol === "CASH") continue

    directBySymbol.set(symbol, (directBySymbol.get(symbol) || 0) + targetWeight)

    for (const exposure of exposureByInstrument.get(symbol) || []) {
      const underlying = exposure.underlying_symbol.toUpperCase()
      const exposureWeight = normalizeExposureWeight(exposure.weight)
      const implied = (targetWeight * exposureWeight) / 100
      indirectBySymbol.set(
        underlying,
        (indirectBySymbol.get(underlying) || 0) + implied
      )
    }
  }

  const symbols = new Set([
    ...Array.from(directBySymbol.keys()),
    ...Array.from(indirectBySymbol.keys()),
  ])

  return Array.from(symbols)
    .map((symbol) => {
      const direct_weight = directBySymbol.get(symbol) || 0
      const indirect_weight = indirectBySymbol.get(symbol) || 0
      return {
        symbol,
        direct_weight: round(direct_weight),
        indirect_weight: round(indirect_weight),
        effective_weight: round(direct_weight + indirect_weight),
      }
    })
    .sort((a, b) => b.effective_weight - a.effective_weight)
}

function buildOverlapWarnings({
  allocation,
  effective,
  exposures,
  riskPolicy,
}: {
  allocation: AllocationItem[]
  effective: ReturnType<typeof calculateEffectiveExposures>
  exposures: InstrumentExposure[]
  riskPolicy: RiskPolicy
}) {
  const warnings = []
  const exposureByUnderlying = new Map<string, InstrumentExposure[]>()
  for (const exposure of exposures) {
    const key = exposure.underlying_symbol.toUpperCase()
    exposureByUnderlying.set(key, [
      ...(exposureByUnderlying.get(key) || []),
      exposure,
    ])
  }

  for (const item of effective) {
    if (item.direct_weight > 0 && item.indirect_weight > 0) {
      warnings.push({
        type: "direct_etf_overlap",
        severity:
          item.effective_weight > riskPolicy.max_single_stock_pct
            ? "high"
            : "medium",
        symbol: item.symbol,
        message: `${item.symbol} has direct weight ${item.direct_weight}% plus ETF-implied weight ${item.indirect_weight}%, for effective exposure ${item.effective_weight}%.`,
        source_instruments: (exposureByUnderlying.get(item.symbol) || []).map(
          (exposure) => exposure.instrument_symbol
        ),
      })
    }

    if (item.effective_weight > riskPolicy.max_single_stock_pct) {
      warnings.push({
        type: "effective_concentration",
        severity: "high",
        symbol: item.symbol,
        message: `${item.symbol} effective exposure ${item.effective_weight}% exceeds the single-position policy ${riskPolicy.max_single_stock_pct}%.`,
      })
    }
  }

  const etfsWithoutLookthrough = allocation
    .filter((item) => isLikelyEtf(item))
    .filter(
      (item) =>
        !exposures.some(
          (exposure) =>
            exposure.instrument_symbol.toUpperCase() === item.symbol
        )
    )
    .map((item) => item.symbol)

  if (etfsWithoutLookthrough.length > 0) {
    warnings.push({
      type: "missing_etf_lookthrough",
      severity: "low",
      symbols: etfsWithoutLookthrough,
      message: `No ETF look-through data is stored for ${etfsWithoutLookthrough.join(", ")} yet, so overlap risk may be understated.`,
    })
  }

  return warnings
}

function buildMetrics({
  allocation,
  effective,
  overlapWarnings,
  riskPolicy,
}: {
  allocation: AllocationItem[]
  effective: ReturnType<typeof calculateEffectiveExposures>
  overlapWarnings: unknown[]
  riskPolicy: RiskPolicy
}) {
  const cashWeight =
    allocation.find((item) => item.symbol === "CASH")?.target_weight || 0
  const largestEffectiveExposure = effective[0]?.effective_weight || 0
  const riskWarnings = overlapWarnings.filter((warning) => {
    return isRecord(warning) && warning.severity === "high"
  }).length

  return {
    cash_weight: round(cashWeight),
    cash_policy_pass:
      cashWeight >= riskPolicy.min_cash_pct &&
      cashWeight <= riskPolicy.max_cash_pct,
    largest_effective_exposure: round(largestEffectiveExposure),
    concentration_policy_pass:
      largestEffectiveExposure <= riskPolicy.max_single_stock_pct,
    overlap_warning_count: overlapWarnings.length,
    high_risk_warning_count: riskWarnings,
    historical_return_status: "not_available",
    historical_return_note:
      "Historical return evaluation requires cached daily price history for proposal symbols.",
  }
}

function calculateTargetFitScore(metrics: Record<string, unknown>) {
  let score = 100
  if (!metrics.cash_policy_pass) score -= 20
  if (!metrics.concentration_policy_pass) score -= 25
  score -= Number(metrics.overlap_warning_count || 0) * 5
  score -= Number(metrics.high_risk_warning_count || 0) * 10
  return Math.max(0, Math.min(100, Math.round(score)))
}

function estimateTargetReturnProbability({
  targetFitScore,
}: {
  targetFitScore: number
  evaluationScope: EvaluationScope
}) {
  if (targetFitScore >= 90) return 0.65
  if (targetFitScore >= 75) return 0.55
  if (targetFitScore >= 60) return 0.45
  return 0.35
}

function buildSummary({
  agent,
  metrics,
  overlapWarnings,
  targetFitScore,
  targetReturnProbability,
  exposures,
}: {
  agent: Agent
  metrics: Record<string, unknown>
  overlapWarnings: unknown[]
  targetFitScore: number
  targetReturnProbability: number
  exposures: InstrumentExposure[]
}) {
  const overlapText =
    overlapWarnings.length > 0
      ? `${overlapWarnings.length} overlap/concentration warning(s) found`
      : "no overlap warnings found"
  const lookthroughText =
    exposures.length > 0
      ? `${exposures.length} ETF look-through rows used`
      : "no ETF look-through data available"

  return `${agent.name} evaluation score ${targetFitScore}/100; target return fit estimate ${Math.round(targetReturnProbability * 100)}%; ${overlapText}; ${lookthroughText}; cash ${metrics.cash_weight}%.`
}

function groupByInstrument(exposures: InstrumentExposure[]) {
  const groups = new Map<string, InstrumentExposure[]>()
  for (const exposure of exposures) {
    const key = exposure.instrument_symbol.toUpperCase()
    groups.set(key, [...(groups.get(key) || []), exposure])
  }
  return groups
}

function normalizeExposureWeight(weight: number) {
  const numeric = Number(weight || 0)
  if (numeric > 0 && numeric <= 1) return numeric * 100
  return numeric
}

function isLikelyEtf(item: AllocationItem) {
  const assetType = String(item.asset_type || "").toLowerCase()
  if (assetType.includes("etf") || assetType.includes("fund")) return true
  return [
    "SPY",
    "VOO",
    "VTI",
    "QQQ",
    "KWEB",
    "CQQQ",
    "CHIH",
    "GLD",
    "XLE",
    "ICLN",
  ].includes(item.symbol)
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function round(value: number) {
  return Math.round(value * 10000) / 10000
}

function isMissingExposureTableError(message: string) {
  return (
    message.includes("instrument_exposures") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}

function isMissingEvaluationTableError(message: string) {
  return (
    message.includes("portfolio_evaluations") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
