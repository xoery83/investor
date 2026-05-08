"use client"

import * as React from "react"

import { AGENT_STATUSES, type AgentActivity, type AgentStatus } from "@/lib/dashboard/types"
import { nextAgentId, pickResearch, seedAgentActivity } from "@/lib/dashboard/mock"

const MAX_ITEMS = 8
const STATUS_TICK_MS = 2000

function nextStatus(s: AgentStatus): AgentStatus {
  const i = AGENT_STATUSES.indexOf(s)
  return AGENT_STATUSES[Math.min(i + 1, AGENT_STATUSES.length - 1)]!
}

function trimFeed(items: AgentActivity[]): AgentActivity[] {
  if (items.length <= MAX_ITEMS) return items
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]!.status === "DONE") {
      return items.filter((_, idx) => idx !== i)
    }
  }
  return items.slice(0, MAX_ITEMS)
}

export function useAgentFeed() {
  const [activities, setActivities] = React.useState<AgentActivity[]>(seedAgentActivity)
  const [, setTimePulse] = React.useState(0)

  React.useEffect(() => {
    const id = setInterval(() => setTimePulse((p) => p + 1), 15_000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    const id = setInterval(() => {
      setActivities((prev) =>
        prev.map((a) => {
          if (a.status === "DONE") return a
          const ns = nextStatus(a.status)
          if (ns === "DONE") {
            return { ...a, status: "DONE", completedAt: Date.now() }
          }
          return { ...a, status: ns }
        })
      )
    }, STATUS_TICK_MS)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const schedule = () => {
      const delay = 6000 + Math.random() * 4000
      timeoutId = setTimeout(() => {
        const t = pickResearch()
        setActivities((prev) => {
          const next: AgentActivity[] = [
            {
              id: nextAgentId(),
              title: t.title,
              detail: t.detail,
              status: "RUNNING",
              createdAt: Date.now(),
              completedAt: null,
            },
            ...prev,
          ]
          return trimFeed(next)
        })
        schedule()
      }, delay)
    }

    schedule()
    return () => clearTimeout(timeoutId)
  }, [])

  return { activities }
}
