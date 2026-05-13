# AI Investment Simulator

AI Investment Simulator is an AI-native portfolio simulation platform. Users can create investment agents, define their philosophy and risk profile, attach simulated holdings, run AI-generated portfolio reviews, and track portfolio state over time.

This product is a simulation and education tool. It does not provide financial advice or execute real brokerage trades.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Supabase for database-backed portfolio state
- OpenAI API for agent recommendations and research briefs
- Yahoo Finance for quote lookup
- Tailwind CSS and shadcn UI primitives

## Product Direction

The current architecture is moving toward:

```text
Agent
-> owns portfolio
-> owns memory and state
-> runs on demand, later on schedule
-> generates rebalance recommendations
-> stores run history and valuation snapshots
-> tracks performance over time
```

Longer term, the platform can support public agents, rankings, follow/copy workflows, subscriptions, and eventual brokerage integrations.

## Implemented

- Agent list, create flow, detail dashboard, and settings page
- Agent holdings with cash balance checks and portfolio weight recalculation
- Manual agent runs stored in `agent_runs`
- Dynamic prompt construction in `src/lib/agents/build-agent-prompt.ts`
- OpenAI-powered agent recommendations in `src/lib/agents/run-agent.ts`
- Yahoo Finance quote lookup in `src/lib/market/get-price.ts`
- Research brief generation in `app/api/generate-research/route.ts`
- Dashboard, portfolio, strategy, research, and settings sections

## Environment

Create `.env.local` with:

```bash
OPENAI_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Quality Checks

```bash
npm run lint
npm run build
```

The production build uses Next.js/Turbopack. In restricted local sandboxes, Turbopack may need permission to bind its helper process port.

## Database

The app expects these Supabase tables:

- `agents`
- `agent_holdings`
- `agent_runs`
- `agent_valuations`

See `docs/supabase-schema.sql` for the current schema baseline.

## Architecture Notes

See `docs/architecture.md` for module boundaries, near-term priorities, and rules for keeping portfolio state database-backed.
