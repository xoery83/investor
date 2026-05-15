"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import type { UpdatedHolding } from "../../../src/lib/agents/calculate-valuation"
import { formatCurrencyAmount } from "../../../src/lib/format/currency"
import type { AgentHolding } from "../../../src/lib/types/agent"
import { supabase } from "../../../src/lib/supabase"
import type { PortfolioSummary, TradeDraft } from "./AgentPortfolioPanel"

export default function AddHoldingForm({
  agentId,
  holdings,
  tradeDraft,
  totalValue,
  baseCurrency,
  onTradeCompleted,
}: {
  agentId: string
  holdings: AgentHolding[]
  tradeDraft?: TradeDraft | null
  totalValue: number
  baseCurrency: string
  onTradeCompleted?: (
    payload: PortfolioSummary & { holdings: UpdatedHolding[] }
  ) => void
}) {
  const router = useRouter()

  const [action, setAction] = useState<"buy" | "sell">("buy")
  const [symbol, setSymbol] = useState("")
  const [assetName, setAssetName] = useState("")
  const [assetType, setAssetType] = useState("stock")
  const [quantity, setQuantity] = useState(0)
  const [averageCost, setAverageCost] = useState(0)
  const [currentPrice, setCurrentPrice] = useState(0)
  const [currency, setCurrency] = useState(baseCurrency || "USD")
  const [targetMarketValueBase, setTargetMarketValueBase] = useState(0)

  const [lookupLoading, setLookupLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [quoteMessage, setQuoteMessage] = useState("")
  const lastAppliedDraftKey = useRef<string | null>(null)
  const selectedHolding = holdings.find(
    (holding) => holding.symbol.toUpperCase() === symbol.toUpperCase()
  )

  useEffect(() => {
    if (!tradeDraft?.symbol) return
    if (lastAppliedDraftKey.current === tradeDraft.key) return

    lastAppliedDraftKey.current = tradeDraft.key

    let cancelled = false
    const draft = tradeDraft

    async function applyTradeDraft() {
      const normalizedSymbol = draft.symbol.toUpperCase()
      const nextAction = draft.action === "sell" ? "sell" : "buy"
      const existingHolding = holdings.find(
        (holding) => holding.symbol.toUpperCase() === normalizedSymbol
      )
      const fallbackPrice = Number(existingHolding?.current_price || 0)

      setAction(nextAction)
      setSymbol(normalizedSymbol)
      setAssetName(existingHolding?.asset_name || "")
      setAssetType(draft.assetType || existingHolding?.asset_type || "stock")
      setAverageCost(Number(existingHolding?.average_cost || 0))
      setCurrency(existingHolding?.currency || baseCurrency || "USD")
      setError("")
      setQuoteMessage("Loading current quote for proposal action...")

      const quoteData = await lookupQuote(normalizedSymbol).catch(() => null)
      if (cancelled) return

      const quote = quoteData?.success ? quoteData.quote : null
      const price = Number(quote?.price || fallbackPrice || 0)
      const quoteCurrency = String(
        quote?.currency || existingHolding?.currency || baseCurrency || "USD"
      )
      const fxRate =
        existingHolding?.currency === quoteCurrency &&
        Number(existingHolding?.fx_rate_to_base || 0) > 0
          ? Number(existingHolding.fx_rate_to_base)
          : await lookupFxRate(quoteCurrency, baseCurrency).catch(() => 1)
      const assetType = inferAssetType(
        String(quote?.assetType || ""),
        draft.assetType || existingHolding?.asset_type || "stock"
      )
      const tradePct = Math.abs(
        Number(draft.estimatedPortfolioPctChange || 0) ||
          Number(draft.targetWeight || 0) -
            Number(
              draft.currentWeight ??
                existingHolding?.weight ??
                0
            )
      )
      const tradeAmount = totalValue > 0 ? (tradePct / 100) * totalValue : 0
      const priceBase = price * fxRate
      const estimatedQuantity =
        priceBase > 0 ? roundQuantity(tradeAmount / priceBase) : 0

      setAssetName(quote?.name || existingHolding?.asset_name || "")
      setAssetType(assetType)
      setCurrency(quoteCurrency)
      setCurrentPrice(price)
      setAverageCost(
        nextAction === "sell"
          ? Number(existingHolding?.average_cost || 0)
          : price
      )
      setQuantity(estimatedQuantity)
      setTargetMarketValueBase(nextAction === "buy" ? tradeAmount : 0)
      setQuoteMessage(
        price > 0
          ? `Proposal loaded: ${normalizedSymbol} @ ${String(
              quoteCurrency
            )} ${price.toFixed(2)}, FX ${fxRate.toFixed(4)}, estimated ${estimatedQuantity} shares.`
          : "Proposal loaded. Please enter price and quantity."
      )
    }

    applyTradeDraft()

    return () => {
      cancelled = true
    }
  }, [tradeDraft, holdings, totalValue, baseCurrency])

  function handleActionChange(nextAction: "buy" | "sell") {
    setAction(nextAction)
    setError("")
    setQuoteMessage("")
    setTargetMarketValueBase(0)

    if (nextAction === "sell" && holdings.length > 0 && !selectedHolding) {
      const firstHolding = holdings[0]
      setSymbol(firstHolding.symbol)
      setAssetName(firstHolding.asset_name || "")
      setAssetType(firstHolding.asset_type || "stock")
      setAverageCost(Number(firstHolding.average_cost || 0))
      setCurrentPrice(Number(firstHolding.current_price || 0))
      setCurrency(firstHolding.currency || baseCurrency || "USD")
    }
  }

  function applyExistingHolding(nextSymbol: string) {
    const normalizedSymbol = nextSymbol.toUpperCase()
    setSymbol(normalizedSymbol)

    const holding = holdings.find(
      (item) => item.symbol.toUpperCase() === normalizedSymbol
    )

    if (!holding) return

    setAssetName(holding.asset_name || "")
    setAssetType(holding.asset_type || "stock")
    setAverageCost(Number(holding.average_cost || 0))
    setCurrentPrice(Number(holding.current_price || 0))
    setCurrency(holding.currency || baseCurrency || "USD")
    setTargetMarketValueBase(0)
  }

  async function handleLookup() {
    if (!symbol.trim()) {
      setError("Please enter a symbol first.")
      return
    }

    setLookupLoading(true)
    setError("")
    setQuoteMessage("")

    const data = await lookupQuote(symbol.trim())

    if (!data.success) {
      setError(data.error || "Failed to lookup quote")
      setLookupLoading(false)
      return
    }

    const quote = data.quote

    setSymbol(quote.symbol || symbol.toUpperCase())
    setAssetName(quote.name || "")
    setCurrentPrice(Number(quote.price || 0))
    setCurrency(String(quote.currency || baseCurrency || "USD"))

    setAssetType(inferAssetType(String(quote.assetType || ""), "stock"))

    if (!averageCost || averageCost <= 0) {
      setAverageCost(Number(quote.price || 0))
    }

    setQuoteMessage(
      `Quote loaded: ${quote.name} @ ${String(
        quote.currency || baseCurrency || "USD"
      )} ${Number(
        quote.price || 0
      ).toFixed(2)}`
    )
    setTargetMarketValueBase(0)

    setLookupLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before trading this agent.")
      setLoading(false)
      return
    }

    const res = await fetch(`/api/agents/${agentId}/holdings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action,
        symbol,
        asset_name: assetName,
        asset_type: assetType,
        quantity,
        target_market_value_base:
          action === "buy" && targetMarketValueBase > 0
            ? targetMarketValueBase
            : undefined,
        average_cost: averageCost,
        current_price: currentPrice,
        currency,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to submit trade")
      setLoading(false)
      return
    }

    setSymbol("")
    setAssetName("")
    setAssetType("stock")
    setQuantity(0)
    setAverageCost(0)
    setCurrentPrice(0)
    setCurrency(baseCurrency || "USD")
    setTargetMarketValueBase(0)
    setQuoteMessage("")

    setLoading(false)
    clearAgentDetailCache(agentId)
    if (Array.isArray(data.holdings)) {
      onTradeCompleted?.({
        holdings: data.holdings,
        cash_balance: Number(data.cash_balance || 0),
        holdings_value: Number(data.holdings_value || 0),
        total_value: Number(data.total_value || 0),
      })
    }
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-blue-200 p-6 lg:sticky lg:top-6"
    >
      <div>
        <h2 className="text-xl font-semibold">Trade Holding</h2>
        <p className="mt-1 text-sm text-slate-500">
          Buy with cash or sell shares back into cash.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-blue-200 bg-white p-1">
        <button
          type="button"
          onClick={() => handleActionChange("buy")}
          className={
            action === "buy"
              ? "rounded-md bg-blue-600 px-3 py-2 text-sm"
              : "rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-blue-100"
          }
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => handleActionChange("sell")}
          className={
            action === "sell"
              ? "rounded-md bg-red-600 px-3 py-2 text-sm"
              : "rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-blue-100"
          }
        >
          Sell
        </button>
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">Symbol</label>

        <div className="flex gap-2">
          <input
            className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
            placeholder="NVDA"
            value={symbol}
            list={action === "sell" ? "agent-holdings-symbols" : undefined}
            onChange={(e) => applyExistingHolding(e.target.value)}
            required
          />
          <datalist id="agent-holdings-symbols">
            {holdings.map((holding) => (
              <option key={holding.id} value={holding.symbol}>
                {holding.asset_name || holding.symbol}
              </option>
            ))}
          </datalist>

          <button
            type="button"
            onClick={handleLookup}
            disabled={lookupLoading || action === "sell"}
            className="bg-blue-100 hover:bg-blue-100 disabled:bg-slate-200 px-4 py-2 rounded-lg whitespace-nowrap"
          >
            {lookupLoading ? "Looking..." : "Lookup"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">Asset Name</label>
        <input
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          placeholder="NVIDIA Corporation"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">Asset Type</label>
        <select
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          value={assetType}
          onChange={(e) => setAssetType(e.target.value)}
        >
          <option value="stock">Stock</option>
          <option value="etf">ETF</option>
          <option value="cash">Cash</option>
          <option value="crypto">Crypto</option>
          <option value="bond">Bond</option>
          <option value="commodity">Commodity</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">Quantity</label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          placeholder="10"
          value={quantity}
          onChange={(e) => {
            setQuantity(Number(e.target.value))
            setTargetMarketValueBase(0)
          }}
          required
        />
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">
          {action === "sell" ? "Average Cost" : "Average Cost"}
        </label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          placeholder="Optional"
          value={averageCost}
          onChange={(e) => {
            setAverageCost(Number(e.target.value))
            setTargetMarketValueBase(0)
          }}
          disabled={action === "sell"}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">
          {action === "sell" ? "Sell Price" : "Current Price"}
        </label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2"
          value={currentPrice}
          onChange={(e) => {
            setCurrentPrice(Number(e.target.value))
            setTargetMarketValueBase(0)
          }}
          required
        />
      </div>

      <div>
        <label className="block text-sm text-slate-500 mb-2">Currency</label>
        <input
          className="w-full bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 uppercase"
          value={currency}
          maxLength={3}
          onChange={(e) => {
            setCurrency(e.target.value.toUpperCase())
            setTargetMarketValueBase(0)
          }}
          required
        />
        <p className="mt-1 text-xs text-slate-500">
          Local trading currency. Portfolio totals convert to {baseCurrency}.
        </p>
      </div>

      {action === "sell" && selectedHolding && (
        <div className="rounded-lg border border-blue-200 bg-white/80 p-3 text-sm text-slate-700">
          Available: {formatShares(selectedHolding.quantity)} shares, local value{" "}
          {formatCurrencyAmount(
            Number(
              selectedHolding.market_value_local ??
                selectedHolding.market_value ??
                0
            ),
            selectedHolding.currency || baseCurrency
          )}
        </div>
      )}

      {quoteMessage && (
        <p className="text-green-400 text-sm">{quoteMessage}</p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className={
          action === "sell"
            ? "bg-red-600 hover:bg-red-700 disabled:bg-slate-200 px-4 py-2 rounded-lg"
            : "bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 px-4 py-2 rounded-lg"
        }
      >
        {loading ? "Submitting..." : action === "sell" ? "Sell Shares" : "Buy Holding"}
      </button>
    </form>
  )
}

function clearAgentDetailCache(agentId: string) {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith(`agents:detail:${agentId}:`)) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Cache invalidation is best effort only.
  }
}

function formatShares(quantity: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(Number(quantity || 0))
}

async function lookupQuote(symbol: string) {
  const res = await fetch(
    `/api/market/quote?symbol=${encodeURIComponent(symbol.trim())}`
  )

  return res.json()
}

async function lookupFxRate(fromCurrency: string, toCurrency: string) {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) return 1

  const res = await fetch(
    `/api/market/fx?from=${encodeURIComponent(
      fromCurrency.trim()
    )}&to=${encodeURIComponent(toCurrency.trim())}`
  )
  const data = await res.json()

  if (!data.success) {
    throw new Error(data.error || "Failed to fetch FX rate")
  }

  return Number(data.rate || 1)
}

function inferAssetType(quoteAssetType: string, fallback: string) {
  const quoteType = quoteAssetType.toLowerCase()

  if (quoteType.includes("etf")) return "etf"
  if (quoteType.includes("crypto")) return "crypto"
  if (quoteType.includes("fund")) return "etf"
  return fallback || "stock"
}

function roundQuantity(value: number) {
  return Math.round(value * 10000) / 10000
}
