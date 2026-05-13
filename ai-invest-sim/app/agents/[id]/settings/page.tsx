"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

export default function AgentSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [philosophy, setPhilosophy] = useState("")
  const [riskLevel, setRiskLevel] = useState("medium")
  const [initialCapital, setInitialCapital] = useState(100000)
  const [currentValue, setCurrentValue] = useState(100000)
  const [isActive, setIsActive] = useState(true)
  const [rebalanceFrequency, setRebalanceFrequency] = useState("daily")
  const [modelName, setModelName] = useState("gpt-4.1-mini")

  useEffect(() => {
    async function loadAgent() {
      const res = await fetch(`/api/agents/${id}`)
      const data = await res.json()

      if (!data.success) {
        setError(data.error || "Failed to load agent")
        setLoading(false)
        return
      }

      const agent = data.agent

      setName(agent.name || "")
      setDescription(agent.description || "")
      setPhilosophy(agent.philosophy || "")
      setRiskLevel(agent.risk_level || "medium")
      setInitialCapital(Number(agent.initial_capital || 100000))
      setCurrentValue(Number(agent.current_value || 100000))
      setIsActive(Boolean(agent.is_active))
      setRebalanceFrequency(agent.rebalance_frequency || "daily")
      setModelName(agent.model_name || "gpt-4.1-mini")

      setLoading(false)
    }

    loadAgent()
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        philosophy,
        risk_level: riskLevel,
        initial_capital: initialCapital,
        current_value: currentValue,
        is_active: isActive,
        rebalance_frequency: rebalanceFrequency,
        model_name: modelName,
      }),
    })

    const data = await res.json()

    if (!data.success) {
      setError(data.error || "Failed to save agent")
      setSaving(false)
      return
    }

    router.push(`/agents/${id}`)
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        Loading...
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href={`/agents/${id}`} className="text-blue-400 text-sm">
            ← Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Agent Settings</h1>
        <p className="text-slate-400 mb-8">
          Modify this agent's philosophy, risk parameters, model, and running status.
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
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Investment Philosophy
            </label>
            <textarea
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 min-h-36"
              value={philosophy}
              onChange={(e) => setPhilosophy(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between border border-slate-800 rounded-lg p-4">
            <div>
              <p className="font-medium">Agent Status</p>
              <p className="text-sm text-slate-500">
                Active agents will be included in future scheduled runs.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`px-4 py-2 rounded-lg ${
                isActive
                  ? "bg-green-900 text-green-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {isActive ? "Active" : "Paused"}
            </button>
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

          <div>
            <label className="block text-sm text-slate-400 mb-2">
              Model Name
            </label>
            <input
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-950 border border-red-800 text-red-300 rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 px-5 py-2 rounded-lg"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </main>
  )
}