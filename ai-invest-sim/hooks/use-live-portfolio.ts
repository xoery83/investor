"use client"

import * as React from "react"

import {
  DAY_OPEN,
  PORTFOLIO_BASE,
} from "@/lib/dashboard/mock"

function randInRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function useLivePortfolio() {
  const [value, setValue] = React.useState(PORTFOLIO_BASE)
  const [tick, setTick] = React.useState(0)
  const dayOpenRef = React.useRef(DAY_OPEN)

  React.useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    const step = () => {
      const delay = randInRange(3000, 5000)
      timeoutId = setTimeout(() => {
        setValue((v) => {
          const jitter = (Math.random() - 0.4) * 900
          return Math.round(v + jitter)
        })
        setTick((t) => t + 1)
        step()
      }, delay)
    }

    step()
    return () => clearTimeout(timeoutId)
  }, [])

  const dayOpen = dayOpenRef.current
  const dayChange = value - dayOpen
  const dayChangePct = (dayChange / dayOpen) * 100
  const cashRatio = 0.0938
  const cash = Math.round(value * cashRatio)
  const invested = Math.max(0, value - cash)
  const dayIncomeEst = Math.max(0, Math.round(dayChange * 0.22))

  return {
    value,
    dayChange,
    dayChangePct,
    cash,
    invested,
    dayIncomeEst,
    tick,
  }
}
