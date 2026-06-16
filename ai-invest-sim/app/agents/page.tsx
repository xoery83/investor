"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
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
  latest_annualized_return?: number | null
  latest_cumulative_return?: number | null
}

type MainTab = "public" | "mine"
type SortKey = "inception" | "annualized" | "newest" | "followers" | "capital"
type LifecycleFilter = "all" | Agent["lifecycle_status"]
type RiskFilter = "all" | Agent["risk_level"]
type ModeFilter = "all" | "copycat" | "ai_manager"
type FollowingFilter = "all" | "following"

const AGENTS_CACHE_TTL_MS = 60_000

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState<MainTab>("public")
  const [searchQuery, setSearchQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("inception")
  const [lifecycleFilter, setLifecycleFilter] =
    useState<LifecycleFilter>("all")
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all")
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all")
  const [followingFilter, setFollowingFilter] =
    useState<FollowingFilter>("all")
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [creatorFilter] = useState(() => {
    if (typeof window === "undefined") return ""
    return new URLSearchParams(window.location.search).get("creator") || ""
  })
  const inFlightRequestKey = useRef<string | null>(null)

  const loadAgents = useCallback(async (token: string | null, userId?: string) => {
    const cacheKey =
      token && userId ? `agents:list:auth:${userId}` : "agents:list:anon"
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

  const visibleAgents = useMemo(
    () => agents.filter((agent) => agent.visibility !== "system"),
    [agents]
  )

  const filteredAgents = useMemo(
    () =>
      applyAgentFilters(visibleAgents, {
        activeTab,
        userId: user?.id,
        searchQuery,
        sortKey,
        lifecycleFilter,
        riskFilter,
        modeFilter,
        followingFilter,
        creatorFilter,
      }),
    [
      activeTab,
      creatorFilter,
      followingFilter,
      lifecycleFilter,
      modeFilter,
      riskFilter,
      searchQuery,
      sortKey,
      user?.id,
      visibleAgents,
    ]
  )

  const publicAgents = filteredAgents.filter(
    (agent) => agent.visibility === "public"
  )
  const publicAdminCopycatAgents = publicAgents.filter(
    (agent) => isAdminAgent(agent) && agent.agent_mode === "copycat"
  )
  const publicAdminAgents = publicAgents.filter(
    (agent) => isAdminAgent(agent) && agent.agent_mode !== "copycat"
  )
  const publicUserAgents = publicAgents.filter((agent) => !isAdminAgent(agent))
  const myAgents = filteredAgents.filter(
    (agent) => user && agent.owner_user_id === user.id
  )

  const showingAgents =
    activeTab === "public" ? publicAgents.length : myAgents.length

  return (
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Investment Agents</h1>
            <p className="mt-2 text-slate-500">
              Browse public agents, compare performance, and manage the agents
              attached to your account.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden max-w-[220px] truncate text-sm text-slate-500 md:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut()
                    clearAgentsCache()
                    setUser(null)
                    setActiveTab("public")
                    await loadAgents(null)
                  }}
                  className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-slate-700 hover:bg-blue-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login?next=%2Fagents"
                className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-slate-700 hover:bg-blue-50"
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

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-blue-200 bg-white p-1 shadow-sm shadow-blue-100/60">
            <TabButton
              active={activeTab === "public"}
              onClick={() => setActiveTab("public")}
            >
              Public
            </TabButton>
            <TabButton
              active={activeTab === "mine"}
              onClick={() => {
                setActiveTab("mine")
                setFollowingFilter("all")
              }}
              disabled={!user}
            >
              My Agents
            </TabButton>
          </div>
          <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-500">
            {showingAgents} shown
          </span>
        </div>

        <AgentToolbar
          activeTab={activeTab}
          searchQuery={searchQuery}
          sortKey={sortKey}
          lifecycleFilter={lifecycleFilter}
          riskFilter={riskFilter}
          modeFilter={modeFilter}
          followingFilter={followingFilter}
          userLoggedIn={Boolean(user)}
          showAdvancedFilters={showAdvancedFilters}
          onSearchChange={setSearchQuery}
          onSortChange={setSortKey}
          onLifecycleChange={setLifecycleFilter}
          onRiskChange={setRiskFilter}
          onModeChange={setModeFilter}
          onFollowingChange={setFollowingFilter}
          onToggleAdvanced={() => setShowAdvancedFilters((value) => !value)}
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
          <p className="text-slate-500">Loading agents...</p>
        ) : visibleAgents.length === 0 ? (
          <div className="rounded-xl border border-blue-200 bg-white/70 p-8 text-center">
            <p className="text-slate-500">
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
        ) : activeTab === "public" ? (
          <PublicAgentsView
            adminCopycatAgents={publicAdminCopycatAgents}
            adminAgents={publicAdminAgents}
            userAgents={publicUserAgents}
          />
        ) : (
          <AgentSection
            title="My Agents"
            description="Private, public, draft, active, and paused agents created by your account."
            agents={myAgents}
            emptyMessage={
              user
                ? "No agents match the selected filters."
                : "Log in to view agents created by your account."
            }
          />
        )}
      </div>
    </main>
  )
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "text-slate-600 hover:bg-blue-50"
      } disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  )
}

