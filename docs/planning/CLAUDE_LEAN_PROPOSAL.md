# CLAUDE.md — Proposed Lean Replacement (PROPOSAL ONLY — not applied)

> **Status:** DRAFT proposal (Phase 1.5). The existing `CLAUDE.md` (1,866 lines) is **unchanged**. This is the proposed ~150-line replacement for review. Before any swap, the full original is preserved as `docs/archive/CLAUDE_FULL_<date>.md`.

---

```markdown
# JJ PROPERTY 10 — Agent Operating Rules (v2 · lean)

## 0. Authority model (scoped — see docs/canonical/JJ_MASTER_CONTEXT.md)
Authority depends on the KIND of truth:
  current DB state → live query (timestamped/scoped) · history/evidence → JHKA ·
  rules → JJ_FINANCE_RULES · constitution → JJ_BUSINESS_CONSTITUTION · architecture → ADR.
A live DB value supersedes only an OLD current-state snapshot — never history/rules/constitution.
Document precedence: docs/canonical/ > Git (code/adr/specs/migrations) > Project Knowledge >
  Memory > Chat history > Model recall. Evidence > memory. Unknown > guess.

## 1. What JJ is
Cyprus property management. Yossi 50% / Jacob 50%.
Exception — Villa Mazotos: Avi 50 / Yossi 25 / Jacob 25.

## 2. Iron rules (full text in docs/canonical/JJ_FINANCE_RULES.md)
- Supabase MCP is full read-write admin (role=postgres). Agents MUST use SELECT/read-only only; any mutation needs Yossi. (Least-privilege is an open security item.)
- NEVER delete transaction rows — review_status only.
- Preserve payer identity: Yossi ≠ Jacob ≠ JJ. Never normalize partner payments.
- Contract ≠ Payment (Purchase/Sale Contract excluded from cash flow).
- Internal Offset ≠ Duplicate (3 patterns).
- Airbnb Platform Income = net to owner (no double deduction).
- Owner-facing amounts = COALESCE(client_charge, amount_eur); cash position = amount_eur.
- Transfer ≠ economic event (custody/location only).
- JHKA is the historical source of truth (ADR-001).

## 3. Canonical knowledge map
docs/canonical/ holds the 10 control-plane files. Read JJ_MASTER_CONTEXT.md first.
Current verified numbers live in JJ_CURRENT_STATE.md (with query + timestamp) — never quote a
transaction/cashbox number from memory or an old doc; re-verify or cite JJ_CURRENT_STATE.

## 4. Approval boundaries (no ambiguous "touching")
SELECT / read-only SQL (incl. public.transactions) = AUTONOMOUS.
INSERT / UPDATE / DELETE / DDL / mutation (incl. public.transactions) = REQUIRES YOSSI.
Also requires Yossi: rule changes · prod migrations · money movement · merges to main ·
  archiving/deleting files or chats · irreversible actions.

## 5. Active freezes → docs/canonical/JJ_OPEN_QUESTIONS.md
Ownership FREEZE · RC1 Business Freeze · Finance Architecture · RC2 BLOCKED.

## 6. Connection facts
Supabase project vsiiprzjrstjcmjpwcrd. Dashboard in Supabase. NO secrets in any doc — .env / Vault only.

## 7. Conflict handling
Factual conflicts → resolve by evidence (read-only). Only genuine business/policy conflicts → Yossi.
Never silently merge conflicting rules. Surface them in JJ_OPEN_QUESTIONS.md.
```

---
**Note:** everything currently in CLAUDE.md §5–§13 (views, tables, Power BI, task status, all §13.x history) maps to `JJ_CURRENT_STATE.md`, `JJ_ARCHITECTURE.md`, and `JJ_DECISION_REGISTER.md` per the migration map in the Phase 0+1 package (§E).
