"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Bot,
  CheckCircle2,
  CreditCard,
  KeyRound,
  LogOut,
  RefreshCw,
  Shield,
  UserRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getPlanLimits } from "../../src/lib/auth/plan-limits"
import type { AppUserRole } from "../../src/lib/auth/server"
import { supabase } from "../../src/lib/supabase"

type AuthMePayload = {
  success: boolean
  user?: {
    id: string
    email: string | null
    profile: {
      id: string
      email: string | null
      display_name: string | null
      role: AppUserRole
      plan_status: string
    }
  }
  error?: string
}

type AgentListItem = {
  id: string
  name: string
  visibility: "private" | "public" | "system"
  lifecycle_status: string
  owner_user_id?: string | null
  scheduled_run_enabled?: boolean | null
  is_following?: boolean
}

type AgentsPayload = {
  success: boolean
  agents?: AgentListItem[]
  error?: string
}

type PortfolioPayload = {
  success: boolean
  positions?: unknown[]
  follows?: unknown[]
  summary?: {
    cash_balance: number
    positions_value: number
    total_value: number
  }
}

type AdminRefreshPayload = {
  success: boolean
  processed?: number
  updated?: number
  skipped?: number
  failed?: number
  error?: string
}

export default function SettingsPage() {
  const [auth, setAuth] = useState<AuthMePayload | null>(null)
  const [agents, setAgents] = useState<AgentListItem[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null)
  const [provider, setProvider] = useState("Unknown")
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [refreshingValuations, setRefreshingValuations] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setLoading(true)
      setError("")

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        if (!cancelled) {
          setAuth({ success: false, error: "Not authenticated" })
          setLoading(false)
        }
        return
      }

      const authProvider =
        sessionData.session?.user?.app_metadata?.provider ||
        sessionData.session?.user?.identities?.[0]?.provider ||
        "email"
      setProvider(formatToken(String(authProvider)))

      const headers: HeadersInit = { Authorization: `Bearer ${token}` }
      const [meRes, agentsRes, portfolioRes] = await Promise.all([
        fetch("/api/auth/me", { headers, cache: "no-store" }),
        fetch("/api/agents", { headers, cache: "no-store" }),
        fetch("/api/user/portfolio", { headers, cache: "no-store" }),
      ])

      const [mePayload, agentsPayload, portfolioPayload] = await Promise.all([
        meRes.json() as Promise<AuthMePayload>,
        agentsRes.json() as Promise<AgentsPayload>,
        portfolioRes.json() as Promise<PortfolioPayload>,
      ])

      if (cancelled) return

      setAuth(mePayload)
      setDisplayName(mePayload.user?.profile.display_name || "")
      setAgents(agentsPayload.success ? agentsPayload.agents || [] : [])
      setPortfolio(portfolioPayload.success ? portfolioPayload : null)
      if (!mePayload.success) setError(mePayload.error || "Failed to load user.")
      setLoading(false)
    }

    loadSettings()

    return () => {
      cancelled = true
    }
  }, [])

  const user = auth?.user
  const role = user?.profile.role || "free"
  const limits = getPlanLimits(role)
  const ownedAgents = useMemo(
    () => agents.filter((agent) => agent.owner_user_id === user?.id),
    [agents, user?.id]
  )
  const activeOwnedAgents = ownedAgents.filter(
    (agent) => agent.lifecycle_status === "active"
  )
  const scheduledOwnedAgents = ownedAgents.filter(
    (agent) => agent.scheduled_run_enabled
  )
  const followedAgents = agents.filter((agent) => agent.is_following)
  const agentPositions = portfolio?.positions?.length || 0

  async function saveDisplayName() {
    setSavingName(true)
    setError("")
    setNotice("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before updating your display name.")
      setSavingName(false)
      return
    }

    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName }),
    })
    const data = (await res.json()) as AuthMePayload

    if (!data.success) {
      setError(data.error || "Failed to update display name.")
    } else {
      setAuth(data)
      setNotice("Display name updated.")
    }

    setSavingName(false)
  }

  async function refreshAllValuations() {
    setRefreshingValuations(true)
    setError("")
    setNotice("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before refreshing valuations.")
      setRefreshingValuations(false)
      return
    }

    const res = await fetch("/api/admin/refresh-valuations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json().catch(() => ({}))) as AdminRefreshPayload

    if (!res.ok || !data.success) {
      setError(data.error || "Failed to refresh agent valuations.")
    } else {
      setNotice(
        `Valuation refresh completed: ${data.updated || 0} updated, ${
          data.skipped || 0
        } skipped, ${data.failed || 0} failed.`
      )
    }

    setRefreshingValuations(false)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            System / Settings
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Account Settings
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Manage account identity, permissions, and the current plan limits used by
            Agent creation, following, and simulated Agent ETF positions.
          </p>
        </div>

        {user ? (
          <Button asChild variant="secondary">
            <Link href="/auth/logout">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/auth/login">Login</Link>
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {notice}
        </div>
      )}

      {!user && !loading ? (
        <Card className="border-border/60 bg-card/55 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>
              Sign in with Google, Facebook, or email to view account limits and
              authorization status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/auth/login">Go to Login</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6 border-border/60 bg-card/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Public Profile</CardTitle>
              <CardDescription>
                This name is shown as the creator name on public agents and agent lists.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex-1">
                  <span className="mb-2 block text-sm text-muted-foreground">
                    Display name
                  </span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Your creator name"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    type="button"
                    onClick={saveDisplayName}
                    disabled={savingName || !displayName.trim()}
                  >
                    {savingName ? "Saving..." : "Save name"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <section className="mb-6 grid gap-4 lg:grid-cols-3">
            <MetricCard
              icon={<UserRound className="h-5 w-5" />}
              label="Signed in as"
              value={loading ? "Loading..." : user?.profile.display_name || user?.email || "User"}
              detail={user?.email || "No email on profile"}
            />
            <MetricCard
              icon={<Shield className="h-5 w-5" />}
              label="Role / Plan"
              value={formatToken(role)}
              detail={`Status: ${formatToken(user?.profile.plan_status || "active")}`}
            />
            <MetricCard
              icon={<KeyRound className="h-5 w-5" />}
              label="Auth Provider"
              value={provider}
              detail="OAuth identity is managed by Supabase Auth."
            />
          </section>

          {role === "admin" && (
            <Card className="mb-6 border-blue-200 bg-blue-50/70">
              <CardHeader>
                <CardTitle>Admin Operations</CardTitle>
                <CardDescription>
                  Run data ingestion and force-refresh active agent valuations
                  when cron frequency is limited.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button asChild>
                  <Link href="/settings/data">Open Data Ingestion</Link>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={refreshAllValuations}
                  disabled={refreshingValuations}
                  className="gap-2"
                >
                  <RefreshCw
                    className={
                      refreshingValuations ? "h-4 w-4 animate-spin" : "h-4 w-4"
                    }
                  />
                  {refreshingValuations
                    ? "Refreshing valuations..."
                    : "Refresh all valuations"}
                </Button>
              </CardContent>
            </Card>
          )}

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/60 bg-card/55 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-blue-300" />
                  Agent Permissions
                </CardTitle>
                <CardDescription>
                  These limits are enforced by the current permission layer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  <LimitRow
                    label="Created Agents"
                    current={ownedAgents.length}
                    limit={limits.maxAgents}
                  />
                  <LimitRow
                    label="Active Agents"
                    current={activeOwnedAgents.length}
                    limit={limits.maxActiveAgents}
                  />
                  <LimitRow
                    label="Auto-run Agents"
                    current={scheduledOwnedAgents.length}
                    limit={limits.maxScheduledRunAgents}
                  />
                  <LimitRow
                    label="Daily Manual Runs"
                    current={0}
                    limit={limits.maxManualRunsPerDay}
                    note="Usage counter will be wired to run history."
                  />
                  <LimitRow
                    label="Followed Agents"
                    current={followedAgents.length}
                    limit={limits.maxFollowedAgents}
                  />
                  <LimitRow
                    label="Agent ETF Positions"
                    current={agentPositions}
                    limit={limits.maxAgentPositions}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/55 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-emerald-300" />
                  Plan Capabilities
                </CardTitle>
                <CardDescription>
                  Upgrade and billing are placeholders until the payment layer is added.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Capability enabled={limits.canPublishAgents}>
                  Publish public Agents
                </Capability>
                <Capability enabled={limits.canConnectBrokerage}>
                  Connect brokerage accounts
                </Capability>
                <Capability enabled={limits.maxScheduledRunAgents > 0}>
                  Scheduled Agent runs
                </Capability>
                <Capability enabled>
                  Follow public Agents
                </Capability>
                <div className="mt-5 rounded-lg border border-border/60 bg-muted/20 p-4 text-muted-foreground">
                  Billing, language preferences, notification controls, and connected
                  brokerage permissions should live here once those modules are ready.
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="border-border/60 bg-card/55 backdrop-blur-md">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="break-words text-xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

function LimitRow({
  label,
  current,
  limit,
  note,
}: {
  label: string
  current: number
  limit: number
  note?: string
}) {
  const unlimited = !Number.isFinite(limit)
  const pct = unlimited || limit <= 0 ? 0 : Math.min(100, (current / limit) * 100)

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-sm">
          {current} / {unlimited ? "Unlimited" : limit}
        </p>
      </div>
      {!unlimited && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function Capability({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <span>{children}</span>
      <span
        className={
          enabled
            ? "inline-flex items-center gap-1 text-emerald-300"
            : "text-muted-foreground"
        }
      >
        {enabled && <CheckCircle2 className="h-4 w-4" />}
        {enabled ? "Enabled" : "Not included"}
      </span>
    </div>
  )
}

function formatToken(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}
