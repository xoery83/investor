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
  AgentInitializationSession,
  AgentProfile,
  AgentMemoryCard,
  RiskPolicy,
  TradeProposalWithValidation,
  WorkflowConfig,
} from "../../../src/lib/types/agent"

const AGENT_DETAIL_CACHE_TTL_MS = 20_000

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
    creator_display_name?: string
    creator_role?: string
    follower_count?: number
    follower_position_value?: number
  }
  holdings: AgentHolding[]
  runs: AgentRun[]
  valuations: AgentValuation[]
  trade_proposals: TradeProposalWithValidation[]
  initialization_session?: AgentInitializationSession | null
  profile: AgentProfile
  risk_policy: RiskPolicy
  workflow_config: WorkflowConfig
  memory_cards?: AgentMemoryCard[]
  permissions?: AgentDashboardPermissions
  is_following?: boolean
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
      setError("")

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const cacheKey = getAgentDetailCacheKey(
        id,
        sessionData.session?.user?.id
      )
      const cached = readAgentDetailCache(cacheKey)

      if (cached) {
        setData(cached)
        setLoading(false)
      } else {
        setLoading(true)
      }

      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {}
      const res = await fetch(`/api/agents/${id}`, {
        cache: "no-store",
        headers,
      })
      const payload = await readAgentDetailResponse(res)

      if (cancelled) return

      if (!res.ok || !payload.success) {
        setError(payload.error || "Agent not found.")
        if (!cached) setData(null)
      } else {
        setData(payload)
        writeAgentDetailCache(cacheKey, payload)
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
      <main className="min-h-screen bg-background p-8 text-foreground">
        Loading agent...
      </main>
    )
  }

  if (!data?.success) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
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
    initialization_session,
    profile,
    risk_policy,
    workflow_config,
    memory_cards,
    portfolio_summary,
  } = data

  return (
    <AgentDashboardClient
      agent={agent}
      holdings={holdings}
      runs={runs}
      valuations={valuations}
      tradeProposals={trade_proposals}
      initializationSession={initialization_session || null}
      profile={profile}
      riskPolicy={risk_policy}
      workflowConfig={workflow_config}
      memoryCards={memory_cards || []}
      permissions={
        data.permissions || {
          canEdit: false,
          canRun: false,
          canTrade: false,
          canFollow: false,
        }
      }
      isFollowing={Boolean(data.is_following)}
      initialSummary={{
        cash_balance: portfolio_summary?.cash_balance ?? agent.cash_balance ?? 0,
        holdings_value: portfolio_summary?.holdings_value ?? 0,
        total_value: portfolio_summary?.total_value ?? agent.current_value ?? 0,
      }}
    />
  )
}

async function readAgentDetailResponse(res: Response): Promise<AgentDetailResponse> {
  const text = await res.text()

  if (!text.trim()) {
    return {
      success: false,
      error: res.ok ? "Empty agent response." : `Agent request failed (${res.status}).`,
    } as AgentDetailResponse
  }

  try {
    return JSON.parse(text) as AgentDetailResponse
  } catch {
    return {
      success: false,
      error: res.ok
        ? "Agent response was not valid JSON."
        : `Agent request failed (${res.status}).`,
    } as AgentDetailResponse
  }
}

function getAgentDetailCacheKey(agentId: string, userId?: string) {
  return `agents:detail:${agentId}:${userId || "anon"}`
}

function readAgentDetailCache(key: string) {
  if (typeof window === "undefined") return null

  try {
    const cached = window.sessionStorage.getItem(key)
    if (!cached) return null
    const parsed = JSON.parse(cached) as {
      savedAt: number
      data: AgentDetailResponse
    }
    if (Date.now() - parsed.savedAt > AGENT_DETAIL_CACHE_TTL_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeAgentDetailCache(key: string, data: AgentDetailResponse) {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), data })
    )
  } catch {
    // Detail cache is best effort only.
  }
}
