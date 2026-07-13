# M8 Investment Lifecycle — Retrospective
**Status: CLOSED**
**Date: 2026-07-13**
**Approved by: Yossi**

---

## 1. What M8 Was

M8 was the first milestone in JJ Property 10 where the system crossed from **accounting** into **investment management**.

Until M8, the system could answer:
- How much was spent on renovation?
- What did Airbnb generate?
- What is the cash balance?

After M8, the system can answer:
- Who owns what, at what valuation, and since when?
- How much capital has a partner deployed?
- What is JJ's internal margin on a partner entry?
- Is a partner fully paid, partially paid, or unknown?
- What is JJ's net capital at risk on a given deal?

That is not accounting. That is investment management.

---

## 2. What Was Proven

### ✅ Proof 1 — Acquisition as a Business Event
A property acquisition is an economic event with its own lifecycle — not a set of accounting rows. It carries JJ's cost, closing costs, acquisition status, and an audit trail linked to a source document. It is independent of, but connected to, the transaction ledger.

### ✅ Proof 2 — Partner Entry at Valuation, Not at Cost
Avi entered Villa Mazotos at an agreed entry valuation of **€500,000**, while JJ's purchase price was **€400,000**. The system correctly models these as separate facts:
- Partner's required capital = €500,000 × 50% = **€250,000**
- JJ's cost basis = €400,000 × 50% = **€200,000**
- JJ's margin = €250,000 − €200,000 = **€50,000**

The partner sees €250,000 required. JJ sees €50,000 margin. The two numbers never appear in the same view.

### ✅ Proof 3 — Capital Events: Who Paid Whom, and Why
The system tracks capital payments with full provenance: payer, payee, amount, event type. Avi's two payments — €200,000 to the seller and €50,000 to Yossi — are separate events with separate audit trails. Neither is confused with expense, income, or settlement.

### ✅ Proof 4 — Ownership is Separate from Capital
Ownership percentage is a fact recorded in `ownership_period`. Capital payment is a fact recorded in `capital_event`. These are different dimensions. A partner can hold 50% ownership before paying a single euro. They can also hold 0% after paying everything (e.g., after a buyout). The system keeps them separate by design.

### ✅ Proof 5 — Never Infer Business Facts
Oren's capital payment status is unknown. The system returned `capital_paid = NULL` and `capital_remaining = NULL`. It did not default to zero. It did not invent a date. It did not estimate.

This is the most important proof in the pilot. A system that cannot represent "unknown" is not safe to use for business decisions.

### ✅ Proof 6 — Internal Economics Separation
JJ's cost basis and margin are stored in `partner_entry` and visible only in `v_jj_lifecycle_internal`. The partner-facing view (`v_partner_investment_statement`) contains zero `jj_*` fields. This separation is enforced at the view layer and validated against in every pilot test.

### ✅ Proof 7 — Legacy System Untouched
`public.transactions` remained at 2,154 rows throughout the entire pilot. RC3 accounting engine, Settlement engine, Portfolio engine, and Reporting engine were not modified. M8 is fully additive.

### ✅ Proof 8 — Investor-Level Portfolio View
The final portfolio validation query proved that the model works at the **investor level**, not just the property level. A single query across `partner_entry`, `ownership_period`, and `capital_event` produces a complete investor statement: capital paid, net deployed, ownership current, distributions received.

---

## 3. Decisions Made During M8

### D1 — Seven Economic Primitives
The lifecycle schema organizes all investment events into seven primitive types:

| Primitive | Table |
|-----------|-------|
| Capital Event | `capital_event` |
| Expense | (public.transactions) |
| Income | (public.transactions) |
| ClientCharge | (public.transactions) |
| Ownership Event | `ownership_period` |
| Settlement Event | (planned) |
| Distribution/Payment Event | `capital_event` (subtype) |

This structure ensures that every economic movement maps to exactly one canonical type. No event is ambiguous.

### D2 — P9: One Canonical Event
One economic movement in the real world → one canonical event in the system → many read-only projections. No event may appear in multiple tables. All views are derived from the canonical events.

### D3 — Lifecycle Schema Isolation
The `lifecycle` schema has no foreign keys to `public`. The only reference from lifecycle to public.transactions is a soft reference via `linked_accounting_transaction_id` (UUID, no PG FK). Rolling back the entire lifecycle layer requires only:
```sql
DROP SCHEMA lifecycle CASCADE;
```
`public.transactions` is unaffected.

### D4 — deny-all RLS
All 7 lifecycle tables have RLS enabled with zero policies. Service role bypasses RLS; all other roles are denied. This is the safest possible starting state. Policies are added explicitly when needed.

### D5 — Void-and-Replace Immutability
No confirmed lifecycle event is deleted. Corrections use `supersedes_event_id` to create a chain: void the old event, insert the new one pointing back to the voided one. This preserves full audit history.

### D6 — Business Validation Before Timeline
The decision to stop before building the Investment Timeline and validate with real data first was correct. The pilot discovered the `entry_status` view bug before it could propagate into UI components. Validating the model on real data costs days; reworking a deployed UI costs weeks.

---

## 4. Decisions That Changed During M8

### C1 — €30,000 → €50,000 (Avi's Payment to Yossi)
Legacy documentation showed €30,000 as Avi's payment to Yossi. During M8 business review, Yossi confirmed the authoritative amount is **€50,000**. The legacy €30K figure was an incorrect historical representation of a single economic event. The canonical lifecycle record contains €50,000 only. No €30,000 event was created.

