import type { SupabaseClient } from "@supabase/supabase-js"

import type { AgentMemoryCard } from "../types/agent"

export type MemoryCardInput = {
  agentId: string
  memoryType: AgentMemoryCard["memory_type"]
  title: string
  content: string
  symbols?: string[]
  importance?: number
  confidence?: number
  sourceRunId?: string | null
  sourceTradeProposalId?: string | null
  sourceInitializationVersionId?: string | null
  metadata?: Record<string, unknown>
}

export async function getActiveMemoryCards(
  supabase: SupabaseClient,
  agentId: string,
  limit = 12
) {
  try {
    const { data, error } = await supabase
      .from("agent_memory_cards")
      .select("*")
      .eq("agent_id", agentId)
      .eq("status", "active")
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) {
      if (isMissingMemoryTableError(error.message)) return []
      throw new Error(error.message)
    }

    return (data || []) as AgentMemoryCard[]
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingMemoryTableError(error.message)
    ) {
      return []
    }
    throw error
  }
}

export async function addMemoryCard(
  supabase: SupabaseClient,
  input: MemoryCardInput
) {
  const content = input.content.trim()
  if (!content) return null

  try {
    const { data, error } = await supabase
      .from("agent_memory_cards")
      .insert({
        agent_id: input.agentId,
        memory_type: input.memoryType,
        title: input.title.trim() || "Agent memory",
        content,
        symbols: normalizeSymbols(input.symbols || []),
        importance: clampNumber(input.importance ?? 3, 1, 5),
        confidence: clampNumber(input.confidence ?? 0.8, 0, 1),
        status: "active",
        source_run_id: input.sourceRunId || null,
        source_trade_proposal_id: input.sourceTradeProposalId || null,
        source_initialization_version_id:
          input.sourceInitializationVersionId || null,
        metadata: input.metadata || {},
      })
      .select()
      .single()

    if (error) {
      if (isMissingMemoryTableError(error.message)) return null
      throw new Error(error.message)
    }

    return data as AgentMemoryCard
  } catch (error) {
    if (
      error instanceof Error &&
      isMissingMemoryTableError(error.message)
    ) {
      return null
    }
    throw error
  }
}

export async function addMemoryCards(
  supabase: SupabaseClient,
  inputs: MemoryCardInput[]
) {
  const cards = []
  for (const input of inputs) {
    const card = await addMemoryCard(supabase, input)
    if (card) cards.push(card)
  }
  return cards
}

export function formatMemoryCardsForPrompt(cards: AgentMemoryCard[]) {
  if (cards.length === 0) return "No active long-term memory cards."

  return cards
    .map((card) => {
      const symbols =
        card.symbols && card.symbols.length > 0
          ? ` Symbols: ${card.symbols.join(", ")}.`
          : ""
      return `- [${card.memory_type}, importance ${card.importance}] ${card.title}: ${card.content}${symbols}`
    })
    .join("\n")
}

export function extractPreferenceMemoryFromText({
  agentId,
  text,
  sourceInitializationVersionId,
}: {
  agentId: string
  text: string
  sourceInitializationVersionId?: string | null
}): MemoryCardInput | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  const looksLikePreference =
    /希望|确认|不要|避免|增加|减少|保留|加入|剔除|prefer|avoid|include|exclude|increase|reduce|keep/.test(
      lower
    )

  if (!looksLikePreference) return null

  return {
    agentId,
    memoryType: "user_preference",
    title: "User portfolio preference",
    content: trimmed,
    symbols: extractSymbols(trimmed),
    importance: 4,
    confidence: 0.75,
    sourceInitializationVersionId,
    metadata: {
      source: "initialization_feedback",
    },
  }
}

export function buildProposalMemoryCards({
  agentId,
  proposal,
  validation,
  sourceRunId,
  sourceTradeProposalId,
  sourceInitializationVersionId,
}: {
  agentId: string
  proposal: unknown
  validation?: unknown
  sourceRunId?: string | null
  sourceTradeProposalId?: string | null
  sourceInitializationVersionId?: string | null
}) {
  const proposalRecord = isRecord(proposal) ? proposal : {}
  const summary = readString(proposalRecord.summary)
  const cards: MemoryCardInput[] = []

  if (summary) {
    cards.push({
      agentId,
      memoryType: "approved_change",
      title: "Latest portfolio proposal",
      content: summary,
      symbols: getProposalSymbols(proposalRecord),
      importance: 3,
      confidence: 0.85,
      sourceRunId,
      sourceTradeProposalId,
      sourceInitializationVersionId,
      metadata: {
        proposal_type: readString(proposalRecord.proposal_type),
        workflow: readString(proposalRecord.workflow),
      },
    })
  }

  const thesis = readNestedString(
    proposalRecord.investment_thesis,
    "why_this_portfolio_exists"
  )
  if (thesis) {
    cards.push({
      agentId,
      memoryType: "thesis",
      title: "Current investment thesis",
      content: thesis,
      symbols: getProposalSymbols(proposalRecord),
      importance: 4,
      confidence: 0.8,
      sourceRunId,
      sourceTradeProposalId,
      sourceInitializationVersionId,
      metadata: {
        proposal_type: readString(proposalRecord.proposal_type),
      },
    })
  }

  const violationSummary = summarizeViolations(validation)
  if (violationSummary) {
    cards.push({
      agentId,
      memoryType: "risk_event",
      title: "Recent risk validation result",
      content: violationSummary,
      symbols: getProposalSymbols(proposalRecord),
      importance: 5,
      confidence: 0.9,
      sourceRunId,
      sourceTradeProposalId,
      sourceInitializationVersionId,
      metadata: {
        source: "validator",
      },
    })
  }

  return cards
}

function summarizeViolations(validation: unknown) {
  if (!isRecord(validation)) return ""
  const violations = validation.violations
  if (!Array.isArray(violations) || violations.length === 0) {
    return "Latest proposal passed local risk validation."
  }

  return violations
    .map((violation) => {
      if (typeof violation === "string") return violation
      if (!isRecord(violation)) return ""
      return (
        readString(violation.message) ||
        readString(violation.reason) ||
        JSON.stringify(violation)
      )
    })
    .filter(Boolean)
    .join(" | ")
}

function getProposalSymbols(proposal: Record<string, unknown>) {
  const symbols = new Set<string>()
  for (const key of ["target_allocation", "suggested_actions"]) {
    const items = proposal[key]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!isRecord(item)) continue
      const symbol = readString(item.symbol)
      if (symbol && symbol.toUpperCase() !== "CASH") {
        symbols.add(symbol.toUpperCase())
      }
    }
  }
  return Array.from(symbols)
}

function extractSymbols(text: string) {
  const matches = text.match(/\b[A-Z0-9]{1,6}(?:\.[A-Z]{1,3})?\b/g) || []
  return normalizeSymbols(matches.filter((symbol) => symbol !== "CASH"))
}

function normalizeSymbols(symbols: string[]) {
  return Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  )
}

function readNestedString(value: unknown, key: string) {
  if (!isRecord(value)) return ""
  return readString(value[key])
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isMissingMemoryTableError(message: string) {
  return (
    message.includes("agent_memory_cards") &&
    (message.includes("schema cache") || message.includes("does not exist"))
  )
}
