"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../src/lib/supabase"
import type { Agent } from "../../src/lib/types/agent"

type AgentListItem = Agent & {
  creator_display_name?: string
  creator_role?: string
}

type SourceFilter = "all" | "system" | "user"
type VisibilityFilter = "all" | Agent["visibility"]
type LifecycleFilter = "all" | Agent["lifecycle_status"]

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all")
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>("all")

  const loadAgents = useCallback(async (token: string | null) => {
    setLoading(true)
    setError("")

    const res = await fetch("/api/agents", {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to load agents")
      setAgents([])
    } else {
      setAgents(data.agents || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession()
      setUser(data.session?.user || null)
      await loadAgents(data.session?.access_token || null)
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      loadAgents(session?.access_token || null)
    })

    return () => subscription.unsubscribe()
  }, [loadAgents])

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const systemAgent = isSystemOrAdminAgent(agent)
        if (sourceFilter === "system" && !systemAgent) return false
        if (sourceFilter === "user" && systemAgent) return false
        if (
          visibilityFilter !== "all" &&
          agent.visibility !== visibilityFilter
        ) {
          return false
        }
        if (
          lifecycleFilter !== "all" &&
          agent.lifecycle_status !== lifecycleFilter
        ) {
          return false
        }
        return true
      }),
    [agents, lifecycleFilter, sourceFilter, visibilityFilter]
  )
  const systemAgents = filteredAgents.filter(isSystemOrAdminAgent)
  const userAgents = filteredAgents.filter(
    (agent) => !isSystemOrAdminAgent(agent)
  )

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Investment Agents</h1>
            <p className="mt-2 text-slate-400">
              Browse public agents and manage the agents attached to your account.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden max-w-[220px] truncate text-sm text-slate-400 md:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut()
                    setUser(null)
                    await loadAgents(null)
                  }}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-900"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-900"
              >
                Log in
              </Link>
            )}
            <Link
              href="/agents/new"
              className="rounded-lg bg-blue-600 px-4 py-2 hover:bg-blue-700"
            >
              Create Agent
            </Link>
          </div>
        </div>

        <AgentFilters
          sourceFilter={sourceFilter}
          visibilityFilter={visibilityFilter}
          lifecycleFilter={lifecycleFilter}
          onSourceChange={setSourceFilter}
          onVisibilityChange={setVisibilityFilter}
          onLifecycleChange={setLifecycleFilter}
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950 p-3 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading agents...</p>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-slate-800 p-8 text-center">
            <p className="text-slate-400">
              {user
                ? "No visible agents yet."
                : "No public agents yet. Log in to create your own private agent."}
            </p>
            <Link
              href={user ? "/agents/new" : "/auth/login"}
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 hover:bg-blue-700"
            >
              {user ? "Create your first Agent" : "Log in"}
            </Link>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-slate-800 p-8 text-center">
            <p className="text-slate-400">
              No agents match the selected filters.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <AgentSection
              title="System & Admin Agents"
              description="Platform-managed agents and admin-created public/system agents."
              agents={systemAgents}
              emptyMessage="No system or admin agents match the selected filters."
            />
            <AgentSection
              title="User Agents"
              description="Agents created by individual users. Creator names use display name first, then email prefix."
              agents={userAgents}
              emptyMessage="No user-created agents match the selected filters."
            />
          </div>
        )}
      </div>
    </main>
  )
}

function AgentFilters({
  sourceFilter,
  visibilityFilter,
  lifecycleFilter,
  onSourceChange,
  onVisibilityChange,
  onLifecycleChange,
}: {
  sourceFilter: SourceFilter
  visibilityFilter: VisibilityFilter
  lifecycleFilter: LifecycleFilter
  onSourceChange: (value: SourceFilter) => void
  onVisibilityChange: (value: VisibilityFilter) => void
  onLifecycleChange: (value: LifecycleFilter) => void
}) {
  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <FilterSelect
          label="Source"
          value={sourceFilter}
          onChange={(value) => onSourceChange(value as SourceFilter)}
          options={[
            ["all", "All sources"],
            ["system", "System/Admin"],
            ["user", "User-created"],
          ]}
        />
        <FilterSelect
          label="Visibility"
          value={visibilityFilter}
          onChange={(value) => onVisibilityChange(value as VisibilityFilter)}
          options={[
            ["all", "All visibility"],
            ["system", "System"],
            ["public", "Public"],
            ["private", "Private"],
          ]}
        />
        <FilterSelect
          label="Status"
          value={lifecycleFilter}
          onChange={(value) => onLifecycleChange(value as LifecycleFilter)}
          options={[
            ["all", "All status"],
            ["active", "Active"],
            ["paused", "Paused"],
            ["retired", "Retired"],
            ["archived", "Archived"],
          ]}
        />
      </div>
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

function AgentSection({
  title,
  description,
  agents,
  emptyMessage,
}: {
  title: string
  description: string
  agents: AgentListItem[]
  emptyMessage: string
}) {
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span className="rounded-md border border-slate-800 px-2 py-1 text-xs text-slate-400">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  )
}

function AgentCard({ agent }: { agent: AgentListItem }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="rounded-xl border border-slate-800 p-6 transition hover:border-blue-500"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{agent.name}</h3>
        <span
          className={`rounded px-2 py-1 text-xs ${
            agent.lifecycle_status === "active" && agent.is_active
              ? "bg-green-900 text-green-300"
              : "bg-slate-800 text-slate-400"
          }`}
        >
          {formatToken(agent.lifecycle_status || "paused")}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <AgentPill value={agent.visibility || "private"} />
        <AgentPill value={agent.creator_type || "user"} />
        {agent.creator_role && <AgentPill value={agent.creator_role} />}
      </div>

      <p className="mb-4 min-h-10 text-sm text-slate-400">
        {agent.description || "No description"}
      </p>

      <div className="space-y-2 text-sm">
        <AgentMetric
          label="Value"
          value={`$${Number(agent.current_value).toLocaleString()}`}
        />
        <AgentMetric
          label="Creator"
          value={agent.creator_display_name || "Unknown user"}
        />
        <AgentMetric label="Risk" value={agent.risk_level} />
        <AgentMetric label="Frequency" value={agent.rebalance_frequency} />
      </div>
    </Link>
  )
}

function AgentPill({ value }: { value: string }) {
  return (
    <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs capitalize text-slate-300">
      {formatToken(value)}
    </span>
  )
}

function AgentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function isSystemOrAdminAgent(agent: AgentListItem) {
  return agent.visibility === "system" || agent.creator_type === "admin"
}

function formatToken(value: string) {
  return value.replaceAll("_", " ")
}
