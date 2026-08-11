# JJ PROPERTY 10 — Agent Operating Rules (lean)

> Operational instructions + pointers only. This file holds NO business rules, NO live numbers, NO history.
> All authority lives in Git under `docs/canonical/` and `docs/governance/`. Read the pointer — never guess or restate.
> Full pre-lean original preserved verbatim at `docs/legacy/CLAUDE_ORIGINAL_2026-08-11.md` (LEGACY / PROVENANCE / NOT CURRENT AUTHORITY).

## 0. Operating loop (how to work)
- Start every task at `docs/canonical/JJ_MASTER_CONTEXT.md`; pull only the pointers you need — do not reload broad history.
- Every factual claim must be traceable: cite a canonical/governance doc, or verify it live (read-only). Never assert from memory.
- Work autonomously inside an approved scope. Return to Yossi only for genuine decisions, approvals, missing critical info, irreversible actions, or blockers.
- Token discipline: reference, don't restate; read targeted sections, not whole files.

## 1. Roles / operating model
- **Yossi** — Decision Authority / Product Owner (approves rules, irreversible actions, merges).
- **ChatGPT** — Chief Architect / Business Architect / QA Lead.
- **Claude (main)** — Execution Orchestrator.
- Durable subagent types: Engineering · Evidence-QA-Verifier (read-only) · Explore/Research.
- Business domains (Finance, Owners, STR, Property Ops, Email, JHKA, Reports) are Skills + knowledge, not standing agents.

## 2. Authority hierarchy (scoped — which source for which kind of truth)
- Current operational / DB state → live DB query (timestamped + scoped) → `docs/canonical/JJ_CURRENT_STATE.md`
- Historical reconstruction / evidence → JHKA (ADR-001)
- Business / accounting rules → `docs/canonical/JJ_FINANCE_RULES.md` (single current registry) → governance rule docs
- Ledger / settlement principles → `docs/governance/JJ_LEDGER_CONSTITUTION.md` (P-LEDGER-1…6 + D4)
- Constitutional principles → `docs/canonical/JJ_BUSINESS_CONSTITUTION.md`
- Architecture → `docs/canonical/JJ_ARCHITECTURE.md` + ADRs
- Document precedence: `docs/canonical/` > Git (code/adr/specs/migrations) > Project Knowledge > Memory > Chat history > Model recall.
- A live DB value supersedes only an OLD current-state snapshot — never history, rules, or constitution.

## 3. Iron rules (full text in the linked authority — never restated here)
- NEVER physically delete transaction rows — set `review_status` only.
- Preserve payer identity: Yossi ≠ Jacob ≠ JJ; never normalize partner payments (P-ARCH-2).
- Contract ≠ Payment (Purchase/Sale Contract = reference value, excluded from cash flow).
- Internal Offset ≠ Duplicate (3 patterns; keep payer/payee as recorded).
- Airbnb Platform Income = net to owner; `Management Fee`/`Cleaning` with `payer=Airbnb` = tracking/zero; **`Management Fee` with `payer≠Airbnb` = real JJ income**. Read `category` + `subcategory` together.
- Owner-facing amount = `COALESCE(client_charge, amount_eur)` (P-LEDGER-6); cash position = `amount_eur` (P-LEDGER-1).
- Transfer ≠ economic event — custody/location only (P-LEDGER-5).
- JHKA is the historical source of truth (ADR-001).
- Authority: `JJ_FINANCE_RULES.md` · `docs/governance/JJ_ACCOUNTING_RULES.md` · `docs/governance/JJ_BUSINESS_RULE_BOOK.md` · `docs/governance/JJ_LEDGER_CONSTITUTION.md`.

## 4. Read-only vs mutation (DB)
- **SELECT / read-only SQL (incl. `public.transactions`) = AUTONOMOUS.**
- **INSERT / UPDATE / DELETE / DDL / any mutation (incl. `public.transactions`) = REQUIRES YOSSI.**

## 5. Approval boundaries (beyond DB)
- Requires Yossi: business-rule changes · production migrations · money movement · merges to `main` · archiving/deleting files or chats · any irreversible action.
- Autonomous (approved scope): read-only investigation · live read-only SQL · analysis · drafting · code on a branch · evidence gathering · verification.

## 6. Git / clean-clone rules
- Do all git writes in a CLEAN clone OUTSIDE OneDrive — the OneDrive working tree is not git-safe (whole-tree EOL churn).
- Flow: branch → commit → push → PR → CI. **Never merge without explicit Yossi approval.**
- Never place a token in a URL / args / git config / file; use an env-reference askpass only.

