"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import AgentDashboardClient from "./AgentDashboardClient"
import { supabase } from "../../../src/lib/supabase"
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

export type AgentDashboardPermissions = {
  canEdit: boolean
  canRun: boolean
  canTrade: boolean
  canFollow: boolean
}

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
  permissions?: AgentDashboardPermissions
  portfolio_summary?: {
    cash_balance: number
    holdings_value: number
    total_value: number
  }
  error?: string
}

export default function AgentDashboardPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<AgentDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadAgent() {
      setLoading(true)
      setError("")

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch(`/api/agents/${id}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const payload = (await res.json()) as AgentDetailResponse

      if (cancelled) return

      if (!res.ok || !payload.success) {
        setError(payload.error || "Agent not found.")
        setData(null)
      } else {
        setData(payload)
      }

      setLoading(false)
    }

    loadAgent()

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading agent...
      </main>
    )
  }

  if (!data?.success) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <p>{error || "Agent not found."}</p>
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
      permissions={
        data.permissions || {
          canEdit: false,
          canRun: false,
          canTrade: false,
          canFollow: false,
        }
      }
      initialSummary={{
        cash_balance: portfolio_summary?.cash_balance ?? agent.cash_balance ?? 0,
        holdings_value: portfolio_summary?.holdings_value ?? 0,
        total_value: portfolio_summary?.total_value ?? agent.current_value ?? 0,
      }}
    />
  )
}
