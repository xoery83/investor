export type RiskLevel = "low" | "medium" | "high"

export type RebalanceFrequency =
  | "daily"
  | "weekly"
  | "monthly"

export type Agent = {
  id: string

  name: string

  description: string | null

  philosophy: string | null

  risk_level: RiskLevel

  initial_capital: number

  current_value: number

  cash_balance: number

  is_active: boolean

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

  daily_return: number

  cumulative_return: number

  annualized_return: number

  recorded_at: string
}
