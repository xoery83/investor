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
  const reportDateOverride = cleanDate(body.report_date)
  const allowTickerMatching = body.allow_ticker_matching !== false

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
      report_date: reportDateOverride,
      allow_ticker_matching: allowTickerMatching,
    },
  })
  const parsed13f = parse13fXmlExtraction({
    rawText: source.raw_text,
    reportDate: reportDateOverride,
    sourceUrl: source.source_url,
    allowTickerMatching,
  })
  const extractedJson =
    parsed13f && parsed13f.holdings.length > 0
      ? parsed13f
      : extraction.extracted_json

  const normalized = normalizeSnapshotExtraction(
    extractedJson,
    reportDateOverride,
    source.source_url
  )
  const warnings = [
    ...source.warnings,
    ...extraction.warnings,
    ...(parsed13f?.warnings || []),
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
        extracted_json: extractedJson,
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
    extracted_json: extractedJson,
    confidence: readOptionalNumber(extractedJson.confidence) ?? extraction.confidence,
    warnings,
    source_url: source.source_url,
  })

  return NextResponse.json({
    success: true,
    job_id: job?.id || null,
    snapshot,
    holdings: normalized.holdings,
    extracted: extractedJson,
    confidence: readOptionalNumber(extractedJson.confidence) ?? extraction.confidence,
    warnings,
  })
}

function parse13fXmlExtraction({
  rawText,
  reportDate,
  sourceUrl,
  allowTickerMatching,
}: {
  rawText: string
  reportDate: string | null
  sourceUrl: string | null
  allowTickerMatching: boolean
}) {
  if (!looksLike13fXml(rawText)) return null

  const blocks = rawText.match(/<infoTable\b[\s\S]*?<\/infoTable>/gi) || []
  const rawHoldings = blocks.flatMap((block) => {
    const issuer = readXmlTag(block, "nameOfIssuer")
    const title = readXmlTag(block, "titleOfClass")
    const cusip = readXmlTag(block, "cusip")
    const value = readXmlNumber(block, "value")
    const shares = readXmlNumber(block, "sshPrnamt")
    if (!issuer || value === null) return []
    const matched = allowTickerMatching ? match13fTicker({ cusip, issuer }) : null
    return [
      {
        symbol: matched?.symbol || null,
        cusip,
        asset_name: issuer,
        asset_type: "stock",
        title_of_class: title,
        raw_reported_value_thousands: value,
        reported_value: value * 1000,
        quantity: shares,
        currency: "USD",
        ticker_match_confidence: matched?.confidence ?? null,
        ticker_match_reason: matched?.reason ?? null,
      },
    ]
  })

  const totalValue = rawHoldings.reduce(
    (sum, holding) => sum + (holding.reported_value || 0),
    0
  )
  const holdings = rawHoldings
    .map((holding) => ({
      ...holding,
      weight:
        totalValue > 0
          ? round((Number(holding.reported_value || 0) / totalValue) * 100)
          : null,
    }))
    .filter((holding) => holding.symbol && holding.weight)

  const unmatched = rawHoldings.filter((holding) => !holding.symbol)
  const warnings = [
    "SEC 13F XML was parsed deterministically from infoTable rows.",
    "13F reported value is provided in thousands of USD and was converted to USD.",
  ]

  if (unmatched.length > 0) {
    warnings.push(
      `${unmatched.length} 13F rows were skipped because no ticker could be matched from CUSIP/issuer.`
    )
  }

  if (!reportDate) {
    warnings.push(
      "Report date was not found in the XML; provide it manually for a usable snapshot."
    )
  }

  return {
    report_date: reportDate,
    effective_date: null,
    source_url: sourceUrl,
    total_reported_value: totalValue || null,
    base_currency: "USD",
    status: "active",
    holdings,
    confidence: holdings.length > 0 ? 0.85 : 0.45,
    warnings,
  }
}

function normalizeSnapshotExtraction(
  data: Record<string, unknown>,
  reportDateFallback: string | null,
  sourceUrlFallback: string | null
) {
  const reportDate = cleanDate(data.report_date) || reportDateFallback
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
          source_url: readString(data.source_url) || sourceUrlFallback,
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

function looksLike13fXml(value: string) {
  const sample = value.slice(0, 10_000).toLowerCase()
  return (
    sample.includes("<infotable") &&
    sample.includes("<nameofissuer") &&
    sample.includes("<cusip")
  )
}

function readXmlTag(block: string, tagName: string) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = block.match(
    new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i")
  )
  return match ? decodeXml(match[1]).trim() || null : null
}