function AgentToolbar({
  activeTab,
  searchQuery,
  sortKey,
  lifecycleFilter,
  riskFilter,
  modeFilter,
  followingFilter,
  userLoggedIn,
  showAdvancedFilters,
  onSearchChange,
  onSortChange,
  onLifecycleChange,
  onRiskChange,
  onModeChange,
  onFollowingChange,
  onToggleAdvanced,
}: {
  activeTab: MainTab
  searchQuery: string
  sortKey: SortKey
  lifecycleFilter: LifecycleFilter
  riskFilter: RiskFilter
  modeFilter: ModeFilter
  followingFilter: FollowingFilter
  userLoggedIn: boolean
  showAdvancedFilters: boolean
  onSearchChange: (value: string) => void
  onSortChange: (value: SortKey) => void
  onLifecycleChange: (value: LifecycleFilter) => void
  onRiskChange: (value: RiskFilter) => void
  onModeChange: (value: ModeFilter) => void
  onFollowingChange: (value: FollowingFilter) => void
  onToggleAdvanced: () => void
}) {
  return (
    <section className="mb-6 rounded-xl border border-blue-200 bg-white/80 p-4 shadow-sm shadow-blue-100/60">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px_160px]">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">
            Search
          </span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={
              activeTab === "public"
                ? "Search public agents by name, creator, risk, theme..."
                : "Search your agents by name, status, risk, theme..."
            }
            className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <FilterSelect
          label="Sort"
          value={sortKey}
          onChange={(value) => onSortChange(value as SortKey)}
          options={[
            ["inception", "Since inception return"],
            ["annualized", "Annualized return"],
            ["newest", "Newest created"],
            ["followers", "Follower count"],
            ["capital", "Agent ETF capital"],
          ]}
        />
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-widest text-slate-500">
            Filters
          </span>
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm text-blue-700 transition hover:bg-blue-100"
          >
            {showAdvancedFilters ? "Hide advanced" : "Advanced filters"}
          </button>
        </label>
      </div>

      {showAdvancedFilters && (
        <div className="mt-4 grid gap-3 border-t border-blue-100 pt-4 md:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Risk"
            value={riskFilter}
            onChange={(value) => onRiskChange(value as RiskFilter)}
            options={[
              ["all", "All risk levels"],
              ["low", "Low"],
              ["medium", "Medium"],
              ["high", "High"],
            ]}
          />
          <FilterSelect
            label="Mode"
            value={modeFilter}
            onChange={(value) => onModeChange(value as ModeFilter)}
            options={[
              ["all", "All agent modes"],
              ["copycat", "Copycat"],
              ["ai_manager", "AI manager"],
            ]}
          />
          <FilterSelect
            label="Status"
            value={lifecycleFilter}
            onChange={(value) => onLifecycleChange(value as LifecycleFilter)}
            options={[
              ["all", "All lifecycle status"],
              ["draft", "Draft"],
              ["active", "Active"],
              ["paused", "Paused"],
              ["retired", "Retired"],
              ["archived", "Archived"],
            ]}
          />
          <FilterSelect
            label="Following"
            value={followingFilter}
            onChange={(value) => onFollowingChange(value as FollowingFilter)}
            disabled={!userLoggedIn || activeTab !== "public"}
            options={[
              ["all", userLoggedIn ? "All public agents" : "Log in to filter"],
              ["following", "Following only"],
            ]}
          />
        </div>
      )}
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

function PublicAgentsView({
  adminCopycatAgents,
  adminAgents,
  userAgents,
}: {
  adminCopycatAgents: AgentListItem[]
  adminAgents: AgentListItem[]
  userAgents: AgentListItem[]
}) {
  return (
    <div className="space-y-8">
      <AgentSection
        title="Public Admin Copycat"
        description="Platform copycat agents that track external manager disclosures and snapshots."
        agents={adminCopycatAgents}
        emptyMessage="No public admin copycat agents match the selected filters."
      />
      <AgentSection
        title="Public Admin AI Agents"
        description="Platform-operated non-copycat agents managed by AI workflows."
        agents={adminAgents}
        emptyMessage="No public admin AI agents match the selected filters."
      />
      <AgentSection
        title="Public User Agents"
        description="Public agents created by Pro users. Use filters to compare risk, performance, followers, and capital."
        agents={userAgents}
        emptyMessage="No public user agents match the selected filters."
      />
    </div>
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
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <span className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-slate-500">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </span>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-blue-200 bg-white/50 p-6 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </section>
  )
}

function AgentCard({ agent }: { agent: AgentListItem }) {
  const tone = getAgentTone(agent)
  const inceptionReturn = calculateInceptionReturn(agent)
  const annualizedReturn = getAnnualizedDisplay(agent)

  return (
    <article
      className={`rounded-xl border bg-white/80 p-6 shadow-sm transition hover:bg-white ${tone.border} ${tone.shadow}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/agents/${agent.id}`}
            className="text-xl font-semibold text-slate-900 hover:text-blue-600"
          >
            {agent.name}
          </Link>
          <div className="mt-1 text-sm text-slate-500">
            by{" "}
            {agent.owner_user_id ? (
              <Link
                href={`/agents?creator=${agent.owner_user_id}`}
                className="text-blue-600 hover:text-blue-700"
              >
                {agent.creator_display_name || "Unknown user"}
              </Link>
            ) : (
              agent.creator_display_name || "Platform"
            )}
          </div>
        </div>
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
        <AgentPill value={tone.label} className={tone.pill} />
        <AgentPill value={agent.visibility || "private"} />
        {agent.is_following && <AgentPill value="following" />}
      </div>

      <p className="mb-5 min-h-12 text-sm leading-6 text-slate-600">
        {agent.description || "No description"}
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <PerformanceTile
          label="Since inception"
          value={formatMaybePercent(inceptionReturn)}
          tone={percentTone(inceptionReturn)}
        />
        <PerformanceTile
          label={annualizedReturn.label}
          value={annualizedReturn.value}
          tone={annualizedReturn.tone}
        />
      </div>

      <div className="space-y-2 text-sm">
        <AgentMetric
          label="Value"
          value={formatCompactCurrencyAmount(
            Number(agent.current_value),
            agent.base_currency || "USD"
          )}
        />
        <AgentMetric
          label="Agent ETF Capital"
          value={formatCurrencyAmount(
            Number(agent.follower_position_value || 0),
            "USD",
            { maximumFractionDigits: 0 }
          )}
        />
        <AgentMetric
          label="Followers"
          value={String(agent.follower_count || 0)}
        />
        <AgentMetric label="Risk" value={formatToken(agent.risk_level)} />
        <AgentMetric
          label="Frequency"
          value={formatToken(agent.rebalance_frequency)}
        />
      </div>
    </article>
  )
}

function AgentPill({
  value,
  className = "border-blue-200 bg-blue-50 text-slate-700",
}: {
  value: string
  className?: string
}) {
  return (
    <span className={`rounded-md border px-2 py-1 text-xs capitalize ${className}`}>
      {formatToken(value)}
    </span>
  )
}

function PerformanceTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "positive" | "negative" | "neutral"
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-600"
        : "text-slate-700"

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  )
}

function AgentMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-slate-900">{value}</span>
    </div>
  )
}

function applyAgentFilters(
  agents: AgentListItem[],
  filters: {
    activeTab: MainTab
    userId?: string
    searchQuery: string
    sortKey: SortKey
    lifecycleFilter: LifecycleFilter
    riskFilter: RiskFilter
    modeFilter: ModeFilter
    followingFilter: FollowingFilter
    creatorFilter: string
  }
) {
  const query = filters.searchQuery.trim().toLowerCase()

  return [...agents]
    .filter((agent) => {
      if (filters.activeTab === "public" && agent.visibility !== "public") {
        return false
      }
      if (
        filters.activeTab === "mine" &&
        (!filters.userId || agent.owner_user_id !== filters.userId)
      ) {
        return false
      }
      if (
        filters.activeTab === "public" &&
        filters.followingFilter === "following" &&
        !agent.is_following
      ) {
        return false
      }
      if (
        filters.lifecycleFilter !== "all" &&
        agent.lifecycle_status !== filters.lifecycleFilter
      ) {
        return false
      }
      if (filters.riskFilter !== "all" && agent.risk_level !== filters.riskFilter) {
        return false
      }
      if (filters.modeFilter !== "all" && agent.agent_mode !== filters.modeFilter) {
        return false
      }
      if (query && !agentMatchesQuery(agent, query)) return false
      if (filters.creatorFilter && agent.owner_user_id !== filters.creatorFilter) {
        return false
      }
      return true
    })
    .sort((left, right) => compareAgents(left, right, filters.sortKey))
}

