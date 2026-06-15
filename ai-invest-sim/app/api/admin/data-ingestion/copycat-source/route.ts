import { NextResponse } from "next/server"

import { isAdmin } from "@/src/lib/auth/permissions"
import { getRequestUser, serverSupabase } from "@/src/lib/auth/server"
import { createIngestionJob, updateIngestionJob } from "@/src/lib/data-ingestion/jobs"
import { extractIngestionJson } from "@/src/lib/data-ingestion/openai-extract"
import { loadWebSource } from "@/src/lib/data-ingestion/web-source"

export async function POST(request: Request) {
  const user = await getRequestUser(request)
  if (!user || !isAdmin(user)) {
    return NextResponse.json(
      { success: false, error: "Admin access required." },
      { status: 403 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  const managerName = readString(body.manager_name)
  const targetName = readString(body.target_name) || managerName
  const sourceUrl = readString(body.source_url)
  const rawText = readString(body.raw_text)

  if (!managerName && !targetName) {
    return NextResponse.json(
      { success: false, error: "manager_name or target_name is required." },
      { status: 400 }
    )
  }

  const job = await createIngestionJob(serverSupabase, {
    job_type: "copycat_source_discovery",
    requested_by: user.id,
    target_name: targetName,
    source_url: sourceUrl,
  })

  const source = await loadWebSource({ sourceUrl, rawText })
  const extraction = await extractIngestionJson({
    kind: "copycat_source_discovery",
    sourceText: source.raw_text,
    context: {
      manager_name: managerName,
      target_name: targetName,
      source_url: source.source_url,
    },
  })

  const warnings = [...source.warnings, ...extraction.warnings]
  await updateIngestionJob(serverSupabase, job?.id || null, {
    status: extraction.confidence && extraction.confidence >= 0.7
      ? "completed"
      : "needs_review",
    raw_text: source.raw_text,
    raw_payload: source.raw_payload,
    extracted_json: extraction.extracted_json,
    confidence: extraction.confidence,
    warnings,
    source_url: source.source_url,
  })

  return NextResponse.json({
    success: true,
    job_id: job?.id || null,
    source: extraction.source,
    extracted: extraction.extracted_json,
    confidence: extraction.confidence,
    warnings,
  })
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}
