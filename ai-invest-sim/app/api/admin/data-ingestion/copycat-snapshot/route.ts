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
  const extractionChoice = chooseSnapshotExtraction({
    parsed13f,
    modelExtraction: extraction.extracted_json,
  })
  const extractedJson = extractionChoice.extractedJson

  const normalized = normalizeSnapshotExtraction(
    extractedJson,
    reportDateOverride,
    source.source_url
  )
  const warnings = [
    ...source.warnings,
    ...extraction.warnings,
    ...(parsed13f?.warnings || []),
    ...extractionChoice.warnings,
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
    const { error: clearHoldingsError } = await serverSupabase
      .from("copycat_source_holdings")
      .delete()
      .eq("snapshot_id", data.id)

    if (clearHoldingsError) {
      warnings.push(clearHoldingsError.message)
    }

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

  const blocks =
    rawText.match(/<(?:\w+:)?infoTable\b[\s\S]*?<\/(?:\w+:)?infoTable>/gi) ||
    []
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
  const matchedValue = rawHoldings
    .filter((holding) => holding.symbol)
    .reduce((sum, holding) => sum + (holding.reported_value || 0), 0)
  const holdings = aggregate13fHoldings(rawHoldings)
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
    metadata: {
      parser: "deterministic_13f_xml",
      raw_rows: rawHoldings.length,
      matched_rows: rawHoldings.length - unmatched.length,
      unmatched_rows: unmatched.length,
      matched_reported_value_pct:
        totalValue > 0 ? round((matchedValue / totalValue) * 100) : null,
    },
    holdings,
    confidence: holdings.length > 0 ? 0.85 : 0.45,
    warnings,
  }
}

function chooseSnapshotExtraction({
  parsed13f,
  modelExtraction,
}: {
  parsed13f: Record<string, unknown> | null
  modelExtraction: Record<string, unknown>
}) {
  if (!parsed13f || getHoldingCount(parsed13f) === 0) {
    return { extractedJson: modelExtraction, warnings: [] }
  }

  const parsedCount = getHoldingCount(parsed13f)
  const modelCount = getHoldingCount(modelExtraction)
  const parsedWeight = getEffectiveHoldingWeightSum(parsed13f)
  const modelWeight = getEffectiveHoldingWeightSum(modelExtraction)
  const parsedMetadata = isRecord(parsed13f.metadata) ? parsed13f.metadata : {}
  const matchedReportedValuePct = readOptionalNumber(
    parsedMetadata.matched_reported_value_pct
  )
  const deterministicCoverageIsLow =
    (matchedReportedValuePct !== null && matchedReportedValuePct < 80) ||
    (parsedWeight > 0 && parsedWeight < 80)
  const modelLooksMoreComplete =
    modelCount > parsedCount && (modelWeight >= parsedWeight || parsedWeight < 80)

  if (deterministicCoverageIsLow && modelLooksMoreComplete) {
    return {
      extractedJson: modelExtraction,
      warnings: [
        `Deterministic 13F parser matched ${parsedCount} holdings / ${round(
          parsedWeight
        )}% weight; OpenAI extraction returned ${modelCount} holdings / ${round(
          modelWeight
        )}% weight, so the model extraction was used for this snapshot.`,
      ],
    }
  }

  return { extractedJson: parsed13f, warnings: [] }
}

function getHoldingCount(value: Record<string, unknown>) {
  return Array.isArray(value.holdings) ? value.holdings.length : 0
}

function getHoldingWeightSum(value: Record<string, unknown>) {
  if (!Array.isArray(value.holdings)) return 0
  return value.holdings.reduce((sum, item) => {
    if (!isRecord(item)) return sum
    return sum + Number(item.weight || 0)
  }, 0)
}

function getEffectiveHoldingWeightSum(value: Record<string, unknown>) {
  const weight = getHoldingWeightSum(value)
  return weight > 0 && weight <= 1.5 ? weight * 100 : weight
}

