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
            {activeTab === "copycat-source" && getFirstSourceCandidate(result) && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="mb-3 text-sm text-emerald-800">
                  A source candidate is available. Review the JSON below before
                  creating the copycat source.
                </p>
                <Button disabled={loading} onClick={createCopycatSourceFromResult}>
                  {loading ? "Creating..." : "Create Copycat Source"}
                </Button>
              </div>
            )}
            {sourceWriteStatus && (
              <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {sourceWriteStatus}
              </p>
            )}
            <pre className="max-h-[520px] overflow-auto rounded-lg border border-blue-100 bg-slate-950 p-3 text-xs text-blue-50">
              {result ? JSON.stringify(result, null, 2) : "No result yet."}
            </pre>
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
                  <th className="py-2">Created</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Target</th>
                  <th>Confidence</th>
                  <th>Warnings</th>
                  <th>Action</th>
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
                    <td className="py-2">{new Date(job.created_at).toLocaleString()}</td>
                    <td>{job.job_type}</td>
                    <td>{job.status}</td>
                    <td>{job.target_symbol || job.target_name || "--"}</td>
                    <td>
                      {typeof job.confidence === "number"
                        ? `${Math.round(job.confidence * 100)}%`
                        : "--"}
                    </td>
                    <td className="max-w-md truncate">
                      {Array.isArray(job.warnings)
                        ? job.warnings.join("; ")
                        : job.error_message || "--"}
                    </td>
                    <td>
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

function getFirstSourceCandidate(value: unknown) {
  if (!isRecord(value)) return null
  const extracted = value.extracted_json
  if (!isRecord(extracted) || !Array.isArray(extracted.source_candidates)) {
    return null
  }
  const candidate = extracted.source_candidates.find(isRecord)
  return candidate || null
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
