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
  const symbol = normalizeSymbol(body.symbol)
  const sourceUrl = readString(body.source_url)
  const rawText = readString(body.raw_text)

  if (!symbol) {
    return NextResponse.json(
      { success: false, error: "symbol is required." },
      { status: 400 }
    )
  }

  const job = await createIngestionJob(serverSupabase, {
    job_type: "etf_lookthrough",
    requested_by: user.id,
    target_symbol: symbol,
    source_url: sourceUrl,
  })

  const source = await loadWebSource({ sourceUrl, rawText })
  const extraction = await extractIngestionJson({
    kind: "etf_lookthrough",
    sourceText: source.raw_text,
    context: {
      target_symbol: symbol,
      source_url: source.source_url,
    },
  })

  const normalized = normalizeLookthroughExtraction({
    data: extraction.extracted_json,
    fallbackSymbol: symbol,
    fallbackSourceUrl: source.source_url,
  })
  const warnings = [
    ...source.warnings,
    ...extraction.warnings,
    ...normalized.warnings,
  ]

  let exposures = []
  if (normalized.rows.length > 0) {
    const { data, error } = await serverSupabase
      .from("instrument_exposures")
      .upsert(normalized.rows, {
        onConflict: "instrument_symbol,underlying_symbol,as_of",
      })
      .select()

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

    exposures = data || []
  }

  await updateIngestionJob(serverSupabase, job?.id || null, {
    status: exposures.length > 0 ? "completed" : "needs_review",
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
    exposures,
    extracted: extraction.extracted_json,
    confidence: extraction.confidence,
    warnings,
  })
}

function normalizeLookthroughExtraction({
  data,
  fallbackSymbol,
  fallbackSourceUrl,
}: {
  data: Record<string, unknown>
  fallbackSymbol: string
  fallbackSourceUrl: string | null
}) {
  const instrumentSymbol =
    normalizeSymbol(data.instrument_symbol) || fallbackSymbol
  const asOf = cleanDate(data.as_of)
  const holdings = Array.isArray(data.holdings)
    ? data.holdings.flatMap((holding) =>
        normalizeExposureRow({
          holding,
          instrumentSymbol,
          instrumentName: readString(data.instrument_name),
          instrumentType: readString(data.instrument_type) || "etf",
          asOf,
          sourceUrl: readString(data.source_url) || fallbackSourceUrl,
          confidence: readOptionalNumber(data.confidence) || 0.8,
        })
      )
    : []
  const warnings = []
  const totalKnownWeight = holdings.reduce((sum, row) => sum + row.weight, 0)

  if (!asOf) warnings.push("ETF holdings as_of date is missing or invalid.")
  if (holdings.length === 0) warnings.push("No ETF holdings were extracted.")
  if (totalKnownWeight > 0 && totalKnownWeight < 50) {
    warnings.push(
      `Extracted look-through weights cover only ${round(totalKnownWeight)}%.`
    )
  }

  return {
    rows: holdings,
    warnings,
  }
}

function normalizeExposureRow({
  holding,
  instrumentSymbol,
  instrumentName,
  instrumentType,
  asOf,
  sourceUrl,
  confidence,
}: {
  holding: unknown
  instrumentSymbol: string
  instrumentName: string | null
  instrumentType: string
  asOf: string | null
  sourceUrl: string | null
  confidence: number
}) {
  if (!isRecord(holding)) return []
  const underlyingSymbol = normalizeSymbol(holding.underlying_symbol)
  const weight = readOptionalNumber(holding.weight)
  if (!underlyingSymbol || weight === null || weight <= 0) return []

  return [
    {
      instrument_symbol: instrumentSymbol,
      instrument_name: instrumentName,
      instrument_type: instrumentType,
      underlying_symbol: underlyingSymbol,
      underlying_name: readString(holding.underlying_name),
      underlying_type: readString(holding.underlying_type),
      weight,
      currency: readString(holding.currency)?.toUpperCase() || null,
      source: "ai_ingestion",
      source_url: sourceUrl,
      as_of: asOf,
      confidence,
      metadata: {},
      updated_at: new Date().toISOString(),
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
