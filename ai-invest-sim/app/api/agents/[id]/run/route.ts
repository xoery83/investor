import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { runAgent } from "../../../../../src/lib/agents/run-agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

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

  if (!agent.is_active) {
    return NextResponse.json(
      { success: false, error: "Agent is paused" },
      { status: 400 }
    )
  }

  try {
    const { data: holdings } = await supabase
        .from("agent_holdings")
        .select("*")
        .eq("agent_id", id)

        const { data: valuations } = await supabase
        .from("agent_valuations")
        .select("*")
        .eq("agent_id", id)
        .order("recorded_at", { ascending: true })

        const { data: recentRuns } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("agent_id", id)
        .order("created_at", { ascending: false })
        .limit(3)

        const result = await runAgent({
        agent,
        holdings: holdings || [],
        valuations: valuations || [],
        recentRuns: recentRuns || [],
        })

    const { data: runRecord, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        agent_id: id,
        run_type: "manual",
        summary: result.summary || "Agent generated a recommendation.",
        recommendation: result,
        risks: result.risks || [],
        status: "completed",
      })
      .select()
      .single()

    if (runError) {
      return NextResponse.json(
        { success: false, error: runError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      result,
      run: runRecord,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to run agent",
      },
      { status: 500 }
    )
  }
}