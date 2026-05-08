"use client"

import { Bot } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatAgentTimestamp } from "@/lib/dashboard/agent-utils"
import type { AgentActivity, AgentStatus } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

function StatusPill({ status }: { status: AgentStatus }) {
  const styles: Record<
    AgentStatus,
    { className: string; dot?: "pulse" | "glow" }
  > = {
    RUNNING: {
      className:
        "bg-sky-500/12 text-sky-300 ring-sky-500/30",
      dot: "pulse",
    },
    ANALYZING: {
      className:
        "bg-violet-500/12 text-violet-200 ring-violet-400/25",
      dot: "glow",
    },
    EXECUTED: {
      className:
        "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
      dot: "glow",
    },
    DONE: {
      className: "bg-secondary/70 text-muted-foreground ring-border/50",
    },
  }

  const cfg = styles[status]

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 font-mono text-[9px] font-semibold tracking-[0.14em] uppercase ring-1 transition-colors duration-300",
        cfg.className
      )}
    >
      {cfg.dot === "pulse" ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400/70" />
          <span className="relative size-1.5 rounded-full bg-sky-400" />
        </span>
      ) : cfg.dot === "glow" ? (
        <span className="size-1.5 rounded-full bg-current opacity-80 shadow-[0_0_8px_currentColor]" />
      ) : null}
      {status}
    </span>
  )
}

type ResearchAgentPanelProps = {
  activities: AgentActivity[]
}

export function ResearchAgentPanel({ activities }: ResearchAgentPanelProps) {
  return (
    <Card className="sticky top-6 border-border/60 bg-card/60 shadow-xl shadow-black/20 backdrop-blur-md transition-shadow duration-500">
      <CardHeader className="border-b border-border/40">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Research agent</CardTitle>
        </div>
        <CardDescription className="font-mono text-[11px] tracking-wide text-muted-foreground/90">
          Live queue · simulated stream
        </CardDescription>
      </CardHeader>
      <CardContent className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto pt-4 [scrollbar-width:thin]">
        {activities.map((item, i) => (
          <div
            key={item.id}
            style={{ animationDelay: `${i * 40}ms` }}
            className="dashboard-feed-enter group rounded-xl border border-border/50 bg-muted/15 p-3.5 transition-colors duration-300 hover:border-border/70 hover:bg-muted/30"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug transition-colors duration-200 group-hover:text-foreground">
                {item.title}
              </p>
              <StatusPill status={item.status} />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground transition-opacity duration-300">
              {item.detail}
            </p>
            <p
              className={cn(
                "mt-2 font-mono text-[10px] tracking-wide text-muted-foreground/85 tabular-nums transition-all duration-300",
                (item.status === "RUNNING" || item.status === "ANALYZING") &&
                  "text-sky-400/80"
              )}
            >
              {formatAgentTimestamp(item)}
            </p>
          </div>
        ))}
        <Button variant="outline" className="mt-3 w-full" size="sm">
          Full agent log
        </Button>
      </CardContent>
    </Card>
  )
}
