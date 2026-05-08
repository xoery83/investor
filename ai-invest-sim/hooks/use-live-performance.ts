"use client"

import * as React from "react"

import { formatClockShort } from "@/lib/dashboard/format"
import type { PerformancePoint } from "@/lib/dashboard/types"
import { PORTFOLIO_BASE, seededPerformancePoints } from "@/lib/dashboard/mock"

const MAX_POINTS = 26
const CHART_STEP_MS = 4000

export function useLivePerformanceSeries(portfolioValue: number) {
  const pvRef = React.useRef(portfolioValue)
  pvRef.current = portfolioValue

  const [series, setSeries] = React.useState<PerformancePoint[]>(() =>
    seededPerformancePoints(PORTFOLIO_BASE, 18)
  )
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    setReady(true)
  }, [])

  React.useEffect(() => {
    const id = setInterval(() => {
      const pv = pvRef.current
      setSeries((prev) => {
        if (prev.length === 0) return seededPerformancePoints(pv, 18)
        const last = prev[prev.length - 1]!
        const noise = (Math.random() - 0.48) * 720
        const at = Date.now()
        const nextVal = Math.max(
          last.value * 0.94,
          Math.round(last.value * 0.52 + pv * 0.48 + noise)
        )
        const sliced = prev.length >= MAX_POINTS ? prev.slice(1) : prev
        return [
          ...sliced,
          {
            at,
            label: formatClockShort(at),
            value: nextVal,
          },
        ]
      })
    }, CHART_STEP_MS)

    return () => clearInterval(id)
  }, [])

  return { series, ready }
}
