export const AGENT_STATUSES = [
  "RUNNING",
  "ANALYZING",
  "EXECUTED",
  "DONE",
] as const

export type AgentStatus = (typeof AGENT_STATUSES)[number]

export type AgentActivity = {
  id: string
  title: string
  detail: string
  status: AgentStatus
  createdAt: number
  completedAt: number | null
}

export type PerformancePoint = {
  at: number
  label: string
  value: number
}

export type HoldingRow = {
  symbol: string
  name: string
  shares: number
  avgCost: number
  price: number
  value: number
  dayPct: number
}
