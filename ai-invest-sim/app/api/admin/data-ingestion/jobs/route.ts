import { NextResponse } from "next/server"

import { isAdmin } from "@/src/lib/auth/permissions"
import { getRequestUser, serverSupabase } from "@/src/lib/auth/server"

export async function GET(request: Request) {
  const user = await getRequestUser(request)
  if (!user || !isAdmin(user)) {
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 }
    )
  }

  const { data, error } = await serverSupabase
    .from("data_ingestion_jobs")
    .select(
      "id,job_type,status,target_symbol,target_name,source_url,extracted_json,confidence,warnings,error_message,created_at,updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(25)

  if (error) {
    if (isMissingIngestionJobTableError(error.message)) {
      return NextResponse.json({
        success: true,
        jobs: [],
        warning:
          "data_ingestion_jobs is not available yet. Run the data ingestion migration to enable the audit trail.",
      })
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    jobs: data || [],
  })
}

function isMissingIngestionJobTableError(message: string) {
  return (
    message.includes("data_ingestion_jobs") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
