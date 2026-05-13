"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function NewAgentPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [philosophy, setPhilosophy] = useState("")
  const [riskLevel, setRiskLevel] = useState("medium")
  const [initialCapital, setInitialCapital] = useState(100000)
  const [rebalanceFrequency, setRebalanceFrequency] = useState("daily")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        philosophy,
        risk_level: riskLevel,
        initial_capital: initialCapital,
        rebalance_frequency: rebalanceFrequency,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to create agent")
      setLoading(false)
      return
    }

    router.push("/agents")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create New Agent</h1>
        <p className="text-slate-400 mb-8">
          Define the investment style, risk level, and starting capital.
        </p>

        <form
          onSubmit={handleSubmit}
          className="border border-slate-800 rounded-xl p-6 space-y-6"
        >
          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Agent Name
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Conservative Growth Agent"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Description
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A balanced agent focused on long-term growth."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Investment Philosophy
            </label>
            <textarea
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 min-h-32"
              value={philosophy}
              onChange={(e) => setPhilosophy(e.target.value)}
              placeholder="Focus on high-quality companies, diversified ETFs, and controlled downside risk."
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Initial Capital
            </label>
            <input
              type="number"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              min={1000}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Risk Level
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Rebalance Frequency
            </label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={rebalanceFrequency}
              onChange={(e) => setRebalanceFrequency(e.target.value)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 px-5 py-2 rounded-lg"
          >
            {loading ? "Creating..." : "Create Agent"}
          </button>
        </form>
      </div>
    </main>
  )
}