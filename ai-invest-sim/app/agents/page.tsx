"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../src/lib/supabase"
import {
  formatCompactCurrencyAmount,
  formatCurrencyAmount,
} from "../../src/lib/format/currency"
import type { Agent } from "../../src/lib/types/agent"

type AgentListItem = Agent & {
  creator_display_name?: string
  creator_role?: string
  follower_count?: number
  is_following?: boolean
  follower_position_value?: number
}



type SourceFilter = "all" | "system" | "user"
type VisibilityFilter = "all" | Agent["visibility"]
type LifecycleFilter = "all" | Agent["lifecycle_status"]
type FollowingFilter = "all" | "following"
const AGENTS_CACHE_TTL_MS = 60_000

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
  const [followingFilter, setFollowingFilter] =
    useState<FollowingFilter>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [creatorFilter] = useState(() => {
    if (typeof window === "undefined") return ""
    return new URLSearchParams(window.location.search).get("creator") || ""
  })
  const inFlightRequestKey = useRef<string | null>(null)

  const loadAgents = useCallback(async (token: string | null, userId?: string) => {
    const cacheKey = token && userId
      ? `agents:list:auth:${userId}`
      : "agents:list:anon"
    const requestKey = userId || token || "anonymous"
    const cached = readAgentsCache(cacheKey)

    if (cached) {
      setAgents(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }

    if (inFlightRequestKey.current === requestKey) {
      return
    }

    inFlightRequestKey.current = requestKey
    setError("")

    try {
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {}
      const res = await fetch("/api/agents", {
        cache: "no-store",
        headers,
      })
      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Failed to load agents")
        setAgents([])
      } else {
        setAgents(data.agents || [])
        writeAgentsCache(cacheKey, data.agents || [])
      }
    } finally {
      if (inFlightRequestKey.current === requestKey) {
        inFlightRequestKey.current = null
      }

      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession()
      setUser(data.session?.user || null)
      await loadAgents(
        data.session?.access_token || null,
        data.session?.user?.id
      )
    }

    load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null)
      loadAgents(session?.access_token || null, session?.user?.id)
    })

    return () => subscription.unsubscribe()
  }, [loadAgents])

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        const query = searchQuery.trim().toLowerCase()
        const systemAgent = isSystemOrAdminAgent(agent)
        if (followingFilter === "following" && !agent.is_following) {
          return false
        }
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
        if (query && !agentMatchesQuery(agent, query)) return false
        if (creatorFilter && agent.owner_user_id !== creatorFilter) return false
        return true
      }),
    [
      agents,
      creatorFilter,
      followingFilter,
      lifecycleFilter,
      searchQuery,
      sourceFilter,
      visibilityFilter,
    ]
  )
  const systemAgents = filteredAgents.filter(isSystemOrAdminAgent)
  const userAgents = filteredAgents.filter(
    (agent) => !isSystemOrAdminAgent(agent)
  )

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
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
                    clearAgentsCache()
                    setUser(null)
                    await loadAgents(null)
                  }}
                  className="rounded-lg border border-blue-200 bg-white/70 px-4 py-2 text-slate-700 hover:bg-blue-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login?next=%2Fagents"
                className="rounded-lg border border-blue-200 bg-white/70 px-4 py-2 text-slate-700 hover:bg-blue-50"
              >
                Log in
              </Link>
            )}
            <Link
              href="/agents/new"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Create Agent
            </Link>
          </div>
        </div>

        <AgentFilters
          sourceFilter={sourceFilter}
          visibilityFilter={visibilityFilter}
          lifecycleFilter={lifecycleFilter}
          followingFilter={followingFilter}
          searchQuery={searchQuery}
          userLoggedIn={Boolean(user)}
          onSourceChange={setSourceFilter}
          onVisibilityChange={setVisibilityFilter}
          onLifecycleChange={setLifecycleFilter}
          onFollowingChange={setFollowingFilter}
          onSearchChange={setSearchQuery}
        />

        {creatorFilter && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">
            <span className="text-blue-800">
              Showing agents by{" "}
              {agents.find((agent) => agent.owner_user_id === creatorFilter)
                ?.creator_display_name || "selected creator"}
            </span>
            <Link href="/agents" className="text-blue-600 hover:text-blue-700">
              Clear creator filter
            </Link>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-400">Loading agents...</p>
        ) : agents.length === 0 ? (
          <div className="rounded-xl border border-blue-200 bg-white/60 p-8 text-center">
            <p className="text-slate-400">
              {user
                ? "No visible agents yet."
                : "No public agents yet. Log in to create your own private agent."}
            </p>
            <Link
              href={user ? "/agents/new" : "/auth/login?next=%2Fagents"}
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              {user ? "Create your first Agent" : "Log in"}
            </Link>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-blue-200 bg-white/60 p-8 text-center">
            <p className="text-slate-400">
              No agents match the selected filters.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <AgentSection
              title="System & Admin Agents"
              description="Platform-managed agents and admin-created discoverable agents. Only public agents can be followed."
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
  followingFilter,
  searchQuery,
  userLoggedIn,
  onSourceChange,
  onVisibilityChange,
  onLifecycleChange,
  onFollowingChange,
  onSearchChange,
}: {
  sourceFilter: SourceFilter
  visibilityFilter: VisibilityFilter
  lifecycleFilter: LifecycleFilter
  followingFilter: FollowingFilter
  searchQuery: string
  userLoggedIn: boolean
  onSourceChange: (value: SourceFilter) => void
  onVisibilityChange: (value: VisibilityFilter) => void
  onLifecycleChange: (value: LifecycleFilter) => void
  onFollowingChange: (value: FollowingFilter) => void
  onSearchChange: (value: string) => void
}) {
  return (
    <section className="mb-6 rounded-xl border border-blue-200 bg-white/75 p-4 shadow-sm shadow-blue-100/60">
      <div className="mb-3 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">
            Search
          </span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, description, creator, risk, frequency..."
            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <FilterSelect
          label="Following"
          value={followingFilter}
          onChange={(value) => onFollowingChange(value as FollowingFilter)}
          disabled={!userLoggedIn}
          options={[
            ["all", userLoggedIn ? "All agents" : "Log in to filter"],
            ["following", "Following only"],
          ]}
        />
      </div>
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
            ["draft", "Draft"],
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
  disabled = false,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
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
        <span className="rounded-md border border-blue-200 bg-white/70 px-2 py-1 text-xs text-slate-500">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-white/40 p-6 text-sm text-slate-500">
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
    <article className="rounded-xl border border-blue-200 bg-white/70 p-6 shadow-sm shadow-blue-100/50 transition hover:border-blue-400 hover:bg-white">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={`/agents/${agent.id}`}
          className="text-xl font-semibold text-slate-900 hover:text-blue-600"
        >
          {agent.name}
        </Link>
        <span
          className={`rounded px-2 py-1 text-xs ${
            agent.lifecycle_status === "active"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {formatToken(agent.lifecycle_status || "paused")}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <AgentPill value={agent.visibility || "private"} />
        {agent.creator_role && <AgentPill value={agent.creator_role} />}
        {agent.is_following && <AgentPill value="following" />}
      </div>

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm">
        <p className="text-xs uppercase tracking-widest text-slate-500">
          Creator
        </p>
        {agent.owner_user_id ? (
          <Link
            href={`/agents?creator=${agent.owner_user_id}`}
            className="mt-1 inline-block text-blue-600 hover:text-blue-700"
          >
            {agent.creator_display_name || "Unknown user"}
          </Link>
        ) : (
          <p className="mt-1 text-slate-700">
            {agent.creator_display_name || "System"}
          </p>
        )}
      </div>

      <p className="mb-4 min-h-10 text-sm text-slate-600">
        {agent.description || "No description"}
      </p>

      <div className="space-y-2 text-sm">
        <AgentMetric
          label="Value"
          value={formatCompactCurrencyAmount(
            Number(agent.current_value),
            agent.base_currency || "USD"
          )}
        />
        <AgentMetric
          label="Followers"
          value={String(agent.follower_count || 0)}
        />
        <AgentMetric
          label="Agent ETF Capital"
          value={formatCurrencyAmount(
            Number(agent.follower_position_value || 0),
            "USD",
            { maximumFractionDigits: 0 }
          )}
        />
        <AgentMetric label="Risk" value={agent.risk_level} />
        <AgentMetric label="Frequency" value={agent.rebalance_frequency} />
      </div>
    </article>
  )
}

function AgentPill({ value }: { value: string }) {
  return (
    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs capitalize text-slate-700">
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


function agentMatchesQuery(agent: AgentListItem, query: string) {
  const haystack = [
    agent.name,
    agent.description,
    agent.philosophy,
    agent.creator_display_name,
    agent.creator_role,
    agent.risk_level,
    agent.rebalance_frequency,
    agent.visibility,
    agent.lifecycle_status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

function readAgentsCache(key: string) {
  if (typeof window === "undefined") return null

  try {
    const cached = window.sessionStorage.getItem(key)
    if (!cached) return null
    const parsed = JSON.parse(cached) as {
      savedAt: number
      agents: AgentListItem[]
    }
    if (Date.now() - parsed.savedAt > AGENTS_CACHE_TTL_MS) return null
    return parsed.agents
  } catch {
    return null
  }
}

function writeAgentsCache(key: string, agents: AgentListItem[]) {
  if (typeof window === "undefined") return

  try {
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), agents })
    )
  } catch {
    // Cache writes are best effort only.
  }
}

function clearAgentsCache() {
  if (typeof window === "undefined") return

  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key === "agents:list:anon" || key.startsWith("agents:list:auth:")) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Cache clearing is best effort only.
  }
}
