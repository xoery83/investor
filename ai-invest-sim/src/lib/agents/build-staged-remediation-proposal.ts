import type {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
} from "../types/agent"
import type { PortfolioDiagnostic } from "./diagnose-portfolio"
import { getUniverseBuyCandidates } from "./investment-universe"
import { formatCurrencyAmount } from "../format/currency"

type DraftAction = {
  action: "buy" | "sell"
  symbol: string
  asset_type: "stock" | "etf"
  reason: string
  current_weight: number
  target_weight: number
  estimated_portfolio_pct_change: number
}

const DEFAULT_ETF_CANDIDATES = ["VOO", "QQQ", "VTI", "VGT"]
const CHINA_TECH_CANDIDATES = [
  "KWEB",
  "CQQQ",
  "3067.HK",
  "3033.HK",
  "9988.HK",
  "0700.HK",
]
const AUSTRALIA_ETF_CANDIDATES = [
  "VAS.AX",
  "A200.AX",
  "IOZ.AX",
  "VHY.AX",
  "GOLD.AX",
]

export function buildStagedRemediationProposal({
  agent,
  holdings,
  profile,
  riskPolicy,
  universe,
}: {
  agent: Agent
  holdings: AgentHolding[]
  profile: AgentProfile
  riskPolicy: RiskPolicy
  universe?: AgentInvestmentUniverse | null
}) {
  const maxOneTrade = Number(riskPolicy.max_one_trade_pct || 10)
  const maxTurnover = Number(riskPolicy.max_weekly_turnover_pct || 15)
  const maxCash = Number(riskPolicy.max_cash_pct || 25)
  const currentCashWeight = getCurrentCashWeight(agent, holdings)
  const targetWeights = buildCurrentWeights(agent, holdings)
  const actions: DraftAction[] = []
  const primaryOverweight = holdings
    .filter(
      (holding) =>
        !isETF(holding.symbol) &&
        Number(holding.weight || 0) > Number(riskPolicy.max_single_stock_pct)
    )
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))[0]

  let remainingTurnover = maxTurnover
  const cashOverweight = Math.max(0, currentCashWeight - maxCash)

  if (primaryOverweight) {
    const sellSize = roundWeight(
      Math.min(
        Number(primaryOverweight.weight) - Number(riskPolicy.max_single_stock_pct),
        maxOneTrade,
        Math.max(0, maxTurnover * 0.25)
      )
    )

    if (sellSize > 0) {
      const symbol = primaryOverweight.symbol.toUpperCase()
      const currentWeight = Number(primaryOverweight.weight || 0)
      const targetWeight = roundWeight(currentWeight - sellSize)

      targetWeights.set(symbol, targetWeight)
      remainingTurnover = roundWeight(remainingTurnover - sellSize)
      actions.push({
        action: "sell",
        symbol,
        asset_type: "stock",
        reason:
          "Reduce an existing overweight single-stock position as the first step toward the concentration limit.",
        current_weight: roundWeight(currentWeight),
        target_weight: targetWeight,
        estimated_portfolio_pct_change: sellSize,
      })
    }
  }

  if (cashOverweight > 0 && remainingTurnover > 0) {
    const cashReduction = roundWeight(Math.min(cashOverweight, remainingTurnover))
    addBuyActions({
      totalBuyWeight: cashReduction,
      actions,
      targetWeights,
      profile,
      universe,
    })
    targetWeights.set(
      "CASH",
      roundWeight(Number(targetWeights.get("CASH") || 0) - cashReduction)
    )
    remainingTurnover = roundWeight(remainingTurnover - cashReduction)
  }

  if (
    primaryOverweight &&
    actions.some((action) => action.action === "sell") &&
    remainingTurnover > 0
  ) {
    const sellAction = actions.find((action) => action.action === "sell")
    const sellProceeds = sellAction?.estimated_portfolio_pct_change || 0
    const buyWeight = roundWeight(Math.min(sellProceeds, remainingTurnover, maxOneTrade))

    if (buyWeight > 0) {
      addBuyActions({
        totalBuyWeight: buyWeight,
        actions,
        targetWeights,
        profile,
        universe,
        reason:
          "Redeploy proceeds from trimming concentration into diversified exposure instead of leaving cash idle.",
      })
      targetWeights.set(
        "CASH",
        roundWeight(Number(targetWeights.get("CASH") || 0) - buyWeight + sellProceeds)
      )
    }
  }

  const targetAllocation = normalizeAllocation([...targetWeights.entries()])
  const cashTarget =
    targetAllocation.find((item) => item.symbol === "CASH")?.target_weight ??
    currentCashWeight
  const concentrationGap = primaryOverweight
    ? Math.max(
        0,
        Number(targetWeights.get(primaryOverweight.symbol.toUpperCase()) || 0) -
          Number(riskPolicy.max_single_stock_pct)
      )
    : 0

  return {
    summary:
      "Stage the portfolio back toward policy compliance with a bounded rebalance.",
    market_view:
      "No external market view is required for this fallback remediation step; the priority is correcting portfolio risk drift.",
    portfolio_diagnosis:
      "The current portfolio cannot fully satisfy cash and concentration policy in a single rebalance without breaching trade-size or turnover limits.",
    risks: [
      "Portfolio remains partially outside policy until the staged remediation is completed.",
      "Market movement may change weights before the next step.",
    ],
    requires_rebalance: true,
    no_trade_reason: null,
    suggested_actions: actions,
    target_allocation: targetAllocation,
    staged_remediation_plan: [
      {
        step: 1,
        goal:
          "Use the current rebalance to reduce the largest policy gaps while staying inside one-trade and weekly turnover limits.",
        actions: actions.map(
          (action) =>
            `${action.action.toUpperCase()} ${action.symbol} to ${action.target_weight}%`
        ),
        expected_policy_gap_after_step:
          concentrationGap > 0 || cashTarget > maxCash
            ? `Cash target ${cashTarget}%; largest concentration gap ${roundWeight(concentrationGap)}%.`
            : "Portfolio should be materially closer to policy compliance.",
      },
      {
        step: 2,
        goal:
          "Re-run the agent after this rebalance settles and continue reducing any remaining cash or concentration gap.",
        actions: ["Generate the next bounded rebalance proposal."],
        expected_policy_gap_after_step:
          "Remaining gaps should continue falling without exceeding trade limits.",
      },
    ],
    allocation_comment:
      "This deterministic fallback is used because the model did not return a usable structured rebalance. It prioritizes policy improvement over full immediate compliance.",
    confidence: "medium",
    generated_by: "system_staged_remediation_fallback",
  }
}