function readXmlNumber(block: string, tagName: string) {
  const text = readXmlTag(block, tagName)
  if (!text) return null
  const numeric = Number(text.replace(/,/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
}

function match13fTicker({
  cusip,
  issuer,
}: {
  cusip: string | null
  issuer: string
}) {
  const byCusip = cusip ? COMMON_13F_CUSIP_SYMBOLS[cusip.toUpperCase()] : null
  if (byCusip) {
    return {
      symbol: byCusip,
      confidence: 0.98,
      reason: `Matched by known 13F CUSIP ${cusip}.`,
    }
  }

  const normalizedIssuer = issuer.toUpperCase()
  const byIssuer = COMMON_13F_ISSUER_SYMBOLS.find(([needle]) =>
    normalizedIssuer.includes(needle)
  )
  if (byIssuer) {
    return {
      symbol: byIssuer[1],
      confidence: 0.8,
      reason: `Matched by issuer name containing "${byIssuer[0]}".`,
    }
  }

  return null
}

const COMMON_13F_CUSIP_SYMBOLS: Record<string, string> = {
  "002824100": "ABT",
  "00287Y109": "ABBV",
  "02079K305": "GOOGL",
  "023135106": "AMZN",
  "025816109": "AXP",
  "037833100": "AAPL",
  "060505104": "BAC",
  "084670702": "BRK.B",
  "110122108": "BMY",
  "149123101": "CAT",
  "166764100": "CVX",
  "17275R102": "CSCO",
  "172967424": "C",
  "191216100": "KO",
  "20030N101": "CMCSA",
  "254687106": "DIS",
  "256746108": "DLR",
  "260003108": "DOV",
  "263534109": "DD",
  "278642103": "EBAY",
  "30303M102": "META",
  "31428X106": "FDX",
  "369604301": "GE",
  "437076102": "HD",
  "478160104": "JNJ",
  "500754106": "KHC",
  "501044101": "KR",
  "532457108": "LLY",
  "55261F104": "MTB",
  "57636Q104": "MA",
  "594918104": "MSFT",
  "615369105": "MCO",
  "67066G104": "NVDA",
  "674599105": "OXY",
  "713448108": "PEP",
  "717081103": "PFE",
  "742718109": "PG",
  "75886F107": "REGN",
  "87612E106": "TGT",
  "88160R101": "TSLA",
  "911312106": "UPS",
  "92343E102": "VZ",
  "92343V104": "V",
  "92826C839": "V",
  "931142103": "WMT",
  "949746101": "WFC",
  G0403H108: "AON",
  G21810109: "CB",
}

const COMMON_13F_ISSUER_SYMBOLS: Array<[string, string]> = [
  ["APPLE", "AAPL"],
  ["AMERICAN EXPRESS", "AXP"],
  ["BANK OF AMERICA", "BAC"],
  ["BERKSHIRE HATHAWAY", "BRK.B"],
  ["CHEVRON", "CVX"],
  ["CHUBB", "CB"],
  ["CITIGROUP", "C"],
  ["COCA COLA", "KO"],
  ["COCA-COLA", "KO"],
  ["KRAFT HEINZ", "KHC"],
  ["MOODYS", "MCO"],
  ["MOODY", "MCO"],
  ["OCCIDENTAL", "OXY"],
  ["VISA", "V"],
  ["MASTERCARD", "MA"],
  ["AMAZON", "AMZN"],
  ["AON", "AON"],
  ["CAPITAL ONE", "COF"],
  ["KROGER", "KR"],
  ["VERISIGN", "VRSN"],
  ["DOMINO", "DPZ"],
  ["POOL", "POOL"],
  ["DAVITA", "DVA"],
]

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
      metadata: {
        cusip: readString(value.cusip),
        ticker_match_confidence: readOptionalNumber(
          value.ticker_match_confidence
        ),
        ticker_match_reason: readString(value.ticker_match_reason),
      },
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
