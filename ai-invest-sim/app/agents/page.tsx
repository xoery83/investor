import { Bot, ShieldCheck, Sparkles, UserRound } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const officialAgents = [
  { name: "Macro Sentinel", focus: "Rates, inflation, and policy shifts", mode: "RUNNING" },
  { name: "Earnings Radar", focus: "Guidance drift and transcript sentiment", mode: "ANALYZING" },
  { name: "Risk Monitor", focus: "Factor concentration and drawdown alerts", mode: "DONE" },
]

const creatorAgents = [
  { name: "Growth Rotator", owner: "Quant Lab", style: "Momentum + quality blend" },
  { name: "Dividend Guard", owner: "Income Desk", style: "Yield stability screens" },
  { name: "Event Decoder", owner: "Creator: Nova", style: "Catalyst and event workflows" },
]

export default function AgentsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Invest / Agents</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">AI Portfolio Agents</h1>
      </div>

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        {officialAgents.map((agent) => (
          <Card key={agent.name} className="border-border/60 bg-card/55 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" />
                {agent.name}
              </CardTitle>
              <CardDescription>{agent.focus}</CardDescription>
            </CardHeader>
            <CardContent>
              <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                {agent.mode}
              </span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-border/60 bg-card/55 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-4 text-primary" />
            Creator Agents
          </CardTitle>
          <CardDescription>Community-built models for specific alpha and risk objectives.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {creatorAgents.map((agent) => (
            <div key={agent.name} className="rounded-xl border border-border/60 bg-muted/25 p-4">
              <p className="flex items-center gap-2 font-medium">
                <Bot className="size-4 text-primary" />
                {agent.name}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserRound className="size-3.5" />
                {agent.owner}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{agent.style}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
