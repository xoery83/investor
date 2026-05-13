"use client"

import Link from "next/link"

import AgentPortfolioPanel, { type PortfolioSummary } from "./AgentPortfolioPanel"
import RunAgentButton from "./RunAgentButton"
import type {
  Agent,
  AgentHolding,
  AgentRun,
  AgentValuation,
} from "../../../src/lib/types/agent"

type AgentDashboardClientProps = {
  agent: Agent
  holdings: AgentHolding[]
  runs: AgentRun[]
  valuations: AgentValuation[]
  initialSummary: PortfolioSummary
}

export default function AgentDashboardClient({
  agent,
  holdings,
  runs,
  valuations,
  initialSummary,
}: AgentDashboardClientProps) {
  const [summary, setSummary] = React.useState(initialSummary)

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/agents" className="text-blue-400 text-sm">
            ← Back to Agents
          </Link>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="text-slate-400 mt-2">
              {agent.description || "No description"}
            </p>
          </div>

          <div className="flex gap-3">
            <RunAgentButton agentId={agent.id} />

            <Link
              href={`/agents/${agent.id}/settings`}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg"
            >
              Settings
            </Link>

            <span
              className={`px-3 py-2 rounded-lg text-sm ${
                agent.is_active
                  ? "bg-green-900 text-green-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {agent.is_active ? "Active" : "Paused"}
            </span>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            label="Total Portfolio Value"
            value={formatCurrency(summary.total_value)}
          />
          <SummaryCard
            label="Cash Balance"
            value={formatCurrency(summary.cash_balance)}
          />
          <SummaryCard
            label="Holdings Value"
            value={formatCurrency(summary.holdings_value)}
          />
          <SummaryCard label="Risk Level" value={agent.risk_level} capitalize />
        </section>

        <section className="border border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-3">Investment Philosophy</h2>
          <p className="text-slate-300 whitespace-pre-wrap">
            {agent.philosophy || "No philosophy defined yet."}
          </p>
        </section>

        <AgentPortfolioPanel
          agentId={agent.id}
          initialHoldings={holdings}
          initialValuations={valuations}
          onSummaryUpdated={setSummary}
        />

        <section className="border border-slate-800 rounded-xl p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4">Recent Runs</h2>

          {runs.length === 0 ? (
            <p className="text-slate-500">No agent runs yet.</p>
          ) : (
            <div className="space-y-4">
              {runs.map((run) => (
                <div key={run.id} className="border-b border-slate-800 pb-3">
                  <p className="text-sm text-slate-500">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1">{run.summary || "No summary"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

import * as React from "react"

function SummaryCard({
  label,
  value,
  capitalize,
}: {
  label: string
  value: string
  capitalize?: boolean
}) {
  return (
    <div className="border border-slate-800 rounded-xl p-5">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${capitalize ? "capitalize" : ""}`}>
        {value}
      </p>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}
