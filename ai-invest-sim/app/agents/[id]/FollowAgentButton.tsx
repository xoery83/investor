"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { supabase } from "../../../src/lib/supabase"

export default function FollowAgentButton({
  agentId,
  visible,
  initialFollowing,
  onFollowChange,
}: {
  agentId: string
  visible: boolean
  initialFollowing?: boolean
  onFollowChange?: (following: boolean) => void
}) {
  const router = useRouter()
  const controlled = initialFollowing !== undefined
  const [loadedFollowing, setLoadedFollowing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const following = controlled ? Boolean(initialFollowing) : loadedFollowing

  useEffect(() => {
    if (!visible) return
    if (controlled) return

    let cancelled = false

    async function loadFollowStatus() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) return

      const res = await fetch(`/api/agents/${agentId}/follow`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()

      if (!cancelled && data.success) {
        setLoadedFollowing(Boolean(data.following))
      }
    }

    loadFollowStatus()

    return () => {
      cancelled = true
    }
  }, [agentId, controlled, visible])

  async function toggleFollow() {
    setLoading(true)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in to follow agents.")
      setLoading(false)
      return
    }

    const res = await fetch(`/api/agents/${agentId}/follow`, {
      method: following ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to update follow status.")
      setLoading(false)
      return
    }

    const nextFollowing = Boolean(data.following)
    if (!controlled) {
      setLoadedFollowing(nextFollowing)
    }
    onFollowChange?.(nextFollowing)
    clearAgentsListCache()
    clearAgentDetailCache(agentId)
    setLoading(false)
    router.refresh()
  }

  if (!visible) return null

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggleFollow}
        disabled={loading}
        className={
          following
            ? "rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-blue-700 hover:bg-blue-500/20 disabled:bg-slate-200"
            : "rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:bg-slate-200"
        }
      >
        {loading ? "Updating..." : following ? "Following" : "Follow"}
      </button>
      {error && <p className="max-w-56 text-xs text-red-400">{error}</p>}
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

function clearAgentsListCache() {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key === "agents:list:anon" || key.startsWith("agents:list:auth:")) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Cache invalidation is best effort only.
  }
}
