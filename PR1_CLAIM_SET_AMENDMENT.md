# PR #1 Claim Set — Declared Architectural Deviation

**Status:** Approved by Architecture Review (2026-07-23)  
**Scope:** PR #1 — Finance First Decision Vertical Slice  
**Document type:** Scope Amendment (not a bug, not a regression — a declared deviation from the Engineering Execution Package)

---

## What Changed

The Engineering Execution Package approved a four-claim set for `approve_withdrawal`:

| # | Claim ID | Evaluation Function |
|---|----------|---------------------|
| 1 | `cashbox_sufficient` | `evaluateCashboxSufficiency` |
| 2 | `no_open_corrections` | `evaluateNoOpenCorrections` |
| 3 | `no_duplicate_candidates` | `evaluateNoDuplicateCandidates` ← **REMOVED** |
| 4 | `bank_reconciliation` | `evaluateBankReconciliation` |

**PR #1 ships with three claims.** `no_duplicate_candidates` has been removed.

---

## Reason for Removal

The RC3 data boundary rule prohibits Finance from reading `public.transactions` directly:

> Finance ONLY reads Financial Truth through RC3-sanctioned channels.  
> Finance NEVER reads `amount_eur`, `client_charge`, or `review_status` from `public.transactions` directly.  
> — `FINANCE_DATA_BOUNDARY_ADR.md`

Evaluating `no_duplicate_candidates` requires a per-partner count of rows where  
`review_status = 'duplicate_candidate'`. No RC3 view currently exposes this data.

The correct evaluation function (`evaluateNoDuplicateCandidates`) read directly from `public.transactions` — a violation caught during Architecture Review FAIL #2.

---

## Governance Basis

**Engineering Execution Package — Stop Condition:**

> A required Claim cannot be evaluated through approved data sources → the Claim is removed from the current slice and deferred to the next RC where the required view is available.

This Stop Condition was invoked. The removal is not a product decision — it is a boundary enforcement consequence.

---

## PR #1 Approved Claim Set

| # | Claim ID | Status (Jacob / July 2026) |
|---|----------|---------------------------|
| 1 | `cashbox_sufficient` | ✅ SUPPORTED — balance +€56,479.47 |
| 2 | `no_open_corrections` | ✅ SUPPORTED — no open cases |
| 3 | `bank_reconciliation` | ❌ UNSUPPORTED — no July 2026 bank import (expected demo state) |

**Decision: BLOCKED** — bank claim unsupported. Resolution: attach bank statement (~10 min).

---

## Impact Assessment

| Area | Impact |
|------|--------|
| RC3 boundary | ✅ None — no direct transactions read introduced |
| Decision logic | ✅ None — `allPass` gate and `logDecision` unchanged |
| Migration | ✅ Seeds 3 claim templates (not 4). Expected output updated |
| Tests | ✅ `jacobiClaims` fixture updated to 3 claims |
| `evaluateClaim.ts` | ✅ Function removed, dispatch entry removed, JSDoc updated |
| `FINANCE_DATA_BOUNDARY_ADR.md` | ✅ Removed accesses table added |

---

## Future Path

`no_duplicate_candidates` will be re-added in RC2, and only after:

1. RC3 team exposes a dedicated view — e.g., `v_partner_quality_flags` — that returns quality flags per partner without exposing raw transaction amounts.
2. `evaluateNoDuplicateCandidates` is rewritten to read from that view.
3. The claim template is added back to the migration seed.
4. Tests are updated to cover the new evaluation path.

No direct `public.transactions` dependency may be introduced for this claim at any future point.

---

## Audit Trail

| Event | Date | Authority |
|-------|------|-----------|
| Engineering Execution Package approved (4 claims) | 2026-07-23 | Architecture Review |
| Boundary violation caught (direct transactions read) | 2026-07-23 | Architecture Review FAIL #2 |
| Stop Condition invoked — claim removed from PR #1 | 2026-07-23 | Architecture Review |
| Amendment declared and approved | 2026-07-23 | Yossi (Pre-Review PASS verdict) |
