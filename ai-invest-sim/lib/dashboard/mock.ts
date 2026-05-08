import type { AgentActivity, HoldingRow, PerformancePoint } from "./types"

export const PORTFOLIO_BASE = 448_920
export const DAY_OPEN = PORTFOLIO_BASE - 6_240

export const RESEARCH_TEMPLATES: Array<{ title: string; detail: string }> = [
  {
    title: "13F delta · top holders",
    detail: "Parsed filer moves vs. prior Q; flagged two new seats in semis.",
  },
  {
    title: "Credit monitor · IG spreads",
    detail: "Curve watch: HY OAS vs. 5y mean; no breach of risk budget.",
  },
  {
    title: "Options skew scan · mega-cap",
    detail: "Put/call wing asymmetry; downside insurance bid elevated 1.2σ.",
  },
  {
    title: "Transcript NLP · guidance tone",
    detail: "Mgmt certainty score ↑; capex language shift on AI infra.",
  },
  {
    title: "FX pass-through · revenue mix",
    detail: "USD basket shock scenario; EPS sensitivity −0.4% / +1% DXY.",
  },
  {
    title: "Ownership flow · passive rebalance",
    detail: "Index adds projected for month-end; estimate ~$2.1B buy-side.",
  },
  {
    title: "Liquidity heatmap · ADR stack",
    detail: "Block volume z-score normal; adv. participation within band.",
  },
  {
    title: "ESG controversy fetch",
    detail: "Vendor + court docket sweep; no new material flags.",
  },
]

export const INITIAL_HOLDINGS: HoldingRow[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    shares: 120,
    avgCost: 118.4,
    price: 892.1,
    value: 107_052,
    dayPct: 2.34,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    shares: 210,
    avgCost: 332.1,
    price: 415.8,
    value: 87_318,
    dayPct: 0.82,
  },
  {
    symbol: "COST",
    name: "Costco Wholesale",
    shares: 85,
    avgCost: 612.0,
    price: 798.4,
    value: 67_864,
    dayPct: -0.41,
  },
  {
    symbol: "VGT",
    name: "Vanguard Info Tech ETF",
    shares: 340,
    avgCost: 498.2,
    price: 612.9,
    value: 208_386,
    dayPct: 1.12,
  },
  {
    symbol: "GLD",
    name: "SPDR Gold Shares",
    shares: 400,
    avgCost: 198.5,
    price: 221.3,
    value: 88_520,
    dayPct: 0.19,
  },
]

export function seededPerformancePoints(
  endValue: number,
  count: number
): PerformancePoint[] {
  const now = Date.now()
  const stepMs = 4_000
  const out: PerformancePoint[] = []
  let v = endValue * 0.965
  for (let i = count - 1; i >= 0; i--) {
    const at = now - i * stepMs
    v += (Math.random() - 0.44) * (endValue * 0.0012)
    if (i === 0) v = endValue
    out.push({
      at,
      label: "",
      value: Math.round(v),
    })
  }
  return out.map((p) => ({
    ...p,
    label: new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(p.at),
  }))
}

let agentId = 0
export function nextAgentId() {
  agentId += 1
  return `ag-${Date.now()}-${agentId}`
}

export function pickResearch() {
  const t = RESEARCH_TEMPLATES[Math.floor(Math.random() * RESEARCH_TEMPLATES.length)]!
  return { ...t }
}

export function seedAgentActivity(): AgentActivity[] {
  const now = Date.now()
  const templates = [
    pickResearch(),
    pickResearch(),
    pickResearch(),
    pickResearch(),
  ]
  return [
    {
      id: nextAgentId(),
      title: templates[0]!.title,
      detail: templates[0]!.detail,
      status: "RUNNING",
      createdAt: now - 12_000,
      completedAt: null,
    },
    {
      id: nextAgentId(),
      title: templates[1]!.title,
      detail: templates[1]!.detail,
      status: "ANALYZING",
      createdAt: now - 28_000,
      completedAt: null,
    },
    {
      id: nextAgentId(),
      title: templates[2]!.title,
      detail: templates[2]!.detail,
      status: "DONE",
      createdAt: now - 420_000,
      completedAt: now - 240_000,
    },
    {
      id: nextAgentId(),
      title: templates[3]!.title,
      detail: templates[3]!.detail,
      status: "DONE",
      createdAt: now - 1_020_000,
      completedAt: now - 900_000,
    },
  ]
}
