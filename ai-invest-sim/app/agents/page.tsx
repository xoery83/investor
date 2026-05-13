import Link from "next/link"
import { headers } from "next/headers"

async function getAgents() {
  const headersList = await headers()
  const host = headersList.get("host")
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"

  const res = await fetch(`${protocol}://${host}/api/agents`, {
    cache: "no-store",
  })

  if (!res.ok) {
    return []
  }

  const data = await res.json()
  return data.agents || []
}

export default async function AgentsPage() {
  const agents = await getAgents()

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Investment Agents</h1>
            <p className="text-slate-400 mt-2">
              Create, monitor, and manage your AI investment agents.
            </p>
          </div>

          <Link
            href="/agents/new"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
          >
            Create Agent
          </Link>
        </div>

        {agents.length === 0 ? (
          <div className="border border-slate-800 rounded-xl p-8 text-center">
            <p className="text-slate-400">No agents yet.</p>
            <Link
              href="/agents/new"
              className="inline-block mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
            >
              Create your first Agent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent: any) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="border border-slate-800 rounded-xl p-6 hover:border-blue-500 transition"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">{agent.name}</h2>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      agent.is_active
                        ? "bg-green-900 text-green-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {agent.is_active ? "Active" : "Paused"}
                  </span>
                </div>

                <p className="text-slate-400 text-sm mb-4">
                  {agent.description || "No description"}
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Value</span>
                    <span>${Number(agent.current_value).toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">Risk</span>
                    <span>{agent.risk_level}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-500">Frequency</span>
                    <span>{agent.rebalance_frequency}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}