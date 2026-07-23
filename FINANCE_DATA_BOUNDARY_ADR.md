# FINANCE DATA BOUNDARY ADR
## Finance Module — Permitted Data Sources

**Status:** Approved  
**Date:** 2026-07-23  
**Author:** Architecture Review  
**Constitutional level:** Operational rule (below constitutional ADRs, above engineering decisions)

---

## Decision

The Finance module defines two categories of data access, with different rules for each.

---

## Category 1: Financial Truth

**Definition:** Any data that answers "how much money moved, to whom, from whom, and when."

**Examples:**
- Transaction amounts (`amount_eur`)
- Client charges (`client_charge`)
- Cashbox balances (derived from transaction sums)
- Partner capital positions
- Revenue, expenses, net results

**Rule:** Finance ONLY reads Financial Truth through RC3-sanctioned channels:
- `v_cashbox_audit` — canonical partner balances (authorized read)
- `finance.evidence_links` — Finance-owned evidence registry
- Future: RC3 reporting views when they expose partner-level data

**Finance NEVER:**
- Reads `amount_eur` or `client_charge` directly from `public.transactions`
- Computes its own balance from raw transaction rows
- Duplicates RC3 accounting logic

---

## Category 2: Operational Metadata

**Definition:** Flags and states that describe the *quality and completeness* of the data — not the financial values themselves.

**Examples:**
- `review_status` — is this transaction flagged for review?
- `statement_events.event_type` — is there an open correction case?
- Duplicate candidate counts
- Reconciliation state flags

**Rule:** Finance MAY read Operational Metadata directly from its source, subject to:
1. The access is **read-only** (`SELECT`, `COUNT` — no `INSERT`, `UPDATE`, `DELETE`)
2. The access is **metadata-only** — no financial amounts are read
3. The query is **Evidence for a Claim** — not a financial computation
4. The access pattern is **documented** in the Claim's `evidence_types`

**Permitted current accesses:**
| Source | Schema | Access | Claim | Justification |
|--------|--------|--------|-------|---------------|
| `v_cashbox_audit` | public | SELECT balance | cashbox_sufficient | Canonical balance view — Financial Truth via authorized view |
| `statement_events` | statements | SELECT event_type | no_open_corrections | Correction state flag — Operational Metadata |
| `evidence_links` | finance | SELECT all | bank_reconciliation | Finance-owned |

**Removed accesses (Stop Conditions):**
| Source | Claim | Reason Removed | RC target |
|--------|-------|---------------|-----------|
| `public.transactions` | no_duplicate_candidates | RC3 boundary violation — no RC3 view exposes `review_status` quality flags per partner. Direct `transactions` read forbidden regardless of metadata-only intent. | RC2: add `v_partner_quality_flags` view, then re-enable claim |

---

## Boundary Enforcement

Finance code must never read these fields from `public.transactions`:
- `amount_eur`
- `client_charge`
- `payer` / `payee` (for financial computation — only for metadata filtering)
- Any calculated financial value

If Finance ever needs a financial value from transactions, it must:
1. Request that RC3 expose it via a dedicated view
2. Read from that view — not from the table directly

---

## Rationale

RC3 is the authoritative accounting engine. If Finance reads raw transaction amounts, it becomes a second accounting engine — inconsistencies become possible, and the "single source of truth" guarantee breaks.

Operational Metadata reads are permitted because they query *about* the data (is it clean? is it flagged?) without computing financial results from it. A `COUNT(*)` of `review_status = 'duplicate_candidate'` tells Finance "this partner has open quality issues" — it does not tell Finance what those issues cost.

---

---

## DecisionExplanation Model Declaration (Gap 4 — explicit)

**Chosen model: Model A — Deterministic Computed Projection**

`DecisionExplanation` is **never stored** independently. It is always derived on demand from already-computed engine output or from a frozen historical snapshot.

| Property | Value |
|----------|-------|
| Stored? | No |
| Source | Derived from `DecisionEvaluation` + `FinancialPosition` (live), or from `SnapshotEvidenceChain` (historical) |
| Function | `buildDecisionExplanation()` — pure, no DB reads, no side effects |
| Reconstruction | `buildExplanationFromSnapshot()` — reconstructs from `decision_log.evidence_chain` JSONB |
| Determinism | Same input → same output. Always. |
| Versioning | The narrative text is derived from the claim statements and balance at call time. If claim statement text is changed in `claim_templates`, historical reconstructions will use the stored `ClaimEvaluation.statement` (which was frozen in the snapshot), not the updated template. |

**Why Model A (not Model B):**

Model B (storing the rendered explanation) would create a second source of truth for what was communicated. `decision_log.evidence_chain` already contains the frozen `positionSnapshot` and `ClaimEvaluation[]`. The explanation can always be reconstructed from this data. Storing the rendered text would add fragility (two records that must agree) without adding auditability.

**Consequence:** `buildDecisionExplanation` and `buildExplanationFromSnapshot` must remain pure functions. Neither may read from the DB. Neither may produce different output for identical inputs.

---

## Future

When Finance needs richer data for Claims (e.g., "no large unreconciled transactions"), the correct path is:
1. Define the claim in this ADR
2. Ask RC3 team to expose a dedicated view
3. Finance reads from the view

This keeps the boundary explicit and the accounting engine centralized.
