"use client"

import * as React from "react"
import Link from "next/link"

import AgentPortfolioPanel, { type PortfolioSummary } from "./AgentPortfolioPanel"
import AgentEtfTradePanel from "./AgentEtfTradePanel"
import FollowAgentButton from "./FollowAgentButton"
import type { TradeDraft } from "./AgentPortfolioPanel"
import RunAgentButton from "./RunAgentButton"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import { supabase } from "../../../src/lib/supabase"
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
  agent: Agent & {
    creator_display_name?: string
    creator_role?: string
    follower_count?: number
    follower_position_value?: number
  }
  holdings: AgentHolding[]
  runs: AgentRun[]
  valuations: AgentValuation[]
  tradeProposals: TradeProposalWithValidation[]
  profile: AgentProfile
  riskPolicy: RiskPolicy
  workflowConfig: WorkflowConfig
  permissions: AgentDashboardPermissions
  isFollowing: boolean
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
  isFollowing,
  initialSummary,
}: AgentDashboardClientProps) {
  const [summary, setSummary] = React.useState(initialSummary)
  const [followOverride, setFollowOverride] = React.useState<boolean | null>(null)
  const [followerCountDelta, setFollowerCountDelta] = React.useState(0)
  const [currentHoldings, setCurrentHoldings] = React.useState<UpdatedHolding[]>(
    holdings.map((holding) => ({
      ...holding,
      price_source: "manual",
      market_state: "LOADED",
    }))
  )
  const [currentRuns, setCurrentRuns] = React.useState(runs)
  const [currentTradeProposals, setCurrentTradeProposals] =
    React.useState(tradeProposals)
  const [appliedProposalIds, setAppliedProposalIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [tradeDraft, setTradeDraft] = React.useState<TradeDraft | null>(null)
  const [configTab, setConfigTab] = React.useState<
    "profile" | "workflow" | null
  >(null)
  const tradeSectionRef = React.useRef<HTMLDivElement | null>(null)
  const initialMarketValue = Number(agent.initial_capital || 0)
  const followerPositionValue = Number(agent.follower_position_value || 0)
  const displayFollowing = followOverride ?? isFollowing
  const followerCount = Math.max(
    0,
    Number(agent.follower_count || 0) + followerCountDelta
  )
  const valueChange = summary.total_value - initialMarketValue
  const valueChangePct =
    initialMarketValue > 0 ? (valueChange / initialMarketValue) * 100 : 0
  const cashWeight =
    summary.total_value > 0
      ? (summary.cash_balance / summary.total_value) * 100
      : 0
  const initialBuildMode =
    currentHoldings.length === 0 || Number(summary.holdings_value || 0) <= 1
  const sortedTradeProposals = React.useMemo(
    () =>
      [...currentTradeProposals].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [currentTradeProposals]
  )

  function handleFollowChange(nextFollowing: boolean) {
    setFollowOverride(nextFollowing)
    setFollowerCountDelta(nextFollowing === isFollowing ? 0 : nextFollowing ? 1 : -1)
  }

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

  function handleInitialBuildApplied(
    proposalId: string,
    payload: PortfolioSummary & { holdings: UpdatedHolding[] }
  ) {
    setCurrentHoldings(payload.holdings)
    setSummary({
      cash_balance: payload.cash_balance,
      holdings_value: payload.holdings_value,
      total_value: payload.total_value,
    })
    setAppliedProposalIds((previous) => new Set(previous).add(proposalId))
    clearAgentDetailCache(agent.id)
  }

  function handleRunCompleted(payload: {
    run?: unknown
    trade_proposal?: unknown
  }) {
    if (payload.run) {
      setCurrentRuns((previous) => [payload.run as AgentRun, ...previous])
    }

    if (payload.trade_proposal) {
      setCurrentTradeProposals((previous) => [
        payload.trade_proposal as TradeProposalWithValidation,
        ...previous,
      ])
    }

    clearAgentDetailCache(agent.id)
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
    <main className="min-h-screen bg-background p-8 text-foreground">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="mb-6">
          <Link href="/agents" className="text-blue-400 text-sm">
            ← Back to Agents
          </Link>
        </div>

        <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="mt-2 max-w-4xl text-slate-500">
              {agent.description || "No description"}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              by{" "}
              <span className="font-medium text-slate-800">
                {agent.creator_display_name || "Unknown user"}
              </span>
              , From {formatShortDate(agent.created_at)} with initial value{" "}
              <span className="font-medium text-slate-800">
                {formatCurrency(initialMarketValue)}
              </span>
              .
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <StatusPill value={agent.visibility} />
              <StatusPill value={agent.lifecycle_status} />
              <StatusPill value={`Followers ${followerCount}`} />
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 xl:max-w-[620px] xl:justify-end">
            <FollowAgentButton
              key={`${agent.id}-${isFollowing ? "following" : "not-following"}`}
              agentId={agent.id}
              visible={permissions.canFollow}
              initialFollowing={displayFollowing}
              onFollowChange={handleFollowChange}
            />
            {permissions.canRun && (
              <RunAgentButton
                agentId={agent.id}
                initialBuildMode={initialBuildMode}
                onRunCompleted={handleRunCompleted}
              />
            )}

            {permissions.canEdit && (
              <Link
                href={`/agents/${agent.id}/settings`}
                className="rounded-lg bg-blue-100 px-4 py-2 text-slate-700 hover:bg-blue-200"
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
            label="Agent ETF Capital"
            value={formatCurrency(followerPositionValue)}
            detail="Simulated capital allocated by followers"
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

        <section className="mb-8 rounded-xl border border-blue-200 bg-white/55 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-slate-700">
                Agent Configuration
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Read-only profile and workflow details are hidden by default.
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border border-blue-200 bg-white">
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
            <div className="mt-4 border-t border-blue-100 pt-4">
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

        <section className="mt-8 rounded-xl border border-blue-200 bg-white/55 p-6">
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
                    agentId={agent.id}
                    totalValue={summary.total_value}
                    holdings={currentHoldings}
                    canApplyInitialBuild={permissions.canTrade}
                    applied={appliedProposalIds.has(proposal.id)}
                    onUseAction={loadTradeDraft}
                    onInitialBuildApplied={(payload) =>
                      handleInitialBuildApplied(proposal.id, payload)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-xl border border-blue-200 bg-white/55 p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Recent Agent Research</h2>
            <p className="mt-1 text-sm text-slate-500">
              Daily runs without trades will evolve into market view, thesis, risk, and watchlist modules.
            </p>
          </div>

          {currentRuns.length === 0 ? (
            <p className="text-slate-500">No agent runs yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {currentRuns.map((run) => (
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
    <div className="rounded-xl border border-blue-100 bg-white/70 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-slate-600">
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
          : "px-3 py-1.5 text-xs text-slate-500 hover:bg-blue-50 hover:text-blue-700"
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
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs capitalize text-slate-600">
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
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-red-700">
            Escalation
          </p>
          <div className="space-y-1 text-sm text-red-700">
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
                className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
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
      <ul className="space-y-1 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  )
}

function ResearchMiniBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white/70 p-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-sm leading-relaxed text-slate-600">{value}</p>
    </div>
  )
}

function TradeProposalCard({
  proposal,
  agentId,
  totalValue,
  holdings,
  canApplyInitialBuild,
  applied,
  onUseAction,
  onInitialBuildApplied,
}: {
  proposal: TradeProposalWithValidation
  agentId: string
  totalValue: number
  holdings: UpdatedHolding[]
  canApplyInitialBuild?: boolean
  applied?: boolean
  onUseAction?: (draft: Omit<TradeDraft, "key">) => void
  onInitialBuildApplied?: (
    payload: PortfolioSummary & { holdings: UpdatedHolding[] }
  ) => void
}) {
  const [buildLoading, setBuildLoading] = React.useState(false)
  const [buildError, setBuildError] = React.useState("")
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
  const isInitialBuildProposal = proposalBody.proposal_type === "initial_build"
  const initialBuildBuyActions = actions.filter(
    (action) => action.action === "buy" && action.symbol.toUpperCase() !== "CASH"
  )
  const existingSymbols = new Set(
    holdings
      .filter((holding) => Number(holding.quantity || 0) > 0)
      .map((holding) => holding.symbol.toUpperCase())
  )
  const initialBuildAlreadyApplied =
    Boolean(applied) ||
    (initialBuildBuyActions.length > 0 &&
      initialBuildBuyActions.every((action) =>
        existingSymbols.has(action.symbol.toUpperCase())
      ))
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
    <article className="rounded-xl border border-blue-200 bg-white/80 p-5 shadow-sm shadow-blue-100/60">
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
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700"
              : "rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700"
          }
        >
          {statusLabel}
        </span>
      </div>

      {isInitialBuildProposal &&
        approved &&
        canApplyInitialBuild &&
        initialBuildBuyActions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <button
              type="button"
              onClick={() =>
                applyInitialBuildProposal({
                  agentId,
                  totalValue,
                  actions: initialBuildBuyActions,
                  onComplete: onInitialBuildApplied,
                  setLoading: setBuildLoading,
                  setError: setBuildError,
                })
              }
              disabled={buildLoading || initialBuildAlreadyApplied}
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {buildLoading
                ? "Building..."
                : initialBuildAlreadyApplied
                  ? "Portfolio built"
                  : "Build portfolio"}
            </button>
            <p className="text-sm text-emerald-800">
              {initialBuildAlreadyApplied
                ? "This initial build has already been applied to current holdings."
                : "Execute all initial BUY actions using current market quotes."}
            </p>
          </div>
        )}

      {buildError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {buildError}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Suggested Actions</p>
          {actions.length === 0 ? (
            <p className="text-sm text-slate-500">No structured actions returned.</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action, index) => (
                <div
                  key={`${action.symbol}-${index}`}
                  className="rounded-lg border border-blue-100 bg-blue-50/35 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-blue-100 px-2 py-1 text-xs uppercase text-blue-700">
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
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
                      className="mt-3 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
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
          <p className="mb-2 text-sm font-medium text-slate-700">Target Allocation</p>
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
                  <div className="h-2 overflow-hidden rounded-full bg-blue-100">
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
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-sm font-medium text-amber-800">
            Risk Review Required
          </p>
          <ul className="space-y-1 text-sm text-amber-700">
            {violations.map((violation) => (
              <li key={violation}>- {violation}</li>
            ))}
          </ul>
        </div>
      )}

      {residualPolicyGaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-sm font-medium text-blue-800">
            Remaining Policy Gap
          </p>
          <ul className="space-y-1 text-sm text-blue-700">
            {residualPolicyGaps.map((gap) => (
              <li key={gap}>- {gap}</li>
            ))}
          </ul>
        </div>
      )}

      {manualActions.length > 0 && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-sm font-medium text-red-800">
            Manual Prerequisite
          </p>
          <ul className="space-y-1 text-sm text-red-700">
            {manualActions.map((action) => (
              <li key={action}>- {action}</li>
            ))}
          </ul>
        </div>
      )}

      {stagedPlan.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/35 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Staged Remediation Plan
          </p>
          <div className="space-y-2">
            {stagedPlan.map((step) => (
              <div key={step.step} className="text-sm leading-relaxed text-slate-600">
                <span className="font-medium text-slate-800">
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
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {readString(proposalBody.allocation_comment, "")}
        </p>
      )}
    </article>
  )
}

type ProposalAction = ReturnType<typeof readActions>[number]

async function applyInitialBuildProposal({
  agentId,
  totalValue,
  actions,
  onComplete,
  setLoading,
  setError,
}: {
  agentId: string
  totalValue: number
  actions: ProposalAction[]
  onComplete?: (payload: PortfolioSummary & { holdings: UpdatedHolding[] }) => void
  setLoading: (loading: boolean) => void
  setError: (error: string) => void
}) {
  setLoading(true)
  setError("")

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      throw new Error("Please log in before building the portfolio.")
    }

    let latestPayload: (PortfolioSummary & { holdings: UpdatedHolding[] }) | null =
      null

    for (const action of actions) {
      const quoteData = await lookupQuote(action.symbol)
      if (!quoteData?.success) {
        throw new Error(
          quoteData?.error || `Failed to fetch quote for ${action.symbol}.`
        )
      }

      const quote = quoteData.quote || {}
      const price = Number(quote.price || 0)
      if (price <= 0) {
        throw new Error(`No usable market price for ${action.symbol}.`)
      }

      const tradePct = Math.abs(
        Number(action.estimated_portfolio_pct_change || 0) ||
          Number(action.target_weight || 0) - Number(action.current_weight || 0)
      )
      const tradeAmount = totalValue > 0 ? (tradePct / 100) * totalValue : 0

      if (tradeAmount <= 0) continue

      const res = await fetch(`/api/agents/${agentId}/holdings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "buy",
          symbol: action.symbol,
          asset_name: quote.name || action.symbol,
          asset_type: inferAssetType(String(quote.assetType || ""), action.asset_type),
          quantity: 0,
          target_market_value_base: tradeAmount,
          average_cost: price,
          current_price: price,
          currency: quote.currency || "USD",
        }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || `Failed to buy ${action.symbol}.`)
      }

      latestPayload = {
        holdings: data.holdings || [],
        cash_balance: Number(data.cash_balance || 0),
        holdings_value: Number(data.holdings_value || 0),
        total_value: Number(data.total_value || 0),
      }
    }

    if (latestPayload) {
      onComplete?.(latestPayload)
      clearAgentDetailCache(agentId)
    }
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Failed to apply initial build."
    )
  } finally {
    setLoading(false)
  }
}

async function lookupQuote(symbol: string) {
  const res = await fetch(
    `/api/market/quote?symbol=${encodeURIComponent(symbol.trim())}`
  )

  return res.json()
}

function inferAssetType(quoteAssetType: string, fallback?: string) {
  const quoteType = quoteAssetType.toLowerCase()

  if (quoteType.includes("etf")) return "etf"
  if (quoteType.includes("crypto")) return "crypto"
  if (quoteType.includes("fund")) return "etf"
  return fallback || "stock"
}

function clearAgentDetailCache(agentId: string) {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(`agents:detail:${agentId}:`)) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Cache invalidation is best effort only.
  }
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-sm leading-relaxed text-slate-700">{value}</p>
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
                ? "rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                : "rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700"
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
    <div className="rounded-xl border border-blue-200 bg-white/65 p-5">
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

function StatusPill({ value }: { value: string }) {
  const normalized = formatSlug(value)
  const lowerValue = value.toLowerCase()
  const className =
    lowerValue === "active" || lowerValue === "public"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : lowerValue === "system"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-white/70 text-slate-700"

  return (
    <span className={`min-w-28 rounded-lg border px-4 py-2 text-center text-sm capitalize ${className}`}>
      {normalized}
    </span>
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
      badge: "border-blue-200 bg-blue-50 text-blue-700",
    }
  }

  if (runType === "initial_build") {
    return {
      card: "border-emerald-200 bg-emerald-50/60",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    }
  }

  if (runType === "escalation") {
    return {
      card: "border-red-200 bg-red-50/70",
      badge: "border-red-200 bg-red-50 text-red-700",
    }
  }

  return {
    card: "border-blue-200 bg-white/80",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }
}

function formatRunType(runType: string) {
  if (runType === "weekly") return "Weekly Deep Research"
  if (runType === "escalation") return "Escalation Memo"
  if (runType === "rebalance") return "Rebalance"
  if (runType === "initial_build") return "Initial Build"
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value))
}

function formatSlug(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
