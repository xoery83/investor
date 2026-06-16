import type {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
} from "../types/agent"
import { getUniverseSymbols } from "./investment-universe"

type ProposalRecord = Record<string, unknown>

type AllocationLike = {
  symbol: string
  target_weight: number
  asset_type?: string
}

type ActionLike = {
  action: string
  symbol: string
  target_weight?: number
  current_weight?: number
  estimated_portfolio_pct_change?: number
  asset_type?: string
}

export type LocalValidationResult = {
  validation_status: "approved" | "human_review_required"
  final_action_allowed: boolean
  violations: string[]
  result: {
    checked_at: string
    target_weight_sum: number
    cash_weight: number
    current_cash_weight: number
    residual_policy_gaps: string[]
    rule_summary: Record<string, number>
  }
}

const ETF_SYMBOLS = new Set([
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
])

const BROAD_US_ETFS = new Set([
  "VOO",
  "VTI",
  "SPY",
  "QQQ",
  "VGT",
  "DIA",
  "IWM",
])

const CHINA_TECH_US_SYMBOLS = new Set([
  "KWEB",
  "CQQQ",
  "BABA",
  "JD",
  "BIDU",
  "PDD",
  "NTES",
  "TME",
  "LI",
  "NIO",
  "XPEV",
])

export function validateTradeProposal({
  agent,
  proposal,
  holdings,
  riskPolicy,
  profile,
  universe,
  validationMode = "rebalance",
}: {
  agent: Agent
  proposal: unknown
  holdings: AgentHolding[]
  riskPolicy: RiskPolicy
  profile?: AgentProfile
  universe?: AgentInvestmentUniverse | null
  validationMode?: "rebalance" | "initial_build" | "capital_deployment"
}): LocalValidationResult {
  const record = isRecord(proposal) ? proposal : {}
  const manualRequired = record.manual_required === true
  const skipUniverseScopeCheck =
    record.proposal_type === "copycat_snapshot" || agent.agent_mode === "copycat"
  const targetAllocation = readAllocation(record.target_allocation)
  const suggestedActions = readActions(record.suggested_actions)
  const violations: string[] = []
  const residualPolicyGaps: string[] = []
  const currentCashWeight = getCurrentCashWeight(agent, holdings)
  const currentWeights = new Map(
    holdings.map((holding) => [
      holding.symbol.toUpperCase(),
      Number(holding.weight || 0),
    ])
  )

  if (manualRequired) {
    return {
      validation_status: "human_review_required",
      final_action_allowed: false,
      violations: [],
      result: {
        checked_at: new Date().toISOString(),
        target_weight_sum: 0,
        cash_weight: currentCashWeight,
        current_cash_weight: currentCashWeight,
        residual_policy_gaps: ["Manual prerequisite required before automation."],
        rule_summary: {
          min_cash_pct: Number(riskPolicy.min_cash_pct),
          max_cash_pct: Number(riskPolicy.max_cash_pct),
          max_single_stock_pct: Number(riskPolicy.max_single_stock_pct),
          max_etf_pct: Number(riskPolicy.max_etf_pct),
          max_one_trade_pct: Number(riskPolicy.max_one_trade_pct),
          max_weekly_turnover_pct: Number(riskPolicy.max_weekly_turnover_pct),
        },
      },
    }
  }

  if (targetAllocation.length === 0 && suggestedActions.length === 0) {
    violations.push("No target allocation or suggested actions were provided.")
  }

  const outOfMarketSymbols = skipUniverseScopeCheck
    ? []
    : getOutOfMarketSymbols({
        targetAllocation,
        suggestedActions,
        currentWeights,
        profile,
        universe,
      })

  if (outOfMarketSymbols.length > 0) {
    violations.push(
      `Symbols outside the configured target market were proposed: ${outOfMarketSymbols.join(", ")}.`
    )
  }

  const allocationSource =
    targetAllocation.length > 0 ? targetAllocation : actionsToAllocation(suggestedActions, holdings)
  const targetWeightSum = roundWeight(
    allocationSource.reduce((sum, item) => sum + item.target_weight, 0)
  )
  const cashWeight =
    allocationSource.find((item) => item.symbol.toUpperCase() === "CASH")
      ?.target_weight ?? Math.max(0, roundWeight(100 - targetWeightSum))

  if (allocationSource.length === 0) {
    violations.push("No target allocation or suggested actions were provided.")
  }

  if (targetWeightSum > 100.5) {
    violations.push(`Target allocation sums to ${targetWeightSum}%, above 100%.`)
  }

  if (cashWeight < Number(riskPolicy.min_cash_pct)) {
    violations.push(
      `Cash target ${cashWeight}% is below the minimum ${riskPolicy.min_cash_pct}%.`
    )
  }

  if (cashWeight > Number(riskPolicy.max_cash_pct)) {
    if (currentCashWeight > Number(riskPolicy.max_cash_pct)) {
      if (cashWeight >= currentCashWeight) {
        violations.push(
          `Cash target ${cashWeight}% does not reduce the existing overweight cash position ${currentCashWeight}%.`
        )
      } else {
        residualPolicyGaps.push(
          `Cash remains above policy at ${cashWeight}%, but improves from ${currentCashWeight}%.`
        )
      }
    } else {
      violations.push(
        `Cash target ${cashWeight}% is above the maximum ${riskPolicy.max_cash_pct}%.`
      )
    }
  }

  for (const item of allocationSource) {
    const symbol = item.symbol.toUpperCase()
    if (symbol === "CASH") continue

    const isEtf = isETF(item)
    const maxWeight = isEtf
      ? Number(riskPolicy.max_etf_pct)
      : Number(riskPolicy.max_single_stock_pct)

    if (item.target_weight > maxWeight) {
      const currentWeight = currentWeights.get(symbol) ?? 0

      if (currentWeight > maxWeight) {
        if (item.target_weight >= currentWeight) {
          violations.push(
            `${symbol} target ${item.target_weight}% does not reduce the existing overweight position ${currentWeight}%.`
          )
        } else {
          residualPolicyGaps.push(
            `${symbol} remains above policy at ${item.target_weight}%, but improves from ${currentWeight}%.`
          )
        }
      } else {
        violations.push(
          `${symbol} target ${item.target_weight}% exceeds ${isEtf ? "ETF" : "single-stock"} limit ${maxWeight}%.`
        )
      }
    }
  }

  const weeklyTurnover = roundWeight(
    suggestedActions.reduce((sum, action) => {
      const explicitTradeSize = Math.abs(
        Number(action.estimated_portfolio_pct_change ?? 0)
      )
      const derivedTradeSize = Math.abs(
        Number(action.target_weight ?? 0) - Number(action.current_weight ?? 0)
      )
      return sum + (explicitTradeSize || derivedTradeSize)
    }, 0)
  )

  if (
    validationMode === "rebalance" &&
    weeklyTurnover > Number(riskPolicy.max_weekly_turnover_pct) &&
    suggestedActions.length > 0
  ) {
    violations.push(
      `Total proposed turnover ${weeklyTurnover}% exceeds weekly turnover limit ${riskPolicy.max_weekly_turnover_pct}%.`
    )
  }

  for (const action of suggestedActions) {
    const oneTradeSize = Math.abs(
      Number(action.estimated_portfolio_pct_change ?? 0) ||
        Number(action.target_weight ?? 0) - Number(action.current_weight ?? 0)
    )

    if (
      validationMode === "rebalance" &&
      oneTradeSize > Number(riskPolicy.max_one_trade_pct)
    ) {
      violations.push(
        `${action.symbol.toUpperCase()} trade size ${roundWeight(oneTradeSize)}% exceeds one-trade limit ${riskPolicy.max_one_trade_pct}%.`
      )
    }

    const actionText = `${action.symbol} ${action.asset_type || ""} ${action.action}`
      .toLowerCase()
    for (const prohibited of riskPolicy.prohibited_assets || []) {
      if (actionText.includes(String(prohibited).toLowerCase())) {
        violations.push(
          `${action.symbol.toUpperCase()} appears to use prohibited asset class: ${prohibited}.`
        )
      }
    }
  }

  return {
    validation_status: violations.length === 0 ? "approved" : "human_review_required",
    final_action_allowed: violations.length === 0,
    violations,
    result: {
      checked_at: new Date().toISOString(),
      target_weight_sum: targetWeightSum,
      cash_weight: roundWeight(cashWeight),
      current_cash_weight: currentCashWeight,
      residual_policy_gaps: residualPolicyGaps,
      rule_summary: {
        validation_mode:
          validationMode === "initial_build"
            ? 1
            : validationMode === "capital_deployment"
              ? 2
              : 0,
        min_cash_pct: Number(riskPolicy.min_cash_pct),
        max_cash_pct: Number(riskPolicy.max_cash_pct),
        max_single_stock_pct: Number(riskPolicy.max_single_stock_pct),
        max_etf_pct: Number(riskPolicy.max_etf_pct),
        max_one_trade_pct: Number(riskPolicy.max_one_trade_pct),
        max_weekly_turnover_pct: Number(riskPolicy.max_weekly_turnover_pct),
      },
    },
  }
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

function readAllocation(value: unknown): AllocationLike[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const symbol = readSymbol(item.symbol)
    const targetWeight = readNumber(item.target_weight)
    if (!symbol || targetWeight === null) return []
    return [
      {
        symbol,
        target_weight: targetWeight,
        asset_type: readOptionalString(item.asset_type),
      },
    ]
  })
}

