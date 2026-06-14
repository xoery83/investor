import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import {
  getAgentProfile,
  getInvestmentUniverse,
  getRiskPolicy,
} from "../../../../../../../src/lib/agents/read-agent-config"
import { validateTradeProposal } from "../../../../../../../src/lib/agents/validate-trade-proposal"
import { canEditAgent } from "../../../../../../../src/lib/auth/permissions"
import { getRequestUser } from "../../../../../../../src/lib/auth/server"
import { normalizeMarketSymbol } from "../../../../../../../src/lib/market/normalize-symbol"
import type {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  TradeProposalWithValidation,
} from "../../../../../../../src/lib/types/agent"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id, sessionId } = await context.params
  const requestUser = await getRequestUser(request)
  const body = await request.json().catch(() => ({}))
  const proposalId =
    typeof body.proposal_id === "string" ? body.proposal_id.trim() : ""
  const requestedSymbols = Array.isArray(body.symbols)
    ? body.symbols
        .map((symbol: unknown) =>
          typeof symbol === "string" ? normalizeMarketSymbol(symbol) : ""
        )
        .filter(Boolean)
    : []

  if (!requestUser) {
    return NextResponse.json(
      { success: false, error: "Login required." },
      { status: 401 }
    )
  }

  if (!proposalId) {
    return NextResponse.json(
      { success: false, error: "Proposal id is required." },
      { status: 400 }
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single()

  if (agentError || !agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found." },
      { status: 404 }
    )
  }

  const editPermission = canEditAgent(requestUser, agent as Agent)
  if (!editPermission.allowed) {
    return NextResponse.json(
      { success: false, error: editPermission.reason },
      { status: 403 }
    )
  }

  const { data: proposal, error: proposalError } = await supabase
    .from("trade_proposals")
    .select("*, validator_results(*)")
    .eq("id", proposalId)
    .eq("agent_id", id)
    .maybeSingle()

  if (proposalError || !proposal) {
    return NextResponse.json(
      { success: false, error: "Trade proposal not found." },
      { status: 404 }
    )
  }

  const { data: version, error: versionError } = await supabase
    .from("agent_initialization_versions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("agent_id", id)
    .eq("trade_proposal_id", proposalId)
    .maybeSingle()

  if (versionError || !version) {
    return NextResponse.json(
      {
        success: false,
        error:
          versionError?.message ||
          "Initialization version for this proposal was not found.",
      },
      { status: 404 }
    )
  }

  const [
    holdingsResult,
    profile,
    riskPolicy,
    currentUniverse,
  ] = await Promise.all([
    supabase.from("agent_holdings").select("*").eq("agent_id", id),
    getAgentProfile(supabase, id),
    getRiskPolicy(supabase, id),
    getInvestmentUniverse(supabase, id),
  ])

  if (holdingsResult.error) {
    return NextResponse.json(
      { success: false, error: holdingsResult.error.message },
      { status: 500 }
    )
  }

  const proposalBody = proposal.proposal
  const existingUniverseSymbols = new Set(getUniverseSymbolList(currentUniverse))
  const inferredSymbols = getProposedSymbols(proposalBody).filter(
    (symbol) => symbol !== "CASH" && !existingUniverseSymbols.has(symbol)
  )
  const symbolsToAdd = uniqueSymbols([
    ...requestedSymbols,
    ...inferredSymbols,
  ]).filter((symbol) => symbol !== "CASH")

  if (symbolsToAdd.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No new symbols were found to add to the investment universe.",
      },
      { status: 400 }
    )
  }

  const expandedUniverse = await createExpandedUniverse({
    agent: agent as Agent,
    currentUniverse,
    symbolsToAdd,
  })

  const validationMode = getProposalType(proposalBody)
  const validation = validateTradeProposal({
    agent: agent as Agent,
    proposal: proposalBody,
    holdings: (holdingsResult.data || []) as AgentHolding[],
    riskPolicy,
    profile,
    universe: expandedUniverse,
    validationMode,
  })

  const { data: validatorRecord, error: validatorError } = await supabase
    .from("validator_results")
    .insert({
      agent_id: id,
      run_id: proposal.source_run_id,
      trade_proposal_id: proposalId,
      validation_status: validation.validation_status,
      violations: validation.violations,
      final_action_allowed: validation.final_action_allowed,
      revision_attempt: Number(version.version_number || 1),
      result: {
        ...validation.result,
        run_type: validationMode,
        universe_expansion: {
          added_symbols: symbolsToAdd,
          universe_id: expandedUniverse.id || null,
          approved_by_user_id: requestUser.id,
        },
      },
    })
    .select()
    .single()

  if (validatorError) {
    return NextResponse.json(
      { success: false, error: validatorError.message },
      { status: 500 }
    )
  }

  const { data: updatedProposal, error: updateProposalError } = await supabase
    .from("trade_proposals")
    .update({
      validator_status: validation.validation_status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .eq("agent_id", id)
    .select("*, validator_results(*)")
    .single()

  if (updateProposalError) {
    return NextResponse.json(
      { success: false, error: updateProposalError.message },
      { status: 500 }
    )
  }

  await supabase
    .from("agent_initialization_versions")
    .update({
      risk_validation: validatorRecord,
      updated_at: new Date().toISOString(),
    })
    .eq("id", version.id)

  await supabase.from("agent_initialization_messages").insert({
    session_id: sessionId,
    version_id: version.id,
    agent_id: id,
    role: "user",
    message_type: "universe_expansion",
    content: `Approved adding ${symbolsToAdd.join(", ")} to the investment universe and revalidated the proposal.`,
  })

  return NextResponse.json({
    success: true,
    added_symbols: symbolsToAdd,
    universe: expandedUniverse,
    validation: validatorRecord,
    trade_proposal: normalizeProposalValidationOrder(updatedProposal),
  })
}

async function createExpandedUniverse({
  agent,
  currentUniverse,
  symbolsToAdd,
}: {
  agent: Agent
  currentUniverse: AgentInvestmentUniverse | null
  symbolsToAdd: string[]
}) {
  const now = new Date().toISOString()

  if (currentUniverse?.id) {
    await supabase
      .from("agent_investment_universes")
      .update({ status: "archived", updated_at: now })
      .eq("id", currentUniverse.id)
  }

  const nextUniverse: AgentInvestmentUniverse = {
    agent_id: agent.id,
    version: Number(currentUniverse?.version || 0) + 1,
    status: "active",
    universe_name:
      currentUniverse?.universe_name || `${agent.name} Investment Universe`,
    market_scope: currentUniverse?.market_scope || ["custom"],
    allowed_exchanges: currentUniverse?.allowed_exchanges || [],
    currency_scope: currentUniverse?.currency_scope || [
      String(agent.base_currency || "USD"),
    ],
    allowed_asset_types: currentUniverse?.allowed_asset_types || ["stock", "etf"],
    core_etfs: currentUniverse?.core_etfs || [],
    core_stocks: currentUniverse?.core_stocks || [],
    watchlist: uniqueSymbols([...(currentUniverse?.watchlist || []), ...symbolsToAdd]),
    excluded_assets: currentUniverse?.excluded_assets || [],
    generation_prompt: currentUniverse?.generation_prompt || null,
    generation_result: {
      ...(currentUniverse?.generation_result || {}),
      manual_expansions: [
        ...readManualExpansions(currentUniverse?.generation_result),
        {
          symbols: symbolsToAdd,
          reason: "User approved during initialization discussion.",
          created_at: now,
        },
      ],
    },
    confidence: currentUniverse?.confidence || "medium",
    source: "manual",
  }

  const { data, error } = await supabase
    .from("agent_investment_universes")
    .insert(nextUniverse)
    .select()
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as AgentInvestmentUniverse
}

function getUniverseSymbolList(universe: AgentInvestmentUniverse | null) {
  if (!universe) return []
  return uniqueSymbols([
    ...universe.core_etfs,
    ...universe.core_stocks,
    ...universe.watchlist,
  ])
}

function getProposedSymbols(proposal: unknown) {
  if (!isRecord(proposal)) return []
  const targetSymbols = Array.isArray(proposal.target_allocation)
    ? proposal.target_allocation.flatMap((item) =>
        isRecord(item) && typeof item.symbol === "string"
          ? [normalizeMarketSymbol(item.symbol)]
          : []
      )
    : []
  const actionSymbols = Array.isArray(proposal.suggested_actions)
    ? proposal.suggested_actions.flatMap((item) =>
        isRecord(item) && typeof item.symbol === "string"
          ? [normalizeMarketSymbol(item.symbol)]
          : []
      )
    : []
  return uniqueSymbols([...targetSymbols, ...actionSymbols])
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => normalizeMarketSymbol(symbol))
        .filter((symbol) => symbol.length > 0)
    )
  )
}

function readManualExpansions(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.manual_expansions)) return []
  return value.manual_expansions.filter(isRecord)
}

function normalizeProposalValidationOrder(value: unknown) {
  if (!isRecord(value)) return value
  const proposal = value as TradeProposalWithValidation
  return {
    ...proposal,
    validator_results: [...(proposal.validator_results || [])].sort(
      (a, b) =>
        new Date(b.created_at || "").getTime() -
        new Date(a.created_at || "").getTime()
    ),
  }
}

function getProposalType(value: unknown) {
  if (!isRecord(value)) return "initial_build"
  return value.proposal_type === "rebalance"
    ? "rebalance"
    : value.proposal_type === "capital_deployment"
      ? "capital_deployment"
      : "initial_build"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
