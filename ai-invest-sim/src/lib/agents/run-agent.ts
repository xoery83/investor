import OpenAI from "openai"

import { buildAgentPrompt } from "./build-agent-prompt"

import {
  Agent,
  AgentHolding,
  AgentRun,
  AgentValuation,
} from "../types/agent"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type RunAgentInput = {
  agent: Agent
  holdings: AgentHolding[]
  valuations: AgentValuation[]
  recentRuns: AgentRun[]
}

export async function runAgent({
  agent,
  holdings,
  valuations,
  recentRuns,
}: RunAgentInput) {
  const prompt = buildAgentPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
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