function compareAgents(left: AgentListItem, right: AgentListItem, sortKey: SortKey) {
  if (sortKey === "inception") {
    return (
      sortablePercent(calculateInceptionReturn(right)) -
      sortablePercent(calculateInceptionReturn(left))
    )
  }

  if (sortKey === "newest") {
    return (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    )
  }

  if (sortKey === "followers") {
    return (right.follower_count || 0) - (left.follower_count || 0)
  }

  if (sortKey === "capital") {
    return (
      Number(right.follower_position_value || 0) -
      Number(left.follower_position_value || 0)
    )
  }

  return (
    sortableAnnualizedPercent(right) - sortableAnnualizedPercent(left)
  )
}

function isAdminAgent(agent: AgentListItem) {
  return agent.creator_type === "admin" || agent.creator_role === "admin"
}

function getAgentTone(agent: AgentListItem) {
  if (agent.agent_mode === "copycat") {
    return {
      label: "copycat",
      border: "border-violet-200 hover:border-violet-400",
      shadow: "shadow-violet-100/60",
      pill: "border-violet-200 bg-violet-50 text-violet-700",
    }
  }

  if (isAdminAgent(agent)) {
    return {
      label: "admin ai",
      border: "border-blue-200 hover:border-blue-400",
      shadow: "shadow-blue-100/60",
      pill: "border-blue-200 bg-blue-50 text-blue-700",
    }
  }

  return {
    label: "user agent",
    border: "border-emerald-200 hover:border-emerald-400",
    shadow: "shadow-emerald-100/60",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }
}

function calculateInceptionReturn(agent: AgentListItem) {
  const initial = Number(agent.initial_capital || 0)
  const current = Number(agent.current_value || 0)
  if (!Number.isFinite(initial) || initial <= 0) return null
  if (!Number.isFinite(current)) return null
  return ((current - initial) / initial) * 100
}

function normalizePercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return null
  }
  return Number(value)
}

function sortablePercent(value: number | null | undefined) {
  return normalizePercent(value) ?? -1_000_000
}

function sortableAnnualizedPercent(agent: AgentListItem) {
  const ageDays = getAgentAgeDays(agent)
  if (ageDays < 30) return -1_000_000
  return sortablePercent(agent.latest_annualized_return)
}

function getAnnualizedDisplay(agent: AgentListItem): {
  label: string
  value: string
  tone: "positive" | "negative" | "neutral"
} {
  const ageDays = getAgentAgeDays(agent)
  const annualized = normalizePercent(agent.latest_annualized_return)

  if (ageDays < 30) {
    return {
      label: "Annualized",
      value: "Too early",
      tone: "neutral",
    }
  }

  if (annualized === null) {
    return {
      label: ageDays < 90 ? "Annualized (prov.)" : "Annualized",
      value: "--",
      tone: "neutral",
    }
  }

  return {
    label: ageDays < 90 ? "Annualized (prov.)" : "Annualized",
    value: formatMaybePercent(annualized),
    tone: percentTone(annualized),
  }
}

function getAgentAgeDays(agent: AgentListItem) {
  const createdAt = new Date(agent.created_at).getTime()
  if (!Number.isFinite(createdAt)) return 0
  return Math.max(0, (Date.now() - createdAt) / 86_400_000)
}

function formatMaybePercent(value: number | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "--"
  }
  const numeric = Number(value)
  const sign = numeric > 0 ? "+" : ""
  return `${sign}${numeric.toFixed(2)}%`
}

function percentTone(value: number | null | undefined) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value)) ||
    Number(value) === 0
  ) {
    return "neutral"
  }
  return Number(value) > 0 ? "positive" : "negative"
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
    agent.agent_mode,
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
