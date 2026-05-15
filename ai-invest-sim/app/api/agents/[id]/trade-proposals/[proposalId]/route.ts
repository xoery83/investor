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

  return NextResponse.json({ success: true, trade_proposal: data })
}
