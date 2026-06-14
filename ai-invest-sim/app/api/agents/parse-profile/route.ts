import { NextResponse } from "next/server"
import OpenAI from "openai"

import {
  defaultAgentProfile,
  defaultRiskPolicy,
  defaultWorkflowConfig,
} from "../../../../src/lib/agents/default-config"
import { DEFAULT_AGENT_MODEL } from "../../../../src/lib/agents/model-options"
import { temperatureParam } from "../../../../src/lib/openai/model-params"
import type {
  AgentProfile,
  RiskLevel,
  RiskPolicy,
  WorkflowConfig,
} from "../../../../src/lib/types/agent"

type ParseRequest = {
  description?: string
  name?: string
  initialCapital?: number
  currentDraft?: Partial<AgentConfigDraft>
  mode?: "create" | "update"
}

export type AgentConfigDraft = {
  name: string
  description: string
  philosophy: string
  risk_level: RiskLevel
  rebalance_frequency: "daily" | "weekly" | "monthly"
  profile: Omit<AgentProfile, "agent_id" | "id" | "created_at" | "updated_at">
  risk_policy: Omit<RiskPolicy, "agent_id" | "id" | "created_at" | "updated_at">
  workflow_config: Omit<WorkflowConfig, "agent_id" | "id" | "created_at" | "updated_at">
}

export async function POST(request: Request) {
  const body = (await request.json()) as ParseRequest
  const description = body.description?.trim()

  if (!description) {
    return NextResponse.json(
      { success: false, error: "Description is required." },
      { status: 400 }
    )
  }

  const fallbackDraft = buildFallbackDraft(
    description,
    body.name,
    body.currentDraft
  )

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      success: true,
      draft: fallbackDraft,
      source: "fallback",
      warning: "OPENAI_API_KEY is not configured in this runtime.",
    })
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const model = DEFAULT_AGENT_MODEL
    const completion = await openai.chat.completions.create({
      model,
      ...temperatureParam(model, 0.2),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You convert a non-professional investor's natural language agent request into a conservative, structured investment-agent configuration.
Return strict JSON only. Respect ambiguity by choosing safe defaults and preserving nuance in manager instructions.
If current configuration is provided, treat the request as a modification and preserve existing fields unless the user clearly asks to change them.
Do not recommend financial advice. This is simulation configuration only.`,
        },
        {
          role: "user",
          content: `${body.currentDraft ? `Current configuration:\n${JSON.stringify(body.currentDraft, null, 2)}\n\n` : ""}Investor request:
${description}

Return this JSON shape exactly:
{
  "name": "short agent name",
  "description": "one sentence description",
  "philosophy": "investment philosophy paragraph",
  "risk_level": "low | medium | high",
  "rebalance_frequency": "daily | weekly | monthly",
  "profile": {
    "strategy_type": "snake_case_strategy_type",
    "objective": "clear objective",
    "target_annual_return_min": 8,
    "target_annual_return_max": 15,
    "max_drawdown_pct": 20,
    "target_markets": ["..."],
    "allowed_assets": ["..."],
    "excluded_assets": ["..."],
    "manager_instructions": "free-form instructions preserving the user's intent",
    "config": {}
  },
  "risk_policy": {
    "min_cash_pct": 5,
    "max_cash_pct": 25,
    "max_single_stock_pct": 20,
    "max_etf_pct": 40,
    "max_one_trade_pct": 10,
    "max_weekly_turnover_pct": 15,
    "max_drawdown_pct": 20,
    "prohibited_assets": ["options", "leverage", "crypto", "penny stocks"],
    "policy": {}
  },
  "workflow_config": {
    "daily_enabled": true,
    "daily_prompt_template_key": "conservative_daily_v1",
    "weekly_enabled": true,
    "weekly_prompt_template_key": "conservative_weekly_v1",
    "escalation_enabled": true,
    "escalation_prompt_template_key": "conservative_escalation_v1",
    "validator_enabled": true,
    "validator_prompt_template_key": "conservative_validator_v1",
    "max_revision_attempts": 2,
    "config": {}
  }
}

Conservative default rule: if the request is vague, use target annual return 8-15%, max drawdown 20%, avoid options/leverage/crypto/penny stocks.

Special parsing rules:
- Do not broaden a niche target into generic "US large cap equities" or "broad market ETFs" unless the user explicitly asks for broad market exposure.
- If the user says Chinese concept stocks, China tech, China healthcare, 中国概念股, 中概股, 中国科技, 中国医药, or similar, keep target_markets specific, for example ["US-listed Chinese ADRs", "Hong Kong-listed Chinese equities", "China technology sector", "China healthcare sector"] as appropriate.
- For that China profile, allowed_assets should mention specific allowed wrappers such as "US-listed Chinese ADRs", "Hong Kong-listed China stocks", "China sector ETFs", "China internet/technology ETFs", and "China healthcare ETFs"; avoid broad US index ETFs unless explicitly requested.
- Preserve geographic listing venue separately from economic exposure. "listed in the US" can still mean China economic exposure, not generic US equities.
- If the user mentions Hong Kong and US listings together, include both listing venues in target_markets and manager_instructions.`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      throw new Error("Model returned an empty draft.")
    }

    return NextResponse.json({
      success: true,
      draft: normalizeDraft(JSON.parse(raw), fallbackDraft),
      source: "openai",
    })
  } catch (error) {
    return NextResponse.json({
      success: true,
      draft: fallbackDraft,
      source: "fallback",
      warning:
        error instanceof Error
          ? error.message
          : "Fell back to default conservative configuration.",
    })
  }
}

function buildFallbackDraft(
  description: string,
  name?: string,
  currentDraft?: Partial<AgentConfigDraft>
): AgentConfigDraft {
  const profile = defaultAgentProfile("draft")
  const riskPolicy = defaultRiskPolicy("draft")
  const workflowConfig = defaultWorkflowConfig("draft")
  const trimmedDescription = description.trim()
  const baseDraft: AgentConfigDraft = {
    name: name?.trim() || "Conservative Growth Agent",
    description: `A conservative growth agent configured from the manager's stated intent: ${shorten(trimmedDescription, 140)}`,
    philosophy: trimmedDescription,
    risk_level: "medium",
    rebalance_frequency: "daily",
    profile: {
      ...stripAgentId(profile),
      objective: trimmedDescription,
      manager_instructions: trimmedDescription,
      config: {
        ...(isRecord(profile.config) ? profile.config : {}),
        source: "fallback",
        original_manager_intent: trimmedDescription,
      },
    },
    risk_policy: stripAgentId(riskPolicy),
    workflow_config: stripAgentId(workflowConfig),
  }

  if (currentDraft) {
    return normalizeDraft(
      {
        ...currentDraft,
        philosophy: currentDraft.philosophy || trimmedDescription,
        profile: {
          ...(isRecord(currentDraft.profile) ? currentDraft.profile : {}),
          manager_instructions: [
            isRecord(currentDraft.profile)
              ? currentDraft.profile.manager_instructions
              : "",
            trimmedDescription,
          ]
            .filter((item) => typeof item === "string" && item.trim())
            .join("\n"),
        },
      },
      baseDraft
    )
  }

  return baseDraft
}

