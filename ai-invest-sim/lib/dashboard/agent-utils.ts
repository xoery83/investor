import { formatAgo } from "./format"
import type { AgentActivity } from "./types"

export function formatAgentTimestamp(item: AgentActivity): string {
  if (item.status === "RUNNING" || item.status === "ANALYZING") {
    return "Updating..."
  }
  if (item.status === "EXECUTED") {
    return "Just now"
  }
  if (item.completedAt != null) {
    return formatAgo(item.completedAt)
  }
  return "Just now"
}
