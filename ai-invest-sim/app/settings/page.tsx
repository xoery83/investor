import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const settings = [
  {
    title: "Risk Profile",
    value: "Balanced Growth",
    description: "Target volatility 11% with max drawdown guardrails.",
  },
  {
    title: "Simulation Capital",
    value: "$3,000,000",
    description: "Paper capital allocated to all strategy experiments.",
  },
  {
    title: "Subscription Tier",
    value: "Institutional Sandbox",
    description: "Includes creator agents, premium research, and advanced reports.",
  },
]

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">System / Settings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Simulation Settings</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {settings.map((item) => (
          <Card key={item.title} className="border-border/60 bg-card/55 backdrop-blur-md">
            <CardHeader>
              <CardDescription>{item.title}</CardDescription>
              <CardTitle className="text-xl">{item.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{item.description}</CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
