# JJ_PEOPLE_AND_ENTITIES — Canonical Consolidation

> **Status:** DRAFT skeleton (Phase 1.5). Proven facts + pointers. Unverified items marked PENDING.

## Partners
- **Yossi** — 50% of JJ. Cashbox entity. `payer/payee = 'Yossi'`.
- **Jacob** (a.k.a. Yaacov) — 50% of JJ. Cashbox entity. `payer/payee ∈ {'jacob','yaacov'}`.
- **JJ** — the company; settlement boundary (D4). Cashbox entity.
> Constitutional: **Yossi ≠ Jacob ≠ JJ** — payer identity never normalized (P-ARCH-2). See `JJ_FINANCE_RULES.md`.

## Settlement model (D4 — Two-Layer) — CONSTITUTIONAL/ECONOMIC RULE, not a per-transaction fact
D4 governs the **settlement/economic layer**: Layer 1 — every external party settles with **JJ**; Layer 2 — partners settle with **JJ**; partners never settle directly with employees/suppliers/customers. This states *who bears/settles economically* — **not who physically paid.** Physical payer, payment instrument, and operator stay distinct and are **preserved as recorded** (P-LEDGER-1: Cash Reality ≠ Economic Allocation ≠ Settlement Counterparty). Source: D4 — `docs/governance/JJ_LEDGER_CONSTITUTION.md` (settlement/economic layer). Business-rule context: `docs/governance/JJ_ACCOUNTING_RULES.md` / `docs/governance/JJ_BUSINESS_RULE_BOOK.md` (Git authority; promoted from CLAUDE.md §4 in Phase 2B).

## Employees / operators
- **Anastasia** — employee. In the **economic/settlement model** she is treated as **operator of a JJ operational cashbox** (DS-014 + `BR-PAYMENT-INSTRUMENT-001`: **operator ≠ economic payer**). ⚠️ This is a *model rule that applies where evidenced* (e.g. JJ company-card use). It does **not** blanket-reclassify every payment she made and does **not** erase historical records of what she physically paid. `employee_config`: role=employee, is_active=TRUE. Reconciled via `v_anastasia_clearing`.
- **Fabi** (and `fabi`) — employee paid by Anastasia. `employee_config`: is_active=**FALSE** (must stay false, else Anastasia box double-counts).

## Identity stores (4 generations — migration incomplete)
| Store | Gen | Status |
|---|---|---|
| `contacts` | 1 | minimal consumers |
| `entities` | 2 | no consumers |
| `entity_registry` (45) | 3 | actively used |
| `registry.parties` (21) | 4 (target) | seeded, **0 consumers** |
> No Gen 3 → Gen 4 migration path exists. See `JJ_OPEN_QUESTIONS.md`.

## PENDING (needs live verification before authoritative)
- Full owner/investor roster and per-property ownership — PENDING (see `JJ_PROPERTIES.md`).
- Canonical spelling table for people/entity aliases — PENDING.
