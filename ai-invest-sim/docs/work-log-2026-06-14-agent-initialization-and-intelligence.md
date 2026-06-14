# Work Log: Agent Initialization, Memory, Evaluation, and Copycat Foundation

Date: 2026-06-14

## Summary

Today focused on moving Quantara from a simple “AI returns a portfolio, user accepts or rejects” flow toward an interactive AI investment committee experience. The main product direction is now clearer: initialization, rebalance, research, risk validation, memory, and eventual copycat/fund-manager tracking should become distinct but connected workflows.

## Completed

### Interactive Initialization Workflow

- Added an initialization workflow layer so a newly created agent can generate a first portfolio proposal before execution.
- Added proposal versions and discussion flow so users can ask questions or request changes before approving.
- Added richer proposal sections:
  - target allocation
  - suggested actions
  - investment thesis
  - self-critique
  - sector exposure
  - historical reference placeholder
- Added an `Approve & Execute` path for approved initialization proposals.
- Disabled repeated execution of already-applied initialization proposals.

### Run Experience Improvements

- Added a visible pending state in the Trade Proposals area when running:
  - Initial Build
  - Rebalance
  - Daily
  - Weekly
  - Escalation
- The pending panel now shows staged progress text so the user does not feel stuck waiting for a long model call.
- The latest generated proposal is inserted into the page immediately after the run completes.
- Fixed evaluation data not appearing immediately after a new proposal or revised proposal returns.

### Agent Memory Foundation

- Added `agent_memory_cards` as the first long-term memory structure.
- Stored user preference signals from initialization discussion and revision requests.
- Added memory cards back into initial build, rebalance, and revision prompts.
- Added proposal-derived memory cards for thesis, risk status, and execution context.

### Portfolio Intelligence / Risk Evaluation

- Added `portfolio_evaluations` as a persistent evaluation layer.
- Added local portfolio evaluation after initial build and rebalance proposals.
- Added basic scoring for:
  - cash policy fit
  - effective exposure concentration
  - ETF/look-through overlap warning
  - target fit score
  - rough target return probability placeholder
- Added `instrument_exposures` table foundation for ETF holdings look-through.
- Added UI panel for portfolio evaluation warnings and metrics.

### Currency Handling

- Standardized portfolio totals around each agent's `base_currency`.
- Added more explicit currency display across holdings and valuation surfaces.
- Preserved local asset quote currency while showing converted base value.

### Public Agent / Execution Controls

- Continued tightening public/private/system agent behavior.
- Public agents are moving toward proposal-approved execution instead of arbitrary manual portfolio edits.
- Added reset support for private agents to make repeated initialization testing easier.

### Model Configuration

- Added shared model options.
- Default model for new agents is now `gpt-5-mini`.
- Settings page uses a model dropdown so future agent runs can be changed without code edits.
- Fixed GPT-5 model parameter compatibility by avoiding unsupported temperature values.

### Copycat Agent Foundation

- Added `agent_mode` to distinguish:
  - `ai_manager`
  - `copycat`
- Added copycat source tables:
  - `copycat_sources`
  - `copycat_source_snapshots`
  - `copycat_source_holdings`
- Added `/api/copycat-sources`.
- Admin users can create or switch an agent into Copycat Source Tracker mode.
- Copycat mode is intentionally admin-only at this stage.

### Database Migrations

User executed the required Supabase SQL migrations:

- `docs/migrations/2026-06-13-initialization-workflow-and-holding-performance.sql`
- `docs/migrations/2026-06-14-portfolio-intelligence-and-copycat.sql`

## Verification

- `npm run lint` passed.
- `npm run build` passed.

## Known Limitations

- Historical return evaluation is still mostly a placeholder. The database table exists, but Yahoo historical price fetching and weighted portfolio backtest logic still need to be implemented.
- ETF look-through depends on `instrument_exposures`; without populated exposure data, overlap warnings are limited.
- Memory cards are written and injected into prompts, but there is not yet a UI for viewing, editing, archiving, or pinning them.
- Copycat agents can be created as a foundation, but there is not yet a full admin source-management page or automated 13F/fund holdings ingestion.
- Settings `Allowed Assets` describes asset classes and strategy scope, but does not yet automatically add explicit ticker symbols such as `SPCX` to the active investment universe.

## Next Work Plan

### 1. Explicit Allowed Symbols / Watchlist Symbols

- Add settings fields for explicit symbols separate from broad asset categories.
- Validate symbols via quote lookup.
- Save approved symbols into the investment universe.
- Add memory cards such as “User explicitly allowed SPCX.”
- Ensure initial build and rebalance no longer treat those symbols as out-of-universe.

### 2. Historical Return and Forward Fit Evaluation

- Add Yahoo historical price retrieval and cache it in `market_price_history_cache`.
- Estimate weighted portfolio historical annualized return, volatility, and max drawdown.
- Show a “target return fit” or “return probability” indicator on initial build and rebalance proposals.
- Use this evaluation in risk validation rather than only in UI.

### 3. ETF Overlap and Look-Through Data

- Populate `instrument_exposures` manually first for common ETFs.
- Later automate ETF holdings ingestion where possible.
- Detect overlap between ETF underlying holdings and direct stock positions.
- Distinguish ETF concentration limits from single-stock effective exposure limits.

### 4. Memory Card Management

- Add an Agent Memory panel.
- Allow owner/admin to view, archive, pin, or supersede memory cards.
- Separate user preferences, approved changes, rejected ideas, and risk events.
- Feed only relevant active memory into future prompts.

### 5. Copycat Agent Management

- Build admin UI for copycat source creation and holdings snapshots.
- Support manual snapshot entry first.
- Later add external data ingestion for 13F or public fund holdings.
- Generate copycat rebalance proposals from source snapshot deltas.

## Product Notes

The most important product learning today is that investment initialization should feel like working with an AI portfolio manager, not accepting a black-box allocation. The system now has the basic shape for that: proposal, thesis, critique, discussion, revision, validation, and approval.
