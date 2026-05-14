import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  canFollowAgent,
  canFollowMoreAgents,
} from "../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const supabase = createAuthedClient(request)

  if (!requestUser) {
    return NextResponse.json({ success: true, following: false })
  }

  const { data, error } = await supabase
    .from("agent_follows")
    .select("*")
    .eq("agent_id", id)
    .eq("user_id", requestUser.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    following: data?.status === "active",
    follow: data || null,
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const supabase = createAuthedClient(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to follow an agent." },
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
      { success: false, error: "Agent not found" },
      { status: 404 }
    )
  }

  const followPermission = canFollowAgent(requestUser, agent)
  if (!followPermission.allowed) {
    return NextResponse.json(
      { success: false, error: followPermission.reason },
      { status: 403 }
    )
  }

  const { count: followCount, error: followCountError } = await supabase
    .from("agent_follows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", requestUser.id)
    .eq("status", "active")

  if (followCountError) {
    return NextResponse.json(
      { success: false, error: followCountError.message },
      { status: 500 }
    )
  }

  const quotaPermission = canFollowMoreAgents({
    user: requestUser,
    followCount: followCount || 0,
  })

  if (!quotaPermission.allowed) {
    return NextResponse.json(
      { success: false, error: quotaPermission.reason },
      { status: 403 }
    )
  }

  const { data, error } = await supabase
    .from("agent_follows")
    .upsert(
      {
        agent_id: id,
        user_id: requestUser.id,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,agent_id" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    following: true,
    follow: data,
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params
  const requestUser = await getRequestUser(request)
  const supabase = createAuthedClient(request)

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required to unfollow an agent." },
      { status: 401 }
    )
  }

  const { data, error } = await supabase
    .from("agent_follows")
    .update({ status: "exited", updated_at: new Date().toISOString() })
    .eq("agent_id", id)
    .eq("user_id", requestUser.id)
    .select()
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    following: false,
    follow: data || null,
  })
}

function createAuthedClient(request: Request) {
  const authorization = request.headers.get("authorization") || ""

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: authorization ? { Authorization: authorization } : {},
    },
  })
}
