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

## Behavioral constants
Evidence > memory · Unknown > guess · Factual conflicts are resolved by evidence (not escalated); only genuine business/policy conflicts go to Yossi · Surface conflicts, never silently merge.
