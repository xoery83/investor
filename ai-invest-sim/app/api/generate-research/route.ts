import { NextResponse } from "next/server"
import OpenAI from "openai"

type ResearchPayload = {
  title: string
  summary: string
  portfolioImpact: string
  riskWatch: string
  suggestedAction: string
  disclaimer: string
}

const MODEL = "gpt-4.1-mini"
const HOLDINGS = ["NVDA", "MSFT", "COST", "VGT", "GLD"] as const
const DEFAULT_DISCLAIMER =
  "Simulated educational output only. Not financial advice."

function validatePayload(data: unknown): data is ResearchPayload {
  if (!data || typeof data !== "object") return false
  const record = data as Record<string, unknown>
  return (
    typeof record.title === "string" &&
    typeof record.summary === "string" &&
    typeof record.portfolioImpact === "string" &&
    typeof record.riskWatch === "string" &&
    typeof record.suggestedAction === "string" &&
    typeof record.disclaimer === "string"
  )
}

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is missing on server." },
      { status: 500 }
    )
  }

  const openai = new OpenAI({ apiKey })

  const systemPrompt = `You are an institutional market research engine inside a hedge-fund style simulation terminal.
  Write in a calm, risk-aware, professional tone. No hype.
  All content is simulated educational analysis only; NOT financial advice.
  Avoid promotional language, guarantees, and certainty claims.
  Do not mention being an AI model.
  Return strict JSON only (no markdown, no extra keys, no prose).`

  const asOf = new Date().toISOString().slice(0, 10)

  const userPrompt = `Generate a concise market research brief for this simulated portfolio: ${HOLDINGS.join(", ")}.
As of date: ${asOf}.

Return a strict JSON object with exactly these keys:
- title
- summary
- portfolioImpact
- riskWatch
- suggestedAction
- disclaimer

Hard constraints:
- Do NOT reference 2024 Q2 or any market developments earlier than 2025-01-01.
- Prefer this year's themes: "this quarter", "year-to-date", "recent months", "current macro regime".
- Include at least one point that clearly reflects the current year timeframe (2025 or 2026 YTD / current quarter).
- Keep all fields concise and actionable, and acknowledge uncertainty where appropriate.
- No hype, no aggressive return-seeking language.
- Do not provide financial advice; simulation-only educational analysis.

disclaimer must be: "${DEFAULT_DISCLAIMER}"`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    })

    const raw = completion.choices[0]?.message?.content

    if (!raw) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 502 }
      )
    }

    const parsed: unknown = JSON.parse(raw)

    if (!validatePayload(parsed)) {
      return NextResponse.json(
        { error: "Model returned an invalid research payload." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ...parsed,
      disclaimer:
        parsed.disclaimer?.trim() || DEFAULT_DISCLAIMER,
      generatedAt: Date.now(),
    })
  } catch (error) {
    console.error("generate-research failed", error)
    return NextResponse.json(
      { error: "Failed to generate research brief." },
      { status: 500 }
    )
  }
}
