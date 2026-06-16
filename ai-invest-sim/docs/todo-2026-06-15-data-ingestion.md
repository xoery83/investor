# TODO 2026-06-16: Data Ingestion, Copycat Agents, and ETF Look-Through

## Current Goal

Continue hardening the production-shaped data ingestion layer for Quantara so copycat agents and ETF look-through risk checks can be trusted by admins before they are exposed to users.

Core principle:

AI can help discover, read, and extract external investment data, but agent decisions must use cached, validated, versioned backend data.

## Current Status

Completed or mostly completed:

- `data_ingestion_jobs` audit trail exists.
- Admin `/settings/data` page exists.
- Copycat source discovery exists.
- Copycat snapshot extraction exists.
- SEC 13F XML deterministic parser exists.
- Copycat agents can generate proposals from the latest active snapshot.
- Copycat proposals can be executed through the same holdings engine.
- Copycat publication checks now treat snapshot-driven holdings differently from normal AI-manager universes.
- 13F duplicate rows are aggregated.
- Common Buffett/Pershing CUSIP mappings were expanded.
- Snapshot re-extraction clears previous holdings for the same snapshot before writing the new set.
- Fractional AI-extracted weights such as `0.91` are normalized to percentage units when appropriate.

Still needs focused testing and refinement:

- ETF look-through extraction.
- ETF/direct-stock overlap scoring in proposal UI.
- Snapshot review and approval UX.
- Copycat auto-refresh/sync lifecycle.
- Automated source retrieval for SEC and issuer pages.
- Data quality flags before public release.

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

Status: implemented.

Follow-up:

- Add a richer job detail drawer/page so admins do not need to inspect raw JSON first.
- Add source-specific metadata display:
  - SEC accession number
  - filing date
  - report date
  - source parser used
  - matched/unmatched row count
  - total extracted weight
  - stale-data status

## 2. Copycat Source Discovery

Status: implemented as a first pass.

Use cases:

- Warren Buffett / Berkshire Hathaway
- Ark Invest
- Pershing Square
- Bridgewater

Follow-up:

- Prefer deterministic SEC discovery when the manager/fund is a 13F filer.
- Store CIK, accession, filing URL, and infoTable URL separately instead of only one source URL.
- Add a "Find latest filing" action for SEC-based sources.
- Add source type-specific instructions in UI:
  - SEC 13F
  - issuer daily holdings CSV
  - fund holdings page
  - manual/pasted source

## 3. Copycat Snapshot Extraction

Status: implemented, but still needs data-quality hardening.

Known issues to keep testing:

- SEC XML may contain CUSIPs that are not in the static mapping.
- Some OpenAI extraction returns weights as fractions (`0.1739`) instead of percentages (`17.39`).
- Some 13F XML uses reported value as thousands; some sample XML appears to use large raw values. Weight calculations are ratio-based, but displayed total reported value needs clearer labeling.
- Snapshot total weight below 90% should require review before being used for public/system agents.
- Snapshot extraction should show a human-readable holdings table, not raw JSON as the main review surface.

Next tasks:

- Add "review snapshot holdings" table:
  - symbol
  - issuer name
  - CUSIP
  - weight
  - reported value
  - quantity
  - match confidence
  - warning badge
- Add edit/override for unmatched or low-confidence tickers.
- Add "Approve snapshot" step before a snapshot becomes active.
- Add "Deactivate previous snapshots from this source" option.
- Add source-level latest snapshot summary.

## 4. ETF Look-Through Discovery and Extraction

Status: endpoint and UI exist, but this is the next major area to test.

Priority manual test cases:

- Broad US ETFs:
  - `SPY`
  - `VOO`
  - `QQQ`
- Sector ETFs:
  - `XLK`
  - `XLE`
- China/Asia ETFs:
  - `KWEB`
  - `CQQQ`
  - `FXI`
- Defensive/hedge ETFs:
  - `GLD`
  - `TLT`

Validation checklist:

- Extracted holdings count is plausible.
- Total known weight is near issuer-reported top holdings total.
- As-of date is stored.
- Source URL is stored.
- Holdings use normalized Yahoo-compatible symbols where possible.
- ETF holdings do not duplicate the same underlying on repeated extraction.
- Stale-data warning appears when data is old.
- Proposal evaluation can detect overlap:
  - direct `BABA` plus `KWEB`
  - direct `NVDA` plus `QQQ`
  - direct `XOM/CVX` plus `XLE`

