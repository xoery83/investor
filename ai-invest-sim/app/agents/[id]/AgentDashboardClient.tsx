"use client"

import * as React from "react"
import Link from "next/link"

import AgentPortfolioPanel, { type PortfolioSummary } from "./AgentPortfolioPanel"
import AgentEtfTradePanel from "./AgentEtfTradePanel"
import FollowAgentButton from "./FollowAgentButton"
import type { TradeDraft } from "./AgentPortfolioPanel"
import RunAgentButton from "./RunAgentButton"
import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import { formatCurrencyAmount } from "../../../src/lib/format/currency"
import { supabase } from "../../../src/lib/supabase"
import type {
  Agent,
  AgentHolding,
  AgentInitializationSession,
  AgentMemoryCard,
  AgentProfile,
  AgentRun,
  AgentValuation,
  PortfolioEvaluation,
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
  initializationSession?: AgentInitializationSession | null
  profile: AgentProfile
  riskPolicy: RiskPolicy
  workflowConfig: WorkflowConfig
  memoryCards: AgentMemoryCard[]
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
  initializationSession,
  profile,
  riskPolicy,
  workflowConfig,
  memoryCards,
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
  const [currentMemoryCards, setCurrentMemoryCards] =
    React.useState(memoryCards)
  const [currentTradeProposals, setCurrentTradeProposals] =
    React.useState(tradeProposals)
  const [currentInitializationSession, setCurrentInitializationSession] =
    React.useState<AgentInitializationSession | null>(
      initializationSession || null
    )
  const [appliedProposalIds, setAppliedProposalIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [pendingRunType, setPendingRunType] =
    React.useState<AgentRun["run_type"] | null>(null)
  const [runActionError, setRunActionError] = React.useState("")
  const [tradeDraft, setTradeDraft] = React.useState<TradeDraft | null>(null)
  const [configTab, setConfigTab] = React.useState<
    "profile" | "workflow" | null
  >(null)
  const tradeSectionRef = React.useRef<HTMLDivElement | null>(null)
  const proposalScrollerRef = React.useRef<HTMLDivElement | null>(null)
  const committeeSectionRef = React.useRef<HTMLElement | null>(null)
  const researchSectionRef = React.useRef<HTMLElement | null>(null)
  const baseCurrency = agent.base_currency || "USD"
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
  const escalationRuns = React.useMemo(
    () =>
      currentRuns
        .filter((run) => getAgentRunType(run) === "escalation")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [currentRuns]
  )
  const researchRuns = React.useMemo(
    () =>
      currentRuns
        .filter((run) => getAgentRunType(run) !== "escalation")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
    [currentRuns]
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
    evaluation?: unknown
    initialization?: unknown
  }) {
    const completedRunType =
      payload.run && isRecord(payload.run)
        ? readString(payload.run.run_type, "")
        : ""
    if (payload.run) {
      setCurrentRuns((previous) => [payload.run as AgentRun, ...previous])
    }

    if (payload.trade_proposal) {
      const nextProposal = payload.trade_proposal as TradeProposalWithValidation
      const evaluation = isPortfolioEvaluation(payload.evaluation)
        ? payload.evaluation
        : null
      setCurrentTradeProposals((previous) => [
        evaluation
          ? {
              ...nextProposal,
              portfolio_evaluations: [
                evaluation,
                ...(nextProposal.portfolio_evaluations || []),
              ],
            }
          : nextProposal,
        ...previous,
      ])
    }

    if (payload.initialization) {
      const initialization = payload.initialization as {
        session?: AgentInitializationSession
      }
      if (initialization.session) {
        setCurrentInitializationSession(initialization.session)
      }
    }

    clearAgentDetailCache(agent.id)
    window.setTimeout(() => {
      if (payload.trade_proposal || isTradeRunType(completedRunType)) {
        proposalScrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" })
        tradeSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      } else if (completedRunType === "escalation") {
        committeeSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      } else {
        researchSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    }, 0)
  }

  async function requestAgentRun(runType: AgentRun["run_type"]) {
    setPendingRunType(runType)
    setRunActionError("")

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ run_type: runType }),
      })

      let data: {
        success?: boolean
        error?: string
        run?: unknown
        trade_proposal?: unknown
        evaluation?: unknown
        initialization?: unknown
      }

      try {
        data = (await res.json()) as typeof data
      } catch {
        throw new Error(`Run failed with status ${res.status}.`)
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Run failed with status ${res.status}.`)
      }

      handleRunCompleted(data)
    } catch (error) {
      setRunActionError(
        error instanceof Error ? error.message : "Failed to run agent."
      )
    } finally {
      setPendingRunType(null)
    }
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
                {formatCurrency(initialMarketValue, baseCurrency)}
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
                agentMode={agent.agent_mode === "copycat" ? "copycat" : "ai_manager"}
                onRunStarted={(runType) => {
                  setRunActionError("")
                  setPendingRunType(runType)
                  window.setTimeout(() => {
                    if (isTradeRunType(runType)) {
                      tradeSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                      proposalScrollerRef.current?.scrollTo({
                        left: 0,
                        behavior: "smooth",
                      })
                    } else if (runType === "escalation") {
                      committeeSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    } else {
                      researchSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  }, 0)
                }}
                onRunCompleted={handleRunCompleted}
                onRunFinished={() => setPendingRunType(null)}
              />
            )}

            {pendingRunType && (
              <div className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {getRunProgressTitle(pendingRunType)} The latest result will
                appear in{" "}
                {isTradeRunType(pendingRunType)
                  ? "Trade Proposals"
                  : "Recent Agent Research"}{" "}
                when generation finishes.
              </div>
            )}
            {runActionError && (
              <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {runActionError}
              </div>
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
            value={formatCurrency(summary.total_value, baseCurrency)}
            detail={`${formatSignedCurrency(valueChange, baseCurrency)} (${formatSignedPercent(valueChangePct)}) since inception`}
            detailTone={valueChange >= 0 ? "positive" : "negative"}
          />
          <SummaryCard
            label="Agent ETF Capital"
            value={formatCurrency(followerPositionValue, "USD")}
            detail="Follower simulator capital, denominated in USD"
          />
          <SummaryCard
            label="Cash Balance"
            value={formatCurrency(summary.cash_balance, baseCurrency)}
            detail={`${cashWeight.toFixed(2)}% of portfolio`}
          />
          <SummaryCard
            label="Holdings Value"
            value={formatCurrency(summary.holdings_value, baseCurrency)}
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

        {currentMemoryCards.length > 0 && (
          <section className="mb-8 rounded-xl border border-blue-200 bg-white/55 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-slate-700">
                  Agent Memory
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Active long-term memory used by future initialization and
                  rebalance prompts.
                </p>
              </div>
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-slate-600">
                {currentMemoryCards.length} active
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {currentMemoryCards.slice(0, 9).map((card) => (
                <MemoryCardPreview
                  key={card.id}
                  agentId={agent.id}
                  card={card}
                  canEdit={permissions.canEdit}
                  onCardUpdated={(nextCard) => {
                    if (nextCard.status !== "active") {
                      setCurrentMemoryCards((previous) =>
                        previous.filter((item) => item.id !== nextCard.id)
                      )
                      return
                    }
                    setCurrentMemoryCards((previous) =>
                      previous
                        .map((item) =>
                          item.id === nextCard.id ? nextCard : item
                        )
                        .sort(
                          (a, b) =>
                            Number(b.importance || 0) -
                              Number(a.importance || 0) ||
                            new Date(b.updated_at).getTime() -
                              new Date(a.updated_at).getTime()
                        )
                    )
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <div ref={tradeSectionRef} className="scroll-mt-6">
          <AgentPortfolioPanel
            agentId={agent.id}
            holdings={currentHoldings}
            initialValuations={valuations}
            tradeDraft={tradeDraft}
            totalValue={summary.total_value}
            baseCurrency={baseCurrency}
            onUseHolding={loadHoldingIntoTradeForm}
            onHoldingsUpdated={setCurrentHoldings}
            onSummaryUpdated={setSummary}
            canTrade={permissions.canTrade}
            canRefreshValuation={permissions.canEdit}
          />
        </div>

        {(pendingRunType === "escalation" || escalationRuns.length > 0) && (
          <section
            ref={committeeSectionRef}
            className="mt-8 rounded-xl border border-red-200 bg-red-50/30 p-6"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                  Investment Committee
                </p>
                <h2 className="mt-1 text-2xl font-semibold">
                  Escalation Review
                </h2>
                <p className="mt-1 max-w-4xl text-sm text-slate-500">
                  A staged committee memo that checks mandate drift, exposure,
                  core holdings, scenarios, macro sensitivity, stress tests, and
                  Keep/Add/Trim/Exit guidance before any rebalance decision.
                </p>
              </div>
              {escalationRuns.length > 0 && (
                <span className="rounded-md border border-red-100 bg-white px-2 py-1 text-xs text-red-700">
                  Latest memo
                </span>
              )}
            </div>

            {pendingRunType === "escalation" && (
              <div className="mb-4">
                <ProposalPendingCard runType={pendingRunType} />
              </div>
            )}

            {escalationRuns.length > 0 ? (
              <RunResearchCard
                run={escalationRuns[0]}
                rebalanceLoading={pendingRunType === "rebalance"}
                onRequestRebalance={() => requestAgentRun("rebalance")}
              />
            ) : (
              <p className="text-sm text-slate-500">
                No escalation memo yet. Run Escalation to generate an investment
                committee review.
              </p>
            )}
          </section>
        )}

        <section
          className="mt-8 rounded-xl border border-blue-200 bg-white/55 p-6"
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Trade Proposals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Agent recommendations are stored here after risk validation. Execution is still manual.
              </p>
            </div>
          </div>

          {pendingRunType && isTradeRunType(pendingRunType) ? (
            <div
              ref={proposalScrollerRef}
              className="flex snap-x gap-4 overflow-x-auto pb-2"
            >
              <div className="min-w-full snap-start">
                <ProposalPendingCard runType={pendingRunType} />
              </div>
              {sortedTradeProposals.map((proposal) => (
                <div key={proposal.id} className="min-w-full snap-start">
                  <TradeProposalCard
                    proposal={proposal}
                    agentId={agent.id}
                    totalValue={summary.total_value}
                    holdings={currentHoldings}
                    canApplyProposal={permissions.canTrade || permissions.canEdit}
                    initializationSession={currentInitializationSession}
                    applied={appliedProposalIds.has(proposal.id)}
                    onUseAction={loadTradeDraft}
                    onProposalRevised={(payload) => {
                      if (payload.trade_proposal) {
                        const nextProposal =
                          payload.trade_proposal as TradeProposalWithValidation
                        const evaluation = isPortfolioEvaluation(
                          payload.evaluation
                        )
                          ? payload.evaluation
                          : null
                        setCurrentTradeProposals((previous) => [
                          evaluation
                            ? {
                                ...nextProposal,
                                portfolio_evaluations: [
                                  evaluation,
                                  ...(nextProposal.portfolio_evaluations || []),
                                ],
                              }
                            : nextProposal,
                          ...previous,
                        ])
                      }
                      if (payload.initialization?.session) {
                        setCurrentInitializationSession(
                          payload.initialization.session
                        )
                      }
                      window.setTimeout(() => {
                        proposalScrollerRef.current?.scrollTo({
                          left: 0,
                          behavior: "smooth",
                        })
                      }, 0)
                    }}
                    onProposalApplied={(payload) =>
                      handleInitialBuildApplied(proposal.id, payload)
                    }
                  />
                </div>
              ))}
            </div>
          ) : sortedTradeProposals.length === 0 ? (
            <p className="text-slate-500">No trade proposals yet. Run the agent to generate one.</p>
          ) : (
            <div
              ref={proposalScrollerRef}
              className="flex snap-x gap-4 overflow-x-auto pb-2"
            >
              {sortedTradeProposals.map((proposal) => (
                <div key={proposal.id} className="min-w-full snap-start">
                  <TradeProposalCard
                    proposal={proposal}
                    agentId={agent.id}
                    totalValue={summary.total_value}
                    holdings={currentHoldings}
                    canApplyProposal={permissions.canTrade || permissions.canEdit}
                    initializationSession={currentInitializationSession}
                    applied={appliedProposalIds.has(proposal.id)}
                    onUseAction={loadTradeDraft}
                    onProposalRevised={(payload) => {
                      if (payload.trade_proposal) {
                        const nextProposal =
                          payload.trade_proposal as TradeProposalWithValidation
                        const evaluation = isPortfolioEvaluation(
                          payload.evaluation
                        )
                          ? payload.evaluation
                          : null
                        setCurrentTradeProposals((previous) => [
                          evaluation
                            ? {
                                ...nextProposal,
                                portfolio_evaluations: [
                                  evaluation,
                                  ...(nextProposal.portfolio_evaluations || []),
                                ],
                              }
                            : nextProposal,
                          ...previous,
                        ])
                      }
                      if (payload.initialization?.session) {
                        setCurrentInitializationSession(
                          payload.initialization.session
                        )
                      }
                      if (payload.run) {
                        setCurrentRuns((previous) => [
                          payload.run as AgentRun,
                          ...previous,
                        ])
                      }
                      clearAgentDetailCache(agent.id)
                    }}
                    onProposalUpdated={(updatedProposal) => {
                      setCurrentTradeProposals((previous) =>
                        previous.map((item) =>
                          item.id === updatedProposal.id ? updatedProposal : item
                        )
                      )
                      clearAgentDetailCache(agent.id)
                    }}
                    onProposalApplied={(payload) =>
                      handleInitialBuildApplied(proposal.id, payload)
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          ref={researchSectionRef}
          className="mt-8 rounded-xl border border-blue-200 bg-white/55 p-6"
        >
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Recent Agent Research</h2>
            <p className="mt-1 text-sm text-slate-500">
              Daily runs without trades will evolve into market view, thesis, risk, and watchlist modules.
            </p>
          </div>

          {pendingRunType &&
            !isTradeRunType(pendingRunType) &&
            pendingRunType !== "escalation" && (
            <div className="mb-4">
              <ProposalPendingCard runType={pendingRunType} />
            </div>
          )}

          {researchRuns.length === 0 &&
          !(
            pendingRunType &&
            !isTradeRunType(pendingRunType) &&
            pendingRunType !== "escalation"
          ) ? (
            <p className="text-slate-500">No agent runs yet.</p>
          ) : (
            <div className="space-y-4">
              {researchRuns.map((run) => (
                <RunResearchCard
                  key={run.id}
                  run={run}
                  rebalanceLoading={pendingRunType === "rebalance"}
                  onRequestRebalance={() => requestAgentRun("rebalance")}
                />
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

function MemoryCardPreview({
  agentId,
  card,
  canEdit,
  onCardUpdated,
}: {
  agentId: string
  card: AgentMemoryCard
  canEdit: boolean
  onCardUpdated: (card: AgentMemoryCard) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [loadingAction, setLoadingAction] = React.useState("")
  const [error, setError] = React.useState("")
  const pinned = Boolean(card.metadata?.pinned)

  async function updateMemory(action: "archive" | "supersede" | "pin" | "unpin") {
    setLoadingAction(action)
    setError("")

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error("Please log in before updating memory.")

      const res = await fetch(`/api/agents/${agentId}/memory/${card.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update memory card.")
      }
      onCardUpdated(data.memory_card as AgentMemoryCard)
      clearAgentDetailCache(agentId)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to update memory card."
      )
    } finally {
      setLoadingAction("")
    }
  }

  return (
    <article className="rounded-lg border border-blue-100 bg-white/75 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] uppercase tracking-wide text-blue-700">
            {formatSlug(card.memory_type)}
          </span>
          {pinned && (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
              Pinned
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-500">
          importance {card.importance}
        </span>
      </div>
      <h3 className="text-sm font-semibold text-slate-800">{card.title}</h3>
      <p
        className={
          expanded
            ? "mt-2 text-xs leading-relaxed text-slate-600"
            : "mt-2 line-clamp-4 text-xs leading-relaxed text-slate-600"
        }
      >
        {card.content}
      </p>
      {card.symbols?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {card.symbols.slice(0, 6).map((symbol) => (
            <span
              key={symbol}
              className="rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] text-blue-700"
            >
              {symbol}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="rounded-md border border-blue-100 bg-white px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => updateMemory(pinned ? "unpin" : "pin")}
              disabled={Boolean(loadingAction)}
              className="rounded-md border border-blue-100 bg-white px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 disabled:text-slate-400"
            >
              {loadingAction === "pin" || loadingAction === "unpin"
                ? "Saving..."
                : pinned
                  ? "Unpin"
                  : "Pin"}
            </button>
            <button
              type="button"
              onClick={() => updateMemory("supersede")}
              disabled={Boolean(loadingAction)}
              className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700 hover:bg-amber-100 disabled:text-slate-400"
            >
              Supersede
            </button>
            <button
              type="button"
              onClick={() => updateMemory("archive")}
              disabled={Boolean(loadingAction)}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 disabled:text-slate-400"
            >
              Archive
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </article>
  )
}

function RunResearchCard({
  run,
  onRequestRebalance,
  rebalanceLoading,
}: {
  run: AgentRun
  onRequestRebalance?: () => void
  rebalanceLoading?: boolean
}) {
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
  const committeeReview = readCommitteeReview(recommendation.committee_review)
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

      {runType === "escalation" && committeeReview && (
        <EscalationCommitteeReview
          review={committeeReview}
          onRequestRebalance={onRequestRebalance}
          rebalanceLoading={rebalanceLoading}
        />
      )}

      {runType === "escalation" && !committeeReview && (
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
            {risks.map((risk, index) => (
              <span
                key={`${risk}-${index}`}
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
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>- {item}</li>
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

type CommitteePhase = {
  phase: string
  title: string
  facts: string[]
  judgment: string
  confidence: string
  risks: string[]
  triggers: string[]
}

type CommitteeHoldingAction = {
  symbol: string
  action: string
  currentWeight?: number
  recommendedWeightChange: string
  factBasis: string[]
  judgment: string
  keyRisks: string[]
  triggerConditions: string[]
  reviewTiming: string
  confidence: string
}

type CommitteeStressTest = {
  scenario: string
  likelyImpact: string
  vulnerableHoldings: string[]
  mitigation: string
}

type CommitteeRebalanceRecommendation = {
  needed: boolean
  priority: string
  reason: string
  suggestedBrief: string
  managerApprovalRequired: boolean
}

type CommitteeReview = {
  overallVerdict: string
  mandateStatus: string
  executiveSummary: string
  rebalanceRecommendation: CommitteeRebalanceRecommendation | null
  phases: CommitteePhase[]
  holdingActions: CommitteeHoldingAction[]
  stressTests: CommitteeStressTest[]
  agreements: string[]
  disagreements: string[]
  finalRecommendation: string
  followUpQuestions: string[]
}

function EscalationCommitteeReview({
  review,
  onRequestRebalance,
  rebalanceLoading,
}: {
  review: CommitteeReview
  onRequestRebalance?: () => void
  rebalanceLoading?: boolean
}) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Investment Committee Review
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs capitalize text-amber-800">
              Verdict: {review.overallVerdict || "watch"}
            </span>
            <span className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs capitalize text-amber-800">
              Mandate: {review.mandateStatus || "watch"}
            </span>
          </div>
        </div>
        {review.executiveSummary && (
          <p className="mt-2 text-sm leading-relaxed text-amber-900">
            {review.executiveSummary}
          </p>
        )}
      </div>

      {review.rebalanceRecommendation && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-emerald-700">
                Rebalance Link
              </p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
                {review.rebalanceRecommendation.needed
                  ? `Recommended: ${review.rebalanceRecommendation.priority || "review"}`
                  : "No immediate rebalance required"}
              </p>
              {review.rebalanceRecommendation.reason && (
                <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
                  {review.rebalanceRecommendation.reason}
                </p>
              )}
              {review.rebalanceRecommendation.suggestedBrief && (
                <p className="mt-2 max-w-4xl text-xs leading-relaxed text-emerald-800">
                  Next rebalance brief:{" "}
                  {review.rebalanceRecommendation.suggestedBrief}
                </p>
              )}
            </div>
            {review.rebalanceRecommendation.needed && onRequestRebalance && (
              <button
                type="button"
                onClick={onRequestRebalance}
                disabled={rebalanceLoading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-200"
              >
                {rebalanceLoading
                  ? "Generating..."
                  : "Generate Rebalance Proposal"}
              </button>
            )}
          </div>
        </div>
      )}

      {review.phases.length > 0 && (
        <div className="space-y-3">
          {review.phases.map((phase, index) => (
            <CommitteePhaseCard
              key={`${phase.phase || phase.title}-${index}`}
              phase={phase}
            />
          ))}
        </div>
      )}

      {review.holdingActions.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
          <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
            Keep / Add / Trim / Exit
          </p>
          <div className="space-y-2">
            {review.holdingActions.slice(0, 10).map((item, index) => (
              <div
                key={`${item.symbol}-${item.action}-${index}`}
                className="rounded-lg border border-blue-100 bg-blue-50/30 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">
                    {item.symbol}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-1 text-[11px] font-semibold uppercase ${getCommitteeActionTone(
                      item.action
                    )}`}
                  >
                    {item.action || "watchlist"}
                  </span>
                  {typeof item.currentWeight === "number" && (
                    <span className="text-xs text-slate-500">
                      {item.currentWeight}% current
                    </span>
                  )}
                </div>
                {item.recommendedWeightChange && (
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    {item.recommendedWeightChange}
                  </p>
                )}
                {item.judgment && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {item.judgment}
                  </p>
                )}
                {item.triggerConditions.length > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Trigger: {item.triggerConditions.slice(0, 2).join("; ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {review.stressTests.length > 0 && (
        <div className="rounded-lg border border-red-100 bg-red-50/50 p-3">
          <p className="mb-3 text-xs uppercase tracking-wide text-red-700">
            Stress Tests
          </p>
          <div className="space-y-2">
            {review.stressTests.slice(0, 8).map((test, index) => (
              <div
                key={`${test.scenario}-${index}`}
                className="rounded-lg border border-red-100 bg-white/75 p-3"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {test.scenario}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {test.likelyImpact}
                </p>
                {test.vulnerableHoldings.length > 0 && (
                  <p className="mt-2 text-xs text-red-700">
                    Vulnerable: {test.vulnerableHoldings.join(", ")}
                  </p>
                )}
                {test.mitigation && (
                  <p className="mt-1 text-xs text-slate-500">
                    Mitigation: {test.mitigation}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(review.finalRecommendation ||
        review.agreements.length > 0 ||
        review.disagreements.length > 0 ||
        review.followUpQuestions.length > 0) && (
        <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
            Committee Conclusion
          </p>
          {review.finalRecommendation && (
            <p className="text-sm font-medium text-slate-800">
              {review.finalRecommendation}
            </p>
          )}
          <div className="mt-3 space-y-3">
            <ResearchListBlock title="Agreements" items={review.agreements} />
            <ResearchListBlock
              title="Disagreements"
              items={review.disagreements}
            />
            <ResearchListBlock
              title="Follow-up"
              items={review.followUpQuestions}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function CommitteePhaseCard({ phase }: { phase: CommitteePhase }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {phase.phase.replaceAll("_", " ")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {phase.title}
          </p>
        </div>
        {phase.confidence && (
          <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] capitalize text-blue-700">
            {phase.confidence}
          </span>
        )}
      </div>
      {phase.facts.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Facts
          </p>
          <ul className="mt-1 space-y-1 text-sm text-slate-600">
            {phase.facts.slice(0, 4).map((fact, index) => (
              <li key={`${fact}-${index}`}>- {fact}</li>
            ))}
          </ul>
        </div>
      )}
      {phase.judgment && (
        <div className="mt-3 rounded-md border border-amber-100 bg-amber-50/60 p-2">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">
            Judgment
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900">
            {phase.judgment}
          </p>
        </div>
      )}
      {(phase.risks.length > 0 || phase.triggers.length > 0) && (
        <div className="mt-3 space-y-2">
          <ResearchListBlock title="Risks" items={phase.risks.slice(0, 3)} />
          <ResearchListBlock
            title="Triggers"
            items={phase.triggers.slice(0, 3)}
          />
        </div>
      )}
    </div>
  )
}

function TradeProposalCard({
  proposal,
  agentId,
  totalValue,
  holdings,
  canApplyProposal,
  initializationSession,
  applied,
  onUseAction,
  onProposalRevised,
  onProposalUpdated,
  onProposalApplied,
}: {
  proposal: TradeProposalWithValidation
  agentId: string
  totalValue: number
  holdings: UpdatedHolding[]
  canApplyProposal?: boolean
  initializationSession?: AgentInitializationSession | null
  applied?: boolean
  onUseAction?: (draft: Omit<TradeDraft, "key">) => void
  onProposalRevised?: (payload: {
    run?: unknown
    trade_proposal?: unknown
    evaluation?: unknown
    initialization?: { session?: AgentInitializationSession }
  }) => void
  onProposalUpdated?: (proposal: TradeProposalWithValidation) => void
  onProposalApplied?: (
    payload: PortfolioSummary & { holdings: UpdatedHolding[] }
  ) => void
}) {
  const [buildLoading, setBuildLoading] = React.useState(false)
  const [buildError, setBuildError] = React.useState("")
  const [question, setQuestion] = React.useState("")
  const [discussionMessages, setDiscussionMessages] = React.useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([])
  const [discussionLoading, setDiscussionLoading] = React.useState(false)
  const [discussionError, setDiscussionError] = React.useState("")
  const [universeLoading, setUniverseLoading] = React.useState(false)
  const [universeMessage, setUniverseMessage] = React.useState("")
  const [universeError, setUniverseError] = React.useState("")
  const proposalBody = isRecord(proposal.proposal) ? proposal.proposal : {}
  const validation = proposal.validator_results?.[0]
  const violations = Array.isArray(validation?.violations)
    ? validation.violations.map(String)
    : []
  const outOfUniverseSymbols = readOutOfUniverseSymbols(violations)
  const validationResult = isRecord(validation?.result) ? validation.result : {}
  const residualPolicyGaps = Array.isArray(validationResult.residual_policy_gaps)
    ? validationResult.residual_policy_gaps.map(String)
    : []
  const actions = readActions(proposalBody.suggested_actions)
  const allocations = readAllocations(proposalBody.target_allocation)
  const thesis = readInvestmentThesis(proposalBody.investment_thesis)
  const critique = readSelfCritique(proposalBody.self_critique)
  const sectorExposure = readSectorExposure(proposalBody.sector_exposure)
  const historicalReference = readHistoricalReference(
    proposalBody.historical_reference
  )
  const portfolioEvaluation = readLatestPortfolioEvaluation(
    proposal.portfolio_evaluations
  )
  const executableActions = actions.filter(
    (action) =>
      (action.action === "buy" || action.action === "sell") &&
      action.symbol.toUpperCase() !== "CASH"
  )
  const isConstructionProposal =
    proposalBody.proposal_type === "initial_build" ||
    proposalBody.proposal_type === "capital_deployment"
  const linkedInitializationVersion = initializationSession?.versions?.find(
    (version) => version.trade_proposal_id === proposal.id
  )
  const canDiscussInitialization =
    isConstructionProposal &&
    initializationSession &&
    (!initializationSession.versions?.length || linkedInitializationVersion)
  const persistedDiscussionMessages =
    initializationSession?.messages
      ?.filter(
        (message) =>
          !linkedInitializationVersion ||
          message.version_id === linkedInitializationVersion.id
      )
      .filter(
        (message) =>
          message.role === "user" || message.role === "assistant"
      )
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      })) || []
  const allDiscussionMessages = [
    ...persistedDiscussionMessages,
    ...discussionMessages,
  ]
  const initialBuildBuyActions = executableActions.filter(
    (action) => action.action === "buy"
  )
  const existingSymbols = new Set(
    holdings
      .filter((holding) => Number(holding.quantity || 0) > 0)
      .map((holding) => holding.symbol.toUpperCase())
  )
  const initialBuildAlreadyApplied =
    Boolean(applied) ||
    (isConstructionProposal &&
      initialBuildBuyActions.length > 0 &&
      initialBuildBuyActions.every((action) =>
        existingSymbols.has(action.symbol.toUpperCase())
      ))
  const stagedPlan = readStagedPlan(proposalBody.staged_remediation_plan)
  const manualActions = readStringList(proposalBody.manual_actions)
  const validatorStatus =
    validation?.validation_status || proposal.validator_status || "pending"
  const approved =
    validatorStatus === "approved" || validation?.final_action_allowed === true
  const proposalExecuted = proposal.status === "executed"
  const statusLabel = approved
    ? proposalExecuted
      ? "Executed"
      : residualPolicyGaps.length > 0
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

      {approved &&
        canApplyProposal &&
        executableActions.length > 0 &&
        !manualActions.length &&
        !violations.length && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <button
              type="button"
              onClick={() =>
                applyTradeProposal({
                  agentId,
                  proposalId: proposal.id,
                  totalValue,
                  holdings,
                  actions: executableActions,
                  allocations,
                  onComplete: onProposalApplied,
                  setLoading: setBuildLoading,
                  setError: setBuildError,
                })
              }
              disabled={
                buildLoading ||
                initialBuildAlreadyApplied ||
                Boolean(applied) ||
                proposalExecuted
              }
              className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {buildLoading
                ? "Executing..."
                : initialBuildAlreadyApplied || applied || proposalExecuted
                  ? "Proposal executed"
                  : isConstructionProposal
                    ? "Approve & Execute"
                    : "Execute proposal"}
            </button>
            <p className="text-sm text-emerald-800">
              {initialBuildAlreadyApplied || applied || proposalExecuted
                ? "This approved proposal has already been applied in this session."
                : "Execute approved BUY/SELL actions using current market quotes."}
            </p>
          </div>
        )}

      {buildError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {buildError}
        </p>
      )}

      {(thesis.summary ||
        thesis.coreThemes.length > 0 ||
        critique.concerns.length > 0 ||
        sectorExposure.length > 0) && (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MemoPanel title="Investment Thesis">
            {thesis.summary && (
              <p className="text-sm leading-relaxed text-slate-600">
                {thesis.summary}
              </p>
            )}
            {thesis.coreThemes.length > 0 && (
              <TagList values={thesis.coreThemes} />
            )}
            {thesis.buckets.length > 0 && (
              <div className="space-y-2">
                {thesis.buckets.map((bucket) => (
                  <p key={bucket.bucket} className="text-xs text-slate-600">
                    <span className="font-medium text-slate-800">
                      {bucket.bucket}:
                    </span>{" "}
                    {bucket.role}
                  </p>
                ))}
              </div>
            )}
          </MemoPanel>

          <MemoPanel title="Self-Critique">
            {critique.concerns.length === 0 ? (
              <p className="text-sm text-slate-500">
                No explicit concerns returned.
              </p>
            ) : (
              <div className="space-y-2">
                {critique.concerns.map((concern, index) => (
                  <div key={`${concern.concern}-${index}`}>
                    <p className="text-sm leading-relaxed text-slate-700">
                      {concern.concern}
                    </p>
                    {concern.possible_adjustment && (
                      <p className="mt-1 text-xs text-slate-500">
                        Adjustment: {concern.possible_adjustment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {critique.questions.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  Questions
                </p>
                <ul className="space-y-1 text-xs text-slate-600">
                  {critique.questions.map((question) => (
                    <li key={question}>- {question}</li>
                  ))}
                </ul>
              </div>
            )}
          </MemoPanel>

          <MemoPanel title="Sector Exposure">
            {sectorExposure.length === 0 ? (
              <p className="text-sm text-slate-500">
                No sector exposure returned.
              </p>
            ) : (
              <div className="space-y-2">
                {sectorExposure.map((sector) => (
                  <div key={sector.sector}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{sector.sector}</span>
                      <span>{sector.target_weight}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, sector.target_weight)
                          )}%`,
                        }}
                      />
                    </div>
                    {sector.rationale && (
                      <p className="mt-1 text-xs text-slate-500">
                        {sector.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </MemoPanel>
        </div>
      )}

      {historicalReference.status && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">
              Historical Reference
            </p>
            <span className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs uppercase text-blue-700">
              {historicalReference.status}
            </span>
          </div>
          {historicalReference.status === "available" ? (
            <div className="mt-2 grid gap-3 text-sm md:grid-cols-4">
              <Metric label="Period" value={historicalReference.period || "--"} />
              <Metric
                label="Annualized Return"
                value={
                  typeof historicalReference.estimatedAnnualizedReturn ===
                  "number"
                    ? `${historicalReference.estimatedAnnualizedReturn.toFixed(2)}%`
                    : "--"
                }
              />
              <Metric
                label="Max Drawdown"
                value={
                  typeof historicalReference.estimatedMaxDrawdown === "number"
                    ? `${historicalReference.estimatedMaxDrawdown.toFixed(2)}%`
                    : "--"
                }
              />
              <Metric
                label="Benchmark"
                value={historicalReference.benchmark || "--"}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {historicalReference.notes ||
                "Historical return calculation requires a price-history data source."}
            </p>
          )}
        </div>
      )}

      {portfolioEvaluation && (
        <PortfolioEvaluationPanel evaluation={portfolioEvaluation} />
      )}

      {canDiscussInitialization && initializationSession && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-white/70 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-800">
                Ask AI about this proposal
              </p>
              <p className="text-xs text-slate-500">
                Challenge individual positions before approving execution.
              </p>
            </div>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
              V
              {linkedInitializationVersion?.version_number ||
                initializationSession.current_version ||
                1}
            </span>
          </div>

          {allDiscussionMessages.length > 0 && (
            <div className="mb-3 space-y-2">
              {allDiscussionMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "user"
                      ? "rounded-md bg-blue-50 p-2 text-sm text-slate-700"
                      : "rounded-md bg-emerald-50 p-2 text-sm leading-relaxed text-slate-700"
                  }
                >
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    {message.role === "user" ? "You" : "AI"}
                  </span>
                  {message.content}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask why a position is included, request less cash, or challenge an allocation..."
              className="min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <button
              type="button"
              onClick={() =>
                askInitializationQuestion({
                  agentId,
                  sessionId: initializationSession.id,
                  question,
                  setQuestion,
                  setDiscussionMessages,
                  setDiscussionLoading,
                  setDiscussionError,
                })
              }
              disabled={discussionLoading || !question.trim()}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-200"
            >
              {discussionLoading ? "Asking..." : "Ask AI"}
            </button>
            <button
              type="button"
              onClick={() =>
                requestInitializationChanges({
                  agentId,
                  sessionId: initializationSession.id,
                  feedback: question,
                  setQuestion,
                  setDiscussionMessages,
                  setDiscussionLoading,
                  setDiscussionError,
                  onProposalRevised,
                })
              }
              disabled={discussionLoading || !question.trim()}
              className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:bg-slate-100 disabled:text-slate-400"
            >
              Request Changes
            </button>
          </div>
          {discussionError && (
            <p className="mt-2 text-xs text-red-600">{discussionError}</p>
          )}
        </div>
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
                      {action.action.toUpperCase()}
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-sm font-medium text-amber-800">
                Risk Review Required
              </p>
              <ul className="space-y-1 text-sm text-amber-700">
                {violations.map((violation, index) => (
                  <li key={`${violation}-${index}`}>- {violation}</li>
                ))}
              </ul>
            </div>
            {canDiscussInitialization &&
              canApplyProposal &&
              linkedInitializationVersion &&
              outOfUniverseSymbols.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    expandUniverseAndRevalidate({
                      agentId,
                      sessionId: initializationSession.id,
                      proposalId: proposal.id,
                      symbols: outOfUniverseSymbols,
                      setLoading: setUniverseLoading,
                      setMessage: setUniverseMessage,
                      setError: setUniverseError,
                      onProposalUpdated,
                    })
                  }
                  disabled={universeLoading}
                  className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:text-slate-400"
                >
                  {universeLoading
                    ? "Revalidating..."
                    : `Add ${outOfUniverseSymbols.join(", ")} to universe`}
                </button>
              )}
          </div>
          {universeMessage && (
            <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">
              {universeMessage}
            </p>
          )}
          {universeError && (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {universeError}
            </p>
          )}
        </div>
      )}

      {residualPolicyGaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="mb-2 text-sm font-medium text-blue-800">
            Remaining Policy Gap
          </p>
          <ul className="space-y-1 text-sm text-blue-700">
            {residualPolicyGaps.map((gap, index) => (
              <li key={`${gap}-${index}`}>- {gap}</li>
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

function ProposalPendingCard({ runType }: { runType: string }) {
  const steps = getRunProgressSteps(runType)

  return (
    <article className="rounded-xl border border-blue-300 bg-white p-6 shadow-sm shadow-blue-100/80">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-700">
            {formatRunType(runType)}
          </p>
          <h3 className="mt-1 text-lg font-semibold">
            {getRunProgressTitle(runType)}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            {getRunProgressDescription(runType)}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-700">
          <span className="h-3 w-3 animate-pulse rounded-full bg-blue-600" />
          <span className="text-sm font-medium">Running</span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.title}
            className="rounded-lg border border-blue-100 bg-blue-50/45 p-3"
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  index === 0
                    ? "h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600"
                    : "h-2.5 w-2.5 rounded-full bg-blue-200"
                }
              />
              <p className="text-sm font-medium text-slate-800">
                {step.title}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {step.description}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        You can keep this tab open. The newest result will slide into this
        position automatically after model output, risk validation, and database
        writes finish.
      </p>
    </article>
  )
}

function getRunProgressTitle(runType: string) {
  if (runType === "initial_build") return "Building initial portfolio..."
  if (runType === "rebalance") return "Generating rebalance proposal..."
  if (runType === "weekly") return "Running weekly deep research..."
  if (runType === "escalation") return "Running escalation review..."
  return "Running daily routine..."
}

function getRunProgressDescription(runType: string) {
  if (runType === "initial_build") {
    return "The agent is selecting a full starting allocation, checking overlap and risk policy, then preparing an approval-ready portfolio proposal."
  }
  if (runType === "rebalance") {
    return "The agent is refreshing holdings, reading memory cards, evaluating current policy gaps, and creating a bounded rebalance proposal."
  }
  if (runType === "weekly") {
    return "The agent is preparing a deeper research note with portfolio implications, risks, and watch-list updates."
  }
  if (runType === "escalation") {
    return "The agent is running an investment committee review: mandate drift, exposure, core holdings, scenarios, macro sensitivity, stress tests, and final Keep/Add/Trim/Exit guidance."
  }
  return "The agent is preparing a daily market and portfolio status update."
}

function getRunProgressSteps(runType: string) {
  if (runType === "initial_build") {
    return [
      {
        title: "Universe",
        description: "Confirming target markets, allowed assets, and memory.",
      },
      {
        title: "Allocation",
        description: "Drafting target weights and construction thesis.",
      },
      {
        title: "Risk",
        description: "Checking cash, concentration, and overlap limits.",
      },
      {
        title: "Save",
        description: "Storing proposal, evaluation, and memory cards.",
      },
    ]
  }

  if (runType === "rebalance") {
    return [
      {
        title: "Refresh",
        description: "Reading current holdings, quotes, and cash state.",
      },
      {
        title: "Reason",
        description: "Comparing current portfolio with target policy.",
      },
      {
        title: "Validate",
        description: "Running proposal through risk constraints.",
      },
      {
        title: "Publish",
        description: "Writing the latest trade proposal to the dashboard.",
      },
    ]
  }

  if (runType === "weekly") {
    return [
      {
        title: "Market",
        description: "Building weekly macro and sector context.",
      },
      {
        title: "Holdings",
        description: "Reviewing position-level implications.",
      },
      {
        title: "Risks",
        description: "Updating risks, watch items, and thesis drift.",
      },
      {
        title: "Research",
        description: "Saving the weekly research run.",
      },
    ]
  }

  if (runType === "escalation") {
    return [
      {
        title: "Mandate",
        description: "Checking whether the portfolio still matches the original agent mission.",
      },
      {
        title: "Exposure",
        description: "Mapping holdings, sectors, geography, style, cash, and concentration.",
      },
      {
        title: "Holdings",
        description: "Reviewing core positions and separating facts from judgment.",
      },
      {
        title: "Stress",
        description: "Running macro, sector-cycle, and drawdown stress scenarios.",
      },
      {
        title: "Committee",
        description: "Preparing Keep/Add/Trim/Exit conclusions and monitoring triggers.",
      },
    ]
  }

  return [
    {
      title: "Quotes",
      description: "Refreshing market and portfolio context.",
    },
    {
      title: "Summary",
      description: "Preparing daily market and portfolio notes.",
    },
    {
      title: "Risks",
      description: "Checking for risk-policy drift.",
    },
    {
      title: "Log",
      description: "Saving the daily routine result.",
    },
  ]
}

function MemoPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/25 p-3">
      <p className="mb-2 text-sm font-medium text-slate-800">{title}</p>
      {children}
    </div>
  )
}

function TagList({ values }: { values: string[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {values.map((value) => (
        <span
          key={value}
          className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700"
        >
          {value}
        </span>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white/70 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function PortfolioEvaluationPanel({
  evaluation,
}: {
  evaluation: PortfolioEvaluation
}) {
  const warnings = readEvaluationWarnings(evaluation.overlap_warnings)
  const metrics = isRecord(evaluation.metrics) ? evaluation.metrics : {}
  const score =
    typeof evaluation.target_fit_score === "number"
      ? evaluation.target_fit_score
      : null
  const probability =
    typeof evaluation.target_return_probability === "number"
      ? evaluation.target_return_probability
      : null

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/25 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">
          Portfolio Evaluation
        </p>
        <span className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs uppercase text-blue-700">
          {evaluation.source || "local"}
        </span>
      </div>
      <div className="mt-2 grid gap-3 text-sm md:grid-cols-4 xl:grid-cols-7">
        <Metric
          label="Fit Score"
          value={score === null ? "--" : `${score}/100`}
        />
        <Metric
          label="Target Fit Estimate"
          value={probability === null ? "--" : `${Math.round(probability * 100)}%`}
        />
        <Metric
          label="Cash"
          value={
            typeof metrics.cash_weight === "number"
              ? `${metrics.cash_weight.toFixed(2)}%`
              : "--"
          }
        />
        <Metric
          label="Largest Exposure"
          value={
            typeof metrics.largest_effective_exposure === "number"
              ? `${metrics.largest_effective_exposure.toFixed(2)}%`
              : "--"
          }
        />
        <Metric
          label="Hist. Annualized"
          value={
            typeof metrics.historical_annualized_return_pct === "number"
              ? `${metrics.historical_annualized_return_pct.toFixed(2)}%`
              : "--"
          }
        />
        <Metric
          label="Hist. Drawdown"
          value={
            typeof metrics.historical_max_drawdown_pct === "number"
              ? `${metrics.historical_max_drawdown_pct.toFixed(2)}%`
              : "--"
          }
        />
        <Metric
          label="History Coverage"
          value={
            typeof metrics.historical_coverage_weight_pct === "number"
              ? `${metrics.historical_coverage_weight_pct.toFixed(0)}%`
              : "--"
          }
        />
      </div>
      {evaluation.summary && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {evaluation.summary}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {warnings.slice(0, 4).map((warning, index) => (
            <p
              key={`${warning.type}-${index}`}
              className={
                warning.severity === "high"
                  ? "rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700"
                  : "rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800"
              }
            >
              {warning.message}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

type ProposalAction = ReturnType<typeof readActions>[number]

async function applyTradeProposal({
  agentId,
  proposalId,
  totalValue,
  holdings,
  actions,
  allocations,
  onComplete,
  setLoading,
  setError,
}: {
  agentId: string
  proposalId: string
  totalValue: number
  holdings: UpdatedHolding[]
  actions: ProposalAction[]
  allocations: ReturnType<typeof readAllocations>
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
      const tradeAction = action.action === "sell" ? "sell" : "buy"
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

      const tradePct = resolveTradePct({
        action,
        allocations,
        holdings,
      })
      const explicitTradeAmount = Number(action.target_base_amount || 0)
      const tradeAmount =
        explicitTradeAmount > 0
          ? explicitTradeAmount
          : totalValue > 0
            ? (tradePct / 100) * totalValue
            : 0

      if (tradeAmount <= 0) continue
      const existingHolding = holdings.find(
        (holding) => holding.symbol.toUpperCase() === action.symbol.toUpperCase()
      )
      const sellQuantity =
        tradeAction === "sell" && existingHolding
          ? estimateSellQuantity({
              holding: existingHolding,
              tradePct,
              tradeAmount,
            })
          : 0

      const res = await fetch(`/api/agents/${agentId}/holdings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: tradeAction,
          proposal_id: proposalId,
          symbol: String(quote.symbol || action.symbol),
          asset_name: quote.name || existingHolding?.asset_name || action.symbol,
          asset_type: inferAssetType(
            String(quote.assetType || ""),
            action.asset_type || existingHolding?.asset_type
          ),
          quantity: tradeAction === "sell" ? sellQuantity : 0,
          target_market_value_base: tradeAction === "buy" ? tradeAmount : 0,
          average_cost: price,
          current_price: price,
          currency: quote.currency || existingHolding?.currency || "USD",
        }),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || `Failed to ${tradeAction} ${action.symbol}.`)
      }

      latestPayload = {
        holdings: data.holdings || [],
        cash_balance: Number(data.cash_balance || 0),
        holdings_value: Number(data.holdings_value || 0),
        total_value: Number(data.total_value || 0),
      }
    }

    if (latestPayload) {
      await markProposalExecuted({ agentId, proposalId, token })
      onComplete?.(latestPayload)
      clearAgentDetailCache(agentId)
    }
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Failed to apply trade proposal."
    )
  } finally {
    setLoading(false)
  }
}

async function markProposalExecuted({
  agentId,
  proposalId,
  token,
}: {
  agentId: string
  proposalId: string
  token: string
}) {
  const res = await fetch(
    `/api/agents/${agentId}/trade-proposals/${proposalId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: "executed" }),
    }
  )
  const data = await res.json()

  if (!data.success) {
    throw new Error(data.error || "Failed to mark proposal as executed.")
  }
}

async function askInitializationQuestion({
  agentId,
  sessionId,
  question,
  setQuestion,
  setDiscussionMessages,
  setDiscussionLoading,
  setDiscussionError,
}: {
  agentId: string
  sessionId: string
  question: string
  setQuestion: (question: string) => void
  setDiscussionMessages: React.Dispatch<
    React.SetStateAction<Array<{ role: "user" | "assistant"; content: string }>>
  >
  setDiscussionLoading: (loading: boolean) => void
  setDiscussionError: (error: string) => void
}) {
  const trimmedQuestion = question.trim()
  if (!trimmedQuestion) return

  setDiscussionLoading(true)
  setDiscussionError("")
  setDiscussionMessages((previous) => [
    ...previous,
    { role: "user", content: trimmedQuestion },
  ])
  setQuestion("")

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      throw new Error("Please log in before asking the agent.")
    }

    const res = await fetch(
      `/api/agents/${agentId}/initialization/${sessionId}/ask`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmedQuestion }),
      }
    )
    const data = await res.json()

    if (!data.success) {
      throw new Error(data.error || "Failed to ask AI.")
    }

    setDiscussionMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        content: String(data.assistant_message?.content || ""),
      },
    ])
  } catch (error) {
    setDiscussionError(
      error instanceof Error ? error.message : "Failed to ask AI."
    )
  } finally {
    setDiscussionLoading(false)
  }
}

async function requestInitializationChanges({
  agentId,
  sessionId,
  feedback,
  setQuestion,
  setDiscussionMessages,
  setDiscussionLoading,
  setDiscussionError,
  onProposalRevised,
}: {
  agentId: string
  sessionId: string
  feedback: string
  setQuestion: (question: string) => void
  setDiscussionMessages: React.Dispatch<
    React.SetStateAction<Array<{ role: "user" | "assistant"; content: string }>>
  >
  setDiscussionLoading: (loading: boolean) => void
  setDiscussionError: (error: string) => void
  onProposalRevised?: (payload: {
    run?: unknown
    trade_proposal?: unknown
    evaluation?: unknown
    initialization?: { session?: AgentInitializationSession }
  }) => void
}) {
  const trimmedFeedback = feedback.trim()
  if (!trimmedFeedback) return

  setDiscussionLoading(true)
  setDiscussionError("")
  setDiscussionMessages((previous) => [
    ...previous,
    { role: "user", content: `Change request: ${trimmedFeedback}` },
  ])
  setQuestion("")

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      throw new Error("Please log in before revising the proposal.")
    }

    const res = await fetch(
      `/api/agents/${agentId}/initialization/${sessionId}/revise`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ feedback: trimmedFeedback }),
      }
    )
    const data = await res.json()

    if (!data.success) {
      throw new Error(data.error || "Failed to revise proposal.")
    }

    setDiscussionMessages((previous) => [
      ...previous,
      {
        role: "assistant",
        content:
          "A revised proposal has been generated and added as the latest version above.",
      },
    ])
    onProposalRevised?.({
      run: data.run,
      trade_proposal: data.trade_proposal,
      evaluation: data.evaluation,
      initialization: data.initialization,
    })
  } catch (error) {
    setDiscussionError(
      error instanceof Error ? error.message : "Failed to revise proposal."
    )
  } finally {
    setDiscussionLoading(false)
  }
}

async function expandUniverseAndRevalidate({
  agentId,
  sessionId,
  proposalId,
  symbols,
  setLoading,
  setMessage,
  setError,
  onProposalUpdated,
}: {
  agentId: string
  sessionId: string
  proposalId: string
  symbols: string[]
  setLoading: (loading: boolean) => void
  setMessage: (message: string) => void
  setError: (error: string) => void
  onProposalUpdated?: (proposal: TradeProposalWithValidation) => void
}) {
  setLoading(true)
  setMessage("")
  setError("")

  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      throw new Error("Please log in before expanding the universe.")
    }

    const res = await fetch(
      `/api/agents/${agentId}/initialization/${sessionId}/expand-universe`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          proposal_id: proposalId,
          symbols,
        }),
      }
    )
    const data = await res.json()

    if (!data.success) {
      throw new Error(data.error || "Failed to expand investment universe.")
    }

    if (data.trade_proposal) {
      onProposalUpdated?.(data.trade_proposal as TradeProposalWithValidation)
    }

    setMessage(
      `${(data.added_symbols || symbols).join(", ")} added to the agent universe. The proposal has been revalidated.`
    )
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : "Failed to expand investment universe."
    )
  } finally {
    setLoading(false)
  }
}

function readOutOfUniverseSymbols(violations: string[]) {
  const prefix = "Symbols outside the configured target market were proposed:"
  const symbols = violations.flatMap((violation) => {
    if (!violation.startsWith(prefix)) return []
    const rawSymbols = violation
      .slice(prefix.length)
      .replace(/\.$/, "")
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
    return rawSymbols
  })
  return Array.from(new Set(symbols))
}

function estimateSellQuantity({
  holding,
  tradePct,
  tradeAmount,
}: {
  holding: UpdatedHolding
  tradePct: number
  tradeAmount: number
}) {
  const currentWeight = Number(holding.weight || 0)
  const quantity = Number(holding.quantity || 0)
  const priceBase = Number(
    holding.current_price_base ||
      Number(holding.current_price || 0) * Number(holding.fx_rate_to_base || 1)
  )

  if (currentWeight > 0 && quantity > 0) {
    return quantity * Math.min(1, tradePct / currentWeight)
  }

  return priceBase > 0 ? tradeAmount / priceBase : 0
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

function resolveTradePct({
  action,
  allocations,
  holdings,
}: {
  action: ProposalAction
  allocations: ReturnType<typeof readAllocations>
  holdings: UpdatedHolding[]
}) {
  const explicitTradePct = Math.abs(
    Number(action.estimated_portfolio_pct_change || 0)
  )

  if (explicitTradePct > 0) return explicitTradePct

  const symbol = action.symbol.toUpperCase()
  const allocationTarget = allocations.find(
    (allocation) => allocation.symbol.toUpperCase() === symbol
  )?.target_weight
  const currentHoldingWeight = holdings.find(
    (holding) => holding.symbol.toUpperCase() === symbol
  )?.weight
  const targetWeight = Number(
    action.target_weight ?? allocationTarget ?? currentHoldingWeight ?? 0
  )
  const currentWeight = Number(
    action.current_weight ?? currentHoldingWeight ?? 0
  )

  if (action.action === "sell") {
    return Math.max(0, currentWeight - targetWeight)
  }

  return Math.max(0, targetWeight - currentWeight)
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

function formatCurrency(value: number, currency?: string) {
  return formatCurrencyAmount(value, currency, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })
}

function formatSignedCurrency(value: number, currency?: string) {
  const absolute = formatCurrency(Math.abs(value), currency)

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
    const action = readString(item.action, "").toLowerCase()
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
        target_base_amount: readNumber(item.target_base_amount),
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

function readInvestmentThesis(value: unknown) {
  const record = isRecord(value) ? value : {}
  const buckets = readObjectList(record.portfolio_role_by_bucket).flatMap(
    (item) => {
      const bucket = readString(item.bucket, "")
      const role = readString(item.role, "")
      return bucket && role ? [{ bucket, role }] : []
    }
  )

  return {
    summary: readString(record.why_this_portfolio_exists, ""),
    coreThemes: readStringList(record.core_themes),
    buckets,
  }
}

function readSelfCritique(value: unknown) {
  const record = isRecord(value) ? value : {}
  const concerns = readObjectList(record.potential_concerns).flatMap((item) => {
    const concern = readString(item.concern, "")
    if (!concern) return []

    return [
      {
        concern,
        severity: readString(item.severity, ""),
        possible_adjustment: readString(item.possible_adjustment, ""),
      },
    ]
  })

  return {
    concerns,
    questions: readStringList(record.questions_for_user),
  }
}

function readSectorExposure(value: unknown) {
  return readObjectList(value).flatMap((item) => {
    const sector = readString(item.sector, "")
    const targetWeight = readNumber(item.target_weight)
    if (!sector || typeof targetWeight !== "number") return []

    return [
      {
        sector,
        target_weight: targetWeight,
        rationale: readString(item.rationale, ""),
      },
    ]
  })
}

function readHistoricalReference(value: unknown) {
  const record = isRecord(value) ? value : {}
  const status = readString(record.status, "")

  return {
    status,
    period: readString(record.period, ""),
    estimatedAnnualizedReturn: readNumber(record.estimated_annualized_return),
    estimatedMaxDrawdown: readNumber(record.estimated_max_drawdown),
    benchmark: readString(record.benchmark, ""),
    notes: readString(record.notes, ""),
  }
}

function readLatestPortfolioEvaluation(
  value: PortfolioEvaluation[] | undefined
) {
  if (!Array.isArray(value) || value.length === 0) return null
  return [...value].sort(
    (a, b) =>
      new Date(b.created_at || "").getTime() -
      new Date(a.created_at || "").getTime()
  )[0]
}

function isPortfolioEvaluation(value: unknown): value is PortfolioEvaluation {
  return (
    isRecord(value) &&
    typeof value.evaluation_scope === "string" &&
    isRecord(value.metrics)
  )
}

function readEvaluationWarnings(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    return [
      {
        type: readString(item.type, "warning"),
        severity: readString(item.severity, "medium"),
        message: readString(item.message, JSON.stringify(item)),
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

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function readCommitteeReview(value: unknown): CommitteeReview | null {
  if (!isRecord(value)) return null
  const summary = isRecord(value.committee_summary)
    ? value.committee_summary
    : {}
  const rebalanceRecommendation = isRecord(value.rebalance_recommendation)
    ? value.rebalance_recommendation
    : null

  return {
    overallVerdict: readString(value.overall_verdict, ""),
    mandateStatus: readString(value.mandate_status, ""),
    executiveSummary: readString(value.executive_summary, ""),
    rebalanceRecommendation: rebalanceRecommendation
      ? {
          needed: readBoolean(rebalanceRecommendation.needed, false),
          priority: readString(rebalanceRecommendation.priority, "monitor"),
          reason: readString(rebalanceRecommendation.reason, ""),
          suggestedBrief: readString(
            rebalanceRecommendation.suggested_rebalance_brief,
            ""
          ),
          managerApprovalRequired: readBoolean(
            rebalanceRecommendation.manager_approval_required,
            true
          ),
        }
      : null,
    phases: readObjectList(value.phases).map(readCommitteePhase),
    holdingActions: readObjectList(value.holding_actions).map(
      readCommitteeHoldingAction
    ),
    stressTests: readObjectList(value.stress_tests).map(readCommitteeStressTest),
    agreements: readStringList(summary.agreements),
    disagreements: readStringList(summary.disagreements),
    finalRecommendation: readString(summary.final_recommendation, ""),
    followUpQuestions: readStringList(summary.follow_up_questions),
  }
}

function readCommitteePhase(value: Record<string, unknown>): CommitteePhase {
  return {
    phase: readString(value.phase, "review_phase"),
    title: readString(value.title, "Committee Review Phase"),
    facts: readStringList(value.facts),
    judgment: readString(value.judgment, ""),
    confidence: readString(value.confidence, ""),
    risks: readStringList(value.risks),
    triggers: readStringList(value.triggers),
  }
}

function readCommitteeHoldingAction(
  value: Record<string, unknown>
): CommitteeHoldingAction {
  return {
    symbol: readString(value.symbol, "UNKNOWN"),
    action: readString(value.action, "watchlist").toLowerCase(),
    currentWeight: readNumber(value.current_weight),
    recommendedWeightChange: readString(value.recommended_weight_change, ""),
    factBasis: readStringList(value.fact_basis),
    judgment: readString(value.judgment, ""),
    keyRisks: readStringList(value.key_risks),
    triggerConditions: readStringList(value.trigger_conditions),
    reviewTiming: readString(value.review_timing, ""),
    confidence: readString(value.confidence, ""),
  }
}

function readCommitteeStressTest(
  value: Record<string, unknown>
): CommitteeStressTest {
  return {
    scenario: readString(value.scenario, "Stress scenario"),
    likelyImpact: readString(value.likely_impact, ""),
    vulnerableHoldings: readStringList(value.vulnerable_holdings),
    mitigation: readString(value.mitigation, ""),
  }
}

function getCommitteeActionTone(action: string) {
  const normalized = action.toLowerCase()
  if (normalized === "add") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700"
  }
  if (normalized === "trim") {
    return "border-amber-200 bg-amber-50 text-amber-700"
  }
  if (normalized === "exit") {
    return "border-red-200 bg-red-50 text-red-700"
  }
  if (normalized === "keep") {
    return "border-blue-200 bg-blue-50 text-blue-700"
  }
  return "border-slate-200 bg-slate-50 text-slate-600"
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

function isTradeRunType(runType: string | null) {
  return runType === "initial_build" || runType === "rebalance"
}

function getAgentRunType(run: AgentRun) {
  const recommendation = isRecord(run.recommendation) ? run.recommendation : {}
  return readString(recommendation.run_type, run.run_type || "daily")
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
