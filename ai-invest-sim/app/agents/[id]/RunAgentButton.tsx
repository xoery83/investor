"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { AgentRunType } from "../../../src/lib/types/agent"
import { supabase } from "../../../src/lib/supabase"

export default function RunAgentButton({
  agentId,
  initialBuildMode = false,
  onRunStarted,
  onRunCompleted,
  onRunFinished,
}: {
  agentId: string
  initialBuildMode?: boolean
  onRunStarted?: (runType: AgentRunType) => void
  onRunCompleted?: (payload: {
    run?: unknown
    trade_proposal?: unknown
    evaluation?: unknown
    initialization?: unknown
  }) => void
  onRunFinished?: () => void
}) {
  const router = useRouter()
  const [loadingType, setLoadingType] = useState<AgentRunType | null>(null)
  const [error, setError] = useState("")

  async function handleRun(runType: AgentRunType) {
    setLoadingType(runType)
    setError("")
    onRunStarted?.(runType)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        setError("Please log in before running this agent.")
        return
      }

      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          run_type: runType,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Failed to run agent")
        return
      }

      clearAgentDetailCache(agentId)
      onRunCompleted?.({
        run: data.run,
        trade_proposal: data.trade_proposal,
        evaluation: data.evaluation,
        initialization: data.initialization,
      })
      router.refresh()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to run agent"
      )
    } finally {
      setLoadingType(null)
      onRunFinished?.()
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <RunButton
        label={initialBuildMode ? "Initial Build" : "Rebalance"}
        runType={initialBuildMode ? "initial_build" : "rebalance"}
        loadingType={loadingType}
        onRun={handleRun}
      />
      <RunButton
        label="Daily"
        runType="daily"
        loadingType={loadingType}
        onRun={handleRun}
      />
      <RunButton
        label="Weekly"
        runType="weekly"
        loadingType={loadingType}
        onRun={handleRun}
      />
      <RunButton
        label="Escalation"
        runType="escalation"
        loadingType={loadingType}
        onRun={handleRun}
      />

      {error && (
        <p className="w-full text-red-400 text-sm mt-1">
          {error}
        </p>
      )}
    </div>
  )
}

function clearAgentDetailCache(agentId: string) {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(`agents:detail:${agentId}:`)) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Cache invalidation is best effort only.
  }
}

function RunButton({
  label,
  runType,
  loadingType,
  onRun,
}: {
  label: string
  runType: AgentRunType
  loadingType: AgentRunType | null
  onRun: (runType: AgentRunType) => void
}) {
  const loading = loadingType === runType
  const disabled = loadingType !== null

  return (
    <button
      type="button"
      onClick={() => onRun(runType)}
      disabled={disabled}
      className={
        runType === "rebalance" || runType === "initial_build"
          ? "rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-slate-200"
          : "rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-500"
      }
    >
      {loading ? "Running..." : label}
    </button>
  )
}
