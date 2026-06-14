import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Agent,
  AgentInitializationSession,
  AgentInitializationVersion,
  ValidatorResult,
} from "../types/agent"

type StoreInitializationVersionInput = {
  supabase: SupabaseClient
  agent: Agent
  userId: string
  proposalId: string
  proposal: unknown
  validation: ValidatorResult
  source?: "initial" | "revision" | "alternative" | "committee"
  userFeedback?: string | null
}

export type StoredInitializationVersion = {
  session: AgentInitializationSession
  version: AgentInitializationVersion
}

export async function storeInitializationVersion({
  supabase,
  agent,
  userId,
  proposalId,
  proposal,
  validation,
  source = "initial",
  userFeedback = null,
}: StoreInitializationVersionInput): Promise<StoredInitializationVersion | null> {
  try {
    const session = await getOrCreateInitializationSession({
      supabase,
      agent,
      userId,
    })
    if (!session) return null

    await supabase
      .from("agent_initialization_versions")
      .update({ status: "superseded" })
      .eq("session_id", session.id)
      .eq("status", "current")

    const versionNumber = Number(session.current_version || 0) + 1
    const proposalRecord = isRecord(proposal) ? proposal : {}
    const { data: version, error: versionError } = await supabase
      .from("agent_initialization_versions")
      .insert({
        session_id: session.id,
        agent_id: agent.id,
        trade_proposal_id: proposalId,
        version_number: versionNumber,
        source,
        user_feedback: userFeedback,
        proposal,
        thesis: proposalRecord.investment_thesis || {},
        self_critique: proposalRecord.self_critique || {},
        risk_validation: validation,
        status: "current",
      })
      .select()
      .single()

    if (versionError || !version) {
      if (isMissingInitializationTableError(versionError?.message || "")) {
        return null
      }
      throw new Error(versionError?.message || "Failed to store initialization version")
    }

    const { data: updatedSession, error: sessionError } = await supabase
      .from("agent_initialization_sessions")
      .update({
        status: "in_review",
        current_version: versionNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select()
      .single()

    if (sessionError || !updatedSession) {
      if (isMissingInitializationTableError(sessionError?.message || "")) {
        return null
      }
      throw new Error(sessionError?.message || "Failed to update initialization session")
    }

    return {
      session: updatedSession as AgentInitializationSession,
      version: version as AgentInitializationVersion,
    }
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingInitializationTableError(error.message)
    ) {
      return null
    }
    throw error
  }
}

async function getOrCreateInitializationSession({
  supabase,
  agent,
  userId,
}: {
  supabase: SupabaseClient
  agent: Agent
  userId: string
}) {
  const { data: existing, error: existingError } = await supabase
    .from("agent_initialization_sessions")
    .select("*")
    .eq("agent_id", agent.id)
    .in("status", ["draft", "in_review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    if (isMissingInitializationTableError(existingError.message)) return null
    throw new Error(existingError.message)
  }

  if (existing) return existing as AgentInitializationSession

  const { data: created, error: createError } = await supabase
    .from("agent_initialization_sessions")
    .insert({
      agent_id: agent.id,
      user_id: userId,
      status: "draft",
      current_version: 0,
      max_revisions: 5,
    })
    .select()
    .single()

  if (createError || !created) {
    if (isMissingInitializationTableError(createError?.message || "")) {
      return null
    }
    throw new Error(createError?.message || "Failed to create initialization session")
  }

  return created as AgentInitializationSession
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isMissingInitializationTableError(message: string) {
  return (
    (message.includes("agent_initialization_sessions") ||
      message.includes("agent_initialization_versions") ||
      message.includes("agent_initialization_messages")) &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