function aggregate13fHoldings(
  holdings: Array<{
    symbol: string | null
    cusip: string | null
    asset_name: string
    asset_type: string
    title_of_class: string | null
    raw_reported_value_thousands: number
    reported_value: number
    quantity: number | null
    currency: string
    ticker_match_confidence: number | null
    ticker_match_reason: string | null
  }>
) {
  const bySymbol = new Map<string, (typeof holdings)[number] & { cusips: string[] }>()

  for (const holding of holdings) {
    if (!holding.symbol) continue
    const existing = bySymbol.get(holding.symbol)
    if (!existing) {
      bySymbol.set(holding.symbol, {
        ...holding,
        cusips: holding.cusip ? [holding.cusip] : [],
      })
      continue
    }

    existing.reported_value += holding.reported_value
    existing.raw_reported_value_thousands += holding.raw_reported_value_thousands
    existing.quantity =
      existing.quantity !== null || holding.quantity !== null
        ? Number(existing.quantity || 0) + Number(holding.quantity || 0)
        : null
    if (holding.cusip && !existing.cusips.includes(holding.cusip)) {
      existing.cusips.push(holding.cusip)
    }
    existing.ticker_match_confidence = Math.max(
      Number(existing.ticker_match_confidence || 0),
      Number(holding.ticker_match_confidence || 0)
    )
    existing.ticker_match_reason = [
      existing.ticker_match_reason,
      holding.ticker_match_reason,
    ]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .join(" | ")
  }

  return Array.from(bySymbol.values()).map(({ cusips, ...holding }) => ({
    ...holding,
    cusip: cusips.join(", ") || holding.cusip,
  }))
}

function normalizeSnapshotExtraction(
  data: Record<string, unknown>,
  reportDateFallback: string | null,
  sourceUrlFallback: string | null
) {
  const reportDate = cleanDate(data.report_date) || reportDateFallback
  const rawHoldings = Array.isArray(data.holdings)
    ? data.holdings.flatMap(normalizeHolding)
    : []
  const normalizedWeights = normalizeHoldingWeights(rawHoldings, data)
  const holdings = normalizedWeights.holdings
  const warnings = [...normalizedWeights.warnings]
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
            ...(isRecord(data.metadata) ? data.metadata : {}),
            extraction_confidence: readOptionalNumber(data.confidence),
            total_weight: round(totalWeight),
          },
        }
      : null,
    holdings,
    warnings,
  }
}

function normalizeHoldingWeights(
  holdings: ReturnType<typeof normalizeHolding> extends Array<infer T> ? T[] : never,
  data: Record<string, unknown>
) {
  const totalWeight = holdings.reduce((sum, item) => sum + item.weight, 0)
  const warnings: string[] = []

  if (holdings.length === 0 || totalWeight <= 0) {
    return { holdings, warnings }
  }

  const metadata = isRecord(data.metadata) ? data.metadata : {}
  const parser = readString(metadata.parser)
  const matchedReportedValuePct = readOptionalNumber(
    metadata.matched_reported_value_pct
  )
  const deterministicPartialMatch =
    parser === "deterministic_13f_xml" &&
    matchedReportedValuePct !== null &&
    matchedReportedValuePct < 80

  if (totalWeight <= 1.5) {
    warnings.push(
      `Holding weights appeared to be fractional (${round(
        totalWeight
      )}); scaled them to percentage units.`
    )
    return {
      holdings: holdings.map((holding) => ({
        ...holding,
        weight: round(holding.weight * 100),
      })),
      warnings,
    }
  }

  const reportedValueHoldings = holdings.filter(
    (holding) =>
      typeof holding.reported_value === "number" && holding.reported_value > 0
  )
  const reportedValueSum = reportedValueHoldings.reduce(
    (sum, holding) => sum + Number(holding.reported_value || 0),
    0
  )

  if (
    !deterministicPartialMatch &&
    reportedValueSum > 0 &&
    reportedValueHoldings.length >= Math.max(1, holdings.length * 0.7) &&
    (totalWeight < 80 || totalWeight > 110)
  ) {
    warnings.push(
      "Holding weights were recomputed from reported values because extracted weights were not near 100%."
    )
    return {
      holdings: holdings.map((holding) => ({
        ...holding,
        weight:
          typeof holding.reported_value === "number" && holding.reported_value > 0
            ? round((holding.reported_value / reportedValueSum) * 100)
            : holding.weight,
      })),
      warnings,
    }
  }

  return { holdings, warnings }
}