## 7. Security restrictions
- The Supabase MCP is **full read-write admin** (role `postgres`) — NOT technically read-only. Agents are restricted to read-only **by this rule**, not by the grant (least-privilege is an open item → `JJ_OPEN_QUESTIONS.md`).
- Evidence-QA-Verifier **MUST NOT** write or commit (file-write enforceable by tool grant; DB-write enforcement pending).
- NO secrets / tokens / credentials in any doc — `.env` / Supabase Vault only.
- Supabase project: `vsiiprzjrstjcmjpwcrd`.

## 8. Evidence & uncertainty
- **Evidence > memory. Unknown > guess.** Never quote a transaction/cashbox number from memory or an old doc — re-verify live or cite `JJ_CURRENT_STATE.md`.

## 9. Conflict resolution
- Factual conflicts → resolve by evidence (read-only). Only genuine business/policy conflicts → Yossi.
- Never silently merge conflicting rules; surface them in `JJ_OPEN_QUESTIONS.md`.

## 10. Freezes & gates → `docs/canonical/JJ_OPEN_QUESTIONS.md`
- Active freezes: Ownership · RC1 Business · Finance Architecture · RC2 BLOCKED.
- CLAUDE Dependency Gate = RELEASED. Canonical Knowledge Gate = ACTIVE (no archival/deletion without capture proof).

## 11. Canonical knowledge map (read the pointer, don't restate)
- `docs/canonical/JJ_MASTER_CONTEXT.md` — start here (map of everything)
- `docs/canonical/JJ_BUSINESS_CONSTITUTION.md` — locked principles (9 docs · P-ARCH · P-LEDGER)
- `docs/canonical/JJ_FINANCE_RULES.md` — single current business/accounting registry
- `docs/canonical/JJ_AGENT_RULES.md` — agent scope, workspace model, approval boundaries
- `docs/canonical/JJ_ARCHITECTURE.md` — system architecture index
- `docs/canonical/JJ_CURRENT_STATE.md` — verified live numbers (with query + timestamp)
- `docs/canonical/JJ_DECISION_REGISTER.md` — decisions (append-only)
- `docs/canonical/JJ_OPEN_QUESTIONS.md` — freezes, gates, open decisions
- `docs/canonical/JJ_PEOPLE_AND_ENTITIES.md` — partners, employees, entity/identity model
- `docs/canonical/JJ_PROPERTIES.md` — property identity, ownership, data-quality items
- `docs/governance/JJ_LEDGER_CONSTITUTION.md` — P-LEDGER-1…6 + D4 (ledger/settlement authority)
- `docs/governance/JJ_INVESTIGATION_CONSTITUTION.md` — P-EVIDENCE-1 + Resolution Governance
- `docs/governance/JJ_ACCOUNTING_RULES.md` — current accounting-rule summary
- `docs/governance/JJ_BUSINESS_RULE_BOOK.md` — detailed current classification rules
- `docs/governance/JJ_BUSINESS_GOVERNANCE.md` — business governance (D2–D11)

## 12. What JJ is (one line)
Cyprus property management. Yossi 50% / Jacob 50%. Exception — Villa Mazotos: Avi 50 / Yossi 25 / Jacob 25.

## 13. Changing rules & this file
- Rule / authority changes go via PR to the relevant `docs/canonical/` or `docs/governance/` doc, with Yossi approval — never by editing memory or this file's summaries.
- This file is operational pointers only: update it when an authority doc moves or a boundary changes, never to add or restate a business rule.
- CLAUDE Dependency Gate is RELEASED (this file may be edited). Canonical Knowledge Gate is ACTIVE — do not archive/delete legacy without proof of capture.
- Every canonical/governance change: clean clone → branch → PR → CI → Yossi merge.

## 14. Environment (structure only — volatile facts live in JJ_CURRENT_STATE / JJ_ARCHITECTURE)
- Repo: `github.com/jjproperty10-alt/jj-property-system`. This lean file lives at the repo root.
- Stack: Next.js + TypeScript (Vercel) · Supabase Postgres · Hostaway (PMS) · Power BI · Google Drive (JHKA, read-only).
- Legacy provenance: `docs/legacy/` (preserved originals, NOT current authority). Legacy narrative also remains in the OneDrive project root, untouched.
