import OpenAI from "openai"

import { buildAgentPrompt } from "./build-agent-prompt"
import { buildInitialPortfolioPrompt } from "./build-initial-portfolio-prompt"
import { formatMemoryCardsForPrompt } from "./memory-cards"
import { DEFAULT_AGENT_MODEL } from "./model-options"

import {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentMemoryCard,
  AgentProfile,
  AgentRun,
  AgentValuation,
  RiskPolicy,
  WorkflowConfig,
  AgentRunType,
} from "../types/agent"
import type { PortfolioDiagnostic } from "./diagnose-portfolio"
import type { LocalValidationResult } from "./validate-trade-proposal"
import { temperatureParam } from "../openai/model-params"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type RunAgentInput = {
  agent: Agent
  holdings: AgentHolding[]
  valuations: AgentValuation[]
  recentRuns: AgentRun[]
  profile?: AgentProfile
  riskPolicy?: RiskPolicy
  workflowConfig?: WorkflowConfig
  diagnostic?: PortfolioDiagnostic
  universe?: AgentInvestmentUniverse | null
  memoryCards?: AgentMemoryCard[]
}

type ResearchRunInput = RunAgentInput & {
  runType: Extract<AgentRunType, "daily" | "weekly" | "escalation">
}

export async function runAgent({
  agent,
  holdings,
  valuations,
  recentRuns,
  profile,
  riskPolicy,
  workflowConfig,
  diagnostic,
  universe,
  memoryCards,
}: RunAgentInput) {
  const prompt = buildAgentPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
    profile,
    riskPolicy,
    workflowConfig,
    diagnostic,
    universe,
    memoryCards,
  })
  const model = agent.model_name || DEFAULT_AGENT_MODEL

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    ...temperatureParam(model, 0.4),
    response_format: {
      type: "json_object",
    },
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error("No response from model")
  }

  return JSON.parse(content)
}

export async function runInitialBuildAgent({
  agent,
  holdings,
  valuations,
  recentRuns,
  profile,
  riskPolicy,
  workflowConfig,
  universe,
  memoryCards,
}: RunAgentInput) {
  const prompt = buildInitialPortfolioPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
    profile,
    riskPolicy,
    workflowConfig,
    universe,
    memoryCards,
  })
  const model = agent.model_name || DEFAULT_AGENT_MODEL

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    ...temperatureParam(model, 0.45),
    response_format: {
      type: "json_object",
    },
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error("No response from model")
  }

  return JSON.parse(content)
}