function looksLike13fXml(value: string) {
  const sample = value.slice(0, 200_000).toLowerCase()
  return (
    /<(?:\w+:)?infotable\b/i.test(sample) &&
    /<(?:\w+:)?nameofissuer\b/i.test(sample) &&
    /<(?:\w+:)?cusip\b/i.test(sample)
  )
}

function readXmlTag(block: string, tagName: string) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = block.match(
    new RegExp(
      `<(?:\\w+:)?${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${escapedTag}>`,
      "i"
    )
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
  "000899104": "ADMA",
  "002824100": "ABT",
  "00287Y109": "ABBV",
  "013872106": "AA",
  "02079K305": "GOOGL",
  "02079K107": "GOOG",
  "020398707": "ALM",
  "023135106": "AMZN",
  "025816109": "AXP",
  "037833100": "AAPL",
  "042068205": "ARM",
  "060505104": "BAC",
  "07782B104": "BLTE",
  "084670702": "BRK.B",
  "093712107": "BE",
  "110122108": "BMY",
  "11135F101": "AVGO",
  "11271J107": "BN",
  "142152107": "CAI",
  "149123101": "CAT",
  "15101Q207": "CLS",
  "166764100": "CVX",
  "17275R102": "CSCO",
  "172967424": "C",
  "185899101": "CLF",
  "18915M107": "NET",
  "191216100": "KO",
  "19247G107": "COHR",
  "20030N101": "CMCSA",
  "22266T109": "CPNG",
  "23306J309": "DBVT",
  "234264109": "DAKT",
  "254687106": "DIS",
  "256746108": "DLR",
  "260003108": "DOV",
  "263534109": "DD",
  "278642103": "EBAY",
  "278768106": "SATS",
  "30303M102": "META",
  "31428X106": "FDX",
  "349381103": "FIGR",
  "369604301": "GE",
  "42806J700": "HTZ",
  "437076102": "HD",
  "444859102": "HUM",
  "44267T102": "HHH",
  "457669307": "INSM",
  "458140100": "INTC",
  "478160104": "JNJ",
  "500754106": "KHC",
  "501044101": "KR",
  "518415104": "LSCC",
  "532457108": "LLY",
  "55024U109": "LITE",
  "55261F104": "MTB",
  "57636Q104": "MA",
  "58733R102": "MELI",
  "594918104": "MSFT",
  "595112103": "MU",
  "615369105": "MCO",
  "632307104": "NTRA",
  "46428R107": "GSG",
  "464287655": "IWM",
  "466313103": "JBL",
  "67066G104": "NVDA",
  "67080N101": "NUVB",
  "674599105": "OXY",
  "68062P106": "OLMA",
  "68404L201": "OPCH",
  "713448108": "PEP",
  "717081103": "PFE",
  "742718109": "PG",
  "74366E102": "PTGX",
  "74623V103": "PCT",
  "74743L100": "Q",
  "76131D103": "QSR",
  "76155X100": "RVMD",
  "75886F107": "REGN",
  "77543R102": "ROKU",
  "78462F103": "SPY",
  "80004C200": "SNDK",
  "81141R100": "SE",
  "812215200": "SEG",
  "83443Q103": "SOLS",
  "84265V105": "SCCO",
  "861012102": "STM",
  "86384P109": "STUB",
  "874039100": "TSM",
  "87612E106": "TGT",
  "881624209": "TEVA",
  "88160R101": "TSLA",
  "90353T100": "UBER",
  "90138F102": "TWLO",
  "90184D100": "TWST",
  "910047109": "UAL",
  "911312106": "UPS",
  "91332U101": "U",
  "92837L109": "VIST",
  "929740108": "WAB",
  "92343E102": "VZ",
  "92343V104": "V",
  "92826C839": "V",
  "931142103": "WMT",
  "949746101": "WFC",
  "960413102": "WLK",
  "980745103": "WWD",
  "98420N105": "XENE",
  "984245100": "YPF",
  G0403H108: "AON",
  G21810109: "CB",
  G0896C103: "TBBB",
  G25508105: "CRH",
  G54950103: "LIN",
  G7997R103: "STX",
  N4732M103: "JBS",
  N53745100: "LYB",
  N62509109: "NAMS",
  Y95308105: "WVE",
}

