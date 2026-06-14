import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { canEditAgent } from "../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; proposalId: string }> }
) {
  const { id, proposalId } = await context.params
  const requestUser = await getRequestUser(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const status = body.status === "executed" ? "executed" : null

  if (!status) {
    return NextResponse.json(
      { success: false, error: "Unsupported proposal status." },
      { status: 400 }
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found." },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const { data: proposal, error: proposalError } = await supabase
    .from("trade_proposals")
    .select("id,agent_id,validator_status,validator_results(*)")
    .eq("id", proposalId)
    .eq("agent_id", id)
    .maybeSingle()

  if (proposalError || !proposal) {
    return NextResponse.json(
      { success: false, error: "Trade proposal not found." },
      { status: 404 }
    )
  }

  const validatorResults: Array<Record<string, unknown>> = Array.isArray(
    proposal.validator_results
  )
    ? proposal.validator_results
    : []
  const approved =
    proposal.validator_status === "approved" ||
    validatorResults.some((result) => result.final_action_allowed === true)

  if (!approved) {
    return NextResponse.json(
      { success: false, error: "Only approved proposals can be marked executed." },
      { status: 403 }
    )
  }

  const { data, error } = await supabase
    .from("trade_proposals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", proposalId)
    .eq("agent_id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  await markInitializationExecuted(proposalId).catch(() => null)

  return NextResponse.json({ success: true, trade_proposal: data })
}

async function markInitializationExecuted(proposalId: string) {
  const now = new Date().toISOString()
  const { data: version, error: versionError } = await supabase
    .from("agent_initialization_versions")
    .update({ status: "executed" })
    .eq("trade_proposal_id", proposalId)
    .select("id,session_id")
    .maybeSingle()

  if (versionError || !version) {
    if (isMissingInitializationTableError(versionError?.message || "")) return
    if (!version) return
    return
  }

  const { error: sessionError } = await supabase
    .from("agent_initialization_sessions")
    .update({
      status: "executed",
      approved_version_id: version.id,
      approved_at: now,
      executed_at: now,
      updated_at: now,
    })
    .eq("id", version.session_id)

  if (sessionError && !isMissingInitializationTableError(sessionError.message)) {
    throw new Error(sessionError.message)
  }
}

function isMissingInitializationTableError(message: string) {
  return (
    (message.includes("agent_initialization_sessions") ||
      message.includes("agent_initialization_versions")) &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
