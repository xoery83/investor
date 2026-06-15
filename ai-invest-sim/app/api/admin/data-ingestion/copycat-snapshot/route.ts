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
  const sourceId = readString(body.copycat_source_id)
  const sourceUrl = readString(body.source_url)
  const rawText = readString(body.raw_text)

  if (!sourceId) {
    return NextResponse.json(
      { success: false, error: "copycat_source_id is required." },
      { status: 400 }
    )
  }

  const { data: copycatSource, error: sourceError } = await serverSupabase
    .from("copycat_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle()

  if (sourceError || !copycatSource) {
    return NextResponse.json(
      { success: false, error: sourceError?.message || "Copycat source not found." },
      { status: 404 }
    )
  }

  const job = await createIngestionJob(serverSupabase, {
    job_type: "copycat_snapshot",
    requested_by: user.id,
    target_name: String(copycatSource.name || ""),
    source_url: sourceUrl || copycatSource.source_url || null,
  })

  const source = await loadWebSource({
    sourceUrl: sourceUrl || copycatSource.source_url,
    rawText,
  })
  const extraction = await extractIngestionJson({
    kind: "copycat_snapshot",
    sourceText: source.raw_text,
    context: {
      copycat_source: copycatSource,
      source_url: source.source_url,
      report_date: readString(body.report_date),
    },
  })

  const normalized = normalizeSnapshotExtraction(extraction.extracted_json)
  const warnings = [
    ...source.warnings,
    ...extraction.warnings,
    ...normalized.warnings,
  ]

  let snapshot = null
  if (normalized.snapshot && normalized.holdings.length > 0) {
    const { data, error } = await serverSupabase
      .from("copycat_source_snapshots")
      .upsert(
        {
          source_id: sourceId,
          ...normalized.snapshot,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source_id,report_date" }
      )
      .select()
      .single()

    if (error) {
      await updateIngestionJob(serverSupabase, job?.id || null, {
        status: "failed",
        raw_text: source.raw_text,
        raw_payload: source.raw_payload,
        extracted_json: extraction.extracted_json,
        confidence: extraction.confidence,
        warnings,
        error_message: error.message,
        source_url: source.source_url,
      })
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    snapshot = data
    const rows = normalized.holdings.map((holding) => ({
      snapshot_id: data.id,
      ...holding,
    }))
    const { error: holdingsError } = await serverSupabase
      .from("copycat_source_holdings")
      .upsert(rows, { onConflict: "snapshot_id,symbol" })

    if (holdingsError) {
      warnings.push(holdingsError.message)
    }
  }

  await updateIngestionJob(serverSupabase, job?.id || null, {
    status: snapshot ? "completed" : "needs_review",
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
    snapshot,
    holdings: normalized.holdings,
    extracted: extraction.extracted_json,
    confidence: extraction.confidence,
    warnings,
  })
}

function normalizeSnapshotExtraction(data: Record<string, unknown>) {
  const reportDate = cleanDate(data.report_date)
  const holdings = Array.isArray(data.holdings)
    ? data.holdings.flatMap(normalizeHolding)
    : []
  const warnings = []
  const totalWeight = holdings.reduce((sum, item) => sum + item.weight, 0)

  if (!reportDate) warnings.push("Report date is missing or invalid.")
  if (holdings.length === 0) warnings.push("No holdings were extracted.")
  if (totalWeight > 0 && (totalWeight < 90 || totalWeight > 110)) {
    warnings.push(`Holding weights sum to ${round(totalWeight)}%, not near 100%.`)
  }

  return {
    snapshot: reportDate
      ? {
          report_date: reportDate,
          effective_date: cleanDate(data.effective_date),
          source_url: readString(data.source_url),
          total_reported_value: readOptionalNumber(data.total_reported_value),
          base_currency: readString(data.base_currency)?.toUpperCase() || "USD",
          status: "active",
          metadata: {
            extraction_confidence: readOptionalNumber(data.confidence),
            total_weight: round(totalWeight),
          },
        }
      : null,
    holdings,
    warnings,
  }
}

function normalizeHolding(value: unknown) {
  if (!isRecord(value)) return []
  const symbol = normalizeSymbol(value.symbol)
  const weight = readOptionalNumber(value.weight)
  if (!symbol || weight === null || weight <= 0) return []

  return [
    {
      symbol,
      asset_name: readString(value.asset_name),
      asset_type: readString(value.asset_type) || "stock",
      weight,
      reported_value: readOptionalNumber(value.reported_value),
      quantity: readOptionalNumber(value.quantity),
      currency: readString(value.currency)?.toUpperCase() || "USD",
      metadata: {},
    },
  ]
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeSymbol(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim().toUpperCase().replace(/-/g, ".")
    : null
}

function readOptionalNumber(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function cleanDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null
}

function round(value: number) {
  return Math.round(value * 10000) / 10000
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
