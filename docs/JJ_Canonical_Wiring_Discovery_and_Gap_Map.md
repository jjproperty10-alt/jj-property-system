# JJ Canonical Wiring — Discovery & Gap Map (Phase 1 + Gap Analysis)

**Agent:** JJ Canonical Identity / Wiring Agent
**Date:** 2026-08-16
**Method:** read-only inspection of live DB (`vsiiprzjrstjcmjpwcrd`) + current `jj-property-system` main.
**Principle applied:** prefer existing architecture; never invent financial semantics; never mock.

> Headline: the system is **much more built than the acceptance-gate framing assumes.** STR reservations, platform revenue, occupancy, ADR, Revenue Intelligence, and Owner financial position are all backed by real, canonical, persisted sources. The **one true blocker** is company-level **money-owed / money-due (receivableToJJ / payableByJJ)** — there is **no certified source** for it, and I will not invent the semantics. Everything else is wiring/surfacing, not new business logic.

---

## A. FINAL ACCEPTANCE GATE — evidence-backed status

| # | Gate | Status | Authoritative source (evidence) |
|---|------|--------|----------------------------------|
| 1 | Control Room `receivableToJJ` LIVE | ❌ **MISSING / BLOCKED** | No certified source. `v_open_balances` (referenced by `open-balances/page.tsx`) **does not exist in the DB** → that page renders empty. `executiveBriefService` deliberately omits receivable/payable (author declined to define the semantic without approval). Per-property `v_client_property_ledger.client_balance_to_jj` exists but rolling it into a company receivable is a **business-semantic decision** (see §C-1). |
| 2 | Control Room `payableByJJ` LIVE | ❌ **MISSING / BLOCKED** | Same as #1. Owner credit exists per-property (`owner_balance`, `certified_str_owner_entitlement`) but "payable" requires the settlement model to define it — not to be inferred. |
| 3 | Owner financial position real | ✅ **LIVE** | `ownerFinancialAdapter.fetchOwnerFinancial` → RC3 engine (`fetchRC3Report` per property) → `computeNetOwnerBalance`. Canonical, keyed on resolver's verified property names. |
| 4 | Owner actual payments/transfers LIVE | ✅ **LIVE** | RC3 BPO (`total_bpo` / `paidToOwnerEur`) and `v_client_property_ledger.paid_to_owner`. |
| 5 | STR reservations LIVE | ✅ **LIVE** | `pms.canonical_reservations` (666 rows), `pms.raw_reservations` (1744). |
| 6 | STR platform revenue LIVE | ✅ **LIVE** | `pms.reservation_financial_snapshots` (28), `v_client_property_ledger.certified_str_*`. |
| 7 | STR occupancy LIVE or UNKNOWN | ✅ **LIVE** | `revintel.reservation_metrics.occupancy_pct` (120 rows, per property/horizon) + `revintel.v_portfolio_summary.occ_30d`. |
| 8 | ADR LIVE or UNKNOWN | ✅ **LIVE** | `revintel.reservation_metrics.adr` + `revintel.v_portfolio_summary.adr_30d`. |
| 9 | Reconciliation alerts LIVE | ⚠️ **PARTIAL** | Real signals exist (`pms.sync_errors` 17, hostaway-audit adapters, `revintel.*.stale_warning`). But `public.alerts` is **empty (0 rows) and non-canonical** (no owner scope, no severity/category). No normalized attention model yet (§C-2). |
| 10 | LTR obligations LIVE | ⚠️ **PARTIAL (data-empty)** | Schema fully built (`lifecycle.rent_obligations`, `rent_terms`, `rental_contracts`, `tenant_charge_obligations`, `management_fee_obligations`, `brokerage_obligations`). But data is nearly empty: **1 rental contract, 0 rent obligations, 0 tenant charges, 0 mgmt-fee obligations.** Wiring is fine; the business simply hasn't populated LTR yet. |
| 11 | Owner report lifecycle LIVE or PARTIAL | ⚠️ **PARTIAL** | `statements` schema (9 tables) + `public.get_owner_statement_snapshots(party_id)` + `lifecycle.create_closing_statement` exist and are party-keyed. Snapshot/lifecycle plumbing present; `lifecycle.tenant_closing_statements` = 0 rows. Status derivation exists but should be surfaced as one canonical contract. |
| 12 | Revenue Intelligence LIVE or empty | ✅ **LIVE** | `revintel.recommendation` (40 rows, 9 current), 39/40 canonical-property-scoped; `revintel.v_portfolio_summary`, `price_position`, `market_observation`, `comparable_set`. **Wired this pass** (`revenueIntelligenceService.ts`). |
| 13 | All records canonical owner/property scoped | ✅ **LIVE** | Canonical identity layer complete (Owner Room switch merged/deployed; `registry.parties` + `property_definitions.property_id` authorities). RI/STR/owner paths key on canonical ids/names. |
| 14 | No demo numbers in production contracts | ✅ (for wired paths) | RI service returns real rows or `[]`. Owner/STR paths read certified engines. `open-balances` page is empty (broken view), not demo. |

**Net:** 7 LIVE, 4 PARTIAL, 2 BLOCKED (money-owed/due), plus 1 broken-wiring defect (`v_open_balances`).

---

## B. Canonical source map (by domain)

**STR / PMS (Agent 2 territory — do not modify internals):** `pms.canonical_reservations`, `pms.reservation_financial_snapshots`, `pms.property_mappings` (→ `property_definitions.property_id`, 8/8 canonical-verified), `pms.sync_errors`, `pms.connections`. STR occupancy/ADR/pace: `revintel.reservation_metrics`, `revintel.v_portfolio_summary`.

