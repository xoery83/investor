import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const strategies = [
  {
    name: "Adaptive Growth Core",
    risk: "Medium",
    ret: "11.8% - 14.2%",
    drawdown: "-9.1%",
    style: "Dynamic growth with volatility throttle",
  },
  {
    name: "Global Defensive Alpha",
    risk: "Low",
    ret: "6.4% - 8.1%",
    drawdown: "-4.5%",
    style: "Min-vol equities + duration hedge",
  },
  {
    name: "AI Event Momentum",
    risk: "High",
    ret: "16.9% - 22.4%",
    drawdown: "-14.8%",
    style: "Event-driven momentum and catalyst rotation",
  },
]

export default function StrategiesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
          Invest / Strategies
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Strategy Library</h1>
      </div>

      <Card className="border-border/60 bg-card/55 backdrop-blur-md">
        <CardHeader>
          <CardTitle>Available Strategy Templates</CardTitle>
          <CardDescription>Mock return and risk estimates for simulation-only workflows.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="pl-4">Strategy</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Return Estimate</TableHead>
                <TableHead>Max Drawdown</TableHead>
                <TableHead className="pr-4">Allocation Style</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.map((s) => (
                <TableRow key={s.name} className="border-border/40">
                  <TableCell className="pl-4 font-medium">{s.name}</TableCell>
                  <TableCell>{s.risk}</TableCell>
                  <TableCell className="tabular-nums">{s.ret}</TableCell>
                  <TableCell className="tabular-nums text-rose-400">{s.drawdown}</TableCell>
                  <TableCell className="pr-4 text-muted-foreground">{s.style}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