const COMMON_13F_ISSUER_SYMBOLS: Array<[string, string]> = [
  ["APPLE", "AAPL"],
  ["ADMA BIOLOGICS", "ADMA"],
  ["ALCOA", "AA"],
  ["ALMONTY", "ALM"],
  ["AMERICAN EXPRESS", "AXP"],
  ["ARM HOLDINGS", "ARM"],
  ["BANK OF AMERICA", "BAC"],
  ["BBB FOODS", "TBBB"],
  ["BELITE BIO", "BLTE"],
  ["BERKSHIRE HATHAWAY", "BRK.B"],
  ["BLOOM ENERGY", "BE"],
  ["BROADCOM", "AVGO"],
  ["CARIS LIFE", "CAI"],
  ["CELESTICA", "CLS"],
  ["CHEVRON", "CVX"],
  ["CHUBB", "CB"],
  ["CITIGROUP", "C"],
  ["CLEVELAND-CLIFFS", "CLF"],
  ["CLOUDFLARE", "NET"],
  ["COHERENT", "COHR"],
  ["COCA COLA", "KO"],
  ["COCA-COLA", "KO"],
  ["COUPANG", "CPNG"],
  ["DAKTRONICS", "DAKT"],
  ["DBV TECHNOLOGIES", "DBVT"],
  ["ECHOSTAR", "SATS"],
  ["FIGURE TECHNOLOGY", "FIGR"],
  ["KRAFT HEINZ", "KHC"],
  ["HUMANA", "HUM"],
  ["INSMED", "INSM"],
  ["INTEL", "INTC"],
  ["JABIL", "JBL"],
  ["JBS", "JBS"],
  ["LATTICE SEMICONDUCTOR", "LSCC"],
  ["LINDE", "LIN"],
  ["LUMENTUM", "LITE"],
  ["LYONDELLBASELL", "LYB"],
  ["MERCADOLIBRE", "MELI"],
  ["MICRON", "MU"],
  ["MOODYS", "MCO"],
  ["MOODY", "MCO"],
  ["NATERA", "NTRA"],
  ["NEWAMSTERDAM", "NAMS"],
  ["NUVATION BIO", "NUVB"],
  ["OCCIDENTAL", "OXY"],
  ["OLEMA", "OLMA"],
  ["OPTION CARE", "OPCH"],
  ["PROTAGONIST", "PTGX"],
  ["PURECYCLE", "PCT"],
  ["QNITY", "Q"],
  ["VISA", "V"],
  ["MASTERCARD", "MA"],
  ["AMAZON", "AMZN"],
  ["AON", "AON"],
  ["BROOKFIELD", "BN"],
  ["CAPITAL ONE", "COF"],
  ["HERTZ", "HTZ"],
  ["HOWARD HUGHES", "HHH"],
  ["KROGER", "KR"],
  ["RESTAURANT BRANDS", "QSR"],
  ["REVOLUTION MEDICINES", "RVMD"],
  ["ROKU", "ROKU"],
  ["SANDISK", "SNDK"],
  ["SEA LTD", "SE"],
  ["SEAGATE", "STX"],
  ["SOUTHERN COPPER", "SCCO"],
  ["STMICROELECTRONICS", "STM"],
  ["STUBHUB", "STUB"],
  ["TAIWAN SEMICONDUCTOR", "TSM"],
  ["TEVA", "TEVA"],
  ["TWILIO", "TWLO"],
  ["TWIST BIOSCIENCE", "TWST"],
  ["UNITED AIRLS", "UAL"],
  ["UNITED AIRLINES", "UAL"],
  ["UNITY SOFTWARE", "U"],
  ["VISTA ENERGY", "VIST"],
  ["WABTEC", "WAB"],
  ["WAVE LIFE", "WVE"],
  ["WESTLAKE", "WLK"],
  ["WOODWARD", "WWD"],
  ["XENON PHARMACEUTICALS", "XENE"],
  ["YPF", "YPF"],
  ["SEAPORT", "SEG"],
  ["UBER", "UBER"],
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