export async function discussInitializationProposal({
  agent,
  proposal,
  validation,
  userQuestion,
}: {
  agent: Agent
  proposal: unknown
  validation: unknown
  userQuestion: string
}) {
  const model = agent.model_name || DEFAULT_AGENT_MODEL
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are an AI portfolio manager discussing an initialization portfolio proposal with the user.
This is a simulation, not financial advice.
Answer clearly and specifically. Reference the proposal's allocation, investment thesis, self-critique, and risk validation.
If the user asks for a change, explain what would likely change, but do not claim the portfolio has been modified unless a revision endpoint is called later.
Keep the answer concise and practical.`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            agent: {
              name: agent.name,
              description: agent.description,
              philosophy: agent.philosophy,
              risk_level: agent.risk_level,
              base_currency: agent.base_currency || "USD",
            },
            proposal,
            validation,
            user_question: userQuestion,
          },
          null,
          2
        ),
      },
    ],
    ...temperatureParam(model, 0.35),
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error("No discussion response from model")
  return content
}

export async function reviseInitializationProposal({
  agent,
  currentProposal,
  validation,
  userFeedback,
  profile,
  riskPolicy,
  universe,
  memoryCards,
}: {
  agent: Agent
  currentProposal: unknown
  validation: unknown
  userFeedback: string
  profile?: AgentProfile
  riskPolicy?: RiskPolicy
  universe?: AgentInvestmentUniverse | null
  memoryCards?: AgentMemoryCard[]
}) {
  const memoryCardsText = formatMemoryCardsForPrompt(memoryCards || [])
  const model = agent.model_name || DEFAULT_AGENT_MODEL
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are revising an initialization portfolio proposal after an investment committee discussion.
This is a simulation, not financial advice.
Return ONLY valid JSON in the same structure as the current proposal.

User feedback is an instruction to modify the portfolio, not merely a question.
Preserve the agent's investment mandate, target markets, risk policy, active universe, and target allocation sum.

Hard rules:
- The revised target_allocation must sum to 100%.
- Include CASH in target_allocation.
- Do not include CASH in suggested_actions.
- Every non-cash target allocation should have a matching BUY/HOLD/SELL suggested action when relevant.
- Cash target must stay between ${riskPolicy?.min_cash_pct ?? "?"}% and ${riskPolicy?.max_cash_pct ?? "?"}% unless the user explicitly asks for a value and it is still risk-valid.
- Single stock target must not exceed ${riskPolicy?.max_single_stock_pct ?? "?"}%.
- ETF target must not exceed ${riskPolicy?.max_etf_pct ?? "?"}%.
- Target markets are hard constraints: ${profile?.target_markets?.join(", ") || "not configured"}.
- Allowed assets are hard constraints: ${profile?.allowed_assets?.join(", ") || "not configured"}.
- Active universe core ETFs: ${universe?.core_etfs?.join(", ") || "not configured"}.
- Active universe core stocks: ${universe?.core_stocks?.join(", ") || "not configured"}.
- Active universe watchlist: ${universe?.watchlist?.join(", ") || "not configured"}.
- Long-term memory cards:
${memoryCardsText}
- If a requested symbol is outside the active universe, include it only if it clearly matches the target market and explain the universe expansion need in self_critique.
- Respect active long-term memory cards unless they conflict with risk policy or target market constraints.
- Update investment_thesis, self_critique, sector_exposure, target_allocation, suggested_actions, risk_analysis, risks, key_assumptions, and allocation_comment to reflect the revision.
- Set proposal_type to the same proposal type unless the current proposal is missing it.
- Make the summary explicitly indicate this is a revised proposal.`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            user_feedback: userFeedback,
            current_proposal: currentProposal,
            current_validation: validation,
          },
          null,
          2
        ),
      },
    ],
    ...temperatureParam(model, 0.35),
    response_format: {
      type: "json_object",
    },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error("No revised initialization response from model")
  return JSON.parse(content)
}

