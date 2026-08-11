# JJ_AGENT_RULES — Canonical

> **Status:** DRAFT skeleton (Phase 1.5). Consolidates the approved workspace model + `AGENT_REGISTRY.md` + `DOMAIN_MAP.md`.

## Workspace model (approved)
- **One Claude Project** for JJ.
- **Main thread** = orchestration: Yossi (Decision Authority) → ChatGPT (Chief Architect / QA) → Claude (Execution Orchestrator).
- **3 durable subagent types:** Engineering/Implementation · Evidence-QA-Verifier (read-only) · Explore/Research.
- **Business domains are Skills + knowledge, not standing agents:** Finance · Owners/Partners · STR/Reservations · Property Ops · Email · JHKA · Reports.
- Rule: the dev workspace is NOT the product's org chart. Do not spin up one agent per domain.

## Domains (stable) — see `DOMAIN_MAP.md` for code paths + authority
FINANCE · PARTNER · LIFECYCLE · PLATFORM · PRODUCT · KNOWLEDGE.

## Scope & least privilege
- Each subagent gets a task + pointers to canonical docs — never a pasted copy of rules/constitution.
- Subagents return findings/diffs to the orchestrator; they do not redefine business rules.
- Evidence-QA-Verifier **MUST NOT** write or commit. Technical enforcement: **file-write** is enforceable via tool grant (a read-only agent has no Edit/Write tools); **DB-write enforcement is PENDING** (the Supabase MCP is write-capable). So "MUST NOT," not "cannot," until least-privilege is provisioned.

## Approval boundaries (precise — no ambiguous "touching")
**Autonomous (inside approved scope):** read-only investigation; **SELECT / read-only SQL on any table including `public.transactions`**; analysis; drafting; code on a branch; evidence gathering; verification.
**Requires Yossi:** **INSERT / UPDATE / DELETE / DDL / any mutation** (including on `public.transactions`) · business-rule changes · production migrations · money movement · merges to `main` · archiving/deleting files or chats · any irreversible action.
> Reading is autonomous. Mutating requires approval. These are different acts and are classified differently.

## Supabase MCP — least-privilege (SECURITY)
The connected MCP is **full read-write admin**, verified 2026-08-11: DB role = `postgres` with SELECT/INSERT/UPDATE/DELETE + CREATE/DDL = TRUE; the MCP also exposes `apply_migration`, `execute_sql`, `deploy_edge_function`, and branch operations. **It is NOT technically read-only.** Agents are restricted to read-only **by this rule, not by the grant.** Enforcing least-privilege (a dedicated read-only DB role and/or a scoped MCP) is an open security item — see `JJ_OPEN_QUESTIONS.md`.

## Operational conventions (promoted from CLAUDE.md §14 — current durable items only)
- **Properties are `property_name` in the DB** (not `property`).
- **JHKA is the historical source of truth** — never create a parallel version of business history (ADR-001).
- **FR-001 Single Component Ownership** — each UI component belongs to one PR; after merge: import only, no copy, no inline.
- **FR-002 Never Assume Merge State** — before a new branch, verify prerequisites are on `main` via the API; never rely on memory.
- **GitHub Bridge** — use `claude_github_bridge.py` (v2; required params via `_require()`); run `self_test` after any Bridge change.
- **DAL** — every Digital Executive declares a DecisionAccessDeclaration per output; access evaluated by DAL (5 dimensions), enforced at the lowest reliable layer (ADR-003).
> **Deliberately excluded (not promoted as authority):** the legacy "sandbox is offline" item (STALE — a read-only Supabase MCP now exists; mutation stays Yossi-gated per Approval boundaries), and all §14 status/changelog notes (milestone/PR status → `JJ_DECISION_REGISTER.md` / `JJ_CURRENT_STATE.md`). Business/data-integrity rules (Contract≠Payment, no-delete, Internal Offset, Partner Capital) live in `JJ_FINANCE_RULES.md`, not here.

## Behavioral constants
Evidence > memory · Unknown > guess · Factual conflicts are resolved by evidence (not escalated); only genuine business/policy conflicts go to Yossi · Surface conflicts, never silently merge.