### C2 — Placeholder Dates → NULL + date_confidence
Initial pilot records used `'2024-01-01'` as a placeholder for unknown dates because the schema required NOT NULL. This was identified as a production risk: a future reader would see `2024-01-01` and assume it is real. The schema was corrected via migration `m8_lifecycle_003_nullable_dates`:
- `effective_from` (ownership_period) → nullable
- `effective_date` (capital_event) → nullable
- `date_confidence` column added to both: `'confirmed'` | `'estimated'` | `'pending_verification'`
- All pilot records updated: dates = NULL, confidence = `'pending_verification'`

### C3 — entry_status View Bug
The original migration applied `pe.status AS entry_status` (always `'confirmed'`) instead of the computed CASE expression (`'fully_paid'` / `'partially_paid'` / `'capital_unknown'`). This was discovered during Business Validation and fixed before the pilot was marked complete.

### C4 — G17 Test Assumption
Golden case G17 initially assumed `v_lifecycle_active_events` would return 7 rows. The view is a UNION of 5 event tables only. With empty event tables, correct expected count is 0. The test was corrected to PASS.

---

## 5. Decisions That Proved Correct

### R1 — Smoke Test First
Running the entire Avi/Oren dataset inside `BEGIN … ROLLBACK` before any permanent insert proved the schema accepts the data, the views return the right numbers, and rollback works cleanly.

### R2 — Generated Column for required_entry_capital_eur
Making `required_entry_capital_eur` a generated column eliminated an entire class of data entry errors. The computed value is always mathematically consistent with `agreed_entry_valuation_eur` and `ownership_pct`.

### R3 — Separation of partner_entry and ownership_period
`partner_entry` records the economic agreement (valuation, capital requirement). `ownership_period` records the legal fact (who owns what, from when). These are different facts that can change independently.

### R4 — Keeping RC3 Untouched
A complete investment lifecycle model was built alongside the existing accounting model without any integration friction.

### R5 — NULL as the honest representation of unknown
Oren's capital payment status is unknown. Returning NULL (not zero, not an estimate) proved correct. Any system that defaults unknown values to zero is making a business decision it has no authority to make.

---

## 6. Principles That Must Never Be Broken

### P-ARCH-1: Never Infer Business Facts
If a value is unknown, store NULL. If a date is unknown, store NULL with `date_confidence = 'pending_verification'`. Never default, never estimate silently, never compute from adjacent data without explicit authorization.

### P-ARCH-2: Partner Capital Rule
Yossi ≠ Jacob ≠ JJ. These three identities are not interchangeable in any context. `payer_name` and `payee_name` must preserve the exact identity of who moved money.

### P-ARCH-3: One Canonical Event (P9)
One economic movement in the real world = one canonical event = many projections. Events are never duplicated across tables.

### P-ARCH-4: Void-and-Replace, Never Delete
Confirmed lifecycle events are never deleted. Corrections create a void + replacement chain using `supersedes_event_id`.

### P-ARCH-5: Lifecycle Schema Isolation
No foreign key from `lifecycle` to `public`. This boundary is absolute.

### P-ARCH-6: Partner View Never Exposes Internal Economics
`v_partner_investment_statement` must never contain `jj_cost_basis_eur`, `jj_margin_from_entry_eur`, or any JJ-internal field.

### P-ARCH-7: Business Validation Before Product Work
Before building UI, PDF, or bulk import on top of a new model: validate the model on real data first.

### P-ARCH-8: JHKA is the Source of Truth
The JJ Historical Knowledge Authority (ADR-001) defines what business facts exist. No lifecycle event should contradict JHKA without explicit authorization from Yossi.

### P-ARCH-9: Business Facts Are Immutable. Business Understanding Is Evolvable.
**Facts** — who paid, how much, to whom, when, under which document — are permanent. Once confirmed, they can only be voided and replaced, never silently corrected.

**Understanding** — reports, KPIs, projections, classifications — can evolve. A new analytical lens does not change the underlying facts.

---

## 7. The Business Intelligence Layer (Proposed — M9+)

The BI Layer does not *know* anything. It only *asks*. Every answer it produces is a derivation from the engines below it. If the BI layer were deleted, no business fact would be lost.

### Architecture Position

```
Lifecycle → Ownership → Accounting → Settlement → Portfolio → Reporting → Business Intelligence
```

### Design Constraints

1. No owned facts. The BI layer stores no data — entirely views and queries.
2. No independent truth. If the BI layer disagrees with an authoritative engine, the engine wins.
3. Derivable only. Dropping the entire BI layer loses zero business information.
4. Internal/external separation preserved.

---

## 8. What Remains for M9

- **M9-A:** Investment Timeline Read Model (`v_investment_timeline`)
- **M9-B:** Historical Data Entry (SA Cases + 22 rows + Anastasia BATCH-0001)
- **M9-C:** Business Intelligence Layer (`bi` schema, views only)
- **M9-D:** Source Date Verification (NULL dates → confirmed from source documents)
- **M9-E:** GitHub Delivery (migrations + docs → main)

---

## 9. M8 Final Verdict

| Dimension | Status |
|-----------|--------|
| Lifecycle schema deployed | ✅ |
| RLS deny-all enforced | ✅ |
| Partner view isolation | ✅ |
| Internal view JJ economics | ✅ |
| Business Validation — Avi | ✅ PASSED |
| Business Validation — Oren | ✅ PASSED |
| Real Portfolio Validation | ✅ PASSED |
| Never Infer Business Facts | ✅ PROVEN |
| No internal economics leak | ✅ PROVEN |
| RC3 accounting untouched | ✅ |
| Placeholder dates eliminated | ✅ |
| M8 closed formally | ✅ |

**M8 is complete. The system now manages investments, not only transactions.**

---

*Document compiled: 2026-07-13*
*Authors: JJ Property 10 Engineering + Yossi (business decisions)*
*Next milestone: M9 — Investment Timeline + Historical Entry + BI Layer*