export async function reviseAgentRecommendation({
  agent,
  recommendation,
  validation,
  riskPolicy,
  profile,
  universe,
  diagnostic,
  validationMode = "rebalance",
}: {
  agent: Agent
  recommendation: unknown
  validation: LocalValidationResult
  riskPolicy: RiskPolicy
  profile?: AgentProfile
  universe?: AgentInvestmentUniverse | null
  diagnostic?: PortfolioDiagnostic
  validationMode?: "rebalance" | "initial_build" | "capital_deployment"
}) {
  const turnoverRules =
    validationMode === "initial_build" || validationMode === "capital_deployment"
      ? "- This is portfolio construction from excess cash. Do not enforce max one-trade or weekly turnover limits; do enforce final allocation limits, target markets, and concentration rules.\n"
      : `- Any one trade must not exceed ${riskPolicy.max_one_trade_pct}% of portfolio value.
- Total turnover must not exceed ${riskPolicy.max_weekly_turnover_pct}%.
`

  const model = agent.model_name || DEFAULT_AGENT_MODEL
  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: `You are a portfolio-risk revision agent.
This is a simulation, not financial advice.
You must revise the recommendation so it satisfies every risk rule.
Return ONLY valid JSON in the same structure as the original recommendation.

Hard rules:
- Cash target must be between ${riskPolicy.min_cash_pct}% and ${riskPolicy.max_cash_pct}%.
- A single stock target must not exceed ${riskPolicy.max_single_stock_pct}%.
- ETF target must not exceed ${riskPolicy.max_etf_pct}%.
${turnoverRules.trimEnd()}
- Target allocation must include CASH and sum to 100%.
- Do not put CASH in suggested_actions. Cash is only a target allocation item.
- If the current portfolio cannot become fully compliant in one step, create a staged_remediation_plan and make this recommendation the next compliant step toward policy compliance.
- If cash is overweight, deploy excess cash into allowed stocks or ETFs while staying inside trade-size and turnover limits.
- Target markets are hard constraints: ${profile?.target_markets?.join(", ") || "not configured"}.
- Allowed assets are hard constraints: ${profile?.allowed_assets?.join(", ") || "not configured"}.
- Active investment universe core ETFs: ${universe?.core_etfs?.join(", ") || "not configured"}.
- Active investment universe core stocks: ${universe?.core_stocks?.join(", ") || "not configured"}.
- If an active investment universe is configured, proposed buy symbols must come from that universe.
- If the profile targets Australia or Australian equities, use ASX/Yahoo-compatible symbols ending in ".AX" and do not propose US ETFs such as VOO, QQQ, VTI, or SPY unless US assets are explicitly allowed.
- If the profile targets China technology listed in Hong Kong and the US, use China/Hong-Kong technology exposure only, such as ".HK" tickers or US-listed China technology ETFs/stocks. Do not propose broad US market or broad US technology ETFs such as VOO, QQQ, VTI, SPY, DIA, or IWM for that profile.
- Local diagnostic workflow: ${diagnostic?.workflow || "unknown"}.
- Local diagnostic instruction: ${diagnostic?.prompt_instruction || "None"}.
- If manual_required is true, keep the recommendation as a manual prerequisite instead of forcing automatic execution.
- Keep the investment thesis as close as possible to the original while resolving violations.`,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            original_recommendation: recommendation,
            validation_violations: validation.violations,
            validation_result: validation.result,
          },
          null,
          2
        ),
      },
    ],
    ...temperatureParam(model, 0.2),
    response_format: {
      type: "json_object",
    },
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error("No revised response from model")
  }

  return JSON.parse(content)
}

export async function runResearchAgent({
  agent,
  holdings,
  valuations,
  recentRuns,
  profile,
  riskPolicy,
  workflowConfig,
  universe,
  memoryCards,
  runType,
}: ResearchRunInput) {
  const prompt = buildResearchPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
    profile,
    riskPolicy,
    workflowConfig,
    universe,
    memoryCards,
    runType,
  })
  const model = agent.model_name || DEFAULT_AGENT_MODEL

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    ...temperatureParam(model, runType === "weekly" ? 0.35 : 0.25),
    response_format: {
      type: "json_object",
    },
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error("No response from model")
  }

  return JSON.parse(content)
}

