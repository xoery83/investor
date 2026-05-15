import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { validateCronRequest } from "../../../../src/lib/cron/guard"
import { refreshPublicAgentValuationsCron } from "../../../../src/lib/cron/refresh-public-agent-valuations"
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
    const valuationResults = await refreshPublicAgentValuationsCron({
      supabase,
    })
    const dailyResearchResults = await runPublicAgentResearchCron({
      supabase,
      runType: "daily",
    })

    return NextResponse.json({
      success: true,
      job: "daily-maintenance",
      valuation_processed: valuationResults.length,
      daily_research_processed: dailyResearchResults.length,
      valuation_results: valuationResults,
      daily_research_results: dailyResearchResults,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Daily maintenance failed.",
      },
      { status: 500 }
    )
  }
}
