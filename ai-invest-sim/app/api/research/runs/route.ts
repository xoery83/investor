import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { getRequestUser } from "../../../../src/lib/auth/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const requestUser = await getRequestUser(request)

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id,name,owner_user_id,visibility")

  if (agentsError) {
    return NextResponse.json(
      { success: false, error: agentsError.message },
      { status: 500 }
    )
  }

  const visibleAgents = (agents || []).filter((agent) => {
    if (requestUser?.profile.role === "admin") return true
    if (agent.visibility === "public" || agent.visibility === "system") {
      return true
    }
    return Boolean(requestUser && agent.owner_user_id === requestUser.id)
  })
  const visibleAgentIds = visibleAgents.map((agent) => agent.id)

  if (visibleAgentIds.length === 0) {
    return NextResponse.json({ success: true, runs: [] })
  }

  const agentNameById = new Map(
    visibleAgents.map((agent) => [String(agent.id), String(agent.name)])
  )
  const { data: runs, error: runsError } = await supabase
    .from("agent_runs")
    .select("*")
    .in("agent_id", visibleAgentIds)
    .in("run_type", ["daily", "weekly", "escalation"])
    .order("created_at", { ascending: false })
    .limit(30)

  if (runsError) {
    return NextResponse.json(
      { success: false, error: runsError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    runs: (runs || []).map((run) => ({
      ...run,
      agent_name: agentNameById.get(String(run.agent_id)) || "Agent",
    })),
  })
}
