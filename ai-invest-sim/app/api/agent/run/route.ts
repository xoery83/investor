import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import OpenAI from "openai"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function GET() {
  try {
    // Fake market data for MVP
    const marketData = {
      nasdaq: "+0.8%",
      sp500: "-0.2%",
      treasuryYield: "4.3%",
      fearGreed: "Neutral",
    }

    // Current portfolio
    const portfolio = {
      NVDA: 20,
      MSFT: 20,
      VOO: 30,
      CASH: 30,
    }

    const systemPrompt = `
You are Agent 001,
a conservative growth portfolio manager.

Your objectives:
- Preserve capital
- Generate stable long-term growth
- Avoid excessive volatility
- Prefer large-cap quality companies
- Maintain diversification
- Keep some cash during uncertainty

Allowed assets:
NVDA, MSFT, GOOGL, AMZN, META, VGT, VOO, QQQ, GLD, CASH

You MUST return valid JSON only.

Return format:
{
  "summary": "...",
  "risks": ["...", "..."],
  "allocation": {
    "NVDA": number,
    "MSFT": number,
    "VOO": number,
    "QQQ": number,
    "GLD": number,
    "CASH": number
  },
  "reasoning": "...",
  "confidence": number from 0 to 100
}
`

    const userPrompt = `
Current market data:
${JSON.stringify(marketData, null, 2)}

Current portfolio:
${JSON.stringify(portfolio, null, 2)}

Generate today's portfolio recommendation.
`

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.4,
    })

    const raw = completion.choices[0].message.content || "{}"
    const cleaned = raw
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim()

    const parsed = JSON.parse(cleaned)
    


    const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      agent_name: "Agent 001 - Conservative Growth Portfolio Manager",
      market_summary: parsed.summary,
      recommendation: parsed,
      reasoning: parsed.reasoning,
    })
    .select()
    .single()
  
  if (error) {
    console.error("Supabase insert error:", error)
  
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save agent run",
        details: error.message,
      },
      { status: 500 }
    )
  }
  
  return NextResponse.json({
    success: true,
    result: parsed,
    saved: data,
  })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        success: false,
        error: "Agent failed",
      },
      { status: 500 }
    )
  }
}