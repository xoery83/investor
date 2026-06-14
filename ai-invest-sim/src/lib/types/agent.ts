export type RiskLevel = "low" | "medium" | "high"

export type RebalanceFrequency =
  | "daily"
  | "weekly"
  | "monthly"

export type AgentRunType =
  | "rebalance"
  | "initial_build"
  | "daily"
  | "weekly"
  | "escalation"

export type Agent = {
  id: string

  owner_user_id: string | null

  agent_mode?: "ai_manager" | "copycat"

  copycat_source_id?: string | null

  visibility: "private" | "public" | "system"

  creator_type: "admin" | "user"

  lifecycle_status: "draft" | "active" | "paused" | "retired" | "archived"

  name: string

  description: string | null

  philosophy: string | null

  risk_level: RiskLevel

  initial_capital: number

  current_value: number

  cash_balance: number

  base_currency?: string

  is_active: boolean

  manual_trade_allowed: boolean

  proposal_execution_required: boolean

  rebalance_frequency: RebalanceFrequency

  model_name: string

  created_at: string

  updated_at: string
}

export type AgentHolding = {
  id: string

  agent_id: string

  symbol: string

  asset_name: string | null

  asset_type: string

  quantity: number

  average_cost: number

  current_price: number

  market_value: number

  currency?: string

  average_cost_base?: number

  current_price_base?: number

  market_value_local?: number

  market_value_base?: number

  fx_rate_to_base?: number

  fx_fetched_at?: string | null

  weight: number

  updated_at?: string
}

export type AgentRun = {
  id: string

  agent_id: string

  run_type: string

  summary: string | null

  recommendation: unknown

  risks: unknown

  status: string

  created_at: string
}

export type AgentValuation = {
  id: string

  agent_id: string

  total_value: number

  cash_value: number

  holdings_value: number

  base_currency?: string

  daily_return: number

  cumulative_return: number

  annualized_return: number

  recorded_at: string
}

export type AgentHoldingSnapshot = {
  id: string
  agent_id: string
  holding_id: string | null
  symbol: string
  asset_type: string | null
  quantity: number
  price_local: number
  currency: string
  fx_rate_to_base: number
  market_value_local: number
  market_value_base: number
  weight: number
  base_currency: string
  price_source: string | null
  market_state: string | null
  recorded_at: string
}

export type AgentProfile = {
  id?: string
  agent_id: string
  strategy_type: string
  objective: string
  target_annual_return_min: number
  target_annual_return_max: number
  max_drawdown_pct: number
  target_markets: string[]
  allowed_assets: string[]
  excluded_assets: string[]
  manager_instructions: string | null
  config: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type RiskPolicy = {
  id?: string
  agent_id: string
  min_cash_pct: number
  max_cash_pct: number
  max_single_stock_pct: number
  max_etf_pct: number
  max_one_trade_pct: number
  max_weekly_turnover_pct: number
  max_drawdown_pct: number
  prohibited_assets: string[]
  policy: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type WorkflowConfig = {
  id?: string
  agent_id: string
  daily_enabled: boolean
  daily_prompt_template_key: string
  weekly_enabled: boolean
  weekly_prompt_template_key: string
  escalation_enabled: boolean
  escalation_prompt_template_key: string
  validator_enabled: boolean
  validator_prompt_template_key: string
  max_revision_attempts: number
  config: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type AgentInvestmentUniverse = {
  id?: string
  agent_id: string
  version: number
  status: "active" | "archived"
  universe_name: string
  market_scope: string[]
  allowed_exchanges: string[]
  currency_scope: string[]
  allowed_asset_types: string[]
  core_etfs: string[]
  core_stocks: string[]
  watchlist: string[]
  excluded_assets: string[]
  generation_prompt: string | null
  generation_result: Record<string, unknown>
  confidence: "low" | "medium" | "high"
  source: "openai" | "fallback" | "manual"
  created_at?: string
  updated_at?: string
}

export type AgentMemoryCard = {
  id: string
  agent_id: string
  memory_type:
    | "thesis"
    | "constraint"
    | "user_preference"
    | "rejected_idea"
    | "approved_change"
    | "risk_event"
    | "universe_change"
    | "execution_note"
    | "copycat_source"
  title: string
  content: string
  symbols: string[]
  importance: number
  confidence: number
  status: "active" | "superseded" | "archived"
  source_run_id: string | null
  source_trade_proposal_id: string | null
  source_initialization_version_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type TradeProposal = {
  id: string
  agent_id: string
  source_run_id: string | null
  status: string
  proposal: unknown
  validator_status: string | null
  created_at: string
  updated_at: string
}

export type TradeProposalWithValidation = TradeProposal & {
  validator_results?: ValidatorResult[]
  portfolio_evaluations?: PortfolioEvaluation[]
}

export type PortfolioEvaluation = {
  id?: string
  agent_id?: string
  evaluation_scope: string
  source_run_id?: string | null
  trade_proposal_id?: string | null
  initialization_version_id?: string | null
  benchmark_symbol?: string | null
  period: string
  base_currency: string
  metrics: Record<string, unknown>
  effective_exposures: unknown[]
  overlap_warnings: unknown[]
  target_fit_score: number | null
  target_return_probability: number | null
  summary: string | null
  source: string
  created_at?: string
}

export type AgentInitializationSession = {
  id: string
  agent_id: string
  user_id: string
  status: "draft" | "in_review" | "approved" | "executed" | "abandoned"
  current_version: number
  max_revisions: number
  approved_version_id: string | null
  created_at: string
  updated_at: string
  approved_at: string | null
  executed_at: string | null
  versions?: AgentInitializationVersion[]
  messages?: AgentInitializationMessage[]
}

export type AgentInitializationVersion = {
  id: string
  session_id: string
  agent_id: string
  trade_proposal_id: string | null
  version_number: number
  source: "initial" | "revision" | "alternative" | "committee"
  user_feedback: string | null
  proposal: unknown
  thesis: unknown
  self_critique: unknown
  risk_validation: unknown
  status: "draft" | "current" | "superseded" | "approved" | "executed"
  created_at: string
  trade_proposals?: TradeProposalWithValidation | null
}

export type AgentInitializationMessage = {
  id: string
  session_id: string
  version_id: string | null
  agent_id: string
  role: "user" | "assistant" | "system"
  message_type: "question" | "answer" | "change_request" | "revision_summary" | "message"
  content: string
  created_at: string
}

export type AgentFollow = {
  id: string
  user_id: string
  agent_id: string
  status: "active" | "paused_by_agent" | "exited" | "force_exited"
  created_at: string
  updated_at: string
}

export type ValidatorResult = {
  id: string
  agent_id: string
  run_id: string | null
  trade_proposal_id: string | null
  validation_status: string
  violations: unknown
  final_action_allowed: boolean
  revision_attempt: number
  result: unknown
  created_at: string
}
