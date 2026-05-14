"use client"

import * as React from "react"
import Link from "next/link"

import AgentPortfolioPanel, { type PortfolioSummary } from "./AgentPortfolioPanel"
import AgentEtfTradePanel from "./AgentEtfTradePanel"
import FollowAgentButton from "./FollowAgentButton"
import type { TradeDraft } from "./AgentPortfolioPanel"
import RunAgentButton from "./RunAgentButton"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import type {
  Agent,
  AgentHolding,
  AgentProfile,
  AgentRun,
  AgentValuation,
  RiskPolicy,
  TradeProposalWithValidation,
  WorkflowConfig,
} from "../../../src/lib/types/agent"

type AgentDashboardPermissions = {
  canEdit: boolean
  canRun: boolean
  canTrade: boolean
  canFollow: boolean
}

type AgentDashboardClientProps = {
  agent: Agent
  holdings: AgentHolding[]
  runs: AgentRun[]
  valuations: AgentValuation[]
  tradeProposals: TradeProposalWithValidation[]
  profile: AgentProfile
  riskPolicy: RiskPolicy
  workflowConfig: WorkflowConfig
  permissions: AgentDashboardPermissions
  initialSummary: PortfolioSummary
}

export default function AgentDashboardClient({
  agent,
  holdings,
  runs,
  valuations,
  tradeProposals,
  profile,
  riskPolicy,
  workflowConfig,
  permissions,
  initialSummary,
}: AgentDashboardClientProps) {
  const [summary, setSummary] = React.useState(initialSummary)
  const [currentHoldings, setCurrentHoldings] = React.useState<UpdatedHolding[]>(
    holdings.map((holding) => ({
      ...holding,
      price_source: "manual",
      market_state: "LOADED",
    }))
  )
  const [tradeDraft, setTradeDraft] = React.useState<TradeDraft | null>(null)
  const [configTab, setConfigTab] = React.useState<
    "profile" | "workflow" | null
  >(null)
  const tradeSectionRef = React.useRef<HTMLDivElement | null>(null)
  const initialMarketValue = Number(agent.initial_capital || 0)
  const valueChange = summary.total_value - initialMarketValue
  const valueChangePct =
    initialMarketValue > 0 ? (valueChange / initialMarketValue) * 100 : 0
  const cashWeight =
    summary.total_value > 0
      ? (summary.cash_balance / summary.total_value) * 100
      : 0
  const sortedTradeProposals = React.useMemo(
    () =>
      [...tradeProposals].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [tradeProposals]
  )

  function loadTradeDraft(draft: Omit<TradeDraft, "key">) {
    setTradeDraft({
      ...draft,
      key: `${draft.symbol}-${draft.action}-${Date.now()}`,
    })
    window.setTimeout(() => {
      tradeSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
    }, 0)
  }

  function loadHoldingIntoTradeForm(holding: UpdatedHolding) {
    loadTradeDraft({
      action: "sell",
      symbol: holding.symbol,
      assetType: holding.asset_type || "stock",
      targetWeight: Number(holding.weight || 0),
      currentWeight: Number(holding.weight || 0),
      estimatedPortfolioPctChange: 0,
    })
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="mx-auto w-full max-w-[1500px]">
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
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <MetaPill
                label="Created"
                value={formatDateTime(agent.created_at)}
              />
              <MetaPill
                label="Initial Market Value"
                value={formatCurrency(initialMarketValue)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <FollowAgentButton
              agentId={agent.id}
              visible={permissions.canFollow}
            />
            {permissions.canRun && <RunAgentButton agentId={agent.id} />}

            {permissions.canEdit && (
              <Link
                href={`/agents/${agent.id}/settings`}
                className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg"
              >
                Settings
              </Link>
            )}
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            label="Total Portfolio Value"
            value={formatCurrency(summary.total_value)}
            detail={`${formatSignedCurrency(valueChange)} (${formatSignedPercent(valueChangePct)}) since inception`}
            detailTone={valueChange >= 0 ? "positive" : "negative"}
          />
          <SummaryCard
            label="Initial Market Value"
            value={formatCurrency(initialMarketValue)}
          />
          <SummaryCard
            label="Cash Balance"
            value={formatCurrency(summary.cash_balance)}
            detail={`${cashWeight.toFixed(2)}% of portfolio`}
          />
          <SummaryCard
            label="Holdings Value"
            value={formatCurrency(summary.holdings_value)}
          />
        </section>

        <AgentEtfTradePanel
          agentId={agent.id}
          visible={permissions.canFollow}
        />

        <section className="mb-8 rounded-xl border border-slate-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-slate-300">
                Agent Configuration
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Read-only profile and workflow details are hidden by default.
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
              <ConfigTabButton
                active={configTab === "profile"}
                onClick={() =>
                  setConfigTab(configTab === "profile" ? null : "profile")
                }
              >
                Investment Profile
              </ConfigTabButton>
              <ConfigTabButton
                active={configTab === "workflow"}
                onClick={() =>
                  setConfigTab(configTab === "workflow" ? null : "workflow")
                }
              >
                Workflow & Risk
              </ConfigTabButton>
            </div>
          </div>

          {configTab && (
            <div className="mt-4 border-t border-slate-800 pt-4">
              {configTab === "profile" ? (
                <ConfigCard title="Investment Profile">
                  <ConfigRow
                    label="Philosophy"
                    value={agent.philosophy || "No philosophy defined yet."}
                  />
                  <ConfigRow label="Strategy" value={formatSlug(profile.strategy_type)} />
                  <ConfigRow label="Objective" value={profile.objective} />
                  <ConfigRow
                    label="Target Return"
                    value={`${profile.target_annual_return_min}% - ${profile.target_annual_return_max}% annualized`}
                  />
                  <ConfigRow
                    label="Max Drawdown"
                    value={`${profile.max_drawdown_pct}%`}
                  />
                  <ConfigTagGroup label="Target Markets" values={profile.target_markets} />
                  <ConfigTagGroup label="Allowed Assets" values={profile.allowed_assets} />
                  <ConfigTagGroup label="Excluded Assets" values={profile.excluded_assets} tone="danger" />
                  {profile.manager_instructions && (
                    <ConfigRow
                      label="Manager Notes"
                      value={profile.manager_instructions}
                    />
                  )}
                </ConfigCard>
              ) : (
                <ConfigCard title="Workflow & Risk Policy">
                  <ConfigRow
                    label="Daily Routine"
                    value={workflowConfig.daily_enabled ? "Enabled" : "Disabled"}
                  />
                  <ConfigRow
                    label="Weekly Deep Research"
                    value={workflowConfig.weekly_enabled ? "Enabled" : "Disabled"}
                  />
                  <ConfigRow
                    label="Escalation Run"
                    value={workflowConfig.escalation_enabled ? "Enabled" : "Disabled"}
                  />
                  <ConfigRow
                    label="Risk Validator"
                    value={
                      workflowConfig.validator_enabled
                        ? `Enabled, max ${workflowConfig.max_revision_attempts} revisions`
                        : "Disabled"
                    }
                  />
                  <ConfigRow
                    label="Cash Range"
                    value={`${riskPolicy.min_cash_pct}% - ${riskPolicy.max_cash_pct}%`}
                  />
                  <ConfigRow
                    label="Single Stock Limit"
                    value={`${riskPolicy.max_single_stock_pct}%`}
                  />
                  <ConfigRow
                    label="ETF Limit"
                    value={`${riskPolicy.max_etf_pct}%`}
                  />
                  <ConfigRow
                    label="Weekly Turnover Limit"
                    value={`${riskPolicy.max_weekly_turnover_pct}%`}
                  />
                  <ConfigTagGroup
                    label="Prohibited Assets"
                    values={riskPolicy.prohibited_assets}
                    tone="danger"
                  />
                </ConfigCard>
              )}
            </div>
          )}
        </section>

        <div ref={tradeSectionRef} className="scroll-mt-6">
          <AgentPortfolioPanel
            agentId={agent.id}
            holdings={currentHoldings}
            initialValuations={valuations}
            tradeDraft={tradeDraft}
            totalValue={summary.total_value}
            onUseHolding={loadHoldingIntoTradeForm}
            onHoldingsUpdated={setCurrentHoldings}
          onSummaryUpdated={setSummary}
          canTrade={permissions.canTrade}
          canRefreshValuation={permissions.canEdit}
        />
        </div>

        <section className="border border-slate-800 rounded-xl p-6 mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Trade Proposals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Agent recommendations are stored here after risk validation. Execution is still manual.
              </p>
            </div>
          </div>

          {sortedTradeProposals.length === 0 ? (
            <p className="text-slate-500">No trade proposals yet. Run the agent to generate one.</p>
          ) : (
            <div className="flex snap-x gap-4 overflow-x-auto pb-2">
              {sortedTradeProposals.map((proposal) => (
                <div key={proposal.id} className="min-w-full snap-start">
                  <TradeProposalCard
                    proposal={proposal}
                    onUseAction={loadTradeDraft}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-slate-800 rounded-xl p-6 mt-8">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Recent Agent Research</h2>
            <p className="mt-1 text-sm text-slate-500">
              Daily runs without trades will evolve into market view, thesis, risk, and watchlist modules.
            </p>
          </div>

          {runs.length === 0 ? (
            <p className="text-slate-500">No agent runs yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {runs.map((run) => (
                <RunResearchCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function ConfigCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-800 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-400">
          Read only
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ConfigTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
          : "px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
      }
    >
      {children}
    </button>
  )
}

function RunResearchCard({ run }: { run: AgentRun }) {
  const recommendation = isRecord(run.recommendation) ? run.recommendation : {}
  const runType = readString(recommendation.run_type, run.run_type || "daily")
  const marketView = readString(recommendation.market_view, "")
  const diagnosis = readString(recommendation.portfolio_diagnosis, "")
  const risks = Array.isArray(recommendation.risks)
    ? recommendation.risks.map(String).slice(0, 3)
    : []
  const thesisUpdates = readStringList(recommendation.thesis_updates).slice(0, 3)
  const nextSteps = readStringList(recommendation.next_steps).slice(0, 3)
  const triggers = readStringList(recommendation.monitoring_triggers).slice(0, 3)
  const watchlist = readObjectList(recommendation.watchlist).slice(0, 3)
  const positionReviews = readObjectList(recommendation.position_reviews).slice(0, 4)
  const escalation = isRecord(recommendation.escalation)
    ? recommendation.escalation
    : {}
  const confidence = readString(recommendation.confidence, "")
  const cardTone = getRunTone(runType)

  return (
    <article className={`rounded-xl border p-4 ${cardTone.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-2 py-1 text-xs ${cardTone.badge}`}>
              {formatRunType(runType)}
            </span>
            {confidence && (
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs capitalize text-slate-300">
                {confidence}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {new Date(run.created_at).toLocaleString()}
          </p>
          <h3 className="mt-1 text-base font-semibold">
            {run.summary || "Agent research run"}
          </h3>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ResearchMiniBlock
          label="Market View"
          value={marketView || "Pending richer research output."}
        />
        <ResearchMiniBlock
          label="Portfolio Diagnosis"
          value={diagnosis || "No structured diagnosis captured."}
        />
      </div>

      {runType === "weekly" && positionReviews.length > 0 && (
        <ResearchListBlock
          title="Position Reviews"
          items={positionReviews.map((item) => {
            const symbol = readString(item.symbol, "Position")
            const assessment = readString(item.assessment, "")
            const suggestedResearch = readString(item.suggested_research, "")
            return `${symbol}: ${assessment || suggestedResearch}`
          })}
        />
      )}

      {runType === "weekly" && thesisUpdates.length > 0 && (
        <ResearchListBlock title="Thesis Updates" items={thesisUpdates} />
      )}

      {runType === "weekly" && watchlist.length > 0 && (
        <ResearchListBlock
          title="Watchlist"
          items={watchlist.map((item) => {
            const symbol = readString(item.symbol, "Watch item")
            const reason = readString(item.reason, "")
            return `${symbol}: ${reason}`
          })}
        />
      )}

      {runType === "escalation" && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-red-200">
            Escalation
          </p>
          <div className="space-y-1 text-sm text-red-100">
            <p>Severity: {readString(escalation.severity, "Not specified")}</p>
            <p>
              Time sensitivity:{" "}
              {readString(escalation.time_sensitivity, "Not specified")}
            </p>
            <p>
              Manual intervention:{" "}
              {readString(escalation.manual_intervention, "None")}
            </p>
          </div>
        </div>
      )}

      {risks.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Key Risks
          </p>
          <div className="flex flex-wrap gap-2">
            {risks.map((risk) => (
              <span
                key={risk}
                className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-100"
              >
                {risk}
              </span>
            ))}
          </div>
        </div>
      )}

      {runType !== "weekly" && nextSteps.length > 0 && (
        <ResearchListBlock title="Next Steps" items={nextSteps} />
      )}

      {runType === "escalation" && triggers.length > 0 && (
        <ResearchListBlock title="Monitoring Triggers" items={triggers} />
      )}
    </article>
  )
}

function ResearchListBlock({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <ul className="space-y-1 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  )
}

function ResearchMiniBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-sm leading-relaxed text-slate-300">{value}</p>
    </div>
  )
}

function TradeProposalCard({
  proposal,
  onUseAction,
}: {
  proposal: TradeProposalWithValidation
  onUseAction?: (draft: Omit<TradeDraft, "key">) => void
}) {
  const proposalBody = isRecord(proposal.proposal) ? proposal.proposal : {}
  const validation = proposal.validator_results?.[0]
  const violations = Array.isArray(validation?.violations)
    ? validation.violations.map(String)
    : []
  const validationResult = isRecord(validation?.result) ? validation.result : {}
  const residualPolicyGaps = Array.isArray(validationResult.residual_policy_gaps)
    ? validationResult.residual_policy_gaps.map(String)
    : []
  const actions = readActions(proposalBody.suggested_actions)
  const allocations = readAllocations(proposalBody.target_allocation)
  const stagedPlan = readStagedPlan(proposalBody.staged_remediation_plan)
  const manualActions = readStringList(proposalBody.manual_actions)
  const validatorStatus =
    validation?.validation_status || proposal.validator_status || "pending"
  const approved =
    validatorStatus === "approved" || validation?.final_action_allowed === true
  const statusLabel = approved
    ? residualPolicyGaps.length > 0
      ? "Step approved"
      : "Risk approved"
    : formatSlug(validatorStatus)

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            {formatDateTime(proposal.created_at)}
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {readString(proposalBody.summary, "Portfolio recommendation")}
          </h3>
        </div>
        <span
          className={
            approved
              ? "rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
              : "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200"
          }
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Suggested Actions</p>
          {actions.length === 0 ? (
            <p className="text-sm text-slate-500">No structured actions returned.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action, index) => (
                <div
                  key={`${action.symbol}-${index}`}
                  className="rounded-lg border border-slate-800 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-800 px-2 py-1 text-xs uppercase text-slate-200">
                      {action.action}
                    </span>
                    <span className="font-mono text-sm">{action.symbol}</span>
                    {typeof action.target_weight === "number" && (
                      <span className="text-xs text-slate-500">
                        target {action.target_weight}%
                      </span>
                    )}
                  </div>
                  {action.reason && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {action.reason}
                    </p>
                  )}
                  {(action.action === "buy" || action.action === "sell") && (
                    <button
                      type="button"
                      onClick={() =>
                        onUseAction?.({
                          action: action.action === "sell" ? "sell" : "buy",
                          symbol: action.symbol,
                          assetType: action.asset_type,
                          targetWeight: action.target_weight,
                          currentWeight: action.current_weight,
                          estimatedPortfolioPctChange:
                            action.estimated_portfolio_pct_change,
                        })
                      }
                      className="mt-3 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/20"
                    >
                      Use in trade form
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Target Allocation</p>
          {allocations.length === 0 ? (
            <p className="text-sm text-slate-500">No target allocation returned.</p>
          ) : (
            <div className="space-y-2">
              {allocations.map((allocation) => (
                <div key={allocation.symbol}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-mono">{allocation.symbol}</span>
                    <span>{allocation.target_weight}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, allocation.target_weight))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {violations.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="mb-2 text-sm font-medium text-amber-200">
            Risk Review Required
          </p>
          <ul className="space-y-1 text-sm text-amber-100">
            {violations.map((violation) => (
              <li key={violation}>- {violation}</li>
            ))}
          </ul>
        </div>
      )}

      {residualPolicyGaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <p className="mb-2 text-sm font-medium text-blue-200">
            Remaining Policy Gap
          </p>
          <ul className="space-y-1 text-sm text-blue-100">
            {residualPolicyGaps.map((gap) => (
              <li key={gap}>- {gap}</li>
            ))}
          </ul>
        </div>
      )}

      {manualActions.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="mb-2 text-sm font-medium text-red-200">
            Manual Prerequisite
          </p>
          <ul className="space-y-1 text-sm text-red-100">
            {manualActions.map((action) => (
              <li key={action}>- {action}</li>
            ))}
          </ul>
        </div>
      )}

      {stagedPlan.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-2 text-sm font-medium text-slate-300">
            Staged Remediation Plan
          </p>
          <div className="space-y-2">
            {stagedPlan.map((step) => (
              <div key={step.step} className="text-sm leading-relaxed text-slate-400">
                <span className="font-medium text-slate-200">
                  Step {step.step}:
                </span>{" "}
                {step.goal}
                {step.expected_policy_gap_after_step && (
                  <span className="block text-xs text-slate-500">
                    Remaining gap: {step.expected_policy_gap_after_step}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {readString(proposalBody.allocation_comment, "") && (
        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          {readString(proposalBody.allocation_comment, "")}
        </p>
      )}
    </article>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm leading-relaxed text-slate-200">{value}</p>
    </div>
  )
}

function ConfigTagGroup({
  label,
  values,
  tone = "default",
}: {
  label: string
  values: string[]
  tone?: "default" | "danger"
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
      <p className="text-sm text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span
            key={value}
            className={
              tone === "danger"
                ? "rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300"
                : "rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-200"
            }
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  detailTone = "muted",
  capitalize,
}: {
  label: string
  value: string
  detail?: string
  detailTone?: "positive" | "negative" | "muted"
  capitalize?: boolean
}) {
  const detailClassName = {
    positive: "text-emerald-400",
    negative: "text-red-400",
    muted: "text-slate-500",
  }[detailTone]

  return (
    <div className="border border-slate-800 rounded-xl p-5">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${capitalize ? "capitalize" : ""}`}>
        {value}
      </p>
      {detail && (
        <p className={`mt-2 text-xs ${detailClassName}`}>
          {detail}
        </p>
      )}
    </div>
  )
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-slate-200">{value}</p>
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

function formatSignedCurrency(value: number) {
  const absolute = formatCurrency(Math.abs(value))

  if (value > 0) return `+${absolute}`
  if (value < 0) return `-${absolute}`
  return absolute
}

function formatSignedPercent(value: number) {
  const formatted = `${Math.abs(value).toFixed(2)}%`

  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

function readActions(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const symbol = readString(item.symbol, "")
    const action = readString(item.action, "")
    if (!symbol || !action) return []

    return [
      {
        action,
        symbol,
        asset_type: readString(item.asset_type, ""),
        reason: readString(item.reason, ""),
        target_weight: readNumber(item.target_weight),
        current_weight: readNumber(item.current_weight),
        estimated_portfolio_pct_change: readNumber(
          item.estimated_portfolio_pct_change
        ),
      },
    ]
  })
}

function readAllocations(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const symbol = readString(item.symbol, "")
    const targetWeight = readNumber(item.target_weight)
    if (!symbol || typeof targetWeight !== "number") return []

    return [
      {
        symbol,
        target_weight: targetWeight,
      },
    ]
  })
}

function readStagedPlan(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((item, index) => {
    if (!isRecord(item)) return []

    return [
      {
        step: readNumber(item.step) ?? index + 1,
        goal: readString(item.goal, "Move portfolio closer to policy compliance."),
        expected_policy_gap_after_step: readString(
          item.expected_policy_gap_after_step,
          ""
        ),
      },
    ]
  })
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) =>
    typeof item === "string" && item.trim() ? [item.trim()] : []
  )
}

function readObjectList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => (isRecord(item) ? [item] : []))
}

function getRunTone(runType: string) {
  if (runType === "weekly") {
    return {
      card: "border-blue-500/30 bg-blue-500/5",
      badge: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    }
  }

  if (runType === "escalation") {
    return {
      card: "border-red-500/30 bg-red-500/5",
      badge: "border-red-500/30 bg-red-500/10 text-red-200",
    }
  }

  return {
    card: "border-slate-800 bg-slate-950/50",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  }
}

function formatRunType(runType: string) {
  if (runType === "weekly") return "Weekly Deep Research"
  if (runType === "escalation") return "Escalation Memo"
  if (runType === "rebalance") return "Rebalance"
  return "Daily Routine"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readNumber(value: unknown) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatSlug(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
