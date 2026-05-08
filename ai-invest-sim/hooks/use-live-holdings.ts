"use client"

import * as React from "react"

import { INITIAL_HOLDINGS } from "@/lib/dashboard/mock"
import type { HoldingRow } from "@/lib/dashboard/types"

function jitterRow(row: HoldingRow): HoldingRow {
  const pct = (Math.random() - 0.5) * 0.0014
  const price = Math.max(0.01, row.price * (1 + pct))
  const value = Math.round(row.shares * price)
  const dayPct = row.dayPct + (Math.random() - 0.5) * 0.035
  return { ...row, price, value, dayPct }
}

export function useLiveHoldings(portfolioRevision: number) {
  const [rows, setRows] = React.useState<HoldingRow[]>(INITIAL_HOLDINGS)

  React.useEffect(() => {
    if (portfolioRevision === 0) return
    setRows((prev) => prev.map(jitterRow))
  }, [portfolioRevision])

  return rows
}
