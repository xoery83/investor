import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const holdings = [
  { symbol: "NVDA", weight: "23.9%", value: "$681,200" },
  { symbol: "MSFT", weight: "18.6%", value: "$530,840" },
  { symbol: "VGT", weight: "21.1%", value: "$601,380" },
  { symbol: "GLD", weight: "8.4%", value: "$239,580" },
]

export default function PortfolioPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Invest / Portfolio
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Portfolio Simulator</h1>
      </div>

      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="border-border/60 bg-card/55 backdrop-blur-md">
          <CardHeader>
            <CardDescription>Net Asset Value</CardDescription>
            <CardTitle className="text-3xl tabular-nums">$2,847,390</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60 bg-card/55 backdrop-blur-md">
          <CardHeader>
            <CardDescription>Cash Balance</CardDescription>
            <CardTitle className="text-3xl tabular-nums">$298,110</CardTitle>
          </CardHeader>
        </Card>
        <Card className="border-border/60 bg-card/55 backdrop-blur-md">
          <CardHeader>
            <CardDescription>Risk Budget</CardDescription>
            <CardTitle className="text-3xl tabular-nums">62%</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/55 backdrop-blur-md lg:col-span-2">
          <CardHeader>
            <CardTitle>Current Holdings (Simulated)</CardTitle>
            <CardDescription>Top positions and target weight distribution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {holdings.map((h) => (
              <div
                key={h.symbol}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
              >
                <p className="font-medium">{h.symbol}</p>
                <p className="font-mono text-xs text-muted-foreground">{h.weight}</p>
                <p className="tabular-nums">{h.value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/55 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Latest Rebalance Recommendation</CardTitle>
            <CardDescription>AI-generated suggestion</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            Reduce single-name concentration by trimming <span className="text-foreground">NVDA (-2.5%)</span>,
            increase defensive exposure via <span className="text-foreground">GLD (+1.4%)</span>, and keep cash
            above <span className="text-foreground">10%</span> through next macro event window.
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