export function buildManualInterventionProposal({
  diagnostic,
}: {
  diagnostic: PortfolioDiagnostic
}) {
  return {
    summary: diagnostic.summary,
    market_view:
      "This run is blocked by a portfolio policy breach that should be handled manually before automated allocation advice.",
    portfolio_diagnosis: diagnostic.issues.join(" ") || diagnostic.summary,
    risks: [
      "Automated deployment may compound an existing concentration problem if performed before manual reduction.",
      "The portfolio remains outside policy until the manual action is completed.",
    ],
    workflow: diagnostic.workflow,
    manual_required: true,
    manual_actions: diagnostic.manual_actions,
    requires_rebalance: false,
    no_trade_reason:
      "Manual concentration reduction is required before the automated agent should propose new deployment trades.",
    suggested_actions: [],
    target_allocation: [],
    staged_remediation_plan: [
      {
        step: 1,
        goal: "Manually reduce the overweight single-stock position to policy limits.",
        actions: diagnostic.manual_actions,
        expected_policy_gap_after_step:
          "Single-stock concentration should be at or below the configured maximum before the next automated run.",
      },
      {
        step: 2,
        goal:
          "Run the agent again to deploy excess cash into a diversified target-market portfolio.",
        actions: [
          "Generate an excess-cash deployment proposal after concentration is manually corrected.",
        ],
        expected_policy_gap_after_step:
          diagnostic.deployable_cash_amount > 0
            ? `Approximately ${formatCurrency(
                diagnostic.deployable_cash_amount,
                diagnostic.base_currency
              )} may be deployable after the manual step, subject to updated prices and cash balance.`
            : "The next run should proceed to normal rebalance review.",
      },
    ],
    allocation_comment:
      "The local workflow router selected a manual prerequisite because one or more single-stock positions are above policy. This avoids using the model to paper over a risk issue that requires manager action.",
    confidence: "high",
    generated_by: "system_manual_intervention_router",
  }
}

