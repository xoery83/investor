# Quantara / AI Investment Simulator Work Log

Date: 2026-05-16

## Current Product Direction

The project has evolved from a simple AI investment simulator into an AI portfolio operating system:

- Users can create AI investment agents with target markets, risk policies, workflow settings, and investment universes.
- Agents can produce daily/weekly/escalation research runs and structured trade proposals.
- Agents can be private, public, or system-level, with user roles controlling creation, follow, run, and trade permissions.
- Public agents are intended to behave like simulated Agent ETFs that users can follow and allocate simulated capital into.
- Agent portfolios now support holdings across multiple trading currencies while maintaining one base reporting currency per agent.

## Major Work Completed

### 1. User Ownership, Roles, and Public Agent Flow

Implemented user-bound agent ownership and permission-aware behavior.

- Agents are now associated with the logged-in user.
- User roles support admin, free, plus, and pro-style limits.
- Agent list separates system/admin agents and user-created agents.
- Agent cards show creator, followers, visibility, lifecycle status, and simulated Agent ETF capital.
- Users can follow public agents.
- Public agents are only followable when they pass publication readiness checks.
- Public/system/private status now controls which actions are visible and allowed.

Important rule currently enforced:

- Public agents cannot be freely manually traded.
- Public agent holdings can only change through approved trade proposals.

### 2. Agent Lifecycle and Publication Readiness

Added a publication readiness gate before an agent can be public/followable.

Current checks include:

- Basic profile exists.
- Target markets and allowed assets are configured.
- Return/drawdown objectives are coherent.
- Risk policy limits are configured.
- Risk validator is enabled.
- Investment universe exists.
- Universe scope matches the target market.
- Cash policy passes.
- Concentration policy passes.
- Holdings are inside the active universe.
- Successful rebalance run exists.
- Latest proposal is risk-approved.

Recent fixes:

- Hong Kong symbols such as `09888.HK` and `9888.HK` are now normalized and treated as the same symbol.
- China/Hong Kong target market scope is checked before generic US-market checks, avoiding false blocks for strategies that include US-listed China ADRs.

### 3. Investment Universe and Market Scope

Added an investment universe system.

- Each agent can have an active universe containing core ETFs, core stocks, watchlist, allowed exchanges, currency scope, and excluded assets.
- If no universe exists, the system can generate one with OpenAI or deterministic fallbacks.
- Rebalance/initial build prompts are constrained to the active universe.
- China technology profiles now avoid broad US ETFs such as VOO/QQQ unless explicitly appropriate.
- Australia-focused agents get ASX/Yahoo-compatible tickers.

Known design direction:

- When agent settings materially change, we should regenerate or revise the investment universe.
- The universe should become editable/reviewable in a more user-friendly way.

### 4. Initial Build vs Rebalance vs Capital Deployment

Separated portfolio construction logic into clearer modes.

Current behavior:

- If holdings are empty or near zero, clicking Rebalance triggers `initial_build`.
- If holdings exist but cash is too high, and no manual concentration intervention is required, the system now uses `capital_deployment`.
- Normal rebalance remains constrained by one-trade and weekly turnover limits.
- Initial build and capital deployment can deploy larger amounts of cash in one go, while still enforcing target market, cash range, concentration, and prohibited asset rules.

Reason for this change:

- A new or cash-heavy agent should be allowed to build a complete portfolio.
- Otherwise the normal rebalance limits make it impossible to satisfy cash policy in one run.

### 5. Trade Proposal Execution

Added controlled execution for approved proposals.

- Trade proposal cards show `Build portfolio` or `Execute proposal` when approved.
- Clicking executes the structured BUY/SELL actions using current quotes.
- Public agents still cannot be manually traded outside approved proposals.
- The holdings API checks `proposal_id` before allowing public proposal execution.
- Once executed, the trade proposal is marked `executed`.
- The button is disabled after execution, including after page refresh.

Important current limitation:

- Execution is still simulated and sequential.
- There is no full transactional rollback if one action succeeds and a later one fails.
- We should add stronger transaction semantics before real-money integrations.

### 6. Multi-Currency Portfolio Accounting

Implemented production-grade multi-currency accounting for agent holdings.

Agent-level accounting:

- Each agent has `base_currency`.
- Portfolio totals, cash, valuation history, and summary cards use agent base currency.
- New agents can choose a base currency.

Holding-level accounting:

- Each holding stores its local trading currency.
- Holdings store local price/value and base-currency price/value.
- FX rates are cached in `fx_rates_cache`.
- Holding tables show local price currency, FX, and base value.

User portfolio / Agent ETF accounting:

- User simulated Agent ETF portfolio remains USD-based for now.
- If an agent base currency is not USD, user buy/sell NAV is converted into USD.

Recent fix:

- `Use in trade form` now estimates shares using:
  `target base amount / (local price * FX rate)`.
- Previously HKD holdings were underbought because target USD amount was divided directly by HKD price.
- Form submission also sends `target_market_value_base` so the server can recalculate using its own FX rate.

### 7. Market Quote and Symbol Normalization

Added shared symbol normalization.

- `09888.HK` is normalized to `9888.HK`.
- Quote lookup, quote cache, holdings insertion, proposal permission checks, and universe comparisons now use normalized symbols.
- This prevents repeated Yahoo Finance failures for Hong Kong tickers with leading zeroes.

Market data architecture currently includes:

- Yahoo Finance quote lookup.
- Market quote cache table.
- FX rate cache table.
- Quote TTL rules depending on market state.

### 8. UI / UX Improvements

Several dashboard and list-page improvements were made.

