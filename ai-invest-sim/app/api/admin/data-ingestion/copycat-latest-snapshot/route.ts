import { NextResponse } from "next/server"

import { isAdmin } from "@/src/lib/auth/permissions"
import { getRequestUser, serverSupabase } from "@/src/lib/auth/server"
import { createIngestionJob, updateIngestionJob } from "@/src/lib/data-ingestion/jobs"

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  "QuantaraDataIngestion/0.1 (+https://quantarasim.local; contact=admin@quantarasim.local)"

type SecRecentFilings = {
  accessionNumber?: string[]
  form?: string[]
  reportDate?: string[]
  filingDate?: string[]
  primaryDocument?: string[]
}

type SecSubmissions = {
  cik?: string
  name?: string
  filings?: {
    recent?: SecRecentFilings
  }
}

type SecDirectory = {
  directory?: {
    item?: Array<{
      name?: string
      type?: string
      size?: string
    }>
  }
}

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

  if (!sourceId) {
    return NextResponse.json(
      { success: false, error: "copycat_source_id is required." },
      { status: 400 }
    )
  }

  const { data: source, error: sourceError } = await serverSupabase
    .from("copycat_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle()

  if (sourceError || !source) {
    return NextResponse.json(
      { success: false, error: sourceError?.message || "Copycat source not found." },
      { status: 404 }
    )
  }

  const job = await createIngestionJob(serverSupabase, {
    job_type: "copycat_snapshot",
    requested_by: user.id,
    target_name: String(source.name || ""),
    source_url: readString(source.source_url),
  })

  const warnings: string[] = []

  try {
    const cik = resolveCik(source)
    if (!cik) {
      throw new Error(
        "Could not resolve SEC CIK from copycat source metadata or source URL."
      )
    }

    const discovered = await discoverLatestSec13f({ cik, warnings })

    await updateIngestionJob(serverSupabase, job?.id || null, {
      status: "completed",
      source_url: discovered.snapshot_url,
      raw_payload: {
        operation: "latest_snapshot_discovery",
        cik,
        filing: discovered,
      },
      extracted_json: {
        operation: "latest_snapshot_discovery",
        source_id: sourceId,
        cik,
        discovery: discovered,
      },
      confidence: 0.95,
      warnings,
    })

    await serverSupabase
      .from("copycat_sources")
      .update({
        metadata: {
          ...(isRecord(source.metadata) ? source.metadata : {}),
          cik,
          latest_13f_discovery: discovered,
          latest_13f_discovered_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sourceId)

    return NextResponse.json({
      success: true,
      source_id: sourceId,
      cik,
      ...discovered,
      warnings,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to discover latest snapshot."
    await updateIngestionJob(serverSupabase, job?.id || null, {
      status: "failed",
      error_message: message,
      warnings,
    })

    return NextResponse.json(
      { success: false, error: message, warnings },
      { status: 500 }
    )
  }
}

async function discoverLatestSec13f({
  cik,
  warnings,
}: {
  cik: string
  warnings: string[]
}) {
  const paddedCik = cik.padStart(10, "0")
  const submissionsUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`
  const submissions = (await fetchJson(submissionsUrl)) as SecSubmissions
  const recent = submissions.filings?.recent
  if (!recent?.accessionNumber?.length) {
    throw new Error(`No recent SEC filings were found for CIK ${cik}.`)
  }

  const index = recent.accessionNumber.findIndex((accession, idx) => {
    const form = recent.form?.[idx] || ""
    return Boolean(accession) && (form === "13F-HR" || form === "13F-HR/A")
  })

  if (index < 0) {
    throw new Error(`No recent 13F-HR filing was found for CIK ${cik}.`)
  }

  const accessionNumber = recent.accessionNumber[index]
  const accessionCompact = accessionNumber.replace(/-/g, "")
  const reportDate = normalizeDate(recent.reportDate?.[index])
  const filingDate = normalizeDate(recent.filingDate?.[index])
  const primaryDocument = recent.primaryDocument?.[index] || null
  const directoryUrl = `https://www.sec.gov/Archives/edgar/data/${Number(
    cik
  )}/${accessionCompact}/index.json`
  const directory = (await fetchJson(directoryUrl)) as SecDirectory
  const items = directory.directory?.item || []
  const filingBaseUrl = `https://www.sec.gov/Archives/edgar/data/${Number(
    cik
  )}/${accessionCompact}`
  const infoTable = await findInfoTableDocument({
    items,
    primaryDocument,
    filingBaseUrl,
    warnings,
  })

  if (!infoTable) {
    throw new Error(
      `No information table XML was found in SEC filing ${accessionNumber}.`
    )
  }

  if (!reportDate) {
    warnings.push(
      "SEC submissions did not provide reportDate; filingDate will be shown separately and report date should be reviewed."
    )
  }

  return {
    source_type: "sec_13f",
    submissions_url: submissionsUrl,
    directory_url: directoryUrl,
    accession_number: accessionNumber,
    filing_date: filingDate,
    report_date: reportDate || filingDate,
    primary_document: primaryDocument,
    info_table_document: infoTable.name,
    snapshot_url: `${filingBaseUrl}/${infoTable.name}`,
  }
}

async function findInfoTableDocument({
  items,
  primaryDocument,
  filingBaseUrl,
  warnings,
}: {
  items: Array<{ name?: string; type?: string; size?: string }>
  primaryDocument: string | null
  filingBaseUrl: string
  warnings: string[]
}) {
  const primaryName = primaryDocument?.toLowerCase() || ""
  const xmlItems = items
    .map((item) => item.name || "")
    .filter((name) => {
      const lower = name.toLowerCase()
      return (
        lower.endsWith(".xml") &&
        !lower.includes("-index") &&
        lower !== primaryName &&
        !lower.endsWith("/primary_doc.xml")
      )
    })
    .sort((a, b) => scoreInfoTableCandidate(b) - scoreInfoTableCandidate(a))

  for (const name of xmlItems) {
    const text = await fetchText(`${filingBaseUrl}/${name}`)
    if (looksLikeInformationTable(text)) {
      return { name }
    }
  }

  if (primaryDocument?.toLowerCase().endsWith(".xml")) {
    const text = await fetchText(`${filingBaseUrl}/${primaryDocument}`)
    if (looksLikeInformationTable(text)) return { name: primaryDocument }
  }

  if (xmlItems.length > 0) {
    warnings.push(
      "SEC filing contained XML attachments, but none clearly contained information table rows; using the first non-primary XML as a fallback."
    )
    return { name: xmlItems[0] }
  }

  return null
}

function scoreInfoTableCandidate(name: string) {
  const lower = name.toLowerCase()
  let score = 0
  if (lower.includes("infotable")) score += 100
  if (lower.includes("info_table")) score += 100
  if (lower.includes("informationtable")) score += 100
  if (/^\d+\.xml$/i.test(name)) score += 50
  if (lower.includes("primary")) score -= 100
  if (lower.includes("form13f")) score -= 25
  return score
}

function looksLikeInformationTable(text: string) {
  const sample = text.slice(0, 500_000).toLowerCase()
  return (
    /<([a-z0-9]+:)?infotable[\s>]/i.test(sample) ||
    sample.includes("<informationtable")
  )
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json,*/*",
      "user-agent": SEC_USER_AGENT,
    },
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    throw new Error(`SEC responded with HTTP ${response.status} for ${url}.`)
  }

  return response.json()
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml,text/plain,*/*",
      "user-agent": SEC_USER_AGENT,
    },
    next: { revalidate: 0 },
  })

  if (!response.ok) {
    throw new Error(`SEC responded with HTTP ${response.status} for ${url}.`)
  }

  return response.text()
}

function resolveCik(source: Record<string, unknown>) {
  const metadata = isRecord(source.metadata) ? source.metadata : {}
  const metadataCik = readString(metadata.cik) || readString(metadata.sec_cik)
  if (metadataCik) return normalizeCik(metadataCik)

  const sourceUrl = readString(source.source_url)
  if (!sourceUrl) return null

  const archiveMatch = sourceUrl.match(/\/data\/(\d+)\//i)
  if (archiveMatch?.[1]) return normalizeCik(archiveMatch[1])

  const cikMatch =
    sourceUrl.match(/CIK(\d{1,10})/i) ||
    sourceUrl.match(/[?&]CIK=(\d{1,10})/i) ||
    sourceUrl.match(/\/browse-edgar\/.*?(\d{6,10})/i)
  return cikMatch?.[1] ? normalizeCik(cikMatch[1]) : null
}

function normalizeCik(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.replace(/^0+/, "") || digits
}

function normalizeDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
