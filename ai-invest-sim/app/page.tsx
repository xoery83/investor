import Link from "next/link"
import { ArrowRight, Bot, ChartSpline, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const quickStats = [
  { label: "Simulated AUM", value: "$2.84M", detail: "+1.9% this week" },
  { label: "Active Agents", value: "17", detail: "5 running now" },
  { label: "Research Briefs", value: "42", detail: "9 pending review" },
]

const modules = [
  { name: "Agents", href: "/agents", desc: "Official and custom investment agents." },
  { name: "Strategies", href: "/strategies", desc: "Risk-aware model portfolios and style blends." },
  { name: "Portfolio", href: "/portfolio", desc: "Live holdings, allocation drift, rebalance proposals." },
  { name: "Research", href: "/research", desc: "AI-generated macro, sector, and earnings briefs." },
]

export default function Home() {
  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
        <section className="mb-8 grid gap-4 md:grid-cols-3">
          {quickStats.map((item) => (
            <Card key={item.label} className="border-border/60 bg-card/50 backdrop-blur-md">
              <CardHeader>
                <CardDescription className="font-mono text-[11px] uppercase tracking-wider">
                  {item.label}
                </CardDescription>
                <CardTitle className="text-2xl tabular-nums">{item.value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">{item.detail}</CardContent>
            </Card>
          ))}
        </section>

        <Card className="mb-8 border-border/60 bg-card/55 shadow-xl shadow-black/20 backdrop-blur-md">
          <CardHeader>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] tracking-wider text-primary uppercase">
              <Sparkles className="size-3" />
              Platform Overview
            </div>
            <CardTitle className="mt-2 text-3xl tracking-tight sm:text-4xl">
              AI Investment Operating System
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-relaxed">
              A multi-section SaaS shell for simulated investment operations. Track live portfolio behavior,
              deploy strategy agents, and review AI-generated market intelligence in one workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard" className="gap-1.5">
                Open Dashboard
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/research">View Research</Link>
            </Button>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-2">
          {modules.map((module) => (
            <Card
              key={module.name}
              className="group border-border/60 bg-card/50 transition-colors hover:bg-card/65"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {module.name === "Agents" ? (
                    <Bot className="size-4 text-primary" />
                  ) : module.name === "Strategies" ? (
                    <ChartSpline className="size-4 text-primary" />
                  ) : (
                    <Sparkles className="size-4 text-primary" />
                  )}
                  {module.name}
                </CardTitle>
                <CardDescription>{module.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="ghost" size="sm" className="px-0 text-primary hover:bg-transparent">
                  <Link href={module.href} className="gap-1.5">
                    Open
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  )
}