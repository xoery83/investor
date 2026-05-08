"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { formatUsd, formatUsdCompact } from "@/lib/dashboard/format"
import type { PerformancePoint } from "@/lib/dashboard/types"

type PerformanceChartProps = {
  data: PerformancePoint[]
  ready: boolean
}

export function PerformanceChart({ data, ready }: PerformanceChartProps) {
  const gid = React.useId().replace(/:/g, "")
  const fillId = `portfolioFill-${gid}`

  return (
    <div className="h-[280px] w-full min-h-[220px] min-w-0 sm:h-[320px]">
      {ready ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.72 0.14 165)"
                  stopOpacity={0.38}
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.72 0.14 165)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border/50"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "oklch(0.62 0 0)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => formatUsdCompact(Number(v))}
              tick={{ fill: "oklch(0.5 0 0)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              animationDuration={300}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const v = payload[0]?.value
                return (
                  <div className="rounded-lg border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm transition-opacity duration-200">
                    <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      {label}
                    </p>
                    <p className="mt-0.5 font-medium tabular-nums text-foreground">
                      {typeof v === "number" ? formatUsd(v) : "—"}
                    </p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="oklch(0.78 0.12 165)"
              strokeWidth={1.75}
              fill={`url(#${fillId})`}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div
          className="flex size-full items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-xs text-muted-foreground transition-opacity duration-300"
          aria-hidden
        >
          Initializing feed…
        </div>
      )}
    </div>
  )
}
