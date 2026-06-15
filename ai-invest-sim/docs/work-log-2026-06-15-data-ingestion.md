# Work Log 2026-06-15: Data Ingestion and Copycat Agent Foundation

## Summary

Today we implemented the first production-shaped data ingestion layer for Quantara. The goal was to reduce manual data entry for copycat agents and ETF look-through analysis while keeping all external data auditable and reviewable before it affects agent decisions.

## Completed

### Data ingestion audit trail

- Added migration: `docs/migrations/2026-06-15-data-ingestion-jobs.sql`.
- Added `data_ingestion_jobs` as the audit log for AI/web extraction attempts.
- Stored job type, status, requester, target symbol/name, source URL, raw text, extracted JSON, confidence, warnings, and errors.
- Made ingestion job creation/update tolerate missing migration during development, so the core app does not break if the audit table is not yet installed.

### AI-assisted extraction helpers

- Added `src/lib/data-ingestion/web-source.ts`.
  - Loads pasted source text directly.
  - Fetches source URLs server-side when available.
  - Strips basic HTML and truncates oversized source text.
- Added `src/lib/data-ingestion/openai-extract.ts`.
  - Uses strict JSON extraction prompts.
  - Supports copycat source discovery, copycat holdings snapshots, and ETF/fund look-through holdings.
  - Falls back gracefully when OpenAI is unavailable.
- Added `src/lib/data-ingestion/jobs.ts`.
  - Centralizes ingestion job create/update behavior.

### Admin ingestion APIs

- Added admin-only `POST /api/admin/data-ingestion/copycat-source`.
  - Extracts candidate copycat data sources from a known URL or pasted text.
  - Returns structured candidates without automatically activating them.
- Added admin-only `POST /api/admin/data-ingestion/copycat-snapshot`.
  - Extracts holdings snapshots for a copycat source.
  - Writes normalized rows to `copycat_source_snapshots` and `copycat_source_holdings`.
  - Keeps extraction output in `data_ingestion_jobs`.
- Added admin-only `POST /api/admin/data-ingestion/etf-lookthrough`.
  - Extracts ETF/fund holdings.
  - Writes normalized look-through rows to `instrument_exposures`.
- Added admin-only `GET /api/admin/data-ingestion/jobs`.
  - Shows recent extraction attempts.
  - Gracefully degrades when the migration has not been executed.

### Admin data management UI

- Added `/settings/data`.
- Added Settings entry for admins.
- UI tabs:
  - ETF Look-through
  - Copycat Source
  - Copycat Snapshot
- Admin can provide a URL or paste raw source text.
- Latest extraction result is shown as JSON for review.
- Recent jobs table shows audit history.
- Copycat source discovery now includes a "Create Copycat Source" action after reviewing the extracted candidate.

### Copycat agent run integration

- Updated `POST /api/agents/[id]/run`.
- If an agent is `copycat`, the run now uses the latest active copycat snapshot instead of asking the model to invent a portfolio.
- The generated proposal includes:
  - source name
  - manager name
  - report date
  - reporting lag
  - target allocation
  - BUY/SELL deltas against current holdings
  - tracking error and staleness warnings
- Existing risk validation and proposal persistence still run after the deterministic copycat proposal is built.

## Verification

- `npm run lint` passed.
- `npm run build` passed.
- Local dev server is running at `http://localhost:3000`.
- `/settings/data` loads.
- `/api/admin/data-ingestion/jobs` returns 200 after the graceful degradation fix.

## SQL Required

Run this migration in Supabase if it has not already been applied:

```sql
docs/migrations/2026-06-15-data-ingestion-jobs.sql
```

Without this migration, ingestion APIs still work where possible, but the Recent Jobs audit log will be empty or show a warning.

## Current Limitations

- Source discovery is not true open-web search yet. It works best with a known URL or pasted source text.
- Copycat source discovery creates a candidate; admin still needs to review before creating the source.
- Snapshot extraction writes directly after a successful extraction. A future version should add a separate staged approval screen before writing snapshot holdings.
- ETF look-through depends on the quality of source text or issuer pages. Some issuer sites may block server-side fetches, requiring pasted text.
- Multi-source reconciliation is not implemented yet.
- No scheduled ingestion refresh has been added yet; this is still admin-triggered.

## Suggested Next Steps

1. Add source retrieval adapters for priority sources:
   - SEC 13F
   - ARK daily holdings
   - common ETF issuer CSV/holdings pages
2. Add staged approval for extracted snapshots before writing holdings.
3. Add stale-data indicators to agent dashboard and settings.
4. Connect ETF look-through overlap warnings more visibly in proposal UI.
5. Add scheduled ingestion refresh for active public/copycat agents.
6. Start copycat agent templates for Buffett/Berkshire and ARK as system agents.
