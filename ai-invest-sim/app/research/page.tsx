"use client"

import * as React from "react"
import { LoaderCircle, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type GeneratedBrief = {
  title: string
  summary: string
  portfolioImpact: string
  riskWatch: string
  suggestedAction: string
  generatedAt: number
}

type BriefCard = {
  id: string
  title: string
  summary: string
  stamp: string
}

const initialBriefs: BriefCard[] = [
  {
    id: "brief-us-macro",
    title: "US Macro Brief",
    summary: "Core inflation cools while labor remains tight; risk assets supported short term.",
    stamp: "Updated 14m ago",
  },
  {
    id: "brief-semis",
    title: "Semiconductor Weekly",
    summary: "AI accelerator demand remains robust; supply constraints likely ease in Q3.",
    stamp: "Updated 42m ago",
  },
  {
    id: "brief-energy",
    title: "Energy and Commodities",
    summary: "Oil range-bound; gold bid sustained on real-rate uncertainty and geopolitical risk.",
    stamp: "Updated 1h ago",
  },
]

const reports = [
  { week: "Week 18", title: "Cross-Asset Correlation Drift", status: "Published" },
  { week: "Week 17", title: "Earnings Revision Breadth", status: "Published" },
  { week: "Week 16", title: "Liquidity Stress Test", status: "Archived" },
]

function mapGeneratedBrief(brief: GeneratedBrief): BriefCard {
  return {
    id: `generated-${brief.generatedAt}`,
    title: brief.title,
    summary: brief.summary,
    stamp: "Generated just now",
  }
}

export default function ResearchPage() {
  const [briefs, setBriefs] = React.useState<BriefCard[]>(initialBriefs)
  const [latestGenerated, setLatestGenerated] = React.useState<GeneratedBrief | null>(null)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch("/api/generate-research", { method: "POST" })

      const payload = (await response.json()) as GeneratedBrief | { error?: string }

      if (!response.ok || "error" in payload) {
        throw new Error(("error" in payload && payload.error) || "Generation failed.")
      }

      const generated = payload as GeneratedBrief
      setLatestGenerated(generated)
      setBriefs((prev) => [mapGeneratedBrief(generated), ...prev])
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to generate research. Please try again."
      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">
            Intelligence / Research
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">AI Research Center</h1>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="gap-2 bg-primary/90 shadow-lg shadow-primary/20 hover:bg-primary"
        >
          {isGenerating ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Generating research...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Generate Latest Research
            </>
          )}
        </Button>
      </div>

      {isGenerating && (
        <Card className="terminal-research-pulse mb-4 border-primary/25 bg-card/60 backdrop-blur-md">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            Generating research...
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/10">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {latestGenerated && (
        <Card className="research-fade-in mb-6 border-primary/30 bg-card/65 shadow-xl shadow-primary/10 backdrop-blur-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{latestGenerated.title}</CardTitle>
              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-[10px] tracking-widest text-primary uppercase">
                Generated just now
              </span>
            </div>
            <CardDescription>{latestGenerated.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Portfolio Impact
              </p>
              <p className="mt-1 text-muted-foreground">{latestGenerated.portfolioImpact}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Risk Watch
              </p>
              <p className="mt-1 text-muted-foreground">{latestGenerated.riskWatch}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                Suggested Action
              </p>
              <p className="mt-1 text-muted-foreground">{latestGenerated.suggestedAction}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="mb-6 grid gap-4 lg:grid-cols-3">
        {briefs.map((brief, index) => (
          <Card
            key={brief.id}
            className={index === 0 ? "research-fade-in border-border/60 bg-card/55 backdrop-blur-md" : "border-border/60 bg-card/55 backdrop-blur-md"}
          >
            <CardHeader>
              <CardTitle className="text-base">{brief.title}</CardTitle>
              <CardDescription>{brief.summary}</CardDescription>
            </CardHeader>
            <CardContent className="font-mono text-[11px] tracking-wide text-muted-foreground">
              {brief.stamp}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-border/60 bg-card/55 backdrop-blur-md">
        <CardHeader>
          <CardTitle>Weekly Reports</CardTitle>
          <CardDescription>Research packets generated by simulation agents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {reports.map((report) => (
            <div
              key={report.week}
              className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div>
                <p className="font-medium">{report.title}</p>
                <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{report.week}</p>
              </div>
              <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {report.status}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