function readActions(value: unknown): ActionLike[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const symbol = readSymbol(item.symbol)
    const action = readOptionalString(item.action)
    if (!symbol || !action) return []
    return [
      {
        action,
        symbol,
        target_weight: readNumber(item.target_weight) ?? undefined,
        current_weight: readNumber(item.current_weight) ?? undefined,
        estimated_portfolio_pct_change:
          readNumber(item.estimated_portfolio_pct_change) ?? undefined,
        asset_type: readOptionalString(item.asset_type),
      },
    ]
  })
}

function actionsToAllocation(
  actions: ActionLike[],
  holdings: AgentHolding[]
): AllocationLike[] {
  const weights = new Map(
    holdings.map((holding) => [holding.symbol.toUpperCase(), Number(holding.weight || 0)])
  )

  for (const action of actions) {
    if (typeof action.target_weight === "number") {
      weights.set(action.symbol.toUpperCase(), action.target_weight)
    }
  }

  return [...weights.entries()].map(([symbol, targetWeight]) => ({
    symbol,
    target_weight: targetWeight,
  }))
}

function isETF(item: AllocationLike) {
  return (
    item.asset_type?.toLowerCase() === "etf" ||
    ETF_SYMBOLS.has(item.symbol.toUpperCase())
  )
}

function getOutOfMarketSymbols({
  targetAllocation,
  suggestedActions,
  currentWeights,
  profile,
  universe,
}: {
  targetAllocation: AllocationLike[]
  suggestedActions: ActionLike[]
  currentWeights: Map<string, number>
  profile?: AgentProfile
  universe?: AgentInvestmentUniverse | null
}) {
  const universeSymbols = getUniverseSymbols(universe)
  if (universeSymbols.length > 0) {
    const allowed = new Set(universeSymbols)
    const proposedOutsideUniverse = new Set<string>()

    for (const allocation of targetAllocation) {
      const symbol = allocation.symbol.toUpperCase()
      if (symbol === "CASH" || allowed.has(symbol)) continue
      const currentWeight = currentWeights.get(symbol) || 0
      if (allocation.target_weight > currentWeight) {
        proposedOutsideUniverse.add(symbol)
      }
    }

    for (const action of suggestedActions) {
      const symbol = action.symbol.toUpperCase()
      const actionType = action.action.toLowerCase()
      if (symbol === "CASH" || allowed.has(symbol) || actionType === "sell") {
        continue
      }
      proposedOutsideUniverse.add(symbol)
    }

    return [...proposedOutsideUniverse]
  }

  if (!profile) return []

  const targetText = [
    ...profile.target_markets,
    ...profile.allowed_assets,
    profile.objective,
    profile.manager_instructions || "",
  ]
    .join(" ")
    .toLowerCase()
  const wantsAustralia =
    targetText.includes("australia") || targetText.includes("australian")
  const wantsChinaTech = isChinaTechProfile(targetText)

  const uniqueSymbols = Array.from(
    new Set(
      [
        ...targetAllocation.map((item) => item.symbol),
        ...suggestedActions.map((item) => item.symbol),
      ]
        .map((symbol) => symbol.toUpperCase().trim())
        .filter((symbol) => symbol && symbol !== "CASH")
    )
  )

  if (wantsAustralia) {
    return uniqueSymbols.filter((symbol) => !symbol.endsWith(".AX"))
  }

  if (wantsChinaTech) {
    return uniqueSymbols.filter((symbol) => {
      if (symbol.endsWith(".HK")) return false
      if (CHINA_TECH_US_SYMBOLS.has(symbol)) return false
      return BROAD_US_ETFS.has(symbol)
    })
  }

  return []
}

function isChinaTechProfile(targetText: string) {
  const hasChinaScope =
    targetText.includes("china") ||
    targetText.includes("chinese") ||
    targetText.includes("hong kong") ||
    targetText.includes("hk") ||
    targetText.includes("中国") ||
    targetText.includes("香港")
  const hasTechScope =
    targetText.includes("tech") ||
    targetText.includes("internet") ||
    targetText.includes("科技") ||
    targetText.includes("互联网")

  return hasChinaScope && hasTechScope
}

function isRecord(value: unknown): value is ProposalRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readSymbol(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase()
    : ""
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100
}
