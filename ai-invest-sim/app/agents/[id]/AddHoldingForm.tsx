"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function AddHoldingForm({ agentId }: { agentId: string }) {
  const router = useRouter()

  const [symbol, setSymbol] = useState("")
  const [assetName, setAssetName] = useState("")
  const [assetType, setAssetType] = useState("stock")
  const [quantity, setQuantity] = useState(0)
  const [averageCost, setAverageCost] = useState(0)
  const [currentPrice, setCurrentPrice] = useState(0)

  const [lookupLoading, setLookupLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [quoteMessage, setQuoteMessage] = useState("")

  async function handleLookup() {
    if (!symbol.trim()) {
      setError("Please enter a symbol first.")
      return
    }

    setLookupLoading(true)
    setError("")
    setQuoteMessage("")

    const res = await fetch(
      `/api/market/quote?symbol=${encodeURIComponent(symbol.trim())}`
    )

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to lookup quote")
      setLookupLoading(false)
      return
    }

    const quote = data.quote

    setSymbol(quote.symbol || symbol.toUpperCase())
    setAssetName(quote.name || "")
    setCurrentPrice(Number(quote.price || 0))

    const quoteType = String(quote.assetType || "").toLowerCase()

    if (quoteType.includes("etf")) {
      setAssetType("etf")
    } else if (quoteType.includes("crypto")) {
      setAssetType("crypto")
    } else {
      setAssetType("stock")
    }

    if (!averageCost || averageCost <= 0) {
      setAverageCost(Number(quote.price || 0))
    }

    setQuoteMessage(
      `Quote loaded: ${quote.name} @ $${Number(quote.price || 0).toFixed(2)}`
    )

    setLookupLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch(`/api/agents/${agentId}/holdings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol,
        asset_name: assetName,
        asset_type: assetType,
        quantity,
        average_cost: averageCost,
        current_price: currentPrice,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to add holding")
      setLoading(false)
      return
    }

    setSymbol("")
    setAssetName("")
    setAssetType("stock")
    setQuantity(0)
    setAverageCost(0)
    setCurrentPrice(0)
    setQuoteMessage("")

    setLoading(false)
    router.refresh()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-slate-800 rounded-xl p-6 space-y-4"
    >
      <h2 className="text-xl font-semibold">Add Holding</h2>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Symbol</label>

        <div className="flex gap-2">
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
            placeholder="NVDA"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            required
          />

          <button
            type="button"
            onClick={handleLookup}
            disabled={lookupLoading}
            className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-700 px-4 py-2 rounded-lg whitespace-nowrap"
          >
            {lookupLoading ? "Looking..." : "Lookup"}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Asset Name</label>
        <input
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          placeholder="NVIDIA Corporation"
          value={assetName}
          onChange={(e) => setAssetName(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Asset Type</label>
        <select
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
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
        <label className="block text-sm text-slate-400 mb-2">Quantity</label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          placeholder="10"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Average Cost</label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          placeholder="Optional"
          value={averageCost}
          onChange={(e) => setAverageCost(Number(e.target.value))}
        />
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-2">Current Price</label>
        <input
          type="number"
          step="any"
          min="0"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
          value={currentPrice}
          onChange={(e) => setCurrentPrice(Number(e.target.value))}
          required
        />
      </div>

      {quoteMessage && (
        <p className="text-green-400 text-sm">{quoteMessage}</p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 px-4 py-2 rounded-lg"
      >
        {loading ? "Adding..." : "Add Holding"}
      </button>
    </form>
  )
}