"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { supabase } from "../../../src/lib/supabase"

export default function AgentEtfTradePanel({
  agentId,
  visible,
}: {
  agentId: string
  visible: boolean
}) {
  const router = useRouter()
  const [amount, setAmount] = useState(1000)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function buyAgentEtf() {
    setLoading(true)
    setError("")
    setMessage("")

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setError("Please log in before buying this Agent ETF.")
      setLoading(false)
      return
    }

    const res = await fetch("/api/user/portfolio/positions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "buy",
        agent_id: agentId,
        amount,
      }),
    })
    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to buy Agent ETF.")
      setLoading(false)
      return
    }

    setMessage(
      `Bought ${Number(data.trade?.shares || 0).toLocaleString()} shares at NAV $${Number(
        data.trade?.nav || 0
      ).toFixed(2)}.`
    )
    setLoading(false)
    router.refresh()
  }

  if (!visible) return null

  return (
    <section className="mb-8 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Simulated Agent ETF</h2>
          <p className="mt-1 text-sm text-slate-400">
            Allocate cash from your personal simulator portfolio into this agent.
          </p>
        </div>
        <Link href="/portfolio" className="text-sm text-blue-600 hover:text-blue-700">
          View portfolio
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">Buy Amount</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="w-44 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2"
          />
        </label>
        <button
          type="button"
          onClick={buyAgentEtf}
          disabled={loading || amount <= 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700 disabled:bg-slate-200"
        >
          {loading ? "Buying..." : "Buy Agent ETF"}
        </button>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  )
}
