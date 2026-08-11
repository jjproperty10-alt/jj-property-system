# JJ_FINANCE_RULES — The One Rules File (Canonical)

> **Status:** DRAFT skeleton (Phase 1.5). This is the SINGLE authority every Skill/subagent reads. No agent redefines a rule here (ADR-001).
> **Reconciled (Phase 2B):** current business/accounting authority promoted to Git — `docs/governance/JJ_ACCOUNTING_RULES.md` (summary, from legacy ACCOUNTING_RULES.md) + `docs/governance/JJ_BUSINESS_RULE_BOOK.md` (detailed, from legacy BUSINESS_RULES.md). Business Governance: `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md`. Historical interpretation: legacy `HISTORICAL_BUSINESS_RULES_V1.md` (provenance only — NOT current; not promoted). Wording conflicts → `JJ_OPEN_QUESTIONS.md`.

## Iron rules (each points to full authority)
1. **No physical deletion.** Duplicates → `review_status='confirmed_duplicate'`, never DELETE. (`JJ_ACCOUNTING_RULES.md` — review_status / no-delete)
2. **Payer identity preserved.** Yossi ≠ Jacob ≠ JJ; never normalize partner payments. (P-ARCH-2)
3. **Contract ≠ Payment.** `Purchase Contract` / `Sale Contract` subcategories = deal value only, excluded from cash flow. (`JJ_ACCOUNTING_RULES.md` / `JJ_BUSINESS_RULE_BOOK.md`)
4. **Internal Offset ≠ Duplicate** — 3 patterns: JJ Internal Settlement · External Personal Payment (Yossi/Jacob received personally) · True Duplicate (needs factual proof). Keep payer/payee as recorded. (`JJ_ACCOUNTING_RULES.md` / `JJ_BUSINESS_RULE_BOOK.md`)
5. **Airbnb Platform Income = net to owner.** Platform `Management Fee`/`Cleaning` rows **with `payer=Airbnb`** = platform-tracking, **zero** balance effect (already netted). ⚠️ **`Management Fee` with `payer≠Airbnb` = real JJ income** (reduces owner credit) — never flatten to "tracking only". Always read **`category` + `subcategory` together** (`Airbnb→Cleaning` ≠ `Management→Cleaning`). (`JJ_ACCOUNTING_RULES.md` / `JJ_BUSINESS_RULE_BOOK.md` BR-1.2/1.3/2.5)
6. **Purchase Capital lifecycle-dependent** — deposit treatment depends on whether the deal reached transfer/sale, not on property type alone. (SA-016)
7. **Owner-facing amount = `COALESCE(client_charge, amount_eur)`** (P-LEDGER-6). Cash position uses `amount_eur` (P-LEDGER-1).
8. **Transfer ≠ economic event** — `category='Transfer'` changes custody/location only, never income/expense. (P-LEDGER-5)

## Ledger constitution (P-LEDGER)
1 Three-Layer Settlement (Cash / Economic / Counterparty) · 2 Ledger Qualification (PASS 0 + 1.25) · 3 Investigation Entry Condition · 4 Settlement Availability · 5 Transfer ≠ Economic · 6 Owner-Facing Amount Basis. Full text: `docs/governance/JJ_LEDGER_CONSTITUTION.md` (Git authority; promoted faithfully from CLAUDE.md §13.17, origin `AV005_LEDGER.md`). ⚠️ **CLAUDE Dependency Gate remains ACTIVE** pending a final post-merge dependency audit; §13.17/P-LEDGER, §4, and §14 current authority are now Git-backed — see `JJ_OPEN_QUESTIONS.md`.

## Business Governance D2–D11
Locked. Source: `docs/governance/JJ_BUSINESS_GOVERNANCE_V1.md` (v1.2). Mandatory reading before any partner-balance / income-allocation / settlement work.

## Scope for reporting (RULE — current counts/totals live only in JJ_CURRENT_STATE)
- **Operational baseline** = `review_status = 'active' OR NULL`.
- **Audit baseline** = all preserved rows including `confirmed_duplicate`. **Never present the audit baseline as operational.**
- **Client-charge scope** follows the approved reporting rule (owner-facing = `COALESCE(client_charge, amount_eur)`, P-LEDGER-6).
- Current counts / amounts / client-charge totals → **`JJ_CURRENT_STATE.md`** (a DB change must never make this file stale).
