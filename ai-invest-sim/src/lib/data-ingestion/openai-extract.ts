import OpenAI from "openai"

import { temperatureParam } from "../openai/model-params"

export type ExtractorKind =
  | "copycat_source_discovery"
  | "copycat_snapshot"
  | "etf_lookthrough"

export type ExtractedIngestionResult = {
  extracted_json: Record<string, unknown>
  confidence: number | null
  warnings: string[]
  source: "openai" | "fallback"
}

const DEFAULT_EXTRACTION_MODEL =
  process.env.OPENAI_INGESTION_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5-mini"

export async function extractIngestionJson({
  kind,
  model = DEFAULT_EXTRACTION_MODEL,
  sourceText,
  context,
}: {
  kind: ExtractorKind
  model?: string
  sourceText: string
  context: Record<string, unknown>
}): Promise<ExtractedIngestionResult> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      extracted_json: buildFallbackExtraction(kind, context),
      confidence: 0.2,
      warnings: ["OPENAI_API_KEY is not configured; fallback extraction used."],
      source: "fallback",
    }
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      ...temperatureParam(model, 0.1),
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(kind),
        },
        {
          role: "user",
          content: JSON.stringify(
            {
              context,
              source_text: sourceText,
            },
            null,
            2
          ),
        },
      ],
    })

    const content = completion.choices[0]?.message?.content || "{}"
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      extracted_json: parsed,
      confidence: readConfidence(parsed.confidence),
      warnings: readWarnings(parsed.warnings),
      source: "openai",
    }
  } catch (error) {
    return {
      extracted_json: buildFallbackExtraction(kind, context),
      confidence: 0.2,
      warnings: [
        error instanceof Error
          ? `OpenAI extraction failed: ${error.message}`
          : "OpenAI extraction failed.",
      ],
      source: "fallback",
    }
  }
}

function buildSystemPrompt(kind: ExtractorKind) {
  const shared = `
You are a financial data extraction engine for an investment simulation system.
Return strict JSON only. Do not include markdown.
Do not invent missing values. Use null when a field is not available.
Include confidence from 0 to 1 and warnings as an array of strings.
`

  if (kind === "copycat_source_discovery") {
    return `${shared}
Task: identify plausible official or high-quality data sources for a copycat investment manager.
Return:
{
  "source_candidates": [
    {
      "name": string,
      "manager_name": string | null,
      "description": string | null,
      "source_type": "manual" | "13f" | "fund_holdings" | "api",
      "source_url": string | null,
      "benchmark_symbol": string | null,
      "rebalance_frequency": "daily" | "weekly" | "monthly" | "quarterly",
      "default_base_currency": string,
      "reason": string
    }
  ],
  "confidence": number,
  "warnings": string[]
}`
  }

  if (kind === "copycat_snapshot") {
    return `${shared}
Task: extract a holdings snapshot for a copycat source.
If the source is a 13F XML information table, it may contain issuer names and CUSIPs but no ticker symbols.
Use context.report_date as the report_date when the source text does not include one.
Only infer ticker symbols from issuer name/CUSIP when context.allow_ticker_matching is true. If you infer a symbol, include ticker_match_confidence and ticker_match_reason, and add a warning that ticker matching requires admin review.
Return:
{
  "report_date": "YYYY-MM-DD" | null,
  "effective_date": "YYYY-MM-DD" | null,
  "source_url": string | null,
  "total_reported_value": number | null,
  "base_currency": string,
  "status": "draft" | "active",
  "holdings": [
    {
      "symbol": string,
      "cusip": string | null,
      "asset_name": string | null,
      "asset_type": "stock" | "etf" | "fund" | "cash" | "other",
      "weight": number | null,
      "reported_value": number | null,
      "quantity": number | null,
      "currency": string,
      "ticker_match_confidence": number | null,
      "ticker_match_reason": string | null
    }
  ],
  "confidence": number,
  "warnings": string[]
}`
  }

  return `${shared}
Task: extract ETF or fund look-through holdings.
Return:
{
  "instrument_symbol": string,
  "instrument_name": string | null,
  "instrument_type": "etf" | "fund",
  "source_url": string | null,
  "as_of": "YYYY-MM-DD" | null,
  "total_known_weight": number | null,
  "holdings": [
    {
      "underlying_symbol": string,
      "underlying_name": string | null,
      "underlying_type": "stock" | "etf" | "fund" | "cash" | "other" | null,
      "weight": number,
      "currency": string | null
    }
  ],
  "confidence": number,
  "warnings": string[]
}`
}

function buildFallbackExtraction(
  kind: ExtractorKind,
  context: Record<string, unknown>
) {
  if (kind === "copycat_source_discovery") {
    return {
      source_candidates: [],
      confidence: 0.2,
      warnings: ["No model extraction was available."],
      context,
    }
  }

  if (kind === "copycat_snapshot") {
    return {
      report_date: null,
      holdings: [],
      confidence: 0.2,
      warnings: ["No model extraction was available."],
      context,
    }
  }

  return {
    instrument_symbol: context.target_symbol || null,
    holdings: [],
    confidence: 0.2,
    warnings: ["No model extraction was available."],
    context,
  }
}

function readConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null
}

function readWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}
