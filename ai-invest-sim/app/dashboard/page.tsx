"use client"
import { useEffect, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  Bot,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { PerformanceChart } from "@/app/dashboard/_components/performance-chart"
import { ResearchAgentPanel } from "@/app/dashboard/_components/research-agent-panel"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAgentFeed } from "@/hooks/use-agent-feed"

import { useLivePerformanceSeries } from "@/hooks/use-live-performance"
import { useLivePortfolio } from "@/hooks/use-live-portfolio"
import { formatUsd } from "../../lib/dashboard/format"
import { cn } from "../../lib/utils"
type DbHolding = {
  id: string
  ticker: string
  asset_type: string
  weight: number
  quantity: number
  avg_cost: number
  current_price: number
  market_value: number
}
export default function DashboardPage() {
  const [mounted, setMounted] = useState(false)

useEffect(() => {
  setMounted(true)
}, [])


  const portfolio = useLivePortfolio()
  const { series, ready: chartReady } = useLivePerformanceSeries(portfolio.value)
  const [holdings, setHoldings] = useState<DbHolding[]>([])

  useEffect(() => {
    async function loadHoldings() {
      const res = await fetch("/api/portfolio")
      const json = await res.json()
      setHoldings(json.data || [])
    }
  
    loadHoldings()
  }, [])
  const { activities } = useAgentFeed()

  const firstSeries = series[0]?.value ?? portfolio.value
  const periodReturnPct = ((portfolio.value - firstSeries) / firstSeries) * 100
  const dayUp = portfolio.dayChange >= 0
  if (!mounted) {
    return null
  }
  return (
    <div className="relative min-h-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,oklch(0.55_0.18_280/0.18),transparent_55%),radial-gradient(ellipse_70%_45%_at_100%_20%,oklch(0.5_0.12_195/0.1),transparent_50%),radial-gradient(ellipse_60%_40%_at_0%_80%,oklch(0.45_0.08_250/0.08),transparent_50%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/90 to-primary/50 text-primary-foreground shadow-lg shadow-primary/12 ring-1 ring-white/10">
              <Sparkles className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                AI Invest Sim
              </p>
              <div className="flex items-baseline gap-2">
                <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
                  Portfolio
                </h1>
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-widest text-emerald-400/90 uppercase">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative hidden min-w-[200px] flex-1 rounded-xl border border-border/80 bg-background/40 backdrop-blur-sm sm:flex sm:max-w-xs lg:max-w-sm">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Route a query to research…"
                className="w-full rounded-xl border-0 bg-transparent py-2.5 pr-3 pl-10 text-sm outline-none transition-colors duration-200 placeholder:text-muted-foreground/70"
                readOnly
                aria-label="Research command (demo)"
              />
            </div>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 font-mono text-xs">
              <Activity className="size-3.5" aria-hidden />
              Agents
            </Button>
            <Button size="sm" className="shrink-0 gap-1.5 shadow-lg shadow-primary/10">
              <Bot className="size-3.5" aria-hidden />
              New task
            </Button>
          </div>
        </header>

        <div className="grid min-w-0 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border/60 bg-card/55 shadow-xl shadow-black/25 backdrop-blur-md transition-colors duration-500 sm:col-span-2">
                <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/40 pb-4">
                  <div>
                    <CardDescription className="font-mono text-[11px] uppercase tracking-wider">
                      Total portfolio value
                    </CardDescription>
                    <CardTitle
                      key={portfolio.tick}
                      className="dashboard-value-tick mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl"
                    >
                      {formatUsd(portfolio.value)}
                    </CardTitle>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 tabular-nums transition-colors duration-300",
                        dayUp
                          ? "bg-emerald-500/12 text-emerald-400 ring-emerald-500/28"
                          : "bg-rose-500/12 text-rose-400 ring-rose-500/28"
                      )}
                    >
                      {dayUp ? (
                        <TrendingUp className="size-3" aria-hidden />
                      ) : (
                        <TrendingDown className="size-3" aria-hidden />
                      )}
                      {dayUp ? "+" : "−"}
                      {formatUsd(Math.abs(portfolio.dayChange))} today
                    </span>
                    <span className="text-sm tabular-nums text-muted-foreground transition-opacity duration-300">
                      {dayUp ? "+" : ""}
                      {portfolio.dayChangePct.toFixed(2)}% ·{" "}
                      <span className="text-foreground/85">
                        {periodReturnPct >= 0 ? "+" : ""}
                        {periodReturnPct.toFixed(1)}% session
                      </span>
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-3 transition-colors duration-300 hover:bg-muted/35">
                      <p className="text-xs text-muted-foreground">Cash &amp; equivalents</p>
                      <p className="mt-1 font-medium tabular-nums transition-colors duration-300">
                        {formatUsd(portfolio.cash)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-3 transition-colors duration-300 hover:bg-muted/35">
                      <p className="text-xs text-muted-foreground">Invested</p>
                      <p className="mt-1 font-medium tabular-nums transition-colors duration-300">
                        {formatUsd(portfolio.invested)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/25 px-3 py-3 transition-colors duration-300 hover:bg-muted/35">
                      <p className="text-xs text-muted-foreground">Day&apos;s income est.</p>
                      <p
                        className={cn(
                          "mt-1 font-medium tabular-nums transition-colors duration-300",
                          portfolio.dayIncomeEst >= 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        )}
                      >
                        {portfolio.dayIncomeEst >= 0 ? "+" : "−"}
                        {formatUsd(Math.abs(portfolio.dayIncomeEst))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/60 bg-card/55 shadow-xl shadow-black/25 backdrop-blur-md">
              <CardHeader className="border-b border-border/40">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Performance</CardTitle>
                    <CardDescription className="font-mono text-[11px] tracking-wide">
                      Live MTM curve · tick {chartReady ? "4s" : "—"} · mock
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="font-mono text-muted-foreground"
                  >
                    Export
                    <ArrowUpRight className="size-3" aria-hidden />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
              <div className="h-[260px] min-h-[260px] w-full min-w-0">
                <PerformanceChart data={series} ready={chartReady} />
              </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/55 shadow-xl shadow-black/25 backdrop-blur-md">
              <CardHeader className="border-b border-border/40">
                <CardTitle className="text-base">Holdings</CardTitle>
                <CardDescription className="font-mono text-[11px]">
                  Positions · prices drift with feed (mock)
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/50 hover:bg-transparent">
                      <TableHead className="pl-4">Symbol</TableHead>
                      <TableHead className="hidden md:table-cell">Name</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">
                        Avg cost
                      </TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="pr-4 text-right">Day</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdings.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-border/40 transition-colors duration-200 hover:bg-muted/30"
                      >
                        <TableCell className="pl-4 font-medium">{row.ticker}</TableCell>
                        <TableCell className="hidden max-w-[180px] truncate md:table-cell text-muted-foreground">
                          {row.asset_type}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.quantity}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell text-muted-foreground">
                          ${row.avg_cost.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ${row.current_price.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsd(row.market_value)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "pr-4 text-right tabular-nums font-medium transition-colors duration-200",
                            0 >= 0 ? "text-emerald-400" : "text-rose-400"
                          )}
                        >
                          {0 >= 0 ? "+" : ""}
                          0.00%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <aside className="lg:col-span-4">
            <ResearchAgentPanel activities={activities} />
          </aside>
        </div>
      </div>
    </div>
  )
}
