"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function RunAgentButton({ agentId }: { agentId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleRun() {
    setLoading(true)
    setError("")

    const res = await fetch(`/api/agents/${agentId}/run`, {
      method: "POST",
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to run agent")
      setLoading(false)
      return
    }

    setLoading(false)
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={handleRun}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 px-4 py-2 rounded-lg"
      >
        {loading ? "Running..." : "Run Agent"}
      </button>

      {error && (
        <p className="text-red-400 text-sm mt-2">
          {error}
        </p>
      )}
    </div>
  )
}