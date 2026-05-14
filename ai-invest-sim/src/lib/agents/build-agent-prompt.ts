import {
  Agent,
  AgentHolding,
  AgentRun,
  AgentValuation,
  AgentProfile,
  AgentInvestmentUniverse,
  RiskPolicy,
  WorkflowConfig,
} from "../types/agent"
import type { PortfolioDiagnostic } from "./diagnose-portfolio"
  
  type BuildAgentPromptInput = {
    agent: Agent
    holdings: AgentHolding[]
    valuations: AgentValuation[]
    recentRuns: AgentRun[]
    profile?: AgentProfile
    riskPolicy?: RiskPolicy
    workflowConfig?: WorkflowConfig
    diagnostic?: PortfolioDiagnostic
    universe?: AgentInvestmentUniverse | null
  }
  
  export function buildAgentPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
    profile,
    riskPolicy,
    workflowConfig,
    diagnostic,
    universe,
  }: BuildAgentPromptInput) {
    const holdingsText =
      holdings.length > 0
        ? holdings
            .map(
              (h) =>
                `- ${h.symbol}: ${h.weight}% weight, market value ${h.market_value}, current price ${h.current_price}`
            )
            .join("\n")
        : "No current holdings. Portfolio is currently in cash."
  
    const valuationText =
      valuations.length > 0
        ? valuations
            .slice(-5)
            .map(
              (v) =>
                `- ${v.recorded_at}: total value ${v.total_value}, cumulative return ${v.cumulative_return}%`
            )
            .join("\n")
        : "No valuation history available."
  
    const recentRunsText =
      recentRuns.length > 0
        ? recentRuns
            .map(
              (r) =>
                `- ${r.created_at}: ${r.summary || "No summary"}`
            )
            .join("\n")
        : "No previous agent runs."

    const profileText = profile
      ? `
  Structured Investment Profile:
  Strategy Type: ${profile.strategy_type}
  Objective: ${profile.objective}
  Target Annual Return: ${profile.target_annual_return_min}% - ${profile.target_annual_return_max}%
  Max Drawdown: ${profile.max_drawdown_pct}%
  Target Markets: ${profile.target_markets.join(", ")}
  Allowed Assets: ${profile.allowed_assets.join(", ")}
  Excluded Assets: ${profile.excluded_assets.join(", ")}
  Manager Instructions: ${profile.manager_instructions || "None"}
  `
      : ""

    const riskPolicyText = riskPolicy
      ? `
  Risk Policy:
  Cash Range: ${riskPolicy.min_cash_pct}% - ${riskPolicy.max_cash_pct}%
  Max Single Stock Weight: ${riskPolicy.max_single_stock_pct}%
  Max ETF Weight: ${riskPolicy.max_etf_pct}%
  Max One Trade Size: ${riskPolicy.max_one_trade_pct}%
  Max Weekly Turnover: ${riskPolicy.max_weekly_turnover_pct}%
  Prohibited Assets: ${riskPolicy.prohibited_assets.join(", ")}
  Risk Validator: ${workflowConfig?.validator_enabled ? "Enabled" : "Disabled"}
  `
      : ""

    const diagnosticText = diagnostic
      ? `
  Local Portfolio Diagnostic:
  Selected Workflow: ${diagnostic.workflow}
  Summary: ${diagnostic.summary}
  Cash Weight: ${diagnostic.cash_weight}%
  Deployable Cash: ${diagnostic.deployable_cash_amount} (${diagnostic.deployable_cash_pct}%)
  Manual Required: ${diagnostic.manual_required ? "Yes" : "No"}
  Issues: ${diagnostic.issues.join(" | ") || "None"}
  Required Instruction: ${diagnostic.prompt_instruction}
  Manual Actions: ${diagnostic.manual_actions.join(" | ") || "None"}
  `
      : ""

    const marketGuardrailsText = profile
      ? `
  Target Market Guardrails:
  - Treat Target Markets and Allowed Assets as hard constraints.
  - Do not propose tickers, ETFs, or asset classes outside the configured target markets.
  - If the target market is Australia or Australian equities, use Australian-market instruments only, preferably Yahoo-compatible ASX symbols ending in ".AX" such as broad ASX ETFs, Australian blue-chip stocks, Australian dividend ETFs, or Australian gold exposure.
  - For an Australia-focused agent, do not propose US ETFs such as VOO, QQQ, VTI, SPY, or US-listed single stocks unless the profile explicitly allows US assets.
  - If the target market is China technology listed in Hong Kong and the US, use China/Hong-Kong technology exposure only, such as Hong Kong tickers ending in ".HK" or US-listed China technology ETFs/stocks. Do not use broad US market or broad US technology ETFs such as VOO, QQQ, VTI, SPY, DIA, or IWM for this profile.
  `
      : ""

    const universeText = universe
      ? `
  Active Investment Universe:
  Universe Name: ${universe.universe_name}
  Market Scope: ${universe.market_scope.join(", ")}
  Allowed Exchanges: ${universe.allowed_exchanges.join(", ")}
  Currency Scope: ${universe.currency_scope.join(", ")}
  Allowed Asset Types: ${universe.allowed_asset_types.join(", ")}
  Core ETFs: ${universe.core_etfs.join(", ")}
  Core Stocks: ${universe.core_stocks.join(", ")}
  Watchlist: ${universe.watchlist.join(", ")}
  Universe Exclusions: ${universe.excluded_assets.join(", ")}
  Universe Confidence: ${universe.confidence}
  `
      : ""
  
    return `
  You are a professional portfolio manager running an AI investment agent inside a simulated investment platform.
  
  This is a simulation, not financial advice.
  
  Agent Profile:
  Name: ${agent.name}
  Description: ${agent.description || "No description provided."}
  Investment Philosophy: ${agent.philosophy || "No philosophy provided."}
  Risk Level: ${agent.risk_level}
  Rebalance Frequency: ${agent.rebalance_frequency}
  ${profileText}
  ${riskPolicyText}
  ${diagnosticText}
  ${marketGuardrailsText}
  ${universeText}
  
  Portfolio Status:
  Initial Capital: ${agent.initial_capital}
  Cash Balance: ${agent.cash_balance}
  Current Portfolio Value: ${agent.current_value}
  Agent Active: ${agent.is_active}
  
  Current Holdings Market Value:
${holdings.reduce(
  (sum, h) => sum + Number(h.market_value || 0),
  0
)}
  Current Holdings:
  ${holdingsText}
  
  Recent Valuation History:
  ${valuationText}
  
  Recent Agent Memory:
  ${recentRunsText}
  
  Your task:
  Generate today's portfolio recommendation based on the agent's philosophy, structured profile, risk policy, current holdings, valuation history, and recent memory.
  
  Important rules:
  - Respect the agent's investment philosophy.
  - Respect the structured investment profile and manager instructions.
  - Respect the Active Investment Universe. Prefer symbols from Core ETFs and Core Stocks when proposing buys.
  - Do not propose buys outside the Active Investment Universe unless no universe is configured.
  - Respect the risk policy exactly.
  - Respect the risk level.
  - Avoid excessive concentration.
  - Avoid unnecessary trading.
  - If there are no holdings, propose a reasonable starting allocation.
  - Explain why your recommendation is consistent with previous agent behavior.
  - Keep actions realistic for a simulated long-term portfolio.
  - Target allocation must include CASH and must sum to 100%.
  - CASH is an allocation target, not a buy/sell action. Do not include CASH inside suggested_actions.
  - Every suggested action must comply with the max one-trade size.
  - If the current portfolio already violates cash or concentration limits and cannot be fully fixed in one rebalance, propose a staged remediation plan.
  - In staged remediation, this run's suggested_actions should be the next executable step that improves the violation within max one-trade size and max weekly turnover.
  - If cash is too high, recommend building positions in allowed stocks or ETFs instead of leaving excess cash idle.
  - Follow the Local Portfolio Diagnostic selected workflow. It is authoritative.
  - If manual_required is true, clearly state the manual prerequisite and do not present the proposal as automatically executable.
  
  Return ONLY valid JSON in this exact structure:
  
  {
    "summary": "Short summary of today's recommendation",
    "market_view": "Brief market view based on general conditions",
    "portfolio_diagnosis": "Current portfolio assessment",
    "risks": ["risk 1", "risk 2", "risk 3"],
    "requires_rebalance": true,
    "workflow": "manual_reduce_concentration | deploy_excess_cash | normal_rebalance",
    "manual_required": false,
    "manual_actions": ["manual action if needed"],
    "no_trade_reason": "If no rebalance is needed, explain why. Otherwise use null.",
    "suggested_actions": [
      {
        "action": "buy | sell | hold | rebalance",
        "symbol": "Ticker or asset name",
        "asset_type": "stock | etf | cash | other",
        "reason": "Why this action is suggested",
        "current_weight": 0,
        "target_weight": 0,
        "estimated_portfolio_pct_change": 0
      }
    ],
    "target_allocation": [
      {
        "symbol": "Ticker or asset name",
        "target_weight": 0
      }
    ],
    "staged_remediation_plan": [
      {
        "step": 1,
        "goal": "What this step fixes",
        "actions": ["human readable action"],
        "expected_policy_gap_after_step": "Remaining gap, if any"
      }
    ],
    "allocation_comment": "Explanation of target allocation",
    "confidence": "low | medium | high"
  }
  `
  }
