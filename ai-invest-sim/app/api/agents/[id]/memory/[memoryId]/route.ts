import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { canEditAgent } from "../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; memoryId: string }> }
) {
  const { id, memoryId } = await context.params
  const requestUser = await getRequestUser(request)
  const body = await request.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
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

  const { data: card, error: cardError } = await supabase
    .from("agent_memory_cards")
    .select("*")
    .eq("id", memoryId)
    .eq("agent_id", id)
    .single()

  if (cardError || !card) {
    return NextResponse.json(
      { success: false, error: "Memory card not found." },
      { status: 404 }
    )
  }

  const update = buildMemoryUpdate(action, card)
  if (!update) {
    return NextResponse.json(
      { success: false, error: "Unsupported memory action." },
      { status: 400 }
    )
  }

  const { data: updatedCard, error: updateError } = await supabase
    .from("agent_memory_cards")
    .update({
      ...update,
      updated_at: new Date().toISOString(),
    })
    .eq("id", memoryId)
    .eq("agent_id", id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json(
      { success: false, error: updateError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    memory_card: updatedCard,
  })
}

function buildMemoryUpdate(
  action: string,
  card: { importance?: number | null; metadata?: unknown }
) {
  const metadata =
    card.metadata && typeof card.metadata === "object" && !Array.isArray(card.metadata)
      ? (card.metadata as Record<string, unknown>)
      : {}

  if (action === "archive") {
    return {
      status: "archived",
      metadata: { ...metadata, archived_by_manager: true },
    }
  }

  if (action === "supersede") {
    return {
      status: "superseded",
      metadata: { ...metadata, superseded_by_manager: true },
    }
  }

  if (action === "pin") {
    return {
      status: "active",
      importance: 5,
      metadata: {
        ...metadata,
        pinned: true,
        previous_importance: card.importance ?? null,
      },
    }
  }

  if (action === "unpin") {
    const previousImportance = Number(metadata.previous_importance || 3)
    return {
      status: "active",
      importance: Number.isFinite(previousImportance)
        ? Math.min(5, Math.max(1, previousImportance))
        : 3,
      metadata: {
        ...metadata,
        pinned: false,
      },
    }
  }

  return null
}
