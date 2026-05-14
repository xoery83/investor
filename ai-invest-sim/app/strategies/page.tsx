"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { supabase } from "../../src/lib/supabase"

type AgentStrategy = {
  id: string
  name: string
  description: string | null
  risk_level: string
  visibility: string
  lifecycle_status: string
  current_value: number
  rebalance_frequency: string
  creator_display_name?: string
  follower_count?: number
}

export default function StrategiesPage() {
  const [agents, setAgents] = useState<AgentStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")

  useEffect(() => {
    let cancelled = false

    async function loadAgents() {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch("/api/agents", {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const payload = await res.json()

      if (cancelled) return

      if (!payload.success) {
        setError(payload.error || "Failed to load strategy agents.")
        setAgents([])
      } else {
        setAgents(payload.agents || [])
      }
      setLoading(false)
    }

    loadAgents()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) =>
        riskFilter === "all" ? true : agent.risk_level === riskFilter
      ),
    [agents, riskFilter]
  )
  const publicStrategies = agents.filter(
    (agent) => agent.visibility === "public" || agent.visibility === "system"
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Invest / Strategies
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Strategy Library
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Strategies are represented by live agents, not static template rows. Open an agent to inspect its profile and workflow.
          </p>
        </div>
        <Link
          href="/agents/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Agent
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-800 bg-red-950 p-3 text-red-300">
          {error}
        </div>
      )}

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <MetricCard label="Visible Strategies" value={loading ? "..." : String(agents.length)} />
        <MetricCard label="Public/System" value={loading ? "..." : String(publicStrategies.length)} />
        <MetricCard
          label="Active"
          value={
            loading
              ? "..."
              : String(agents.filter((agent) => agent.lifecycle_status === "active").length)
          }
        />
      </section>

      <Card className="border-border/60 bg-card/55 backdrop-blur-md">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Agent Strategy Catalog</CardTitle>
              <CardDescription>
                Risk, lifecycle, visibility, and follower counts from live agents.
              </CardDescription>
            </div>
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            >
              <option value="all">All risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">Loading strategies...</p>
          ) : filteredAgents.length === 0 ? (
            <div className="mx-4 mb-4 rounded-lg border border-dashed border-border/70 p-6 text-sm text-muted-foreground">
              No strategy agents match this filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="pl-4">Strategy Agent</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Followers</TableHead>
                  <TableHead className="pr-4 text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.id} className="border-border/40">
                    <TableCell className="pl-4">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="font-medium text-blue-300 hover:text-blue-200"
                      >
                        {agent.name}
                      </Link>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {agent.description || "No description"}
                      </p>
                    </TableCell>
                    <TableCell className="capitalize">{agent.risk_level}</TableCell>
                    <TableCell className="capitalize">{formatToken(agent.lifecycle_status)}</TableCell>
                    <TableCell className="capitalize">{agent.visibility}</TableCell>
                    <TableCell className="tabular-nums">{agent.follower_count || 0}</TableCell>
                    <TableCell className="pr-4 text-right tabular-nums">
                      {formatCurrency(agent.current_value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-card/55 backdrop-blur-md">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatToken(value: string) {
  return value.replaceAll("_", " ")
}
