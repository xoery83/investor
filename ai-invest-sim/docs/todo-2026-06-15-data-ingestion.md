# TODO 2026-06-15: AI-Assisted Data Ingestion

## Goal

Build the first production-shaped data ingestion layer for Quantara so copycat agents and ETF look-through risk checks do not depend on manual user entry.

Core principle:

AI can help discover, read, and extract external investment data, but agent decisions must use cached, validated, versioned backend data.

## Target Architecture

```text
External web / SEC / ETF issuer
  -> ingestion job
  -> raw source snapshot
  -> AI/parser extraction
  -> validation
  -> normalized tables
  -> agent proposal and risk engine
```

## 1. Data Ingestion Storage

- Add migration for raw ingestion records.
- Suggested table: `data_ingestion_jobs`.
- Store:
  - `id`
  - `job_type`: `copycat_source_discovery`, `copycat_snapshot`, `etf_lookthrough`
  - `status`: `queued`, `running`, `needs_review`, `completed`, `failed`
  - `requested_by`
  - `target_symbol`
  - `target_name`
  - `source_url`
  - `raw_text`
  - `raw_payload`
  - `extracted_json`
  - `confidence`
  - `warnings`
  - `created_at`
  - `updated_at`

Acceptance criteria:

- Ingestion attempts are auditable.
- Failed extractions do not block the app.
- Admin can inspect what source produced each structured result.

## 2. Copycat Source Discovery

Build admin-only endpoint:

`POST /api/admin/data-ingestion/copycat-source`

Input:

- manager name
- optional fund/company name
- optional known URL

Output:

- candidate official sources
- source type guess: `13f`, `fund_holdings`, `manual`, `api`
- suggested `copycat_sources` row

Use cases:

- Warren Buffett / Berkshire Hathaway
- Ark Invest
- Pershing Square
- Bridgewater

Acceptance criteria:

- Admin can request discovery from a name.
- System returns structured candidate source data.
- Nothing is written to active copycat tables until validated.

## 3. Copycat Snapshot Extraction

Build admin-only endpoint:

`POST /api/admin/data-ingestion/copycat-snapshot`

Input:

- `copycat_source_id`
- source URL or uploaded/pasted raw text
- report date if known

Output:

- normalized holdings snapshot:
  - symbol
  - asset name
  - weight
  - reported value
  - quantity if available
  - currency
  - source confidence

Write path:

- create `copycat_source_snapshots`
- create `copycat_source_holdings`
- keep original extraction in `data_ingestion_jobs`

Validation rules:

- weights should sum close to 100%, or mark as partial.
- symbols must be normalized for Yahoo compatibility where possible.
- report date and source URL must be stored.
- stale 13F lag should be explicitly shown.

Acceptance criteria:

- A Berkshire-style 13F can become a copycat snapshot.
- Snapshot can later drive a copycat agent rebalance proposal.

## 4. ETF Look-Through Discovery and Extraction

Build admin-only endpoint:

`POST /api/admin/data-ingestion/etf-lookthrough`

Input:

- ETF symbol
- optional issuer URL

Output:

- issuer/source URL
- top holdings
- weights
- as-of date
- confidence

Write path:

- update `instrument_exposures`
- keep original extraction in `data_ingestion_jobs`

Validation rules:

- total known weights should be recorded.
- stale data threshold:
  - fresh: <= 30 days
  - stale: 31-90 days
  - expired: > 90 days
- ETF exposure rows must use normalized symbols.

Acceptance criteria:

- Common ETFs such as `KWEB`, `CQQQ`, `QQQ`, `SPY`, `VOO`, `XLE`, `XLK` can be populated without manual row entry.
- Proposal evaluation can detect overlap between direct stocks and ETF underlyings.

## 5. Admin Data Management UI

Add a lightweight admin-only page or section.

Suggested location:

- `/settings`
- or new `/settings/data`

Tabs:

- Copycat Sources
- Copycat Snapshots
- ETF Look-through
- Ingestion Jobs

Minimum UI features:

- trigger discovery/extraction
- show job status
- preview extracted JSON
- approve/write extracted result
- show last updated date and stale warnings

Acceptance criteria:

- Admin can run ingestion without touching SQL.
- Admin can see why a source is trusted or rejected.

## 6. Agent Integration

Copycat agents:

- Latest active `copycat_source_snapshot` should be convertible into a rebalance proposal.
- Copycat proposal should clearly show:
  - source name
  - report date
  - reporting lag
  - portfolio changes
  - tracking error warning

AI manager agents:

- Proposal evaluation should use `instrument_exposures` automatically.
- Missing ETF look-through should remain a visible warning.
- Historical evaluation should continue using `market_price_history_cache`.

Acceptance criteria:

- Copycat source data and ETF look-through data are both used by agent risk/proposal logic.

## 7. OpenAI / Web Retrieval Strategy

Preferred pattern:

- Use server-side ingestion route.
- Fetch source pages or documents.
- Use OpenAI only to extract/normalize when deterministic parsing is insufficient.
- Store extraction result and confidence.
- Never rely on live AI browsing during normal agent runs.

Prompt requirements:

- Return strict JSON.
- Include source URL and as-of date.
- Include confidence and warnings.
- Mark unavailable fields as `null`.
- Do not invent ticker symbols.

## 8. Testing Plan

Manual tests:

- Discover Berkshire/Buffett source.
- Extract one 13F-style snapshot.
- Create or update one copycat agent from snapshot.
- Extract `KWEB` look-through data.
- Run proposal evaluation with both `KWEB` and direct China ADRs.
- Confirm overlap warnings appear.

Automated checks:

- `npm run lint`
- `npm run build`

Database checks:

- `data_ingestion_jobs` row created for every ingestion attempt.
- `copycat_source_snapshots` and `copycat_source_holdings` are populated only after successful extraction.
- `instrument_exposures` upserts do not duplicate same instrument/underlying/as_of row.

## 9. Defer

- Fully automated crawling schedules.
- Paid data provider integrations.
- Broker-real execution.
- Public copycat marketplace ranking.
- Complex multi-source reconciliation.

These should wait until the ingestion audit trail and admin review flow are stable.
