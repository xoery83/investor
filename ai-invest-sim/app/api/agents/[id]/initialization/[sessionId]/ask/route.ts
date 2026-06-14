import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  addMemoryCard,
  extractPreferenceMemoryFromText,
} from "../../../../../../../src/lib/agents/memory-cards"
import { discussInitializationProposal } from "../../../../../../../src/lib/agents/run-agent"
import { canEditAgent } from "../../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../../src/lib/auth/server"
import type {
  Agent,
  AgentInitializationVersion,
} from "../../../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await context.params
  const requestUser = await getRequestUser(request)
  const body = await request.json().catch(() => ({}))
  const question = typeof body.question === "string" ? body.question.trim() : ""

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
    )
  }

  if (!question) {
    return NextResponse.json(
      { success: false, error: "Question is required." },
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

  const editPermission = canEditAgent(requestUser, agent as Agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const { data: version, error: versionError } = await supabase
    .from("agent_initialization_versions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("agent_id", id)
    .eq("status", "current")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (versionError || !version) {
    return NextResponse.json(
      {
        success: false,
        error:
          versionError?.message ||
          "Current initialization proposal version not found.",
      },
      { status: 404 }
    )
  }

  const currentVersion = version as AgentInitializationVersion
  const preferenceMemory = extractPreferenceMemoryFromText({
    agentId: id,
    text: question,
    sourceInitializationVersionId: currentVersion.id,
  })
  if (preferenceMemory) {
    await addMemoryCard(supabase, preferenceMemory)
  }

  const { data: userMessage, error: userMessageError } = await supabase
    .from("agent_initialization_messages")
    .insert({
      session_id: sessionId,
      version_id: currentVersion.id,
      agent_id: id,
      role: "user",
      message_type: "question",
      content: question,
    })
    .select()
    .single()

  if (userMessageError) {
    return NextResponse.json(
      { success: false, error: userMessageError.message },
      { status: 500 }
    )
  }

  const answer = await discussInitializationProposal({
    agent: agent as Agent,
    proposal: currentVersion.proposal,
    validation: currentVersion.risk_validation,
    userQuestion: question,
  })

  const { data: assistantMessage, error: assistantMessageError } = await supabase
    .from("agent_initialization_messages")
    .insert({
      session_id: sessionId,
      version_id: currentVersion.id,
      agent_id: id,
      role: "assistant",
      message_type: "answer",
      content: answer,
    })
    .select()
    .single()

  if (assistantMessageError) {
    return NextResponse.json(
      { success: false, error: assistantMessageError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    user_message: userMessage,
    assistant_message: assistantMessage,
  })
}
