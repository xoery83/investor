import type {
  Agent,
  AgentHolding,
  AgentProfile,
  RiskPolicy,
} from "../types/agent"

export type PortfolioWorkflow =
  | "manual_reduce_concentration"
  | "deploy_excess_cash"
  | "normal_rebalance"

export type PortfolioDiagnostic = {
  workflow: PortfolioWorkflow
  summary: string
  cash_weight: number
  deployable_cash_amount: number
  deployable_cash_pct: number
  manual_required: boolean
  manual_actions: string[]
  issues: string[]
  prompt_instruction: string
}

export function diagnosePortfolio({
  agent,
  holdings,
  profile,
  riskPolicy,
}: {
  agent: Agent
  holdings: AgentHolding[]
  profile: AgentProfile
  riskPolicy: RiskPolicy
}): PortfolioDiagnostic {
  const totalValue = Number(agent.current_value || 0)
  const cashBalance = Number(agent.cash_balance || 0)
  const cashWeight =
    totalValue > 0
      ? roundWeight((cashBalance / totalValue) * 100)
      : inferCashWeight(holdings)
  const maxCashPct = Number(riskPolicy.max_cash_pct || 25)
  const maxSingleStockPct = Number(riskPolicy.max_single_stock_pct || 20)
  const overweightHoldings = holdings
    .filter(
      (holding) =>
        !isLikelyETF(holding) &&
        Number(holding.weight || 0) > maxSingleStockPct
    )
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
  const deployableCashPct = Math.max(0, roundWeight(cashWeight - maxCashPct))
  const deployableCashAmount = roundCurrency(
    totalValue > 0 ? (deployableCashPct / 100) * totalValue : 0
  )
  const issues: string[] = []

  if (cashWeight > maxCashPct) {
    issues.push(
      `Cash weight ${cashWeight}% is above max cash policy ${maxCashPct}%.`
    )
  }

  for (const holding of overweightHoldings) {
    issues.push(
      `${holding.symbol.toUpperCase()} weight ${roundWeight(Number(holding.weight || 0))}% is above single-stock policy ${maxSingleStockPct}%.`
    )
  }

  if (overweightHoldings.length > 0) {
    const manualActions = overweightHoldings.map((holding) => {
      const reductionPct = roundWeight(
        Number(holding.weight || 0) - maxSingleStockPct
      )
      const reductionAmount = roundCurrency((reductionPct / 100) * totalValue)
      return `Manually reduce ${holding.symbol.toUpperCase()} by about ${formatCurrency(reductionAmount)} (${reductionPct}% of portfolio) before automated deployment.`
    })

    return {
      workflow: "manual_reduce_concentration",
      summary:
        "Single-position concentration is outside policy and should be manually reduced before automated portfolio construction.",
      cash_weight: cashWeight,
      deployable_cash_amount: deployableCashAmount,
      deployable_cash_pct: deployableCashPct,
      manual_required: true,
      manual_actions: manualActions,
      issues,
      prompt_instruction: `The current portfolio has single-stock concentration above policy. Do not pretend the portfolio can be automatically fixed in one run. Output a structured recommendation that asks the manager to manually reduce the overweight position first. You may describe a future deployment plan for excess cash after that manual action, using target markets ${profile.target_markets.join(", ")} and allowed assets ${profile.allowed_assets.join(", ")}.`,
    }
  }

  if (cashWeight > maxCashPct) {
    return {
      workflow: "deploy_excess_cash",
      summary:
        "Cash is above policy; recommend a new portfolio sleeve to deploy excess cash into allowed markets and assets.",
      cash_weight: cashWeight,
      deployable_cash_amount: deployableCashAmount,
      deployable_cash_pct: deployableCashPct,
      manual_required: false,
      manual_actions: [],
      issues,
      prompt_instruction: `The current portfolio has too much cash. Recommend a concrete new holdings sleeve for approximately ${formatCurrency(deployableCashAmount)} (${deployableCashPct}% of portfolio) using the agent's target markets and allowed assets. Prefer diversified ETFs plus selected high-quality stocks when appropriate. Do not leave excess cash idle.`,
    }
  }

  return {
    workflow: "normal_rebalance",
    summary:
      "Portfolio is not materially blocked by cash or concentration policy; run a normal rebalance review.",
    cash_weight: cashWeight,
    deployable_cash_amount: 0,
    deployable_cash_pct: 0,
    manual_required: false,
    manual_actions: [],
    issues,
    prompt_instruction:
      "Run a normal portfolio review. Only recommend trades when they clearly improve risk-adjusted positioning.",
  }
}

function inferCashWeight(holdings: AgentHolding[]) {
  const holdingsWeight = holdings.reduce(
    (sum, holding) => sum + Number(holding.weight || 0),
    0
  )
  return roundWeight(Math.max(0, 100 - holdingsWeight))
}

function isLikelyETF(holding: AgentHolding) {
  const assetType = String(holding.asset_type || "").toLowerCase()
  if (assetType.includes("etf") || assetType.includes("fund")) return true

  return [
    "VOO",
    "VTI",
    "SPY",
    "QQQ",
    "VGT",
    "DIA",
    "IWM",
    "GLD",
    "TLT",
    "BND",
    "KWEB",
    "CQQQ",
    "MCHI",
    "FXI",
    "ASHR",
  ].includes(holding.symbol.toUpperCase())
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}
