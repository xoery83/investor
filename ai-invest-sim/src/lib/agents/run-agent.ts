import OpenAI from "openai"

import { buildAgentPrompt } from "./build-agent-prompt"

import {
  Agent,
  AgentHolding,
  AgentInvestmentUniverse,
  AgentProfile,
  AgentRun,
  AgentValuation,
  RiskPolicy,
  WorkflowConfig,
  AgentRunType,
} from "../types/agent"
import type { PortfolioDiagnostic } from "./diagnose-portfolio"
import type { LocalValidationResult } from "./validate-trade-proposal"

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
}

type ResearchRunInput = RunAgentInput & {
  runType: Exclude<AgentRunType, "rebalance">
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
  })

  const response = await client.chat.completions.create({
    model: agent.model_name || "gpt-4.1-mini",

    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],

    temperature: 0.4,

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

export async function reviseAgentRecommendation({
  agent,
  recommendation,
  validation,
  riskPolicy,
  profile,
  universe,
  diagnostic,
}: {
  agent: Agent
  recommendation: unknown
  validation: LocalValidationResult
  riskPolicy: RiskPolicy
  profile?: AgentProfile
  universe?: AgentInvestmentUniverse | null
  diagnostic?: PortfolioDiagnostic
}) {
  const response = await client.chat.completions.create({
    model: agent.model_name || "gpt-4.1-mini",
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
- Any one trade must not exceed ${riskPolicy.max_one_trade_pct}% of portfolio value.
- Total turnover must not exceed ${riskPolicy.max_weekly_turnover_pct}%.
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
    temperature: 0.2,
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
    runType,
  })

  const response = await client.chat.completions.create({
    model: agent.model_name || "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: prompt,
      },
    ],
    temperature: runType === "weekly" ? 0.35 : 0.25,
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
  runType,
}: ResearchRunInput) {
  const holdingsText =
    holdings.length > 0
      ? holdings
          .map(
            (holding) =>
              `- ${holding.symbol}: ${holding.weight}% weight, quantity ${holding.quantity}, value ${holding.market_value}`
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
