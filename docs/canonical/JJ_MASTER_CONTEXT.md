# JJ_MASTER_CONTEXT — Canonical Knowledge Map

> **Status:** DRAFT skeleton (Phase 1.5, branch). Additive. NOT authoritative until the Canonical Knowledge Gate passes.
> **Role:** Control plane. This file is a map, not content. It says *where truth lives*, never restates it.

## Authority model — SCOPED (which source is authoritative for WHICH kind of truth)
Authority depends on the *kind* of question. **No single source is "the only truth."**

| Kind of truth | Authoritative source |
|---|---|
| Current operational / DB state (counts, balances, live values) | **Live DB query** — timestamped + scoped (see `JJ_CURRENT_STATE.md`) |
| Historical reconstruction / evidence (what happened, why) | **JHKA / canonical evidence authority** (ADR-001) |
| Business / accounting rules | **`JJ_FINANCE_RULES.md`** — the single canonical registry of *current* approved rules. Governance v1.2 / ADRs / Constitution are **provenance & authority sources**, never parallel current authorities. |
| Constitutional principles | **`JJ_BUSINESS_CONSTITUTION.md` (9 docs · P-ARCH · P-LEDGER)** |
| Architecture decisions | **ADR / Architecture authority (`JJ_ARCHITECTURE.md`)** |

**Rule:** a live DB value supersedes an **old CURRENT-STATE snapshot only.** It NEVER silently supersedes historical evidence, constitutional principles, or business rules.

## Document precedence (for knowledge documents, within a given kind of truth)
Git `docs/canonical/` > Git (code, `docs/adr`, `docs/specifications`, migrations) > Project Knowledge > Memory (continuity only) > Chat history > Model recall (never authority).

**Evidence > memory. Unknown > guess.**

## The 10 canonical files
| File | Answers | Type |
|---|---|---|
| `JJ_MASTER_CONTEXT.md` | Where does each kind of truth live? (this file) | Map / control plane |
| `JJ_BUSINESS_CONSTITUTION.md` | What are the locked principles? | Index |
| `JJ_PEOPLE_AND_ENTITIES.md` | Who are the people/entities? | Consolidation |
| `JJ_PROPERTIES.md` | What properties exist, who owns them? | Consolidation |
| `JJ_FINANCE_RULES.md` | What are the accounting/ledger rules? (**the one rules file**) | Consolidation + Index |
| `JJ_AGENT_RULES.md` | How do agents work, what's their scope? | Consolidation |
| `JJ_ARCHITECTURE.md` | How is the system built? | Index |
| `JJ_DECISION_REGISTER.md` | What was decided, when, why? | Register |
| `JJ_CURRENT_STATE.md` | What is true right now (verified)? | Index + verified facts |
| `JJ_OPEN_QUESTIONS.md` | What is unresolved / needs Yossi? | Consolidation |

## Where non-canonical material lives
- **Authority sources:** `docs/adr/`, `docs/specifications/`, `docs/governance/`, `docs/architecture/`, `docs/contracts/`.
- **Evidence / investigations / runbooks:** `docs/evidence/`, `docs/investigations/`, `docs/runbooks/` (to be populated in gated phases).
- **Legacy / source layer** (OneDrive `JJ/` top level, 357 `.md`): not the final canonical destination; **may still contain uncaptured authoritative material** until the Canonical Knowledge Gate passes. Do not delete or discount — migrate then verify.

## Provenance note
Built by identify → reference → map → reconcile. No authoritative doc was rewritten or duplicated. Provenance of consolidation decisions: `JJ_DECISION_REGISTER.md` (CONS-001…). The full migration plan will be promoted into Git under `docs/` (gated); until then it is tracked via the Decision Register — not via any OneDrive path.
