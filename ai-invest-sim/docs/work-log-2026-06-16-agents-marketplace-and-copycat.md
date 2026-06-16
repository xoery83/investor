# Work Log - 2026-06-16 - Agents Marketplace, Copycat Sync, and Performance Display

## Summary

Today focused on marketplace structure, copycat ingestion reliability, and making public-facing performance metrics less misleading. The main product direction is now clearer: public agents should be browsable like an investable marketplace, while copycat agents need a deterministic data pipeline before they are safe to publish.

## Agents Marketplace

- Reworked the Agents page into two primary tabs:
  - Public
  - My Agents
- Public agents are now grouped by source/type:
  - Public admin copycat agents
  - Public admin non-copycat AI agents
  - Public user agents
- My Agents now focuses only on agents owned by the logged-in user.
- Added search, sorting, and advanced filters.
- Supported marketplace sorting by:
  - since-inception return
  - annualized return
  - newest created
  - follower count
  - Agent ETF capital
- Agent cards now highlight:
  - since-inception return
  - annualized return status
  - current value
  - follower count
  - Agent ETF capital
  - risk level
  - rebalance frequency
- Added visual category distinctions:
  - copycat
  - admin AI
  - user agent

## Annualized Return Display

- Changed the default Agents page sorting from annualized return to since-inception return.
- Added guardrails for annualized return display:
  - fewer than 30 days: display `Too early`
  - 30 to 90 days: display `Annualized (prov.)`
  - 90+ days: display normal annualized return
- Annualized-return sorting now pushes agents with insufficient history behind agents with usable history.
- This avoids newly created agents showing misleading extreme annualized figures caused by short-duration CAGR math.

## System Agent Type

- Removed `system` from new create/update UI paths.
- Agents with legacy `visibility = system` are hidden from the Agents page for now.
- Existing database support remains in place for backward compatibility.
- Recommended future cleanup:
  - migrate old `system` visibility agents to either `private` or admin-owned `public`
  - remove `system` from TypeScript types and database checks in a dedicated migration

## Copycat Data Ingestion

- Added and refined admin data ingestion tools for copycat workflows.
- Improved SEC 13F snapshot extraction behavior:
  - deterministic XML parsing for SEC information table XML
  - AI ticker matching remains available when XML contains issuer names/CUSIPs but no ticker symbols
  - snapshot extraction can write copycat source snapshots and holdings
- Added manual latest SEC 13F discovery/extraction flow for copycat sources.
- Improved copycat proposal generation from latest active snapshots.
- Copycat snapshot proposals can now drive initial portfolio construction more directly.

## Known Issues / Follow-Up

- Some SEC filing discovery still needs hardening:
  - SEC filing index pages often point to a primary cover document, while holdings are in a separate filing/detail link.
  - Latest snapshot discovery should inspect filing directory metadata and prefer XML files containing `infoTable` rows.
- Some 13F XML variants still parse incomplete holdings or require more robust namespace/tag handling.
- Copycat publication readiness should treat snapshot-backed holdings differently from normal AI-manager investment-universe checks.
- Copycat agents need a clearer admin workflow:
  - find latest source filing
  - extract snapshot
  - review snapshot
  - sync/build proposal
  - approve and execute
  - publish if readiness checks pass
- ETF look-through ingestion still needs more manual testing and UI polish.
- Marketplace performance needs richer ranking metrics beyond raw return:
  - max drawdown
  - volatility
  - history coverage
  - capital-weighted follower confidence
  - return consistency

## Verification

- `npm run lint`
- `npm run build`

