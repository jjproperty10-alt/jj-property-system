# M8 Investment Lifecycle — Final Delivery Report
**JJ Property 10 · Delivered 2026-07-13**

---

## Delivery Status: ✅ COMPLETE

All gates cleared. All migrations applied. All views live. All golden cases + regression tests documented.

---

## 1. What Was Delivered

### Architecture Documents (constitutional layer)

| Document | Status | What it contains |
|---|---|---|
| `ADR_M8_INVESTMENT_LIFECYCLE.md` | ✅ Final | 9 ADR principles (P1–P9). Investment Event model. Seven Economic Primitives. ClientCharge formula. Partner Capital Rule. Void-and-replace immutability. |
| `M8_EVENT_TYPE_AUDIT.md` | ✅ Final (Gate B7 PASS) | Constitutional event type map. All 6 OQ resolutions locked. 7 primitives × lifecycle/accounting/capital/ownership/CC/margin/partner-visible matrix. |
| `M8_BUSINESS_DECISION_WORKSHEET.md` | ✅ Final | All facts for Villa Mazotos (Avi) + Villa Mazotos 2 (Oren). Zero hard blockers. |
| `M8_B0_DELIVERY_PACKAGE.md` | ✅ Final | Full business decision package. Confirmed facts F1–F29. All blockers B1–B7 cleared. |
| `GOLDEN_CASES_BUSINESS_NARRATIVES.md` | ✅ v3.0 | 20 golden cases (G1–G20). 24 architectural invariants. G1–G6: Settlement Engine. G7–G14: Investment Lifecycle. G15–G20: OQ-1 through OQ-6 resolutions. |
| `regression_dataset_v1.json` | ✅ v1.3 | 28 validation rules. 15 lifecycle test cases (G7–G20 + G9b). All OQ resolutions encoded as runnable test assertions. |

### Database Migrations Applied

| Migration | Version | Status |
|---|---|---|
| `m8_lifecycle_001_schema` | 20260713122206 | ✅ Applied |
| `m8_lifecycle_002_rls_and_views` | 20260713122341 | ✅ Applied |

### Schema Created: `lifecycle`

**Tables (7):**

| Table | Purpose | Key fields |
|---|---|---|
| `lifecycle.entity_identity` | Canonical partner registry | canonical_name, aliases, entity_type |
| `lifecycle.business_source` | Evidence registry | source_type, description, source_date |
| `lifecycle.property_acquisition` | Acquisition event per property | jj_purchase_price_eur *(internal)*, jj_total_cost_eur *(internal)* |
| `lifecycle.partner_entry` | Partner entry per (property, partner) | agreed_entry_valuation_eur, required_entry_capital_eur, jj_cost_basis_eur *(internal)*, jj_margin_from_entry_eur *(internal)* |
| `lifecycle.capital_event` | Unified capital ledger | event_subtype (13 types), direction, amount_eur, payer_name, payee_name |
| `lifecycle.ownership_period` | Time-boxed ownership % | ownership_pct, effective_from, effective_to |
| `lifecycle.property_disposition` | Sale / transfer events | disposition_type (sale/external_transfer/internal_buyout) |

**Views (3):**

| View | Audience | Contains JJ margins? |
|---|---|---|
| `lifecycle.v_partner_investment_statement` | Partner-facing | ❌ Never |
| `lifecycle.v_lifecycle_active_events` | JJ admin | ❌ No margin fields (metadata only) |
| `lifecycle.v_jj_lifecycle_internal` | JJ internal only | ✅ Yes — NEVER expose to partners |

**Indexes:** 23 (covering all foreign keys, status filters, date ranges, active-event lookups)

**RLS:** Enabled on all 7 tables, 0 policies (deny-all baseline). Service role bypasses.

**Seed data:** 7 entities (JJ, Yossi, Jacob, Avi, Oren, Anastasia, Fabi).

**Zero impact on:** `public.transactions` (2,154 rows unchanged), any existing engine, views, or RLS policies.

**Rollback:** `DROP SCHEMA lifecycle CASCADE;`

