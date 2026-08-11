# JJ_OPEN_QUESTIONS — Canonical

> **Status:** DRAFT skeleton (Phase 1.5). Tracks unresolved items. Distinguishes evidence-resolvable from genuine Yossi decisions.

## Active freezes (do not violate)
- **Ownership FREEZE** (10/7) — `property_owners`, ownership views, dashboards.
- **RC1 Business Freeze** (6/7) — transaction data changes.
- **Finance Architecture Freeze** (23/7) — `finance` schema.
- **RC2 BLOCKED** (23/7) — Settlement Engine, persistent alerts.

## F-items — resolution status (from Phase 0+1 package)
| Item | Type | Status |
|---|---|---|
| F-1 Transaction count | Factual | ✅ RESOLVED by live query (JJ_CURRENT_STATE): 2,162 / 2,137 / 25 |
| F-2 CLAUDE.md stale count | Factual | ✅ RESOLVED — stale; superseded by F-1 |
| F-3 Cashbox DB vs PBI | Factual | ✅ RESOLVED — snapshot/scope difference; DB authoritative, refresh PBI |
| F-4 Client-charge scopes | Factual | ✅ RESOLVED — active €113,460.13 / all-rows €120,555.14 |
| F-5 ADR sets diff | Factual | ✅ RESOLVED — 3 distinct sets, no content duplicates |
| F-6 CLAUDE.md → Git | Decision | ✅ DECIDED by Yossi — YES, version in Git; preserve original |

## Findings resolved autonomously (evidence — NOT Yossi decisions)
- **Dirty git working tree (377 files):** read-only forensic (`git diff --numstat`) shows every file with `added == deleted == full line count` (e.g. `package-lock.json` 10422/10422, `.gitignore` 11/11) — a whole-tree **line-ending/encoding rewrite** (no `.gitattributes`, `core.autocrlf` unset). **Mechanical artifact, not source changes. Zero genuine unexplained changes → nothing escalates.** These must NOT be committed and must not follow the canonical commit. Confirms the OneDrive working tree is not git-safe → commit canonical via Bridge / clean clone.

## Genuine decisions still requiring Yossi
1. **ADR canonical numbering** — collisions exist (two `ADR-001`, two `ADR-003`, three `ADR-004`). **Non-breaking fix:** an **ADR Registry** assigning a namespaced Canonical UID mapped to the legacy filename **without renaming any file** (references stay intact). ChatGPT recommends APPROVE. See `JJ_ARCHITECTURE.md` + review package §E.
2. **MCP least-privilege target (SECURITY)** — approve a **technically-enforced** read-only path (rule-only restriction is not accepted as final). Options + recommendation in review package §F.

## Proposed autonomously (no Yossi choice needed)
- **Legacy `docs/` promotion order** — dependency-driven, derived from what the canonical files already reference: **governance → specifications → architecture/contracts → planning/reviews/issues.** See review package §D.

## Open SECURITY items
- **Supabase MCP least-privilege** — MCP is **full read-write admin** (role `postgres`; SELECT/INSERT/UPDATE/DELETE + CREATE/DDL = TRUE, verified 2026-08-11).
  - **Current temporary state:** agents are restricted to read-only **by rule**, while the MCP remains **technically write-capable**.
  - **Required target state:** technically-enforced least privilege — a dedicated read-only DB role / scoped read-only MCP for Investigation, Explore, and Evidence-QA; the privileged `postgres`/admin MCP remains a **separate** execution path for explicitly approved mutations/migrations.
  - Until technical enforcement exists, **all mutation remains Yossi-gated.** (Architecture APPROVED = Option 1 + Option 3; DDL / permission changes NOT authorized in this phase.)

## Business open questions (pointers, not restated)
Owner Workspace Q1–Q16 (`docs/planning/OWNER_WORKSPACE_*`), Settlement Engine Implementation Contract (not written), Identity Gen 3→4 migration, PMS→Accounting bridge automation scope, Ownership FREEZE closure (R1/R2/R5/R6). Full list: `OPEN_QUESTIONS_BUSINESS_REVIEW.md` + `JJ_MASTER_PROJECT_INVENTORY_v1.0.md` §6.

## Canonical Knowledge Gate — status: ACTIVE
No legacy file/chat/zip/dir may be archived until every unique authoritative rule, decision, open question, evidence pointer, and architectural constraint it holds is captured or referenced in this canonical structure. **Nothing has been archived. Gate not yet run.**

## CLAUDE Dependency Gate — status: ACTIVE
No section may be removed or trimmed from legacy `CLAUDE.md` until **every canonical reference to that section** has been migrated to a durable Git-backed authority/evidence document. **P-LEDGER / §13.17 — RESOLVED (Phase 2A):** promoted to Git as `docs/governance/JJ_LEDGER_CONSTITUTION.md` (P-LEDGER-1…6 + D4) and `docs/governance/JJ_INVESTIGATION_CONSTITUTION.md` (P-EVIDENCE-1 + Resolution Governance); P-LEDGER-7 draft excluded. **Gate remains ACTIVE — remaining material dependencies:** `CLAUDE.md §4` (business rules) + `§14` (no-delete), still referenced by `JJ_FINANCE_RULES.md`; release requires the FINANCE_RULES reconciliation. Soft references (§5 PBI note, §13.x changelog) tracked separately. **CLAUDE.md must not be replaced while this gate holds.**
