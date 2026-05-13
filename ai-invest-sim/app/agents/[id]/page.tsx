import Link from "next/link"
import RunAgentButton from "./RunAgentButton"
import AddHoldingForm from "./AddHoldingForm"

async function getAgent(id: string) {
  const res = await fetch(`http://localhost:3000/api/agents/${id}`, {
    cache: "no-store",
  })

  if (!res.ok) {
    return null
  }

  return res.json()
}

export default async function AgentDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getAgent(id)

  if (!data?.success) {
    return (
      <main className="min-h-screen bg-slate-950 text-white p-8">
        <p>Agent not found.</p>
        <Link href="/agents" className="text-blue-400">
          Back to Agents
        </Link>
      </main>
    )
  }

  const { agent, holdings, runs, valuations, portfolio_summary } = data

  const cashBalance = portfolio_summary?.cash_balance ?? agent.cash_balance ?? 0
  const holdingsValue = portfolio_summary?.holdings_value ?? 0
  const totalValue = portfolio_summary?.total_value ?? agent.current_value ?? 0

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <Link href="/agents" className="text-blue-400 text-sm">
            ← Back to Agents
          </Link>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">{agent.name}</h1>
            <p className="text-slate-400 mt-2">
              {agent.description || "No description"}
            </p>
          </div>

          <div className="flex gap-3">
            <RunAgentButton agentId={agent.id} />

            <Link
              href={`/agents/${agent.id}/settings`}
              className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg"
            >
              Settings
            </Link>

            <span
              className={`px-3 py-2 rounded-lg text-sm ${
                agent.is_active
                  ? "bg-green-900 text-green-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {agent.is_active ? "Active" : "Paused"}
            </span>
          </div>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="border border-slate-800 rounded-xl p-5">
            <p className="text-slate-500 text-sm">Total Portfolio Value</p>
            <p className="text-2xl font-bold mt-2">
              ${Number(totalValue).toLocaleString()}
            </p>
          </div>

          <div className="border border-slate-800 rounded-xl p-5">
            <p className="text-slate-500 text-sm">Cash Balance</p>
            <p className="text-2xl font-bold mt-2">
              ${Number(cashBalance).toLocaleString()}
            </p>
          </div>

          <div className="border border-slate-800 rounded-xl p-5">
            <p className="text-slate-500 text-sm">Holdings Value</p>
            <p className="text-2xl font-bold mt-2">
              ${Number(holdingsValue).toLocaleString()}
            </p>
          </div>

          <div className="border border-slate-800 rounded-xl p-5">
            <p className="text-slate-500 text-sm">Risk Level</p>
            <p className="text-2xl font-bold mt-2 capitalize">
              {agent.risk_level}
            </p>
          </div>
        </section>

        <section className="border border-slate-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-3">Investment Philosophy</h2>
          <p className="text-slate-300 whitespace-pre-wrap">
            {agent.philosophy || "No philosophy defined yet."}
          </p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border border-slate-800 rounded-xl p-6 lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Holdings</h2>

            {holdings.length === 0 ? (
              <p className="text-slate-500">No holdings yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-4 text-sm text-slate-500 border-b border-slate-800 pb-2">
                  <span>Symbol</span>
                  <span>Weight</span>
                  <span>Price</span>
                  <span className="text-right">Market Value</span>
                </div>

                {holdings.map((holding: any) => (
                  <div
                    key={holding.id}
                    className="grid grid-cols-4 border-b border-slate-800 pb-2 text-sm"
                  >
                    <span className="font-medium">{holding.symbol}</span>

                    <span>
                      {Number(holding.weight || 0).toFixed(2)}%
                    </span>

                    <span>
                      ${Number(holding.current_price || 0).toLocaleString()}
                    </span>

                    <span className="text-right">
                      ${Number(holding.market_value || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <AddHoldingForm agentId={agent.id} />
        </section>

        <section className="border border-slate-800 rounded-xl p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4">Recent Runs</h2>

          {runs.length === 0 ? (
            <p className="text-slate-500">No agent runs yet.</p>
          ) : (
            <div className="space-y-4">
              {runs.map((run: any) => (
                <div key={run.id} className="border-b border-slate-800 pb-3">
                  <p className="text-sm text-slate-500">
                    {new Date(run.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1">{run.summary || "No summary"}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="border border-slate-800 rounded-xl p-6 mt-8">
          <h2 className="text-xl font-semibold mb-4">Valuation History</h2>

          {valuations.length === 0 ? (
            <p className="text-slate-500">No valuation history yet.</p>
          ) : (
            <div className="space-y-2">
              {valuations.map((valuation: any) => (
                <div
                  key={valuation.id}
                  className="flex justify-between border-b border-slate-800 pb-2"
                >
                  <span className="text-slate-400">
                    {new Date(valuation.recorded_at).toLocaleDateString()}
                  </span>
                  <span>
                    ${Number(valuation.total_value).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}