---

## 2. Confirmed Business Facts Locked In This Milestone

### Villa Mazotos — Avi (G7, G8, G11, G13)

| Fact | Value | Source |
|---|---|---|
| Purchase price | €400,000 | Confirmed by Yossi |
| Avi entry valuation | €500,000 | Confirmed by Yossi |
| Avi ownership | 50% | Confirmed |
| Required entry capital | €250,000 | = €500K × 50% |
| Capital paid | €250,000 | €200K to seller + €50K to Yossi (corrected from legacy €30K) |
| Capital remaining | €0 | Fully paid |
| JJ cost basis for Avi's 50% | €200,000 | = €400K × 50% — internal only |
| JJ margin from Avi entry | €50,000 | = €250K − €200K — NEVER shown to Avi |
| Inception model | from_acquisition_inception | Avi co-owned from day 1 |

### Villa Mazotos 2 — Oren (G14)

| Fact | Value | Source |
|---|---|---|
| Purchase price | €400,000 (in progress) | Confirmed by Yossi |
| Oren entry valuation | €520,000 | Confirmed by Yossi |
| Oren ownership | 35% | Confirmed |
| Required entry capital | €182,000 | = €520K × 35% |
| Capital paid | UNKNOWN | Must return null — not inferred |
| JJ cost basis for Oren's 35% | €140,000 | = €400K × 35% — internal only |
| JJ margin from Oren entry | €42,000 | = €182K − €140K — NEVER shown to Oren |
| Inception model | from_acquisition_inception | Oren co-owned from day 1 |

---

## 3. Seven Economic Primitives (Locked)

| # | Primitive | Changes Capital? | P&L? | Ownership Change? |
|---|---|---|---|---|
| 1 | Capital Event | ✅ | ❌ | ❌ |
| 2 | Expense | ❌ | ✅ | ❌ |
| 3 | Income | ❌ | ✅ | ❌ |
| 4 | ClientCharge | ❌ | ✅ | ❌ |
| 5 | Ownership Event | ❌ | ❌ | ✅ |
| 6 | Settlement Event | ❌ | ❌ | ❌ (computed) |
| 7 | Distribution/Payment Event | ✅ | ❌ | ❌ |

**ClientCharge formula (locked):**
- `owner_charge = CC × ownershipPct`
- `owner_cost_share = actual_cost × ownershipPct`
- `jj_margin = (CC − actual_cost) × ownershipPct` — **internal only**
- JJ does not invoice itself

---

## 4. OQ Resolutions (All Locked)

| OQ | Topic | Resolution |
|---|---|---|
| OQ-1 | Vacancy costs | Treated as property costs; owners pay per %; JJ does not absorb |
| OQ-2 | LTR management fee | Same Billable Event model as Renovation/Airbnb |
| OQ-3 | Refinance | capital_event only; no new ownership_period unless ownership actually changes |
| OQ-4 | Capital call | Unified capital_event ledger; 13 distinct subtypes |
| OQ-5 | Distribution vs Payment | Settlement (owed) ≠ Distribution Payment (paid); partial payments supported |
| OQ-6 | Partner buyout | external_transfer (no JJ capital_event) vs internal_buyout (JJ capital_event) |

---

## 5. Smoke Test Results (E2E Verification)

Confirmed business facts (Avi / Villa Mazotos) seeded into lifecycle schema in a rolled-back transaction and read back through `v_partner_investment_statement`:

| Field | Expected | Actual |
|---|---|---|
| agreed_entry_valuation_eur | 500,000 | ✅ 500,000.00 |
| required_entry_capital_eur | 250,000 | ✅ 250,000.00 |
| capital_paid_eur | 250,000 | ✅ 250,000.00 (200K + 50K, corrected) |
| capital_remaining_eur | 0 | ✅ 0 |
| inception_model | from_acquisition_inception | ✅ |
| current_ownership_from | 2020-01-01 | ✅ |
| jj_* fields in partner view | absent | ✅ absent |

---

