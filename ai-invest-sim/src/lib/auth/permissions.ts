import { getPlanLimits } from "./plan-limits"
import type { RequestUser } from "./server"

export type PermissionAgent = {
  id: string
  owner_user_id: string | null
  visibility: "private" | "public" | "system"
  creator_type?: "admin" | "user"
  lifecycle_status: "draft" | "active" | "paused" | "retired" | "archived"
  is_active?: boolean
  manual_trade_allowed?: boolean | null
}

export type PermissionResult = {
  allowed: boolean
  reason?: string
}

export function allow(): PermissionResult {
  return { allowed: true }
}

export function deny(reason: string): PermissionResult {
  return { allowed: false, reason }
}

export function isAdmin(user: RequestUser | null) {
  return user?.profile.role === "admin"
}

export function isOwner(user: RequestUser | null, agent: PermissionAgent) {
  return Boolean(user && agent.owner_user_id === user.id)
}

export function canViewAgent(user: RequestUser | null, agent: PermissionAgent) {
  if (agent.visibility === "public" || agent.visibility === "system") {
    return allow()
  }
  if (isAdmin(user) || isOwner(user, agent)) return allow()
  return deny("You do not have permission to view this agent.")
}

export function canEditAgent(user: RequestUser | null, agent: PermissionAgent) {
  if (!user) return deny("Login required.")
  if (isAdmin(user) || isOwner(user, agent)) return allow()
  return deny("You do not have permission to edit this agent.")
}

export function canPublishAgent(user: RequestUser | null) {
  if (!user) return deny("Login required.")
  if (getPlanLimits(user.profile.role).canPublishAgents) return allow()
  return deny("Your current plan cannot publish public agents.")
}

export function canRunAgent(user: RequestUser | null, agent: PermissionAgent) {
  const edit = canEditAgent(user, agent)
  if (!edit.allowed) return edit
  if (!["draft", "active"].includes(agent.lifecycle_status)) {
    return deny("Only draft or active agents can run.")
  }
  if (agent.is_active === false) return deny("Agent is paused.")
  return allow()
}

export function canTradeAgentPortfolio(
  user: RequestUser | null,
  agent: PermissionAgent
) {
  const edit = canEditAgent(user, agent)
  if (!edit.allowed) return edit
  if (!["draft", "active"].includes(agent.lifecycle_status)) {
    return deny("Only draft or active agents can be rebalanced.")
  }
  if (
    (agent.visibility === "public" || agent.visibility === "system") &&
    agent.manual_trade_allowed === false
  ) {
    return deny(
      "Public agents can only be traded through approved rebalance proposals."
    )
  }
  return allow()
}

export function canFollowAgent(user: RequestUser | null, agent: PermissionAgent) {
  if (!user) return deny("Login required to follow an agent.")
  if (agent.lifecycle_status !== "active") {
    return deny("Only active agents can accept new followers.")
  }
  if (agent.visibility !== "public" && agent.visibility !== "system") {
    return deny("Only public or system agents can be followed.")
  }
  if (isOwner(user, agent)) {
    return deny("You already own this agent.")
  }
  return allow()
}

export function canActivateMoreAgents({
  user,
  activeAgentCount,
}: {
  user: RequestUser
  activeAgentCount: number
}) {
  const limit = getPlanLimits(user.profile.role).maxActiveAgents
  if (activeAgentCount < limit) return allow()
  return deny(`Your plan allows ${limit} active agent(s).`)
}

export function canCreateMoreAgents({
  user,
  agentCount,
}: {
  user: RequestUser
  agentCount: number
}) {
  const limit = getPlanLimits(user.profile.role).maxAgents
  if (agentCount < limit) return allow()
  return deny(`Your plan allows ${limit} agent(s).`)
}

export function canManualRunToday({
  user,
  runCount,
}: {
  user: RequestUser
  runCount: number
}) {
  const limit = getPlanLimits(user.profile.role).maxManualRunsPerDay
  if (runCount < limit) return allow()
  return deny(`Your plan allows ${limit} manual run(s) per day.`)
}

export function canFollowMoreAgents({
  user,
  followCount,
}: {
  user: RequestUser
  followCount: number
}) {
  const limit = getPlanLimits(user.profile.role).maxFollowedAgents
  if (followCount < limit) return allow()
  return deny(`Your plan allows following ${limit} agent(s).`)
}

export function canHoldMoreAgentPositions({
  user,
  positionCount,
}: {
  user: RequestUser
  positionCount: number
}) {
  const limit = getPlanLimits(user.profile.role).maxAgentPositions
  if (positionCount < limit) return allow()
  return deny(`Your plan allows holding ${limit} agent position(s).`)
}
