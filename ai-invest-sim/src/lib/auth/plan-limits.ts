import type { AppUserRole } from "./server"

export type PlanLimits = {
  maxAgents: number
  maxActiveAgents: number
  canPublishAgents: boolean
  maxScheduledRunAgents: number
  maxManualRunsPerDay: number
  maxFollowedAgents: number
  maxAgentPositions: number
  canConnectBrokerage: boolean
}

const unlimited = Number.POSITIVE_INFINITY

export const planLimits: Record<AppUserRole, PlanLimits> = {
  free: {
    maxAgents: 2,
    maxActiveAgents: 1,
    canPublishAgents: false,
    maxScheduledRunAgents: 0,
    maxManualRunsPerDay: 5,
    maxFollowedAgents: 10,
    maxAgentPositions: 3,
    canConnectBrokerage: false,
  },
  plus: {
    maxAgents: 20,
    maxActiveAgents: 10,
    canPublishAgents: false,
    maxScheduledRunAgents: 3,
    maxManualRunsPerDay: 50,
    maxFollowedAgents: 50,
    maxAgentPositions: 20,
    canConnectBrokerage: false,
  },
  pro: {
    maxAgents: 100,
    maxActiveAgents: 50,
    canPublishAgents: true,
    maxScheduledRunAgents: 30,
    maxManualRunsPerDay: 300,
    maxFollowedAgents: 200,
    maxAgentPositions: 100,
    canConnectBrokerage: true,
  },
  admin: {
    maxAgents: unlimited,
    maxActiveAgents: unlimited,
    canPublishAgents: true,
    maxScheduledRunAgents: unlimited,
    maxManualRunsPerDay: unlimited,
    maxFollowedAgents: unlimited,
    maxAgentPositions: unlimited,
    canConnectBrokerage: true,
  },
}

export function getPlanLimits(role: AppUserRole) {
  return planLimits[role] || planLimits.free
}