function buildResearchPrompt({
  agent,
  holdings,
  valuations,
  recentRuns,
  profile,
  riskPolicy,
  workflowConfig,
  universe,
  memoryCards,
  runType,
}: ResearchRunInput) {
  const holdingsText =
    holdings.length > 0
      ? holdings
          .map(
            (holding) =>
              `- ${holding.symbol}: ${holding.weight}% weight, quantity ${holding.quantity}, local value ${holding.market_value_local || holding.market_value} ${holding.currency || "USD"}, base value ${holding.market_value_base || holding.market_value}`
          )
          .join("\n")
      : "No holdings. Portfolio is currently cash-heavy."
  const latestValuation = valuations[valuations.length - 1]
  const recentRunsText =
    recentRuns.length > 0
      ? recentRuns
          .map((run) => `- ${run.created_at}: ${run.summary || "No summary"}`)
          .join("\n")
      : "No previous runs."
  const memoryCardsText = formatMemoryCardsForPrompt(memoryCards || [])
  const universeText = universe
    ? `- Universe Name: ${universe.universe_name}
- Market Scope: ${universe.market_scope?.join(", ") || "Not configured"}
- Exchanges: ${universe.allowed_exchanges?.join(", ") || "Not configured"}
- Currency Scope: ${universe.currency_scope?.join(", ") || "Not configured"}
- Asset Types: ${universe.allowed_asset_types?.join(", ") || "Not configured"}
- Core ETFs: ${universe.core_etfs?.join(", ") || "Not configured"}
- Core Stocks: ${universe.core_stocks?.join(", ") || "Not configured"}
- Watchlist: ${universe.watchlist?.join(", ") || "Not configured"}`
    : "No active investment universe configured."

  if (runType === "escalation") {
    return buildEscalationResearchPrompt({
      agent,
      holdingsText,
      latestValuation,
      recentRunsText,
      profile,
      riskPolicy,
      workflowConfig,
      universeText,
      memoryCardsText,
    })
  }

  const runInstruction = {
    daily:
      "Produce a concise daily portfolio operating note. Focus on market context, portfolio drift, short-term watch items, and risks. Keep it compact. Do not generate trade proposals.",
    weekly:
      "Produce a deeper weekly research review. Include position-by-position observations, thesis updates, sector observations, portfolio risk, watchlist priorities, and questions for future research. You may say which holdings deserve closer research, but do not generate executable trade proposals.",
    escalation:
      "Produce a risk escalation memo. Focus on urgent risks, drawdown/concentration/cash concerns, possible manual interventions, severity, and monitoring triggers. Do not generate executable trade proposals.",
  }[runType]

  return `
You are running a ${runType} research workflow for an AI investment simulation agent.
This is simulation output, not financial advice.

Run instruction:
${runInstruction}

Agent:
- Name: ${agent.name}
- Philosophy: ${agent.philosophy || "No philosophy provided."}
- Risk Level: ${agent.risk_level}
- Profile Objective: ${profile?.objective || "No objective"}
- Target Markets: ${profile?.target_markets?.join(", ") || "Not configured"}
- Allowed Assets: ${profile?.allowed_assets?.join(", ") || "Not configured"}
- Risk Policy Cash Range: ${riskPolicy?.min_cash_pct ?? "?"}% - ${riskPolicy?.max_cash_pct ?? "?"}%
- Workflow Daily: ${workflowConfig?.daily_enabled ? "enabled" : "disabled"}
- Workflow Weekly: ${workflowConfig?.weekly_enabled ? "enabled" : "disabled"}
- Workflow Escalation: ${workflowConfig?.escalation_enabled ? "enabled" : "disabled"}

Portfolio:
- Cash Balance: ${agent.cash_balance}
- Current Value: ${agent.current_value}
- Latest Valuation: ${latestValuation?.total_value || "N/A"}

Holdings:
${holdingsText}

Recent Memory:
${recentRunsText}

Long-term Memory Cards:
${memoryCardsText}

Active Investment Universe:
${universeText}

Return ONLY valid JSON:
{
  "summary": "One clear sentence summary",
  "run_type": "${runType}",
  "market_view": "Market context relevant to this agent",
  "portfolio_diagnosis": "Portfolio state, drift, and notable exposures",
  "thesis_updates": ["thesis update 1", "thesis update 2"],
  "watchlist": [
    {
      "symbol": "Ticker or theme",
      "reason": "Why to monitor",
      "priority": "low | medium | high"
    }
  ],
  "position_reviews": [
    {
      "symbol": "Ticker",
      "assessment": "Current view on the position",
      "suggested_research": "What to research next",
      "priority": "low | medium | high"
    }
  ],
  "escalation": {
    "severity": "low | medium | high",
    "manual_intervention": "What a human should consider, or null",
    "time_sensitivity": "none | soon | urgent"
  },
  "risks": ["risk 1", "risk 2", "risk 3"],
  "monitoring_triggers": ["trigger 1", "trigger 2"],
  "next_steps": ["next step 1", "next step 2"],
  "confidence": "low | medium | high"
}
`
}

