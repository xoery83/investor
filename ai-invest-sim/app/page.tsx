export default function Home() {
  const portfolio = [
    { name: "AI Growth Alpha", risk: "中风险", allocation: "42%", pnl: "+18.4%" },
    { name: "Global Quant Core", risk: "低风险", allocation: "28%", pnl: "+9.7%" },
    { name: "Future Tech Momentum", risk: "高风险", allocation: "30%", pnl: "+24.1%" },
  ]

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.18),transparent_24%)]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col px-6 pb-16 pt-6 lg:px-10">
        <nav className="mb-12 flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-cyan-400/20 ring-1 ring-cyan-300/40" />
            <span className="text-sm font-semibold tracking-wide text-cyan-200">AIFolio</span>
          </div>
          <div className="hidden gap-8 text-sm text-slate-300 md:flex">
            <a className="transition hover:text-cyan-300" href="#">
              Products
            </a>
            <a className="transition hover:text-cyan-300" href="#">
              Strategy
            </a>
            <a className="transition hover:text-cyan-300" href="#">
              Analytics
            </a>
            <a className="transition hover:text-cyan-300" href="#">
              Pricing
            </a>
          </div>
          <button className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20">
            登录
          </button>
        </nav>

        <section className="mb-12 grid gap-8 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs tracking-wide text-cyan-200">
              AI-Powered Investment Platform
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              用 AI 打造更聪明的
              <span className="block bg-gradient-to-r from-cyan-300 to-sky-500 bg-clip-text text-transparent">
                资产配置与收益增长
              </span>
            </h1>
            <p className="max-w-xl text-slate-300">
              结合机器学习信号、市场情绪与风险控制模型，实时生成投资建议，帮助你在复杂市场里做出更稳健决策。
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110">
                立即开始
              </button>
              <button className="rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400/50 hover:text-cyan-200">
                查看演示
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/30">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-200">收益曲线（30D）</h2>
              <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-xs text-emerald-300">+12.8%</span>
            </div>
            <div className="h-48 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <svg viewBox="0 0 480 180" className="h-full w-full">
                <defs>
                  <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <path d="M0 145 L70 126 L130 132 L190 95 L250 110 L310 70 L370 82 L430 40 L480 52" fill="none" stroke="url(#line)" strokeWidth="4" strokeLinecap="round" />
                <path d="M0 145 L70 126 L130 132 L190 95 L250 110 L310 70 L370 82 L430 40 L480 52 L480 180 L0 180 Z" fill="url(#line)" opacity="0.12" />
              </svg>
            </div>
            <div className="mt-4 flex justify-between text-xs text-slate-400">
              <span>Week 1</span>
              <span>Week 2</span>
              <span>Week 3</span>
              <span>Week 4</span>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold">Portfolio Cards</h3>
            <a className="text-sm text-cyan-300 transition hover:text-cyan-200" href="#">
              查看全部
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {portfolio.map((item) => (
              <article
                key={item.name}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-900/20"
              >
                <h4 className="mb-3 font-medium text-slate-100">{item.name}</h4>
                <div className="space-y-2 text-sm text-slate-300">
                  <p className="flex justify-between">
                    <span>风险等级</span>
                    <span>{item.risk}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>仓位占比</span>
                    <span>{item.allocation}</span>
                  </p>
                  <p className="flex justify-between font-medium text-emerald-300">
                    <span>近30天收益</span>
                    <span>{item.pnl}</span>
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}