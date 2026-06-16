import { NextResponse } from "next/server"

import { isAdmin } from "../../../../src/lib/auth/permissions"
import { getRequestUser, serverSupabase } from "../../../../src/lib/auth/server"
import { refreshPublicAgentValuationsCron } from "../../../../src/lib/cron/refresh-public-agent-valuations"

export async function POST(request: Request) {
  const user = await getRequestUser(request)

  if (!isAdmin(user)) {
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 }
    )
  }

  try {
    const results = await refreshPublicAgentValuationsCron({
      supabase: serverSupabase,
      force: true,
      skipPublicationReadiness: true,
      maxAgents: 100,
    })

    return NextResponse.json({
      success: true,
      job: "admin-refresh-valuations",
      processed: results.length,
      updated: results.filter((result) => result.status === "updated").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Admin valuation refresh failed.",
      },
      { status: 500 }
    )
  }
}
