import Link from "next/link"
import AgentDashboardClient from "./AgentDashboardClient"

import { headers } from "next/headers"

import type {
  Agent,
  AgentValuation,
  AgentHolding,
  AgentRun,
  AgentProfile,
  RiskPolicy,
  TradeProposalWithValidation,
  WorkflowConfig,
} from "../../../src/lib/types/agent"

type AgentDetailResponse = {
  success: boolean
  agent: Agent & {
    holdings_value?: number
  }
  holdings: AgentHolding[]
  runs: AgentRun[]
  valuations: AgentValuation[]
  trade_proposals: TradeProposalWithValidation[]
  profile: AgentProfile
  risk_policy: RiskPolicy
  workflow_config: WorkflowConfig
  portfolio_summary?: {
    cash_balance: number
    holdings_value: number
    total_value: number
  }
  error?: string
}

async function getAgent(id: string): Promise<AgentDetailResponse | null> {
  const headersList = await headers()
  const host = headersList.get("host")

  const protocol =
    process.env.NODE_ENV === "production"
      ? "https"
      : "http"

  const res = await fetch(
    `${protocol}://${host}/api/agents/${id}`,
    {
      cache: "no-store",
    }
  )

  if (!res.ok) {
    return null
  }

  return (await res.json()) as AgentDetailResponse
}

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getAgent(id)

  if (!data?.success) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <p>Agent not found.</p>
        <Link href="/agents" className="text-blue-400">
          Back to Agents
        </Link>
      </main>
    )
  }

  const {
    agent,
    holdings,
    runs,
    valuations,
    trade_proposals,
    profile,
    risk_policy,
    workflow_config,
    portfolio_summary,
  } = data

  return (
    <AgentDashboardClient
      agent={agent}
      holdings={holdings}
      runs={runs}
      valuations={valuations}
      tradeProposals={trade_proposals}
      profile={profile}
      riskPolicy={risk_policy}
      workflowConfig={workflow_config}
      initialSummary={{
        cash_balance: portfolio_summary?.cash_balance ?? agent.cash_balance ?? 0,
        holdings_value: portfolio_summary?.holdings_value ?? 0,
        total_value: portfolio_summary?.total_value ?? agent.current_value ?? 0,
      }}
    />
  )
}