- Agent dashboard was reorganized to reduce page length.
- Investment profile and workflow/risk sections are hidden behind tabs.
- Holdings and valuation history share a portfolio workspace area.
- Trade proposals display as horizontally scrollable cards.
- Recent research cards now distinguish daily, weekly, and escalation output.
- Sidebar can collapse.
- Light blue visual theme was introduced.
- Logo assets were integrated.
- Agent header was simplified: creator, created date, initial value moved into a readable line.
- Agent list supports filters and search.
- Settings page supports natural-language draft updates for agent configuration.

Known UI follow-up:

- Some colors and spacing still need another design pass.
- Settings page is functional but still too technical for ordinary users.
- Agent dashboard still needs a more polished “research intelligence” section.

### 9. Cron and Backend Operations

Added or adjusted backend routes for:

- Public agent valuation refresh.
- Daily public agent research.
- Weekly public agent research.
- Daily maintenance.

Vercel Hobby limitation:

- Cron can only run once per day on Hobby.
- Current setup should avoid frequent Vercel cron schedules.

Operational rule:

- Avoid duplicate localhost and Vercel scheduled execution.
- Use `CRON_SECRET` style authorization for cron routes.

## Validation

Latest checks performed:

- `npm run lint` passed.
- `npm run build` passed.

## Current Known Issues / Risks

1. Proposal execution is not fully transactional.
   - If action 1 succeeds and action 2 fails, the portfolio may be partially updated.
   - This is acceptable for simulation now but must be fixed before automation or brokerage integration.

2. AI memory is still shallow.
   - Runs do not yet have a robust memory/state layer.
   - Recent runs are passed in, but there is no durable thesis/memory object.

3. Investment universe regeneration needs better UX.
   - Settings changes should trigger a clear “regenerate universe” review flow.
   - Users should be able to accept/reject generated universe changes.

4. Public agent execution policy needs a final product decision.
   - Currently owner/admin can execute approved proposals.
   - Future public agents may need automatic execution only, with no owner discretion.

5. Multi-currency data migration is mostly handled, but old test holdings may still contain legacy assumptions.
   - Historical data can remain imperfect for now.
   - New trades should use the new local/base/FX fields.

6. Internationalization is only partially planned.
   - UI language toggle exists conceptually but needs deeper integration.
   - AI outputs should probably be generated and stored in the selected language instead of translated live.

7. Real brokerage integration is not started.
   - Permission, risk, audit, and execution logs will need to be much stricter before that stage.

## Recommended Next Work Plan for June

### Phase 1: Stabilize Agent Trading Loop

1. Make proposal execution transactional.
   - Add an execution endpoint that processes the entire proposal server-side.
   - Validate all quotes and FX first.
   - Apply all trades or none.
   - Write an execution record.

2. Add proposal execution history.
   - Store who executed it, when, which prices/FX were used, and resulting portfolio state.
   - Separate `pending`, `approved`, `executed`, `failed`, `cancelled`.

3. Improve post-execution refresh.
   - After executing a proposal, automatically refresh valuation and update proposal card state.

### Phase 2: Agent Memory and Decision Consistency

1. Add agent memory tables.
   - Current thesis.
   - Target allocation thesis.
   - Last decision rationale.
   - Risk notes.
   - Watchlist.

2. Feed memory into daily/weekly/rebalance prompts.
   - Prevent the model from forgetting its own previous allocation.
   - Make rebalance evaluate drift from its last accepted target allocation.

3. Distinguish model output types.
   - Daily: market pulse and no-trade monitoring.
   - Weekly: deeper holdings review and thesis updates.
   - Rebalance: structured target allocation and trade proposal.
   - Escalation: event-driven risk intervention.

### Phase 3: Public Agent Product Model

1. Finalize public agent lifecycle.
   - Draft -> Active -> Public -> Paused/Retired/Archived.
   - Decide whether public agents can ever be manually adjusted.

2. Define follower handling when agent status changes.
   - Public to private.
   - Public to paused.
   - Retired agent with existing follower positions.
   - Archived agent.

3. Build follower portfolio UX.
   - Show followed agents.
   - Show owned Agent ETF positions.
   - Show capital allocated to each public agent.

### Phase 4: Settings and Natural Language Configuration

1. Make settings less technical.
   - Keep advanced fields collapsible.
   - Natural language update first.
   - Generated structured diff second.
   - Save only after user confirmation.

2. Add explicit universe regeneration.
   - “Regenerate investment universe from current settings.”
   - Preview changes before save.

3. Add better validation messages.
   - Explain exactly what blocks publication and how to fix it.

### Phase 5: Internationalization

1. Add proper UI language dictionary.
   - English / Chinese first.

2. Store preferred language per user.

3. For AI output, generate directly in user/agent language and store it.
   - Avoid live translation on every page render.

### Phase 6: Production Hardening

1. Add audit logs.
   - Agent setting changes.
   - Proposal generation.
   - Proposal execution.
   - Public status changes.

2. Add tests for:
   - Multi-currency holdings.
   - HK symbol normalization.
   - Publication readiness.
   - Public agent proposal execution.
   - User permission limits.

3. Add server-side caching for expensive agent list/detail queries.

4. Review Supabase RLS policies for every table involved in public/private agents.

## Resume Notes

When work resumes, start by testing these flows manually:

1. Create a China/HK/US-listed China tech agent.
2. Generate investment universe.
3. Run initial build.
4. Execute build portfolio.
5. Confirm HKD shares are sized correctly.
6. Confirm `9888.HK` passes publication readiness.
7. Confirm proposal is marked executed and cannot be clicked again.
8. Publish agent.
9. Follow agent from another user.
10. Buy simulated Agent ETF position.

