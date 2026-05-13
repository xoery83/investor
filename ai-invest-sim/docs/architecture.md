# Architecture

## Current Goal

Build a production-quality AI portfolio operating system for simulated investing. The platform should make AI agents first-class portfolio managers: each agent has a philosophy, risk profile, cash balance, holdings, valuation history, and run history.

## Module Boundaries

### App routes

`app/` contains Next.js pages and route handlers. Pages should focus on rendering and user flow. Route handlers should validate input, call domain helpers, and return typed JSON responses.

### Domain helpers

`src/lib/agents/` owns AI agent behavior:

- prompt construction
- model execution
- future valuation and rebalance helpers

`src/lib/market/` owns quote and market data integrations.

### Shared UI/data helpers

`components/` contains reusable UI.

`lib/dashboard/` currently contains dashboard-only formatting and mock/demo helpers. New production portfolio state should come from Supabase, not from mock arrays.

### Database

Supabase is the source of truth for portfolio state:

- agent profile and control state
- holdings
- cash balance
- run outputs
- valuation snapshots

Mock data is acceptable for placeholder screens, but not for agent-owned portfolio workflows.

## Development Rules

- Keep prompt construction centralized in `src/lib/agents/build-agent-prompt.ts`.
- Keep model execution centralized in `src/lib/agents/run-agent.ts`.
- Prefer server-side data fetching for portfolio state.
- Do not mix portfolio math deeply into React components.
- Avoid hardcoded production portfolio values.
- Store generated agent outputs before showing them as history.
- Treat AI output as recommendations until a separate execution engine validates and applies trades.
- Keep all finance language simulation-only and non-advisory.

## Immediate Production Priorities

1. Automatic valuation snapshots
2. Historical performance chart backed by `agent_valuations`
3. Holdings price refresh job or endpoint
4. Transaction history table
5. Rebalance recommendation parser and validation layer
6. Portfolio allocation engine that can turn approved target weights into simulated trades

## Suggested Next Tables

- `agent_transactions` for simulated buys, sells, deposits, withdrawals, and rebalance executions
- `agent_memory` for durable theses, constraints, and learned preferences
- `agent_rebalance_orders` for proposed and approved trade plans

## AI Safety Shape

AI should generate structured recommendations. Deterministic application code should validate:

- symbols are allowed or quote-resolvable
- target weights sum to sane values
- cash never goes below zero
- risk limits are respected
- actions are stored before being applied

This keeps the agent expressive while making the simulator auditable.
