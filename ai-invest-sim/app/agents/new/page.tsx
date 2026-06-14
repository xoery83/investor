"use client"

import { type FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../../src/lib/supabase"
import type { AgentConfigDraft } from "../../api/agents/parse-profile/route"

type CurrentUser = {
  id: string
  email: string | null
  profile: {
    role: "admin" | "free" | "plus" | "pro"
    plan_status: string
  }
}

type CopycatSource = {
  id: string
  name: string
  manager_name: string | null
  description: string | null
  source_type: string
  benchmark_symbol: string | null
  rebalance_frequency: string
  default_base_currency: string
  status: string
}

export default function NewAgentPage() {
  const router = useRouter()

  const [naturalLanguage, setNaturalLanguage] = useState("")
  const [initialCapital, setInitialCapital] = useState(100000)
  const [baseCurrency, setBaseCurrency] = useState("USD")
  const [draft, setDraft] = useState<AgentConfigDraft | null>(null)
  const [draftSource, setDraftSource] = useState("")
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [agentMode, setAgentMode] = useState<"ai_manager" | "copycat">(
    "ai_manager"
  )
  const [copycatSourceId, setCopycatSourceId] = useState("")
  const [copycatSources, setCopycatSources] = useState<CopycatSource[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (token) {
        const [meRes, sourcesRes] = await Promise.all([
          fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("/api/copycat-sources"),
        ])

        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.success) setCurrentUser(meData.user)
        }

        if (sourcesRes.ok) {
          const sourcesData = await sourcesRes.json()
          if (sourcesData.success) {
            const sources = sourcesData.sources || []
            setCopycatSources(sources)
            if (sources[0]?.id) setCopycatSourceId(sources[0].id)
          }
        }
      }
      setAuthLoading(false)
    })
  }, [])

  async function handleGenerateDraft(e: FormEvent) {
    e.preventDefault()
    setParsing(true)
    setError("")
    setNotice("")

    const res = await fetch("/api/agents/parse-profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: naturalLanguage,
        initialCapital,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to parse agent profile")
      setParsing(false)
      return
    }

    setDraft(data.draft)
    setDraftSource(data.source || "")
    if (data.source === "fallback") {
      setNotice(
        data.warning
          ? `OpenAI parsing fell back: ${data.warning}`
          : "OpenAI parsing was unavailable, so the system preserved your manager intent and applied conservative defaults."
      )
    }
    setParsing(false)
  }

  async function handleCreateAgent(e: FormEvent) {
    e.preventDefault()
    if (!draft) return

    setCreating(true)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before creating an agent.")
      setCreating(false)
      return
    }

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        philosophy: draft.philosophy,
        risk_level: draft.risk_level,
        initial_capital: initialCapital,
        base_currency: baseCurrency,
        rebalance_frequency: draft.rebalance_frequency,
        profile: draft.profile,
        risk_policy: draft.risk_policy,
        workflow_config: draft.workflow_config,
        agent_mode: agentMode,
        copycat_source_id:
          agentMode === "copycat" ? copycatSourceId || null : null,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to create agent")
      setCreating(false)
      return
    }

    try {
      window.sessionStorage.removeItem("agents:list:auth")
    } catch {
      // Cache invalidation is best effort only.
    }

    router.push("/agents")
    router.refresh()
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
        Loading...
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto max-w-2xl rounded-xl border border-slate-800 p-8">
          <h1 className="text-3xl font-bold">Login required</h1>
          <p className="mt-3 text-slate-400">
            Agent creation is now attached to the current user account.
          </p>
          <Link
            href="/auth/login?next=/agents/new"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700"
          >
            Log in to create an agent
          </Link>
        </div>
      </main>
    )
  }

  const canCreateCopycat = currentUser?.profile.role === "admin"

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <Link href="/agents" className="text-sm text-blue-400">
            ← Back to Agents
          </Link>
        </div>

        <div className="mb-8">
          <div className="mb-3 inline-flex rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs font-medium uppercase tracking-wide text-blue-200">
            Step 1 of 2 · Draft first
          </div>
          <h1 className="text-3xl font-bold">Create New Agent</h1>
          <p className="mt-2 text-slate-400">
            Describe the manager intent first. The system will turn it into a structured agent configuration for review.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <form
            onSubmit={handleGenerateDraft}
            className="h-fit rounded-xl border border-slate-800 p-6"
          >
            <h2 className="text-xl font-semibold">Manager Intent</h2>
            <p className="mt-1 text-sm text-slate-500">
              You can be vague. The parser will choose conservative defaults and preserve your wording.
            </p>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm text-slate-400">
                Natural Language Brief
              </span>
              <textarea
                className="min-h-56 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2"
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder="Example: Build a conservative Australia-focused income agent. It should prefer Australian index ETFs, gold exposure, blue-chip stocks, and high-dividend stocks. Max drawdown should be around 10% and cash should stay below 20%."
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-slate-400">
                Initial Capital ({baseCurrency})
              </span>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Number(e.target.value))}
                min={1000}
                required
              />
            </label>

            <label className="mt-4 block">
              <span className="mb-2 block text-sm text-slate-400">
                Base Currency
              </span>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="AUD">AUD</option>
                <option value="HKD">HKD</option>
                <option value="NZD">NZD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Cash, portfolio totals, weights, and valuation history use this currency.
              </p>
            </label>

            {canCreateCopycat && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-600">
                    Agent Type
                  </span>
                  <select
                    className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2 text-slate-900"
                    value={agentMode}
                    onChange={(e) =>
                      setAgentMode(
                        e.target.value === "copycat"
                          ? "copycat"
                          : "ai_manager"
                      )
                    }
                  >
                    <option value="ai_manager">AI Manager</option>
                    <option value="copycat">Copycat Source Tracker</option>
                  </select>
                </label>

                {agentMode === "copycat" && (
                  <label className="mt-4 block">
                    <span className="mb-2 block text-sm text-slate-600">
                      Copycat Source
                    </span>
                    <select
                      className="w-full rounded-lg border border-blue-200 bg-white px-4 py-2 text-slate-900"
                      value={copycatSourceId}
                      onChange={(e) => setCopycatSourceId(e.target.value)}
                      required={agentMode === "copycat"}
                    >
                      {copycatSources.length === 0 ? (
                        <option value="">No active sources yet</option>
                      ) : (
                        copycatSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name}
                            {source.manager_name
                              ? ` · ${source.manager_name}`
                              : ""}
                          </option>
                        ))
                      )}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      Copycat agents are a foundation feature for system agents
                      that mirror known fund-manager portfolios.
                    </p>
                  </label>
                )}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
                {error}
              </div>
            )}
            {notice && (
              <div className="mt-4 rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={parsing || !naturalLanguage.trim()}
              className="mt-5 w-full rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:bg-slate-700"
            >
              {parsing ? "Generating draft..." : draft ? "Regenerate Draft" : "Preview Structured Draft"}
            </button>
          </form>

          <section className="rounded-xl border border-slate-800 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Structured Draft</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Review this before the agent is created.
                </p>
              </div>
              {draftSource && (
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs uppercase tracking-wide text-slate-400">
                  {draftSource}
                </span>
              )}
            </div>

            {!draft ? (
              <div className="rounded-lg border border-dashed border-slate-800 p-8 text-center text-slate-500">
                No draft yet. Enter a brief and generate the structured configuration.
              </div>
            ) : (
              <form onSubmit={handleCreateAgent} className="space-y-5">
                <DraftBlock title="Basic">
                  <DraftRow label="Name" value={draft.name} />
                  <DraftRow label="Description" value={draft.description} />
                  <DraftRow label="Risk" value={draft.risk_level} />
                  <DraftRow
                    label="Base Currency"
                    value={baseCurrency}
                  />
                  <DraftRow
                    label="Rebalance"
                    value={draft.rebalance_frequency}
                  />
                  <DraftRow
                    label="Agent Type"
                    value={
                      agentMode === "copycat"
                        ? "Copycat Source Tracker"
                        : "AI Manager"
                    }
                  />
                  {agentMode === "copycat" && (
                    <DraftRow
                      label="Copycat Source"
                      value={
                        copycatSources.find(
                          (source) => source.id === copycatSourceId
                        )?.name || "No source selected"
                      }
                    />
                  )}
                </DraftBlock>

                <DraftBlock title="Investment Profile">
                  <DraftRow
                    label="Strategy"
                    value={draft.profile.strategy_type}
                  />
                  <DraftRow label="Objective" value={draft.profile.objective} />
                  <DraftRow
                    label="Target Return"
                    value={`${draft.profile.target_annual_return_min}% - ${draft.profile.target_annual_return_max}%`}
                  />
                  <DraftRow
                    label="Max Drawdown"
                    value={`${draft.profile.max_drawdown_pct}%`}
                  />
                  <DraftTags
                    label="Target Markets"
                    values={draft.profile.target_markets}
                  />
                  <DraftTags
                    label="Allowed Assets"
                    values={draft.profile.allowed_assets}
                  />
                  <DraftTags
                    label="Excluded Assets"
                    values={draft.profile.excluded_assets}
                  />
                  <DraftRow
                    label="Manager Notes"
                    value={draft.profile.manager_instructions || "None"}
                  />
                </DraftBlock>

                <DraftBlock title="Risk Policy">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DraftRow
                      label="Cash Range"
                      value={`${draft.risk_policy.min_cash_pct}% - ${draft.risk_policy.max_cash_pct}%`}
                    />
                    <DraftRow
                      label="Single Stock Limit"
                      value={`${draft.risk_policy.max_single_stock_pct}%`}
                    />
                    <DraftRow
                      label="ETF Limit"
                      value={`${draft.risk_policy.max_etf_pct}%`}
                    />
                    <DraftRow
                      label="One Trade Limit"
                      value={`${draft.risk_policy.max_one_trade_pct}%`}
                    />
                  </div>
                  <DraftTags
                    label="Prohibited"
                    values={draft.risk_policy.prohibited_assets}
                  />
                </DraftBlock>

                <DraftBlock title="Workflow">
                  <div className="grid gap-3 md:grid-cols-3">
                    <DraftRow
                      label="Daily"
                      value={draft.workflow_config.daily_enabled ? "Enabled" : "Disabled"}
                    />
                    <DraftRow
                      label="Weekly"
                      value={draft.workflow_config.weekly_enabled ? "Enabled" : "Disabled"}
                    />
                    <DraftRow
                      label="Escalation"
                      value={draft.workflow_config.escalation_enabled ? "Enabled" : "Disabled"}
                    />
                  </div>
                </DraftBlock>

                <div className="flex justify-end gap-3 border-t border-slate-800 pt-5">
                  <button
                    type="button"
                    onClick={() => setDraft(null)}
                    className="rounded-lg border border-slate-700 px-5 py-2 text-slate-300 hover:bg-slate-900"
                  >
                    Edit Brief
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 disabled:bg-slate-700"
                  >
                    {creating ? "Creating..." : "Create Agent"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function DraftBlock({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function DraftRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 md:grid-cols-[150px_1fr]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm leading-relaxed text-slate-200">{value}</p>
    </div>
  )
}

function DraftTags({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-[150px_1fr]">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.length === 0 ? (
          <span className="text-sm text-slate-500">None</span>
        ) : (
          values.map((value) => (
            <span
              key={value}
              className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-200"
            >
              {value}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
