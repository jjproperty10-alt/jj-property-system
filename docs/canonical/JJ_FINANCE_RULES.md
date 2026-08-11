# JJ_FINANCE_RULES — The One Rules File (Canonical)

> **Status:** DRAFT skeleton (Phase 1.5). This is the SINGLE authority every Skill/subagent reads. No agent redefines a rule here (ADR-001).
> **Reconciliation pending:** merge of `BUSINESS_RULES.md` + CLAUDE.md §4 + `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md` + `docs/ACCOUNTING_RULES.md` + `docs/HISTORICAL_BUSINESS_RULES_V1.md`. Any wording conflict between sources → `JJ_OPEN_QUESTIONS.md` (not merged here).

## Iron rules (each points to full authority)
1. **No physical deletion.** Duplicates → `review_status='confirmed_duplicate'`, never DELETE. (CLAUDE.md §14)
2. **Payer identity preserved.** Yossi ≠ Jacob ≠ JJ; never normalize partner payments. (P-ARCH-2)
3. **Contract ≠ Payment.** `Purchase Contract` / `Sale Contract` subcategories = deal value only, excluded from cash flow. (CLAUDE.md §4)
4. **Internal Offset ≠ Duplicate** — 3 patterns: JJ Internal Settlement · External Personal Payment (Yossi/Jacob received personally) · True Duplicate (needs factual proof). Keep payer/payee as recorded. (CLAUDE.md §4)
5. **Airbnb Platform Income = net to owner.** Airbnb `Management Fee` / `Cleaning` rows are platform-tracking only — never deducted again. (CLAUDE.md §4)
6. **Purchase Capital lifecycle-dependent** — deposit treatment depends on whether the deal reached transfer/sale, not on property type alone. (SA-016)
7. **Owner-facing amount = `COALESCE(client_charge, amount_eur)`** (P-LEDGER-6). Cash position uses `amount_eur` (P-LEDGER-1).
8. **Transfer ≠ economic event** — `category='Transfer'` changes custody/location only, never income/expense. (P-LEDGER-5)

## Ledger constitution (P-LEDGER)
1 Three-Layer Settlement (Cash / Economic / Counterparty) · 2 Ledger Qualification (PASS 0 + 1.25) · 3 Investigation Entry Condition · 4 Settlement Availability · 5 Transfer ≠ Economic · 6 Owner-Facing Amount Basis. Full text: `docs/governance/JJ_LEDGER_CONSTITUTION.md` (Git authority; promoted faithfully from CLAUDE.md §13.17, origin `AV005_LEDGER.md`). ⚠️ **CLAUDE Dependency Gate remains ACTIVE:** §13.17/P-LEDGER is now Git-backed, but §4 + §14 are still referenced — see `JJ_OPEN_QUESTIONS.md`.

## Business Governance D2–D11
Locked. Source: `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md` (v1.2). Mandatory reading before any partner-balance / income-allocation / settlement work.

## Scope for reporting (RULE — current counts/totals live only in JJ_CURRENT_STATE)
- **Operational baseline** = `review_status = 'active' OR NULL`.
- **Audit baseline** = all preserved rows including `confirmed_duplicate`. **Never present the audit baseline as operational.**
- **Client-charge scope** follows the approved reporting rule (owner-facing = `COALESCE(client_charge, amount_eur)`, P-LEDGER-6).
- Current counts / amounts / client-charge totals → **`JJ_CURRENT_STATE.md`** (a DB change must never make this file stale).