function addBuyActions({
  totalBuyWeight,
  actions,
  targetWeights,
  profile,
  universe,
  reason = "Deploy excess cash into diversified allowed exposure while respecting trade-size limits.",
}: {
  totalBuyWeight: number
  actions: DraftAction[]
  targetWeights: Map<string, number>
  profile: AgentProfile
  universe?: AgentInvestmentUniverse | null
  reason?: string
}) {
  const candidates = getUniverseBuyCandidates(universe)
  const fallbackCandidates = candidates.length > 0 ? candidates : getETFBuyCandidates(profile)
  let remaining = totalBuyWeight

  for (const symbol of fallbackCandidates) {
    if (remaining <= 0) break
    const buyWeight = roundWeight(Math.min(remaining, 10))
    const currentWeight = Number(targetWeights.get(symbol) || 0)
    const targetWeight = roundWeight(currentWeight + buyWeight)

    targetWeights.set(symbol, targetWeight)
    actions.push({
      action: "buy",
      symbol,
      asset_type: "etf",
      reason,
      current_weight: roundWeight(currentWeight),
      target_weight: targetWeight,
      estimated_portfolio_pct_change: buyWeight,
    })
    remaining = roundWeight(remaining - buyWeight)
  }
}

function getETFBuyCandidates(profile: AgentProfile) {
  const sourceText = [
    ...profile.allowed_assets,
    ...profile.target_markets,
    profile.objective,
    profile.manager_instructions || "",
  ]
    .join(" ")
    .toUpperCase()

  if (sourceText.includes("AUSTRALIA") || sourceText.includes("AUSTRALIAN")) {
    return AUSTRALIA_ETF_CANDIDATES.filter((symbol) => {
      if (symbol === "GOLD.AX" && !sourceText.includes("GOLD")) return false
      if (symbol === "VHY.AX" && !sourceText.includes("DIVIDEND") && !sourceText.includes("INCOME")) {
        return false
      }
      return true
    })
  }

  if (isChinaTechProfile(sourceText)) {
    return CHINA_TECH_CANDIDATES
  }

  return DEFAULT_ETF_CANDIDATES.filter((symbol) => {
    if (symbol === "VGT" && !sourceText.includes("TECH")) return false
    return true
  })
}

function isChinaTechProfile(sourceText: string) {
  const hasChinaScope =
    sourceText.includes("CHINA") ||
    sourceText.includes("CHINESE") ||
    sourceText.includes("HONG KONG") ||
    sourceText.includes("HK") ||
    sourceText.includes("中国") ||
    sourceText.includes("香港")
  const hasTechScope =
    sourceText.includes("TECH") ||
    sourceText.includes("INTERNET") ||
    sourceText.includes("科技") ||
    sourceText.includes("互联网")

  return hasChinaScope && hasTechScope
}

function buildCurrentWeights(agent: Agent, holdings: AgentHolding[]) {
  const weights = new Map<string, number>()
  for (const holding of holdings) {
    weights.set(holding.symbol.toUpperCase(), roundWeight(Number(holding.weight || 0)))
  }
  weights.set("CASH", getCurrentCashWeight(agent, holdings))
  return weights
}

function normalizeAllocation(entries: Array<[string, number]>) {
  const allocations = entries
    .filter(([, value]) => value > 0)
    .map(([symbol, value]) => ({
      symbol,
      target_weight: roundWeight(value),
    }))

  const total = roundWeight(
    allocations.reduce((sum, item) => sum + item.target_weight, 0)
  )
  const cash = allocations.find((item) => item.symbol === "CASH")

  if (cash && total !== 100) {
    cash.target_weight = roundWeight(cash.target_weight + (100 - total))
  }

  return allocations
}

function getCurrentCashWeight(agent: Agent, holdings: AgentHolding[]) {
  const totalValue = Number(agent.current_value || 0)
  if (totalValue > 0) {
    return roundWeight((Number(agent.cash_balance || 0) / totalValue) * 100)
  }

  const holdingsWeight = holdings.reduce(
    (sum, holding) => sum + Number(holding.weight || 0),
    0
  )
  return roundWeight(Math.max(0, 100 - holdingsWeight))
}

function isETF(symbol: string) {
  return ["VOO", "VTI", "SPY", "QQQ", "VGT", "DIA", "IWM", "GLD", "TLT", "BND"].includes(
    symbol.toUpperCase()
  )
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100
}

function formatCurrency(value: number, currency: string) {
  return formatCurrencyAmount(value, currency, {
    maximumFractionDigits: 0,
  })
}