function normalizeDraft(
  input: unknown,
  fallback: AgentConfigDraft
): AgentConfigDraft {
  const record = isRecord(input) ? input : {}

  return {
    name: readString(record.name, fallback.name),
    description: readString(record.description, fallback.description),
    philosophy: readString(record.philosophy, fallback.philosophy),
    risk_level: readRiskLevel(record.risk_level, fallback.risk_level),
    rebalance_frequency: readFrequency(
      record.rebalance_frequency,
      fallback.rebalance_frequency
    ),
    profile: {
      ...fallback.profile,
      ...(isRecord(record.profile) ? record.profile : {}),
    },
    risk_policy: {
      ...fallback.risk_policy,
      ...(isRecord(record.risk_policy) ? record.risk_policy : {}),
    },
    workflow_config: {
      ...fallback.workflow_config,
      ...(isRecord(record.workflow_config) ? record.workflow_config : {}),
    },
  }
}

function stripAgentId<T extends { agent_id: string }>(
  value: T
): Omit<T, "agent_id"> {
  const { agent_id, ...rest } = value
  void agent_id
  return rest
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}

function readRiskLevel(value: unknown, fallback: RiskLevel): RiskLevel {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : fallback
}

function readFrequency(
  value: unknown,
  fallback: "daily" | "weekly" | "monthly"
) {
  return value === "daily" || value === "weekly" || value === "monthly"
    ? value
    : fallback
}

function shorten(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3).trimEnd()}...`
}
