import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { validateCronRequest } from "../../../../src/lib/cron/guard"
import { runPublicAgentResearchCron } from "../../../../src/lib/cron/run-public-agent-research"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(request: Request) {
  const guard = validateCronRequest(request)
  if (!guard.allowed) {
    return NextResponse.json(
      { success: false, error: guard.error },
      { status: guard.status }
    )
  }

  try {
    const results = await runPublicAgentResearchCron({
      supabase,
      runType: "weekly",
    })

    return NextResponse.json({
      success: true,
      job: "run-weekly-agents",
      processed: results.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Weekly cron failed.",
      },
      { status: 500 }
    )
  }
}