function buildEscalationResearchPrompt({
  agent,
  holdingsText,
  latestValuation,
  recentRunsText,
  profile,
  riskPolicy,
  workflowConfig,
  universeText,
  memoryCardsText,
}: {
  agent: Agent
  holdingsText: string
  latestValuation: AgentValuation | undefined
  recentRunsText: string
  profile?: AgentProfile
  riskPolicy?: RiskPolicy
  workflowConfig?: WorkflowConfig
  universeText: string
  memoryCardsText: string
}) {
  return `
You are running an Escalation investment committee review for an AI investment simulation agent.
This is simulation output, not financial advice.

Escalation is NOT a normal buy/sell recommendation. It is a staged investment committee review.
Separate objective facts from model judgment. If a fact is unavailable, say it is unavailable and do not invent it.
Do not generate executable trade proposals, target allocation changes, or order instructions.
If the committee conclusion implies portfolio changes, do not execute or return trades in this escalation run.
Instead set committee_review.rebalance_recommendation.needed=true and write a concise suggested_rebalance_brief for a later rebalance run.
If no allocation change is needed, set needed=false and explain the monitoring triggers.

Committee workflow:
1. Original mandate review: determine whether the portfolio still matches the agent's initial mission.
2. Current portfolio exposure analysis: summarize top holdings, sectors, geography, style, concentration, cash, and theme exposure.
3. Core holding fundamental review: deeply review major positions, briefly review medium positions, and classify small positions by necessity.
4. Historical return attribution: explain whether past returns likely came from earnings growth, valuation expansion, dividends, beta, FX, or one-time events.
5. Forward scenarios: provide base, bull, and bear case reasoning for the portfolio and core positions.
6. Macro sensitivity: map rates, inflation, USD, recession, AI capex, energy, China, regulation, and geopolitics to actual portfolio exposures.
7. Sector cycle positioning: assess whether the portfolio is early/mid/late/down-cycle by major sector.
8. Stress testing: test market -20%, rates +1%, USD strength, recession, tech multiple compression -30%, largest holding -40%, sector downturn, liquidity shock, and earnings misses.
9. Investment committee conclusion: classify actions as Keep, Add, Trim, Exit, or Watchlist with reasons, triggers, risks, and review timing.

Agent:
- Name: ${agent.name}
- Philosophy: ${agent.philosophy || "No philosophy provided."}
- Risk Level: ${agent.risk_level}
- Profile Objective: ${profile?.objective || "No objective"}
- Target Return: ${profile?.target_annual_return_min ?? "?"}% - ${profile?.target_annual_return_max ?? "?"}%
- Max Drawdown Objective: ${profile?.max_drawdown_pct ?? "?"}%
- Target Markets: ${profile?.target_markets?.join(", ") || "Not configured"}
- Allowed Assets: ${profile?.allowed_assets?.join(", ") || "Not configured"}
- Excluded Assets: ${profile?.excluded_assets?.join(", ") || "Not configured"}
- Manager Instructions: ${profile?.manager_instructions || "None"}
- Risk Policy Cash Range: ${riskPolicy?.min_cash_pct ?? "?"}% - ${riskPolicy?.max_cash_pct ?? "?"}%
- Max Single Stock: ${riskPolicy?.max_single_stock_pct ?? "?"}%
- Max ETF: ${riskPolicy?.max_etf_pct ?? "?"}%
- Max One Trade: ${riskPolicy?.max_one_trade_pct ?? "?"}%
- Workflow Daily: ${workflowConfig?.daily_enabled ? "enabled" : "disabled"}
- Workflow Weekly: ${workflowConfig?.weekly_enabled ? "enabled" : "disabled"}
- Workflow Escalation: ${workflowConfig?.escalation_enabled ? "enabled" : "disabled"}

Portfolio:
- Cash Balance: ${agent.cash_balance}
- Current Value: ${agent.current_value}
- Latest Valuation: ${latestValuation?.total_value || "N/A"}

Holdings:
${holdingsText}

Recent Runs:
${recentRunsText}

Long-term Memory Cards:
${memoryCardsText}

Active Investment Universe:
${universeText}

Return ONLY valid JSON:
{
  "summary": "One sentence committee conclusion",
  "run_type": "escalation",
  "market_view": "Market context mapped to this portfolio",
  "portfolio_diagnosis": "Current portfolio identity, drift, concentration, and exposures",
  "committee_review": {
    "overall_verdict": "aligned | watch | drifted | urgent_review",
    "mandate_status": "aligned | watch | drifted",
    "executive_summary": "Short investment committee summary",
    "phases": [
      {
        "phase": "mandate_check",
        "title": "Original Agent Mandate Review",
        "facts": ["objective fact 1", "objective fact 2"],
        "judgment": "Model judgment separated from facts",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      },
      {
        "phase": "portfolio_exposure",
        "title": "Current Portfolio Exposure Analysis",
        "facts": ["objective fact"],
        "judgment": "style/geography/sector/concentration judgment",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      },
      {
        "phase": "core_holding_review",
        "title": "Core Holding Review",
        "facts": ["objective fact"],
        "judgment": "A/B/C holding tier judgment",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      },
      {
        "phase": "return_attribution_and_forward_scenarios",
        "title": "Return Attribution and Forward Scenarios",
        "facts": ["objective fact"],
        "judgment": "Base/bull/bear forward judgment",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      },
      {
        "phase": "macro_sector_stress",
        "title": "Macro, Sector Cycle, and Stress Tests",
        "facts": ["objective fact"],
        "judgment": "macro sensitivity and stress-test judgment",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      },
      {
        "phase": "committee_conclusion",
        "title": "Investment Committee Conclusion",
        "facts": ["objective fact"],
        "judgment": "final committee judgment",
        "confidence": "low | medium | high",
        "risks": ["risk"],
        "triggers": ["trigger"]
      }
    ],
    "holding_actions": [
      {
        "symbol": "Ticker or CASH",
        "action": "keep | add | trim | exit | watchlist",
        "current_weight": 0,
        "recommended_weight_change": "e.g. trim 2-4% or keep unchanged",
        "fact_basis": ["objective fact"],
        "judgment": "why this action fits or does not fit the mandate",
        "key_risks": ["risk"],
        "trigger_conditions": ["trigger"],
        "review_timing": "e.g. next weekly review, after earnings, immediately",
        "confidence": "low | medium | high"
      }
    ],
    "stress_tests": [
      {
        "scenario": "Market down 20%",
        "likely_impact": "Expected portfolio impact",
        "vulnerable_holdings": ["symbol"],
        "mitigation": "Possible mitigation"
      }
    ],
    "rebalance_recommendation": {
      "needed": true,
      "priority": "none | monitor | soon | urgent",
      "reason": "Explain whether the committee conclusion should become a separate rebalance proposal.",
      "suggested_rebalance_brief": "If needed, describe what the next rebalance run should attempt. Do not execute trades here.",
      "manager_approval_required": true
    },
    "committee_summary": {
      "agreements": ["agreement"],
      "disagreements": ["disagreement or uncertainty"],
      "final_recommendation": "Keep observing, escalate to manual review, or prepare a separate rebalance run",
      "follow_up_questions": ["question"]
    }
  },
  "escalation": {
    "severity": "low | medium | high",
    "manual_intervention": "What a human should consider, or null",
    "time_sensitivity": "none | soon | urgent"
  },
  "risks": ["risk 1", "risk 2", "risk 3"],
  "monitoring_triggers": ["trigger 1", "trigger 2"],
  "next_steps": ["next step 1", "next step 2"],
  "confidence": "low | medium | high"
}
`
}
