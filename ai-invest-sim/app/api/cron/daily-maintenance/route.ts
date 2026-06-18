import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { validateCronRequest } from "../../../../src/lib/cron/guard"
import { refreshActiveAgentMarketDataCron } from "../../../../src/lib/cron/refresh-active-agent-market-data"
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
    const marketQuoteResults = await refreshActiveAgentMarketDataCron({
      supabase,
    })
    const valuationResults = await refreshPublicAgentValuationsCron({
      supabase,
      force: true,
      forceMarketRefresh: false,
      skipPublicationReadiness: true,
      maxAgents: 100,
    })
    const dailyResearchResults = await runPublicAgentResearchCron({
      supabase,
      runType: "daily",
    })
    const weeklyResearchResults = await runPublicAgentResearchCron({
      supabase,
      runType: "weekly",
    })

    return NextResponse.json({
      success: true,
      job: "daily-maintenance",
      market_quotes_processed: marketQuoteResults.length,
      valuation_processed: valuationResults.length,
      daily_research_processed: dailyResearchResults.length,
      weekly_research_processed: weeklyResearchResults.length,
      market_quote_results: marketQuoteResults,
      valuation_results: valuationResults,
      daily_research_results: dailyResearchResults,
      weekly_research_results: weeklyResearchResults,
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
