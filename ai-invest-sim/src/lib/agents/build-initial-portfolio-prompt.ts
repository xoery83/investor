import type {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentProfile,
  AgentRun,
  AgentValuation,
  RiskPolicy,
  WorkflowConfig,
} from "../types/agent"
import { getUniverseSymbols } from "./investment-universe"

type BuildInitialPortfolioPromptInput = {
  agent: Agent
  holdings: AgentHolding[]
  valuations: AgentValuation[]
  recentRuns: AgentRun[]
  profile?: AgentProfile
  riskPolicy?: RiskPolicy
  workflowConfig?: WorkflowConfig
  universe?: AgentInvestmentUniverse | null
}

export function buildInitialPortfolioPrompt({
  agent,
  holdings,
  valuations,
  recentRuns,
  profile,
  riskPolicy,
  workflowConfig,
  universe,
}: BuildInitialPortfolioPromptInput) {
  const totalValue = Number(agent.current_value || agent.initial_capital || 0)
  const cashValue = Number(agent.cash_balance || totalValue)
  const universeSymbols = getUniverseSymbols(universe)
  const latestValuation = valuations[valuations.length - 1]
  const holdingsText =
    holdings.length > 0
      ? holdings
          .map(
            (holding) =>
              `- ${holding.symbol}: ${holding.weight}% weight, quantity ${holding.quantity}, local value ${holding.market_value_local || holding.market_value} ${holding.currency || "USD"}, base value ${holding.market_value_base || holding.market_value}`
          )
          .join("\n")
      : "No existing positions. Treat this as a cash-only portfolio."
  const recentRunsText =
    recentRuns.length > 0
      ? recentRuns
          .map((run) => `- ${run.created_at}: ${run.summary || "No summary"}`)
          .join("\n")
      : "No previous runs."

  return `
You are constructing the FIRST portfolio for an AI investment simulation agent.
This is an initial build, not a rebalance. This is simulation output, not financial advice.

Primary objective:
- Build a complete starting portfolio from cash using the configured target markets and active investment universe.
- The output should be actionable enough that a human can use each BUY action to populate a trade form, review prices/quantity, and execute manually.
- Do not merely improve the cash ratio. The target allocation must put cash inside the configured cash range.

Agent:
- Name: ${agent.name}
- Description: ${agent.description || "No description provided."}
- Philosophy: ${agent.philosophy || "No philosophy provided."}
- Risk level: ${agent.risk_level}
- Portfolio value available for initial build: ${totalValue}
- Current cash value: ${cashValue}
- Current holdings:
${holdingsText}

Structured investment profile:
- Strategy type: ${profile?.strategy_type || "Not configured"}
- Objective: ${profile?.objective || "Not configured"}
- Target annual return: ${profile?.target_annual_return_min ?? "?"}% - ${profile?.target_annual_return_max ?? "?"}%
- Max drawdown: ${profile?.max_drawdown_pct ?? "?"}%
- Target markets: ${profile?.target_markets?.join(", ") || "Not configured"}
- Allowed assets: ${profile?.allowed_assets?.join(", ") || "Not configured"}
- Excluded assets: ${profile?.excluded_assets?.join(", ") || "None"}
- Manager instructions: ${profile?.manager_instructions || "None"}

Risk policy:
- Cash target must be between ${riskPolicy?.min_cash_pct ?? "?"}% and ${riskPolicy?.max_cash_pct ?? "?"}%.
- Single stock target must not exceed ${riskPolicy?.max_single_stock_pct ?? "?"}%.
- ETF target must not exceed ${riskPolicy?.max_etf_pct ?? "?"}%.
- Prohibited assets: ${riskPolicy?.prohibited_assets?.join(", ") || "None"}
- For this initial build only, max one-trade and weekly turnover limits do NOT apply. The user is building the first portfolio from cash.
- Validator enabled: ${workflowConfig?.validator_enabled ? "yes" : "no"}.

Active investment universe:
- Name: ${universe?.universe_name || "Not configured"}
- Market scope: ${universe?.market_scope?.join(", ") || "Not configured"}
- Allowed exchanges: ${universe?.allowed_exchanges?.join(", ") || "Not configured"}
- Currency scope: ${universe?.currency_scope?.join(", ") || "Not configured"}
- Allowed asset types: ${universe?.allowed_asset_types?.join(", ") || "Not configured"}
- Core ETFs: ${universe?.core_etfs?.join(", ") || "Not configured"}
- Core stocks: ${universe?.core_stocks?.join(", ") || "Not configured"}
- Watchlist: ${universe?.watchlist?.join(", ") || "Not configured"}
- Excluded assets: ${universe?.excluded_assets?.join(", ") || "None"}

Hard market constraints:
- If an active investment universe is configured, every proposed BUY symbol must come from this exact set: ${universeSymbols.join(", ") || "No configured universe symbols"}.
- If the profile targets Australia, use ASX/Yahoo-compatible symbols ending in ".AX" and do not propose US ETFs such as VOO, QQQ, VTI, or SPY unless US assets are explicitly allowed.
- If the profile targets China technology listed in Hong Kong and the US, use China/Hong-Kong technology exposure only, such as ".HK" tickers or US-listed China technology ETFs/stocks. Do not propose broad US market or broad US technology ETFs such as VOO, QQQ, VTI, SPY, DIA, or IWM.
- If the available universe is too narrow to build a compliant portfolio, return manual_required true and explain what missing universe coverage should be added.

Recent context:
- Latest valuation: ${latestValuation ? JSON.stringify(latestValuation) : "No valuation history yet."}
- Recent runs:
${recentRunsText}

Return ONLY valid JSON with this shape:
{
  "proposal_type": "initial_build",
  "workflow": "initial_build",
  "summary": "short sentence",
  "market_summary": "brief market context",
  "portfolio_diagnosis": "why this starting allocation fits the agent",
  "target_allocation": [
    { "symbol": "CASH", "target_weight": 10, "asset_type": "cash" },
    { "symbol": "SYMBOL", "target_weight": 15, "asset_type": "etf or stock" }
  ],
  "suggested_actions": [
    {
      "action": "buy",
      "symbol": "SYMBOL",
      "asset_type": "etf or stock",
      "current_weight": 0,
      "target_weight": 15,
      "estimated_portfolio_pct_change": 15,
      "reason": "why this position belongs in the initial portfolio"
    }
  ],
  "risk_analysis": "explain cash, diversification, drawdown, concentration",
  "risks": ["risk 1", "risk 2"],
  "key_assumptions": ["assumption 1", "assumption 2"],
  "next_steps": ["review suggested trades", "adjust quantity/price manually"],
  "manual_required": false,
  "confidence": "low | medium | high"
}

Allocation rules:
- Include CASH in target_allocation.
- target_allocation must sum to 100%.
- suggested_actions should include BUY actions for all non-cash allocations.
- Do not put CASH in suggested_actions.
- Keep each stock and ETF inside its risk limit.
- Prefer diversified exposure over one or two concentrated names.
`
}
