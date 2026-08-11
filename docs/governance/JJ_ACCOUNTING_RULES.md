# JJ Accounting Rules (Canonical — Git Authority)

> **Status:** Git-backed CURRENT accounting-rule authority (Phase 2B promotion, 2026-08-11).
> **Faithful promotion** of legacy `docs/ACCOUNTING_RULES.md` — text preserved, no rule rewritten.
> **Role:** summary / current accounting authority. Referenced by `docs/canonical/JJ_FINANCE_RULES.md` (the single current registry) — this file is authority/provenance, not a competing registry.
> **Companion:** `docs/governance/JJ_BUSINESS_RULE_BOOK.md` (detailed classification rules).
> ⚠️ **Read in context:** the Airbnb `Management Fee` / `Cleaning` "tracking only" statement below describes **platform rows (payer=Airbnb)**. The payer-dependent nuance — **`Management Fee` with `payer≠Airbnb` = real JJ income** — is carried authoritatively in `JJ_FINANCE_RULES.md` + `JJ_BUSINESS_RULE_BOOK.md` (BR-1.2). Do not read this summary in isolation. Always evaluate `category` + `subcategory` together.

---

# JJ Property 10 — Accounting Rules

> **STATUS: FROZEN — RC1 freeze declared. No changes without Yossi approval.**
> Last updated: 2026-07-08 · RC2

---

## Core Principle: Contract ≠ Payment

- `subcategory = "Purchase Contract"` = contract value only. **Not a cash movement.**
- `subcategory = "Sale Contract"` = contract value only. **Not a cash movement.**
- Exclude from: cash flow, cashbox balance, partner balance calculations.

---

## Category Definitions

| Category | Description |
|----------|-------------|
| Renovation | Property renovation expenses |
| Airbnb | Short-term rental income/expenses |
| Management | Ongoing management — rent, HOA, property tax |
| JJ | Company-level expenses |
| Sale | Property sales |
| Purchase | Property purchases |
| Transfer | Inter-partner transfers |
| General | Miscellaneous |

---

## Payer / Payee Allowed Values

**Only 8 valid values:** `Yossi`, `Jacob`, `Anastasia`, `JJ`, `Client`, `Tenant`, `Owner`, `Airbnb`

---

## Partner Capital Rule ⚠️

**Yossi ≠ Jacob ≠ JJ — always.**

Payments made by Yossi, Jacob, and JJ are NOT interchangeable. Never normalize between them.

- Always preserve original payer/payee as recorded
- Applies to: Purchase Deposits, Client Balance Offsets, all partner payments
- The Manual Correction UI shows a warning when editing these rows
- `v_cashbox_audit` splits balances by Yossi / Jacob / JJ — this reflects this principle

---

## review_status Values

| Value | Meaning | Included in Reports? |
|-------|---------|---------------------|
| `active` (or NULL) | Normal, verified transaction | ✅ Yes |
| `duplicate_candidate` | Suspected duplicate — under review | ❌ No |
| `confirmed_duplicate` | Verified duplicate — evidence confirmed | ❌ No |
| `ignored` | Intentionally excluded | ❌ No |

**Client reports filter `review_status = 'active'` (or NULL) only.**
**Never DELETE rows — change review_status instead.**

---

## Airbnb / Hostaway Rule

Platform Income = net amount to owner (after all platform deductions).

- `Management Fee` (category=Airbnb) — tracking only, NOT deducted again
- `Cleaning` (category=Airbnb) — tracking only, NOT deducted again
- Only real owner expenses (electricity, water, repairs) reduce the owner balance

When importing future Hostaway reports:
- Import: Platform Income (net), Cleaning (tracking), Management Fee (tracking), BPO (actual payment to owner)
- Import as expenses: electricity, water, internet, repairs only

---

## Purchase Capital Rule

Purchase Deposits and Payments are **capital expenditures**, not expenses.

| Property lifecycle state | Treatment |
|--------------------------|-----------|
| Property retained by JJ | Deposit = part of JJ acquisition cost (non-refundable) |
| Property transferred to client | Deposit = part of acquisition cost client reimburses to JJ |

> The determining factor is the **transaction lifecycle** (did transfer/sale occur?), not the property definition alone.
> Current implementation: Deposits are in `SKIP_EXPENSE_SUBS` → classified as Other/info-only. Full lifecycle-aware treatment deferred to RC2+.

---

## Internal Offset Rule

Transactions with keywords like: `קיזוז`, `לסגור חוב`, `לטובת השיפוץ`, `מהשכירות`, `internal offset`, `transferred from rent`

**Are NOT duplicates.** Three patterns:

### Pattern 1: JJ Internal Settlement
Money moved through JJ accounts. JJ is payer or payee. All rows are valid — keep as active.

### Pattern 2: External Personal Payment Applied to Client Balance
Yossi or Jacob received money personally (not through JJ) and offset it against a client debt.
- Keep payer/payee as originally recorded
- Yossi ≠ JJ even if economically equivalent
- Mark "Needs Review" if uncertain

### Pattern 3: True Duplicate
Mark `confirmed_duplicate` ONLY with actual evidence:
- Bank/Airbnb PDF showing single movement
- Two rows with different UUID but same event_id
- Yossi confirms same event recorded twice

---

## Balance Equation

```
Opening Balance
+ Platform Income & Rent
+ Client Payments Received
− Expenses Paid on Behalf
= Closing Balance
− Payments Sent to Owner (BPO)
= Remaining Balance
```

Positive remaining = owner owes JJ.
Negative remaining = JJ owes owner.

---

## classifyTx() — Frozen

The `classifyTx()` function in `src/app/client-report/page.tsx` is the canonical transaction classifier.
**No changes without explicit Yossi approval.**
It implements an 18-step waterfall classification chain.

Section keys (in order): `platform_income` → `client_payment` → `expenses` → `renovation` → `settlement` → `purchase_info` → `pending_review` → `other`
