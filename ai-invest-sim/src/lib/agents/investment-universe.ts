import OpenAI from "openai"

import type {
  Agent,
  AgentInvestmentUniverse,
  AgentProfile,
  RiskPolicy,
} from "../types/agent"
import { normalizeMarketSymbol } from "../market/normalize-symbol"
import { temperatureParam } from "../openai/model-params"
import { DEFAULT_AGENT_MODEL } from "./model-options"

type UniverseGenerationInput = {
  agent: Agent
  profile: AgentProfile
  riskPolicy: RiskPolicy
}

type UniverseGenerationResult = {
  universe: Omit<
    AgentInvestmentUniverse,
    "id" | "agent_id" | "version" | "status" | "created_at" | "updated_at"
  >
  prompt: string
}

export async function generateInvestmentUniverse({
  agent,
  profile,
  riskPolicy,
}: UniverseGenerationInput): Promise<UniverseGenerationResult> {
  const fallback = buildFallbackUniverse({ agent, profile, riskPolicy })
  const prompt = buildUniversePrompt({ agent, profile, riskPolicy })

  if (!process.env.OPENAI_API_KEY) {
    return {
      universe: {
        ...fallback,
        generation_prompt: prompt,
        generation_result: {
          warning: "OPENAI_API_KEY is not configured.",
          fallback,
        },
        source: "fallback",
      },
      prompt,
    }
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = agent.model_name || DEFAULT_AGENT_MODEL
    const completion = await openai.chat.completions.create({
      model,
      ...temperatureParam(model, 0.15),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate a conservative, structured investment universe for an AI investment simulation agent. Return strict JSON only. This is simulation configuration, not financial advice.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error("Model returned an empty universe.")

    const parsed = JSON.parse(content)
    return {
      universe: {
        ...normalizeUniverse(parsed, fallback),
        generation_prompt: prompt,
        generation_result: parsed,
        source: "openai",
      },
      prompt,
    }
  } catch (error) {
    return {
      universe: {
        ...fallback,
        generation_prompt: prompt,
        generation_result: {
          warning:
            error instanceof Error
              ? error.message
              : "Fell back to deterministic universe.",
          fallback,
        },
        source: "fallback",
      },
      prompt,
    }
  }
}

export function getUniverseSymbols(universe?: AgentInvestmentUniverse | null) {
  if (!universe) return []
  return uniqueSymbols([
    ...universe.core_etfs,
    ...universe.core_stocks,
    ...universe.watchlist,
  ])
}

export function getUniverseBuyCandidates(
  universe?: AgentInvestmentUniverse | null
) {
  if (!universe) return []
  const etfs = uniqueSymbols(universe.core_etfs)
  if (etfs.length > 0) return etfs
  return uniqueSymbols([...universe.core_stocks, ...universe.watchlist])
}

function buildUniversePrompt({
  agent,
  profile,
  riskPolicy,
}: UniverseGenerationInput) {
  return `Generate an investment universe for this agent.

Agent:
- Name: ${agent.name}
- Description: ${agent.description || "None"}
- Philosophy: ${agent.philosophy || "None"}
- Risk level: ${agent.risk_level}

Structured profile:
- Strategy type: ${profile.strategy_type}
- Objective: ${profile.objective}
- Target markets: ${profile.target_markets.join(", ")}
- Allowed assets: ${profile.allowed_assets.join(", ")}
- Excluded assets: ${profile.excluded_assets.join(", ")}
- Manager instructions: ${profile.manager_instructions || "None"}

Risk policy:
- Cash range: ${riskPolicy.min_cash_pct}% - ${riskPolicy.max_cash_pct}%
- Max single stock: ${riskPolicy.max_single_stock_pct}%
- Max ETF: ${riskPolicy.max_etf_pct}%
- Prohibited assets: ${riskPolicy.prohibited_assets.join(", ")}

Rules:
- Use symbols compatible with Yahoo Finance where possible.
- The universe must stay inside target markets and allowed assets.
- Prefer diversified ETFs first when the strategy allows ETFs.
- Include representative stocks only when they match the target market and style.
- Exclude broad-market instruments that do not match the user's target market.
- Do not include options, leveraged ETFs, crypto, or penny stocks.
- Keep the universe compact enough for a simulation agent to use reliably.

Return ONLY valid JSON in this shape:
{
  "universe_name": "Short descriptive name",
  "market_scope": ["market or theme"],
  "allowed_exchanges": ["exchange"],
  "currency_scope": ["currency"],
  "allowed_asset_types": ["etf", "stock"],
  "core_etfs": ["symbol"],
  "core_stocks": ["symbol"],
  "watchlist": ["symbol"],
  "excluded_assets": ["asset or symbol"],
  "confidence": "low | medium | high"
}`
}

function buildFallbackUniverse({
  agent,
  profile,
  riskPolicy,
}: UniverseGenerationInput): UniverseGenerationResult["universe"] {
  const text = [
    agent.name,
    agent.description || "",
    agent.philosophy || "",
    profile.strategy_type,
    profile.objective,
    ...profile.target_markets,
    ...profile.allowed_assets,
    ...profile.excluded_assets,
    profile.manager_instructions || "",
  ]
    .join(" ")
    .toLowerCase()

  if (isAustraliaProfile(text)) {
    return baseUniverse({
      universe_name: "Australia Core Equity and Income",
      market_scope: ["Australia", "ASX"],
      allowed_exchanges: ["ASX"],
      currency_scope: ["AUD"],
      core_etfs: ["VAS.AX", "A200.AX", "IOZ.AX", "VHY.AX", "GOLD.AX"],
      core_stocks: ["BHP.AX", "CBA.AX", "CSL.AX", "WES.AX", "WOW.AX"],
      watchlist: ["NAB.AX", "WBC.AX", "MQG.AX"],
      excluded_assets: [...riskPolicy.prohibited_assets, "US broad market ETFs"],
      confidence: "medium",
    })
  }

  if (isChinaTechProfile(text)) {
    return baseUniverse({
      universe_name: "China Technology HK and US Listed",
      market_scope: ["China technology", "Hong Kong", "US ADRs"],
      allowed_exchanges: ["HKEX", "NASDAQ", "NYSE"],
      currency_scope: ["HKD", "USD"],
      core_etfs: ["KWEB", "CQQQ", "3067.HK", "3033.HK"],
      core_stocks: [
        "9988.HK",
        "0700.HK",
        "3690.HK",
        "9618.HK",
        "BABA",
        "JD",
        "BIDU",
      ],
      watchlist: ["9999.HK", "1024.HK", "PDD", "NTES"],
      excluded_assets: [...riskPolicy.prohibited_assets, "broad US ETFs"],
      confidence: "medium",
    })
  }

  return baseUniverse({
    universe_name: "US Core Equity",
    market_scope: ["United States", "large cap equities"],
    allowed_exchanges: ["NYSE", "NASDAQ"],
    currency_scope: ["USD"],
    core_etfs: ["VOO", "VTI", "SPY", "QQQ"],
    core_stocks: ["MSFT", "AAPL", "NVDA", "GOOGL", "AMZN"],
    watchlist: ["META", "BRK-B", "JPM"],
    excluded_assets: riskPolicy.prohibited_assets,
    confidence: "low",
  })
}

function baseUniverse(
  values: Pick<
    UniverseGenerationResult["universe"],
    | "universe_name"
    | "market_scope"
    | "allowed_exchanges"
    | "currency_scope"
    | "core_etfs"
    | "core_stocks"
    | "watchlist"
    | "excluded_assets"
    | "confidence"
  >
): UniverseGenerationResult["universe"] {
  return {
    ...values,
    allowed_asset_types: ["etf", "stock"],
    generation_prompt: null,
    generation_result: {},
    source: "fallback",
  }
}

function normalizeUniverse(
  input: unknown,
  fallback: UniverseGenerationResult["universe"]
): UniverseGenerationResult["universe"] {
  const record = isRecord(input) ? input : {}
  return {
    universe_name: readString(record.universe_name, fallback.universe_name),
    market_scope: readStringList(record.market_scope, fallback.market_scope),
    allowed_exchanges: readStringList(
      record.allowed_exchanges,
      fallback.allowed_exchanges
    ),
    currency_scope: readStringList(
      record.currency_scope,
      fallback.currency_scope
    ),
    allowed_asset_types: readStringList(
      record.allowed_asset_types,
      fallback.allowed_asset_types
    ),
    core_etfs: uniqueSymbols(readStringList(record.core_etfs, fallback.core_etfs)),
    core_stocks: uniqueSymbols(
      readStringList(record.core_stocks, fallback.core_stocks)
    ),
    watchlist: uniqueSymbols(readStringList(record.watchlist, fallback.watchlist)),
    excluded_assets: readStringList(
      record.excluded_assets,
      fallback.excluded_assets
    ),
    generation_prompt: null,
    generation_result: {},
    confidence: readConfidence(record.confidence, fallback.confidence),
    source: "openai",
  }
}

function isAustraliaProfile(text: string) {
  return text.includes("australia") || text.includes("australian")
}

function isChinaTechProfile(text: string) {
  const hasChinaScope =
    text.includes("china") ||
    text.includes("chinese") ||
    text.includes("hong kong") ||
    text.includes("hk") ||
    text.includes("中国") ||
    text.includes("香港")
  const hasTechScope =
    text.includes("tech") ||
    text.includes("internet") ||
    text.includes("科技") ||
    text.includes("互联网")
  return hasChinaScope && hasTechScope
}

function uniqueSymbols(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeMarketSymbol(value)).filter(Boolean))
  )
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function readStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const parsed = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

function readConfidence(
  value: unknown,
  fallback: "low" | "medium" | "high"
) {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
