import type {
  AgentProfile,
  RiskPolicy,
  WorkflowConfig,
} from "../types/agent"

export function defaultAgentProfile(agentId: string): Omit<
  AgentProfile,
  "id" | "created_at" | "updated_at"
> {
  return {
    agent_id: agentId,
    strategy_type: "conservative_growth",
    objective:
      "Steady long-term growth with controlled drawdown and disciplined risk management.",
    target_annual_return_min: 8,
    target_annual_return_max: 15,
    max_drawdown_pct: 20,
    target_markets: ["US large cap equities", "US ETFs"],
    allowed_assets: [
      "US large cap stocks",
      "broad market ETFs",
      "sector ETFs",
      "gold ETF",
      "cash",
    ],
    excluded_assets: ["options", "leverage", "crypto", "penny stocks"],
    manager_instructions:
      "Prefer quality companies, diversified ETFs, controlled turnover, and clear risk/reward before proposing a rebalance.",
    config: {},
  }
}

export function defaultRiskPolicy(agentId: string): Omit<
  RiskPolicy,
  "id" | "created_at" | "updated_at"
> {
  return {
    agent_id: agentId,
    min_cash_pct: 5,
    max_cash_pct: 25,
    max_single_stock_pct: 20,
    max_etf_pct: 40,
    max_one_trade_pct: 10,
    max_weekly_turnover_pct: 15,
    max_drawdown_pct: 20,
    prohibited_assets: ["options", "leverage", "crypto", "penny stocks"],
    policy: {},
  }
}

export function defaultWorkflowConfig(agentId: string): Omit<
  WorkflowConfig,
  "id" | "created_at" | "updated_at"
> {
  return {
    agent_id: agentId,
    daily_enabled: true,
    daily_prompt_template_key: "conservative_daily_v1",
    weekly_enabled: true,
    weekly_prompt_template_key: "conservative_weekly_v1",
    escalation_enabled: true,
    escalation_prompt_template_key: "conservative_escalation_v1",
    validator_enabled: true,
    validator_prompt_template_key: "conservative_validator_v1",
    max_revision_attempts: 2,
    config: {},
  }
}
