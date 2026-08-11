# JJ_DECISION_REGISTER — Canonical (append-only)

> **Status:** DRAFT skeleton (Phase 1.5). Append-only. One row per decision, newest last. Indexes decisions — does not restate their full text.

## Format
`| ID | Date | Domain | Decision (1 line) | Authority / Evidence doc | Status |`

## Migration sources to fold in (Phase 2, gated)
1. CLAUDE.md 77 changelog lines (dated) → one row each.
2. CLAUDE.md §13.x rulings → one row each, pointing to the real doc.
3. Decision packages: `DS1_*`, `WA001/002_*`, `DS_009B/014/015_*`, `CP-Q00x` → one row each.
4. Merged PR rulings (PRs #51–#83, with merge SHAs) from `JJ_MASTER_PROJECT_INVENTORY_v1.0.md` §3.4.

## Seed rows (decisions made during consolidation)
| ID | Date | Domain | Decision | Authority / Evidence | Status |
|---|---|---|---|---|---|
| CONS-001 | 2026-08-11 | Knowledge | Canonical knowledge authority lives in Git `docs/canonical/`; OneDrive = legacy source layer | Yossi direction | Approved |
| CONS-002 | 2026-08-11 | Knowledge | `CLAUDE.md` to be versioned in Git; original preserved before refactor | Yossi (F-6) | Approved |
| CONS-003 | 2026-08-11 | Knowledge | Canonical Knowledge Gate blocks any archival until capture proven | Yossi direction | Active |
| CONS-006 | 2026-08-11 | Knowledge | Authority is scoped by kind of truth (DB=current state, JHKA=history, Constitution/ADR=rules/architecture). No global "DB = only truth" | Yossi direction | Approved |
| CONS-009 | 2026-08-11 | Knowledge | §13.17 promoted to Git: JJ_LEDGER_CONSTITUTION (P-LEDGER-1…6 + D4) + JJ_INVESTIGATION_CONSTITUTION (P-EVIDENCE-1 + Resolution) — intentionally split; P-LEDGER-7 excluded (draft); CLAUDE Dependency Gate stays ACTIVE (§4/§14 remain); CLAUDE.md unchanged | Yossi (Phase 2A) | Approved |

> **This register holds DECISIONS only — not facts, findings, or events.**
> - Verified current facts (transaction baseline, cashbox values) → `JJ_CURRENT_STATE.md`.
> - Reconciliations & findings (DB↔PBI, dirty-tree forensic) → `JJ_OPEN_QUESTIONS.md` / evidence.
> - Security findings (MCP privilege) → `JJ_OPEN_QUESTIONS.md` (Open Security).