**Owner financial (Agent 1 territory — do not modify report logic):** `ownerFinancialAdapter` → RC3 (`v_rc3_*`, `computeNetOwnerBalance`); `v_client_property_ledger` (per-property owner ledger incl. `client_balance_to_jj`, `paid_to_owner`, `certified_str_*`); `ownerLtrStatementAdapter`, `ownerStrCockpit`, `ownerReservationAdapter`.

**Reports:** `statements.*` (9 tables), `public.get_owner_statement_snapshots(party_id)`, `lifecycle.create_closing_statement` / `get_closing_statement`, `lifecycle.v_tenant_closing_position`.

**Revenue Intelligence:** `revintel.*` (recommendation, reservation_metrics, price_position, market_observation, comparable_set, listing_audit, photo_audit, v_portfolio_summary, v_market_freshness).

**Identity (Agent 3 — mine, done):** `registry.parties`, `registry.external_identities`, `public.resolve_party_id`, `public.resolve_property_canonical` / `resolve_party_canonical`, `identityResolverService`.

**Control Room / CEO:** `executiveBriefService` (verification tasks + cashbox monitor + PMS status) — narrow by design; NOT a full control-room summary. `(app)/ceo`, `(app)/page.tsx` dashboard.

---

## C. The real gaps (what actually needs a decision or build)

### C-1. Company-level money-owed / money-due — **DECISION REQUIRED (blocks gates #1, #2)**
There is no certified single source for "who owes JJ" / "JJ owes whom" at the company level:
- `v_open_balances` — **referenced by the UI but absent from the DB** (the Open Balances screen is dead). Either it was dropped, or never shipped to this project.
- `v_client_property_ledger` gives per-property `client_balance_to_jj` (mixes sale_receivable, reno_receivable, owner_balance, airbnb_owner_balance) — but collapsing these into company **receivable vs payable**, with counterparty attribution and aging, is a **business-semantic definition**, not a mechanical rollup.
- The mission forbids inferring receivables from expected profit and payables from inferred owner entitlement "unless the existing settlement model defines it as payable."

**I did not invent this.** To wire gates #1/#2 I need ChatGPT/Yossi to ratify ONE of:
- (a) restore/define the certified `v_open_balances` (or an equivalent `v_money_position`) with explicit balance_type → {receivable_to_jj | payable_by_jj} classification and counterparty, OR
- (b) point me at the authoritative settlement view that already defines company payables/receivables (candidates seen but unconfirmed as authoritative: `v_counterparty_position` 51 cols, `v_owner_balances`, `v_entity_settlement`, `v_partner_settlement`).

Once the certified source/semantic is named, the canonical `getMoneyPosition()` service is a thin, safe wrap (with drill-down source refs).

### C-2. Normalized attention/alert model — **BUILD (contract) + wire real signals**
`public.alerts` is empty and non-canonical. Real alert signals already exist (pms.sync_errors, revintel stale_warning, verification_tasks, reconciliation gaps). The normalized model (id, canonicalOwnerId?, canonicalPropertyId?, category, severity, businessTitle, source, sourceReference, actionType…) can be defined and populated from those sources — additive, no business-truth change. Low risk once the source list is approved.

### C-3. Canonical UI service contracts — **surface, don't rebuild**
`getOwnerWorkspace` largely exists (`ownerWorkspaceService`, 28KB). A single `getControlRoomSummary` does not (executiveBrief is narrower). Building it = composing existing certified adapters (STR from revintel/pms, RI from the new service, owner counts from identity, money from C-1 once defined). Blocked only by C-1 for the cash section.

---

## D. Delivered this pass (safe, additive, real-data)

`src/lib/revintel/revenueIntelligenceService.ts` — `getRevenueRecommendations({currentOnly, canonicalPropertyId})`:
- reads `revintel.recommendation` via service client (RLS deny-all; server-only),
- canonical-property-scoped (drops the 1 non-property row),
- maps to a clean contract (recommendationId, canonicalPropertyId, period, type, headline, recommendation, reason, evidence, confidence, isAi, status ∈ NEW/REVIEWED/APPROVED/REJECTED/EXPIRED, createdAt, reviewedAt),
- returns real rows or `[]` — **never mock**; never writes; approval ≠ price change.

---

## E. Recommended safe wiring sequence (smallest-first)

1. **[DECISION]** Ratify the certified money-owed/due source/semantic (C-1). ← unblocks Control Room cash.
2. `getMoneyPosition()` canonical service over the ratified source (receivable/payable + counterparty + drill-down refs).
3. `getControlRoomSummary(period)` composing: portfolio counts (identity) + STR (revintel.v_portfolio_summary + reservation_metrics) + RI (this pass) + cash (step 2) + attention (step 5).
4. Extend/confirm `getOwnerWorkspace(ownerId, period)` to include RI (owner-scoped) + report lifecycle status.
5. Normalized attention model (C-2) over existing real signals.
6. Drill-down source refs on each aggregate (IDs already available in the underlying views).
7. Tests: owner isolation, canonical scope, RI empty/live, money receivable-vs-payable semantics (after C-1), STR occupancy/ADR from revintel, report status.

---

## F. Decisions needed from Yossi / ChatGPT (business/architecture authority)

1. **Money-owed/due certified source (C-1)** — the only hard blocker. Name the authoritative view/semantic (restore `v_open_balances`, or designate `v_counterparty_position`/settlement view). I will not invent it.
2. **`v_open_balances` defect** — confirm it should be restored/rebuilt vs. the Open Balances page retired. (It's currently a dead UI pointing at a missing view.)
3. **Attention model scope (C-2)** — approve the signal sources to normalize (pms.sync_errors, revintel stale_warning, verification_tasks, reconciliation gaps, LTR arrears once populated).

No financial truth was changed. No PMS/STR internals, report formulas, or `transactions.property_id` were touched. Nothing was mocked.
