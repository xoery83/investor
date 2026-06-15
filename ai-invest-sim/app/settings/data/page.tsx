"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { supabase } from "@/src/lib/supabase"

type CopycatSource = {
  id: string
  name: string
  manager_name: string | null
  status: string
}

type IngestionJob = {
  id: string
  job_type: string
  status: string
  target_symbol: string | null
  target_name: string | null
  source_url: string | null
  extracted_json: Record<string, unknown> | null
  confidence: number | null
  warnings: unknown
  error_message: string | null
  created_at: string
}

export default function DataSettingsPage() {
  const [token, setToken] = useState("")
  const [role, setRole] = useState("")
  const [sources, setSources] = useState<CopycatSource[]>([])
  const [jobs, setJobs] = useState<IngestionJob[]>([])
  const [jobsWarning, setJobsWarning] = useState("")
  const [activeTab, setActiveTab] = useState<
    "etf" | "copycat-source" | "copycat-snapshot"
  >("etf")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<unknown>(null)
  const [sourceWriteStatus, setSourceWriteStatus] = useState("")

  const [etfSymbol, setEtfSymbol] = useState("KWEB")
  const [etfUrl, setEtfUrl] = useState("")
  const [etfText, setEtfText] = useState("")

  const [managerName, setManagerName] = useState("Warren Buffett")
  const [sourceName, setSourceName] = useState("Berkshire Hathaway")
  const [sourceUrl, setSourceUrl] = useState("")
  const [sourceText, setSourceText] = useState("")

  const [snapshotSourceId, setSnapshotSourceId] = useState("")
  const [snapshotUrl, setSnapshotUrl] = useState("")
  const [snapshotText, setSnapshotText] = useState("")

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token || ""
      if (cancelled) return
      setToken(accessToken)

      if (!accessToken) return
      const headers = { Authorization: `Bearer ${accessToken}` }
      const [meRes, sourcesRes, jobsRes] = await Promise.all([
        fetch("/api/auth/me", { headers, cache: "no-store" }),
        fetch("/api/copycat-sources?include_inactive=true", {
          headers,
          cache: "no-store",
        }),
        fetch("/api/admin/data-ingestion/jobs", {
          headers,
          cache: "no-store",
        }),
      ])
      const [me, sourcesPayload, jobsPayload] = await Promise.all([
        meRes.json(),
        sourcesRes.json(),
        jobsRes.json(),
      ])
      if (cancelled) return
      setRole(me.user?.profile?.role || "")
      setSources(sourcesPayload.sources || [])
      setJobs(jobsPayload.jobs || [])
      setJobsWarning(jobsPayload.warning || jobsPayload.error || "")
      setSnapshotSourceId(sourcesPayload.sources?.[0]?.id || "")
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  async function refreshJobs() {
    if (!token) return
    const res = await fetch("/api/admin/data-ingestion/jobs", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    setJobs(data.jobs || [])
    setJobsWarning(data.warning || data.error || "")
  }

  async function refreshSources() {
    if (!token) return
    const res = await fetch("/api/copycat-sources?include_inactive=true", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    const data = await res.json()
    setSources(data.sources || [])
    setSnapshotSourceId((current) => current || data.sources?.[0]?.id || "")
  }

  async function runIngestion(endpoint: string, payload: Record<string, unknown>) {
    setLoading(true)
    setError("")
    setResult(null)
    setSourceWriteStatus("")
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      setResult(data)
      if (!data.success) setError(data.error || "Ingestion failed.")
      await refreshJobs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingestion failed.")
    } finally {
      setLoading(false)
    }
  }

  async function createCopycatSourceFromResult(sourceResult = result) {
    const candidate = getFirstSourceCandidate(sourceResult)
    if (!candidate || !token) return

    setLoading(true)
    setError("")
    setSourceWriteStatus("")
    try {
      const res = await fetch("/api/copycat-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: readString(candidate.name) || sourceName,
          manager_name: readString(candidate.manager_name) || managerName,
          description: readString(candidate.description),
          source_type: readString(candidate.source_type) || "manual",
          source_url: readString(candidate.source_url) || sourceUrl,
          benchmark_symbol: readString(candidate.benchmark_symbol),
          rebalance_frequency:
            readString(candidate.rebalance_frequency) || "quarterly",
          default_base_currency:
            readString(candidate.default_base_currency) || "USD",
          status: "active",
          metadata: {
            ingestion_candidate: candidate,
            ingestion_result: isRecord(sourceResult) ? sourceResult : {},
          },
        }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "Failed to create copycat source.")
        return
      }
      setSourceWriteStatus(`Created source: ${data.source?.name || "source"}`)
      await refreshSources()
      await refreshJobs()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create copycat source."
      )
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>
              Please sign in as an admin to manage data ingestion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/auth/login">Login</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (role !== "admin") {
    return (
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Admin Access Required</CardTitle>
            <CardDescription>
              Data ingestion controls are restricted to administrators.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6">
        <Link href="/settings" className="text-sm text-blue-600">
          ← Back to Settings
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          Data Ingestion
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Use AI-assisted extraction to populate copycat snapshots and ETF
          look-through data. Every attempt is stored as an ingestion job.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {[
          ["etf", "ETF Look-through"],
          ["copycat-source", "Copycat Source"],
          ["copycat-snapshot", "Copycat Snapshot"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key as typeof activeTab)}
            className={
              activeTab === key
                ? "rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
                : "rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm text-slate-700"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>{renderTabTitle(activeTab)}</CardTitle>
            <CardDescription>
              Provide a source URL when possible. Pasted raw text can be used
              when a source blocks server-side fetches.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeTab === "etf" && (
              <div className="space-y-4">
                <TextInput label="ETF Symbol" value={etfSymbol} onChange={setEtfSymbol} />
                <TextInput label="Issuer holdings URL" value={etfUrl} onChange={setEtfUrl} />
                <TextArea label="Optional pasted holdings text" value={etfText} onChange={setEtfText} />
                <Button
                  disabled={loading}
                  onClick={() =>
                    runIngestion("/api/admin/data-ingestion/etf-lookthrough", {
                      symbol: etfSymbol,
                      source_url: etfUrl,
                      raw_text: etfText,
                    })
                  }
                >
                  {loading ? "Extracting..." : "Extract ETF Look-through"}
                </Button>
              </div>
            )}

            {activeTab === "copycat-source" && (
              <div className="space-y-4">
                <TextInput label="Manager Name" value={managerName} onChange={setManagerName} />
                <TextInput label="Fund / Company Name" value={sourceName} onChange={setSourceName} />
                <TextInput label="Known source URL" value={sourceUrl} onChange={setSourceUrl} />
                <TextArea label="Optional pasted source text" value={sourceText} onChange={setSourceText} />
                <Button
                  disabled={loading}
                  onClick={() =>
                    runIngestion("/api/admin/data-ingestion/copycat-source", {
                      manager_name: managerName,
                      target_name: sourceName,
                      source_url: sourceUrl,
                      raw_text: sourceText,
                    })
                  }
                >
                  {loading ? "Discovering..." : "Discover Source Candidate"}
                </Button>
              </div>
            )}

            {activeTab === "copycat-snapshot" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm text-slate-600">
                    Copycat Source
                  </span>
                  <select
                    value={snapshotSourceId}
                    onChange={(event) => setSnapshotSourceId(event.target.value)}
                    className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
                  >
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} {source.manager_name ? `(${source.manager_name})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <TextInput label="Snapshot source URL" value={snapshotUrl} onChange={setSnapshotUrl} />
                <TextArea label="Optional pasted holdings text" value={snapshotText} onChange={setSnapshotText} />
                <Button
                  disabled={loading || !snapshotSourceId}
                  onClick={() =>
                    runIngestion("/api/admin/data-ingestion/copycat-snapshot", {
                      copycat_source_id: snapshotSourceId,
                      source_url: snapshotUrl,
                      raw_text: snapshotText,
                    })
                  }
                >
                  {loading ? "Extracting..." : "Extract Snapshot"}
                </Button>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest Result</CardTitle>
            <CardDescription>
              Preview the structured output and warnings from the last run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeTab === "copycat-source" &&
              getFirstSourceCandidate(result) && (
                <CopycatSourceCandidateReview
                  candidate={getFirstSourceCandidate(result)!}
                  confidence={readNumber(
                    isRecord(result) ? result.confidence : null
                  )}
                  warnings={readWarnings(
                    isRecord(result) ? result.warnings : null
                  )}
                  loading={loading}
                  onCreate={() => createCopycatSourceFromResult()}
                />
              )}
            {activeTab === "copycat-snapshot" &&
              getSnapshotExtraction(result) && (
                <CopycatSnapshotReview
                  result={result}
                  warnings={readWarnings(
                    isRecord(result) ? result.warnings : null
                  )}
                />
              )}
            {sourceWriteStatus && (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {sourceWriteStatus}
              </p>
            )}
            {result ? (
              <details className="rounded-lg border border-blue-100 bg-white">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                  Raw JSON details
                </summary>
                <pre className="max-h-[420px] overflow-auto border-t border-blue-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            ) : (
              <p className="rounded-lg border border-blue-100 bg-slate-50 p-3 text-sm text-slate-500">
                No result yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>
            Audit trail for source fetches, AI extraction, and writes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobsWarning && (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {jobsWarning}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2">Type</th>
                  <th className="px-2">Status</th>
                  <th className="px-2">Target</th>
                  <th className="px-2">Confidence</th>
                  <th className="px-2">Warnings</th>
                  <th className="px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 && (
                  <tr className="border-t border-blue-100">
                    <td className="py-4 text-slate-500" colSpan={7}>
                      No ingestion jobs yet.
                    </td>
                  </tr>
                )}
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-blue-100">
                    <td className="px-2 py-2">{new Date(job.created_at).toLocaleString()}</td>
                    <td className="px-2">{job.job_type}</td>
                    <td className="px-2">{job.status}</td>
                    <td className="px-2">{job.target_symbol || job.target_name || "--"}</td>
                    <td className="px-2">
                      {typeof job.confidence === "number"
                        ? `${Math.round(job.confidence * 100)}%`
                        : "--"}
                    </td>
                    <td className="max-w-md truncate px-2">
                      {Array.isArray(job.warnings)
                        ? job.warnings.join("; ")
                        : job.error_message || "--"}
                    </td>
                    <td className="px-2">
                      {job.job_type === "copycat_source_discovery" &&
                      getFirstSourceCandidate(job) ? (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            disabled={loading}
                            onClick={() => {
                              setActiveTab("copycat-source")
                              setResult({
                                success: true,
                                extracted_json: job.extracted_json || {},
                                confidence: job.confidence,
                                warnings: Array.isArray(job.warnings)
                                  ? job.warnings
                                  : [],
                              })
                            }}
                          >
                            Review
                          </Button>
                          <Button
                            disabled={loading}
                            onClick={() =>
                              createCopycatSourceFromResult({
                                success: true,
                                extracted_json: job.extracted_json || {},
                                confidence: job.confidence,
                                warnings: Array.isArray(job.warnings)
                                  ? job.warnings
                                  : [],
                              })
                            }
                          >
                            Create
                          </Button>
                        </div>
                      ) : job.job_type === "copycat_snapshot" &&
                        getSnapshotExtraction(job) ? (
                        <Button
                          variant="secondary"
                          disabled={loading}
                          onClick={() => {
                            setActiveTab("copycat-snapshot")
                            setResult({
                              success: true,
                              extracted_json: job.extracted_json || {},
                              confidence: job.confidence,
                              warnings: Array.isArray(job.warnings)
                                ? job.warnings
                                : [],
                              job_status: job.status,
                            })
                          }}
                        >
                          Review
                        </Button>
                      ) : (
                        "--"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-600">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2"
      />
    </label>
  )
}

function renderTabTitle(tab: string) {
  if (tab === "copycat-source") return "Copycat Source Discovery"
  if (tab === "copycat-snapshot") return "Copycat Snapshot Extraction"
  return "ETF Look-through Extraction"
}

function CopycatSourceCandidateReview({
  candidate,
  confidence,
  warnings,
  loading,
  onCreate,
}: {
  candidate: Record<string, unknown>
  confidence: number | null
  warnings: string[]
  loading: boolean
  onCreate: () => void
}) {
  const sourceUrl = readString(candidate.source_url)
  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Source Candidate
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {readString(candidate.name) || "Unnamed source"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {readString(candidate.manager_name) || "Unknown manager"}
          </p>
        </div>
        <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-sm text-blue-800">
          {confidence !== null ? `${Math.round(confidence * 100)}% confidence` : "Confidence unknown"}
        </span>
      </div>

      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="font-medium text-slate-500">Source Type</dt>
          <dd className="mt-1 text-slate-900">
            {readString(candidate.source_type) || "manual"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Reason</dt>
          <dd className="mt-1 text-slate-900">
            {readString(candidate.reason) ||
              readString(candidate.description) ||
              "No explanation returned."}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Source URL</dt>
          <dd className="mt-1 break-all text-blue-700">
            {sourceUrl ? (
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                {sourceUrl}
              </a>
            ) : (
              <span className="text-slate-500">No URL returned</span>
            )}
          </dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="font-medium text-slate-500">Frequency</dt>
            <dd className="mt-1 text-slate-900">
              {readString(candidate.rebalance_frequency) || "quarterly"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Base Currency</dt>
            <dd className="mt-1 text-slate-900">
              {readString(candidate.default_base_currency) || "USD"}
            </dd>
          </div>
        </div>
      </dl>

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Review warnings
          </p>
          <ul className="space-y-1 text-sm text-amber-800">
            {warnings.slice(0, 4).map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button disabled={loading} onClick={onCreate}>
          {loading ? "Creating..." : "Create Copycat Source"}
        </Button>
      </div>
    </div>
  )
}

function CopycatSnapshotReview({
  result,
  warnings,
}: {
  result: unknown
  warnings: string[]
}) {
  const extracted = getSnapshotExtraction(result)
  const holdings = getSnapshotHoldings(result)
  const snapshotWritten = isRecord(result) && Boolean(result.snapshot)
  const jobStatus = isRecord(result) ? readString(result.job_status) : null
  const reportDate = extracted ? readString(extracted.report_date) : null
  const effectiveDate = extracted ? readString(extracted.effective_date) : null
  const baseCurrency = extracted
    ? readString(extracted.base_currency) || "USD"
    : "USD"
  const totalWeight = holdings.reduce(
    (sum, holding) => sum + (readNumber(holding.weight) || 0),
    0
  )
  const topHoldings = holdings.slice(0, 6)

  return (
    <div
      className={
        snapshotWritten
          ? "mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          : "mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
      }
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className={
              snapshotWritten
                ? "text-xs font-semibold uppercase tracking-wide text-emerald-700"
                : "text-xs font-semibold uppercase tracking-wide text-amber-800"
            }
          >
            Snapshot Extraction
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {snapshotWritten ? "Snapshot written" : "Needs review"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {snapshotWritten
              ? "The extracted holdings were saved and can drive copycat agent runs."
              : "The extraction did not produce a usable holdings snapshot yet."}
          </p>
        </div>
        <span className="rounded-full border border-blue-200 bg-white px-3 py-1 text-sm text-blue-800">
          {jobStatus || (snapshotWritten ? "completed" : "needs_review")}
        </span>
      </div>

      <dl className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="font-medium text-slate-500">Report Date</dt>
          <dd className="mt-1 text-slate-900">{reportDate || "Missing"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Effective Date</dt>
          <dd className="mt-1 text-slate-900">{effectiveDate || "--"}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Holdings Extracted</dt>
          <dd className="mt-1 text-slate-900">{holdings.length}</dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Total Weight</dt>
          <dd className="mt-1 text-slate-900">
            {totalWeight > 0 ? `${roundDisplay(totalWeight)}%` : "--"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-slate-500">Base Currency</dt>
          <dd className="mt-1 text-slate-900">{baseCurrency}</dd>
        </div>
      </dl>

      {topHoldings.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Top extracted holdings
          </p>
          <div className="space-y-2">
            {topHoldings.map((holding, index) => (
              <div
                key={`${readString(holding.symbol) || "holding"}-${index}`}
                className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {readString(holding.symbol) || "--"}
                </span>
                <span className="text-slate-600">
                  {roundDisplay(readNumber(holding.weight) || 0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!snapshotWritten && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
          <p className="text-sm font-medium text-amber-900">
            Next action
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Provide a source URL or paste the raw 13F/holdings text, then run
            Extract Snapshot again. A usable snapshot requires a report date and
            at least one holding with a symbol and weight.
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3">
          <p className="mb-2 text-sm font-medium text-amber-900">
            Review warnings
          </p>
          <ul className="space-y-1 text-sm text-amber-800">
            {warnings.slice(0, 5).map((warning) => (
              <li key={warning}>- {warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function getFirstSourceCandidate(value: unknown) {
  if (!isRecord(value)) return null
  const extracted = value.extracted_json
  if (!isRecord(extracted) || !Array.isArray(extracted.source_candidates)) {
    return null
  }
  const candidate = extracted.source_candidates.find(isRecord)
  return candidate || null
}

function getSnapshotExtraction(value: unknown) {
  if (!isRecord(value)) return null
  if (isRecord(value.extracted)) return value.extracted
  if (isRecord(value.extracted_json)) return value.extracted_json
  return null
}

function getSnapshotHoldings(value: unknown) {
  if (!isRecord(value)) return []
  const directHoldings = Array.isArray(value.holdings) ? value.holdings : null
  if (directHoldings) return directHoldings.filter(isRecord)
  const extracted = getSnapshotExtraction(value)
  return extracted && Array.isArray(extracted.holdings)
    ? extracted.holdings.filter(isRecord)
    : []
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function roundDisplay(value: number) {
  return Math.round(value * 100) / 100
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
