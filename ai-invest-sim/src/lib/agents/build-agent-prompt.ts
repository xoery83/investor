import {
    Agent,
    AgentHolding,
    AgentRun,
    AgentValuation,
  } from "../types/agent"
  
  type BuildAgentPromptInput = {
    agent: Agent
    holdings: AgentHolding[]
    valuations: AgentValuation[]
    recentRuns: AgentRun[]
  }
  
  export function buildAgentPrompt({
    agent,
    holdings,
    valuations,
    recentRuns,
  }: BuildAgentPromptInput) {
    const holdingsText =
      holdings.length > 0
        ? holdings
            .map(
              (h) =>
                `- ${h.symbol}: ${h.weight}% weight, market value ${h.market_value}, current price ${h.current_price}`
            )
            .join("\n")
        : "No current holdings. Portfolio is currently in cash."
  
    const valuationText =
      valuations.length > 0
        ? valuations
            .slice(-5)
            .map(
              (v) =>
                `- ${v.recorded_at}: total value ${v.total_value}, cumulative return ${v.cumulative_return}%`
            )
            .join("\n")
        : "No valuation history available."
  
    const recentRunsText =
      recentRuns.length > 0
        ? recentRuns
            .map(
              (r) =>
                `- ${r.created_at}: ${r.summary || "No summary"}`
            )
            .join("\n")
        : "No previous agent runs."
  
    return `
  You are a professional portfolio manager running an AI investment agent inside a simulated investment platform.
  
  This is a simulation, not financial advice.
  
  Agent Profile:
  Name: ${agent.name}
  Description: ${agent.description || "No description provided."}
  Investment Philosophy: ${agent.philosophy || "No philosophy provided."}
  Risk Level: ${agent.risk_level}
  Rebalance Frequency: ${agent.rebalance_frequency}
  
  Portfolio Status:
  Initial Capital: ${agent.initial_capital}
  Cash Balance: ${agent.cash_balance}
  Current Portfolio Value: ${agent.current_value}
  Agent Active: ${agent.is_active}
  
  Current Holdings Market Value:
${holdings.reduce(
  (sum, h) => sum + Number(h.market_value || 0),
  0
)}
  Current Holdings:
  ${holdingsText}
  
  Recent Valuation History:
  ${valuationText}
  
  Recent Agent Memory:
  ${recentRunsText}
  
  Your task:
  Generate today's portfolio recommendation based on the agent's philosophy, risk level, current holdings, valuation history, and recent memory.
  
  Important rules:
  - Respect the agent's investment philosophy.
  - Respect the risk level.
  - Avoid excessive concentration.
  - Avoid unnecessary trading.
  - If there are no holdings, propose a reasonable starting allocation.
  - Explain why your recommendation is consistent with previous agent behavior.
  - Keep actions realistic for a simulated long-term portfolio.
  
  Return ONLY valid JSON in this exact structure:
  
  {
    "summary": "Short summary of today's recommendation",
    "market_view": "Brief market view based on general conditions",
    "portfolio_diagnosis": "Current portfolio assessment",
    "risks": ["risk 1", "risk 2", "risk 3"],
    "suggested_actions": [
      {
        "action": "buy | sell | hold | rebalance",
        "symbol": "Ticker or asset name",
        "reason": "Why this action is suggested",
        "target_weight": 0
      }
    ],
    "target_allocation": [
      {
        "symbol": "Ticker or asset name",
        "target_weight": 0
      }
    ],
    "allocation_comment": "Explanation of target allocation",
    "confidence": "low | medium | high"
  }
  `
  }