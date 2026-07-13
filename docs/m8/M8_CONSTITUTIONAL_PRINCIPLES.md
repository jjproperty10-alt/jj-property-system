# M8 Constitutional Principles — Checkpoint
**One page. Nine principles. One real example each.**
**Purpose: Any developer who reads this page understands not just what each rule says, but why it exists.**

---

## P-ARCH-1 — Never Infer Business Facts

> If a value is unknown, the system must say so. NULL is not an error. NULL is the truth.

**What it forbids:** Defaulting unknown values to 0, to a calculated estimate, or to a placeholder date.

**Real M8 example:**
Oren's capital payment status is unknown — no payment documents exist yet. The system returned:
```
capital_paid_eur     = NULL
capital_remaining_eur = NULL
entry_status         = 'capital_unknown'
```
Not zero. Not an estimate. Not "pending". The correct business answer was NULL, and the system gave it.

**Why it matters:** A system that converts "unknown" to "zero" is making a business decision it has no authority to make. A balance sheet with invented zeros is not a balance sheet.

---

## P-ARCH-2 — Partner Capital Rule: Yossi ≠ Jacob ≠ JJ

> The identity of who moved money is part of the accounting model, not metadata.

**What it forbids:** Normalizing partner payments into JJ. Losing the payer/payee identity during import, correction, or migration.

**Real M8 example:**
Avi paid €50,000 to **Yossi personally**, not to JJ. The capital event records:
```
payer_name = 'Avi'
payee_name = 'Yossi'
```
Not `payee_name = 'JJ'`. This matters because partner capital accounting (how much Yossi vs Jacob deployed) is tracked separately from company accounting. The same €50K that is "Avi's entry payment" is also "Yossi received €50K on behalf of the deal" — two facts, one event, identity preserved.

**Why it matters:** If Yossi's capital contributions are collapsed into JJ, partner reconciliation at exit is impossible.

---

## P-ARCH-3 — One Canonical Event (P9)

> One economic movement in the real world = one canonical event in the system = many read-only projections.

**What it forbids:** Duplicating the same economic fact across multiple tables. Storing the same movement in both `capital_event` and `partner_entry`.

**Real M8 example:**
Avi's €200,000 payment to the seller appears exactly once — as a single row in `capital_event`. The partner view (`v_partner_investment_statement`) and the internal view (`v_jj_lifecycle_internal`) both read from that same row. Neither view stores its own copy. If the row is voided, both views update automatically.

**Why it matters:** Two copies of the same fact eventually disagree. One canonical event never disagrees with itself.

---

## P-ARCH-4 — Void-and-Replace, Never Delete

> Confirmed business events are permanent. Corrections create a chain, not an erasure.

**What it forbids:** UPDATE or DELETE on confirmed lifecycle records. Silent overwrites. In-place corrections that lose history.

**Real M8 example:**
Legacy documentation showed €30,000 as Avi's payment to Yossi. The authoritative amount is €50,000. The resolution was **not** to create a €30,000 event and then correct it. Instead: only the single correct €50,000 event was entered, with a note in the `notes` field explaining the legacy discrepancy. No €30K event was created, so no void was needed. But if a confirmed event needed correcting, the procedure would be: set `status = 'void'` on the old event, insert a new event with `supersedes_event_id` pointing to the voided one.

**Why it matters:** In investment management, the audit trail is the product. Regulators, partners, and courts ask "what did you know and when?" A system that overwrites history cannot answer that question.

---

## P-ARCH-5 — Lifecycle Schema Isolation

> The lifecycle layer can be deployed, rolled back, and replaced without touching the accounting layer.

**What it forbids:** Foreign keys from `lifecycle` to `public`. Any DDL on `public.transactions` during lifecycle work. Any migration that modifies both schemas in the same transaction.

**Real M8 example:**
After the full M8 pilot — two property acquisitions, two partner entries, four capital events, two ownership periods — `public.transactions` remained at exactly **2,154 rows**. The accounting engine did not change. The settlement engine did not change. The Client Report did not change. The entire investment layer was built alongside the existing system, not on top of it.

**Rollback proof:** `DROP SCHEMA lifecycle CASCADE` removes the entire investment model. `public.transactions` is unaffected.

**Why it matters:** The ability to rollback an experimental layer without affecting production accounting is what makes safe iteration possible.

---

## P-ARCH-6 — Partner View Never Exposes Internal Economics

> A partner sees their numbers. JJ sees its numbers. The same query cannot return both.

**What it forbids:** Adding any `jj_*` column to `v_partner_investment_statement`. Exposing JJ's cost basis, purchase price, or margin through any partner-facing API route.

**Real M8 example:**
For Villa Mazotos / Avi:

