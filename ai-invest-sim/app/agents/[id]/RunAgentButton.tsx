"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { AgentRunType } from "../../../src/lib/types/agent"

export default function RunAgentButton({ agentId }: { agentId: string }) {
  const router = useRouter()
  const [loadingType, setLoadingType] = useState<AgentRunType | null>(null)
  const [error, setError] = useState("")

  async function handleRun(runType: AgentRunType) {
    setLoadingType(runType)
    setError("")

    const res = await fetch(`/api/agents/${agentId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_type: runType,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to run agent")
      setLoadingType(null)
      return
    }

    setLoadingType(null)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <RunButton
        label="Rebalance"
        runType="rebalance"
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
        runType === "rebalance"
          ? "rounded-lg bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700 disabled:bg-slate-700"
          : "rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:bg-slate-700"
      }
    >
      {loading ? "Running..." : label}
    </button>
  )
}