## 6. Architecture Principles (ADR — Final)

| # | Principle | Core rule |
|---|---|---|
| P1 | Ownership is partnership-level | Ownership % lives in `partnership_ownership`, not computed per-transaction |
| P2 | Immutable history | No DELETE on confirmed events; void-and-replace only |
| P3 | Separation of concerns | Settlement Engine, Portfolio Engine, Reporting Engine are independent layers |
| P4 | Partner Capital Rule | Yossi ≠ Jacob ≠ JJ; payer/payee identity preserved in every import/migration |
| P5 | Confirmed facts only | Unknown values return null, not zero; no inference without Yossi confirmation |
| P6 | ClientCharge formula | owner_charge = CC × pct; jj_margin = (CC−cost) × pct; internal only |
| P7 | Ownership → Investment Events | Ownership is allocated to Investment Events, never directly to accounting rows |
| P8 | Capital ≠ P&L | Capital Events change investment position; they do not flow through P&L |
| P9 | One canonical event | One economic movement → one canonical event → many read-only projections |

---

## 7. GitHub PR Plan

The lifecycle schema is additive and fully isolated. No existing migrations or code are modified.

| PR | Branch | Content | Risk |
|---|---|---|---|
| PR A | `m8/architecture-docs` | ADR, Event Type Audit, Golden Cases, Regression Dataset, Delivery Package, Worksheet | Zero — documentation only |
| PR B | `m8/lifecycle-schema` | `m8_lifecycle_001_schema.sql` — 7 tables, 23 indexes, seed | Zero — new schema, no existing FK |
| PR C | `m8/lifecycle-views-rls` | `m8_lifecycle_002_rls_and_views.sql` — 3 views + RLS | Zero — read-only views, RLS additive |
| PR D | Future | Backfill mapping: existing `public.transactions` rows → `capital_event` canonical events | Review required |

> **Note:** PRs A–C are already applied to the database (migrations registered). The `.sql` files are in `C:\Users\yossi\OneDrive\Desktop\BI\JJ\`. Git push requires local execution — sandbox is internet-blocked.

---

## 8. What Is NOT In This Delivery (RC2+ Scope)

Per the Freeze declared 2026-07-06 and the RC1/RC2 split decision:

- Cross-property settlement engine
- Automated backfill of `public.transactions` rows → `capital_event`
- `contact_opening_balances` table (blocked on Task 4 G1–G5)
- Persistent `accounting_alerts` table + alert workflow
- btree_gist overlap constraint on `ownership_period`
- Partner portal integration (API endpoints pointing to lifecycle views)

---

## 9. Immutability Reminder

**Never DELETE from lifecycle tables once a row is confirmed.**

Correction pattern:
```sql
-- Step 1: void the incorrect event
UPDATE lifecycle.capital_event
SET status = 'void', updated_at = now()
WHERE id = '<wrong_event_id>';

-- Step 2: insert replacement linked to voided event
INSERT INTO lifecycle.capital_event (..., supersedes_event_id, ...)
VALUES (..., '<wrong_event_id>', ...);
```

---

## 10. Verification Queries

```sql
-- Schema exists and has 7 tables
SELECT tablename FROM pg_tables WHERE schemaname = 'lifecycle' ORDER BY tablename;

-- RLS enabled on all 7, 0 policies
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'lifecycle';
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'lifecycle'; -- must be 0

-- Views exist
SELECT viewname FROM pg_views WHERE schemaname = 'lifecycle';

-- Seed data
SELECT canonical_name, entity_type FROM lifecycle.entity_identity ORDER BY canonical_name;

-- Migrations registered
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE name LIKE 'm8_lifecycle%' ORDER BY version;

-- public.transactions untouched
SELECT COUNT(*) FROM public.transactions; -- expect 2,154
```

---

*M8 Investment Lifecycle — delivered 2026-07-13*
*Total migrations applied this milestone: 2 (001_schema + 002_rls_and_views)*
*All OQ resolutions locked. All gates cleared. All golden cases documented. Schema live.*