| View | What Avi sees | What JJ sees |
|------|--------------|--------------|
| `v_partner_investment_statement` | agreed_entry_valuation = €500,000 | *(jj_margin not present)* |
| `v_jj_lifecycle_internal` | *(restricted)* | jj_margin_from_entry_eur = **€50,000** |

JJ bought at €400K and sold entry at €500K valuation. Avi's required capital is €250K (50% of €500K). JJ's cost basis is €200K (50% of €400K). The €50K margin is in the internal view only. The two views are structurally separate — it is not possible to accidentally expose the margin by joining them in a partner-facing route.

**Why it matters:** A partner who discovers JJ's internal margin mid-deal may renegotiate or exit. This information asymmetry is a legitimate business need that must be enforced architecturally, not by convention.

---

## P-ARCH-7 — Business Validation Before Product Work

> Validate the model on real data before building anything that touches the user.

**What it forbids:** Building Timeline, UI, PDF, or API routes before confirming that the underlying data model returns the correct values on real cases.

**Real M8 example:**
During Business Validation (before any Timeline code was written), the `entry_status` column in `v_partner_investment_statement` was found to return `'confirmed'` (the row's lifecycle status) instead of `'fully_paid'` (the computed payment status). This was a view definition bug from the original migration. It was fixed before a single line of Timeline UI existed.

Had the Timeline been built first, `entry_status = 'confirmed'` would have appeared on investor dashboards — semantically wrong, visually plausible, and very hard to trace once it propagated into multiple UI components.

**Why it matters:** Bugs in the data model cost days to find and fix at the model layer. The same bug costs weeks to find and fix after it is embedded in UI, PDF templates, and API contracts.

---

## P-ARCH-8 — JHKA Is the Source of Truth

> Historical business facts are defined by what Yossi can confirm, not by what the data suggests.

**What it forbids:** Inferring historical facts from patterns in `public.transactions`. Treating legacy Excel figures as authoritative without explicit Yossi confirmation. Any agent independently deciding what a historical event "must have been."

**Real M8 example:**
Legacy Excel records showed €30,000 as Avi's payment to Yossi. This figure appeared in multiple documents. The JJ Historical Knowledge Authority (Yossi's explicit written confirmation, M8 pilot Case 1) overrode it: the single authoritative amount is **€50,000**. The lifecycle record was entered with €50,000. No €30,000 event was created. The legacy figure is acknowledged in the `notes` field as a historical inaccuracy.

**Why it matters:** Data in spreadsheets may reflect drafts, partial information, or accounting conventions that differ from economic reality. Only the human authority on the business (Yossi) can confirm which is true.

---

## P-ARCH-9 — Business Facts Are Immutable. Business Understanding Is Evolvable.

> What happened is fixed. How we understand and report it can change.

**What it forbids:** Changing a capital event's amount after it is confirmed. Rewriting historical records when a new analytical lens is applied. Treating a change in reporting logic as a reason to alter source data.

**Real M8 example:**
When the `entry_status` view bug was discovered (see P-ARCH-7), the fix was applied to the **view** (business understanding), not to the capital events (business facts). The two capital events for Avi — €200,000 and €50,000 — were never modified. The `entry_status` computation in the view was corrected from `pe.status` to the proper CASE expression. Same facts, corrected interpretation.

A second example: if in the future JJ decides to classify "partner entry payments" differently for tax purposes, that classification change belongs in the BI layer or Reporting layer — not in `capital_event.event_subtype`. The economic fact does not change because the classification does.

**Why it matters:** This principle is what makes the audit trail trustworthy. If business facts can be rewritten whenever the understanding changes, the audit trail is fiction.

---

## Summary Table

| Principle | Core rule | Violated by |
|-----------|-----------|-------------|
| P-ARCH-1 | Unknown = NULL | Defaulting to 0 or placeholder |
| P-ARCH-2 | Yossi ≠ Jacob ≠ JJ | Normalizing partner payments to JJ |
| P-ARCH-3 | One event, many projections | Duplicating facts across tables |
| P-ARCH-4 | Void-and-replace | UPDATE/DELETE on confirmed records |
| P-ARCH-5 | Lifecycle isolation | FK to public, joint migrations |
| P-ARCH-6 | Partner view = no JJ fields | Adding jj_* to partner-facing view |
| P-ARCH-7 | Validate before building | Building UI before data is proven |
| P-ARCH-8 | JHKA is authority | Using legacy data without confirmation |
| P-ARCH-9 | Facts immutable, understanding evolvable | Rewriting history to match new logic |

---

*Compiled: 2026-07-13 — M8 closure checkpoint*
*These principles apply to all future milestones (M9, M10, ...) unless explicitly superseded by a documented ADR.*