Next tasks:

- Add issuer-specific adapters where generic AI extraction is unreliable.
- Add a human-readable ETF exposure review table.
- Add "Approve look-through" before writing or activating rows.
- Add look-through freshness badge on agent proposal cards.

## 5. Admin Data Management UI

Status: implemented as `/settings/data`, but review UX needs improvement.

Next tasks:

- Replace JSON-first review with structured cards/tables.
- Keep raw JSON behind an expandable "technical details" panel.
- Add clear action buttons for every completed job:
  - Create Source
  - Create Snapshot
  - Approve Snapshot
  - Reject
  - Re-run
- Add better empty/loading states.
- Add job detail drawer with warnings and extracted rows.
- Add visual distinction between:
  - candidate data
  - written data
  - active data
  - needs-review data

## 6. Agent Integration

Copycat agents:

- Status: initial implementation exists.
- Latest active `copycat_source_snapshot` can generate a proposal.
- Proposal should clearly show:
  - source name
  - report date
  - reporting lag
  - portfolio changes
  - tracking error warning

AI manager agents:

Status: partially implemented.

Next tasks:

- Add "Build from Snapshot" / "Sync Snapshot" success state after execution.
- Confirm copycat proposal execution creates holdings with correct base currency.
- Confirm copycat proposal execution can update existing holdings.
- Add "latest source snapshot" panel on copycat agent dashboard.
- Add copycat-specific publication readiness:
  - latest snapshot exists
  - latest snapshot total weight acceptable
  - snapshot report date not too stale
  - all holdings have symbols and quote availability
  - risk-approved copycat proposal exists
- Decide whether copycat public agents can bypass normal target-universe checks permanently, or only when holdings are snapshot-sourced.
- Add sync behavior when a new active snapshot is approved:
  - create proposal only
  - execute automatically only if system setting allows it

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

Follow-up:

- Use deterministic parser first for SEC XML.
- Use OpenAI only for:
  - source discovery
  - CUSIP/ticker reconciliation candidates
  - issuer pages that are not structured
  - warnings and explainability summaries
- Add low-confidence review queue for AI-matched symbols.
- Consider a lightweight external security master later.

## 8. Testing Plan

Manual tests:

- Copycat source discovery:
  - Berkshire / Warren Buffett
  - Pershing Square / Bill Ackman
  - ARK Invest
- Copycat snapshot extraction:
  - Berkshire SEC 13F XML
  - Pershing Square SEC 13F XML
  - one source with pasted holdings text
- Copycat agent workflow:
  - create copycat agent
  - build from snapshot
  - execute proposal
  - approve public readiness
  - upload/approve newer snapshot
  - sync snapshot into a new proposal
- ETF look-through:
  - `KWEB`
  - `CQQQ`
  - `QQQ`
  - `VOO`
  - `XLE`
  - `XLK`
- Overlap/risk:
  - direct `BABA` plus `KWEB`
  - direct `AAPL/MSFT/NVDA` plus `QQQ`
  - direct `XOM/CVX` plus `XLE`
- Multi-currency:
  - confirm USD base values remain correct if an ETF or holding has non-USD quote currency.

Automated checks:

- `npm run lint`
- `npm run build`

Database checks:

- `data_ingestion_jobs` row created for every ingestion attempt.
- `copycat_source_snapshots` and `copycat_source_holdings` are populated only after successful extraction.
- `instrument_exposures` upserts do not duplicate same instrument/underlying/as_of row.

## 9. Defer

- Fully automated crawling schedules for all source types.
- Paid data provider integrations.
- Broker-real execution.
- Public copycat marketplace ranking.
- Complex multi-source reconciliation.
- Full security master / issuer identifier database.

These should wait until the ingestion audit trail and admin review flow are stable.

## 10. Open Product Decisions

- Should copycat snapshots become active immediately after extraction, or only after explicit admin approval?
- For SEC 13F, should missing symbols be excluded, included as needs-review, or block publication?
- Should copycat public agents auto-sync immediately after a new snapshot is approved?
- How stale can a 13F snapshot be before public users see a warning or the agent stops accepting new follows?
- Should ETF look-through be required for publication when an agent owns ETFs above a threshold?
- Should all public agents require a minimum history window before marketplace exposure?
