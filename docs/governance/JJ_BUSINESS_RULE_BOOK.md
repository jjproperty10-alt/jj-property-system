# JJ Business Rule Book (Canonical — Git Authority)

> **Status:** Git-backed CURRENT business/classification rule authority (Phase 2B promotion, 2026-08-11).
> **Faithful promotion** of legacy `BUSINESS_RULES.md` — text preserved, no rule rewritten.
> **Role:** detailed current business / classification rule book. Referenced by `docs/canonical/JJ_FINANCE_RULES.md`.
> **Companion:** `docs/governance/JJ_ACCOUNTING_RULES.md` (summary).

---

# JJ PROPERTY 10 — BUSINESS RULE BOOK
## Client Report & Transaction Classification

*This document is the authoritative source of confirmed business rules for the JJ Property 10 client report system.*
*Last updated: 2026-06-30 v1.4 (Groups A–E closed — dedup_2026_06_29 fully audited — Rule 2.5 added)*
*Maintained by: Claude (Cowork session) based on confirmed answers from Yossi / ChatGPT.*

---

## RULE STATUS LEGEND

| Status | Meaning |
|--------|---------|
| ✅ CONFIRMED | Rule is confirmed and may be implemented |
| ❓ OPEN | Question raised, awaiting answer |
| 🚫 PROHIBITED | This behaviour is explicitly forbidden |

---

## SECTION 1 — PLATFORM INCOME & SETTLEMENT MODEL

### RULE 1.1 — Platform Income Definition ✅ CONFIRMED
*Confirmed: 2026-06-30*

**Platform Income is the NET amount actually received into JJ's bank account for the property owner.**

It already includes the following deductions made by the platform (Airbnb / Booking / Hostaway) before transfer:
- Management Fee (Airbnb's or JJ's platform-level fee)
- Cleaning Fee (when cleaning was part of the platform/statement deduction)
- Any other platform-side deductions before Net Owner Payout

Platform Income is the **starting point** of the owner settlement. It is not a gross figure.

---

### RULE 1.2 — Management Fee Row: Two Distinct Patterns ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A1) + Extended: 2026-06-30 (C3 — global rule)*

**Pattern A — Platform-side Management Fee (payer=Airbnb / AIRBMB / platform):**

Management Fee was deducted by the platform before Net Owner Payout reached JJ's bank.

🚫 **Do NOT deduct Management Fee again from Platform Income.**
🚫 **Do NOT credit Management Fee as additional owner income.**
**Balance effect must be zero — informational only.**

Affected transaction pattern: category=Airbnb, subcategory=Management Fee, payer=Airbnb (or AIRBMB, COMPANI normalised to Airbnb) or payer=JJ.

Affected audit issues resolved: BR-01 (a+b), BR-02 (a+b), BR-03, BR-04 — 6 source rows across 4 properties.

---

**Pattern B — Manual client-payment split (payer=Client):** ✅ CONFIRMED 2026-06-30 (C3)

When a client/guest payment is manually split into two rows:
1. Airbnb / Platform Income (payer=Client) = owner's net income → **credit owner**
2. Airbnb / Management Fee (payer=Client) = JJ's management share → **debit owner**

Both rows are legitimate and must remain. The Management Fee in this pattern is **real JJ income**, not a platform-side deduction already accounted for. It **must deduct from the owner's balance**.

🚫 **Do NOT apply Pattern A (zero balance) to Pattern B rows.**
🚫 **Do NOT delete or merge the split rows.**

Recognition: Excel notes reading "חלקתי מתשלום לקוח [amount]" ("I split from client payment [amount]") confirm Pattern B. This rule applies globally across all properties.

classifyTx implementation: A1 (step 6) fires only for payer=Airbnb/AIRBMB or payer=JJ, leaving payer=Client Management Fee rows to reach A5 → charges_billed. No code change required.

Confirmed example: Ofri Makarios 5 Floor, Excel Rows 1618 + 1619, 2025-12-30, €70 + €70 split from €140 client payment.

---

### RULE 1.3 — Cleaning Fee Row Has Zero Balance Effect on Client Ledger ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A2 — answered by ChatGPT / Yossi)*

**For Airbnb/Platform settlement rows, Platform Income is NET Owner Payout — already after all platform-side deductions, including Cleaning.**

Cleaning rows with payer=Airbnb and subcategory=Cleaning represent amounts deducted by the platform before the Net Owner Payout reached JJ. They are not a second expense to charge the client.

🚫 **Do NOT deduct Cleaning again from the client ledger.**
🚫 **Do NOT debit the client balance for platform-side cleaning rows.**
🚫 **Do NOT credit platform-side cleaning rows as client income.**
**Balance effect must be zero.**

The scope of "platform-side deductions" covered by this rule includes:
- Management Fee
- Cleaning (when it appears inside the Airbnb / Hostaway / JJ statement as a deduction before Net Owner Payout)
- Platform fees
- Taxes or other platform-side deductions

If the report displays a gross-to-net breakdown, these rows may appear as **informational only**.

Confirmed applies to the following specific rows:
- Uriel Duplex, Row 1645 (DB: 5bd7b43a), 2025-12-31, Cleaning, €1,010.00
- Tamir redisson, Row 1635 (DB: 73e33615), 2025-12-31, Cleaning, €710.00
- Ofri Makarios 5 Floor, Row 1804 (DB: a4ea6d74), 2026-02-28, Cleaning, €850.00

Affected audit issues resolved by this rule: BR-19a, BR-19b, BR-19c.

---

### RULE 1.4 — Purpose of the Client Report ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A3 — answered by ChatGPT / Yossi)*

**The Client Report is NOT a full property P&L.**

Its purpose is to calculate the **financial settlement between JJ and the property owner**.

The client ledger balance is affected only by:
1. Money received by JJ **on behalf of** the owner
2. Expenses actually **paid by JJ** on behalf of the owner
3. Charges **billed by JJ** to the owner (client_charge > 0)
4. Payments **between JJ and the owner** (transfers, bank payments)

Everything else has zero balance effect.

---

### RULE 1.5 — Owner-Paid Expenses Have Zero Balance Effect ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A3 — answered by ChatGPT / Yossi)*

When payer=Owner and JJ did not advance the money:
- JJ has no financial exposure on that transaction.
- The owner's balance with JJ does not change.
- **Balance effect must be zero.**

🚫 **Do NOT debit the client balance for owner-paid expenses.**
🚫 **Do NOT include owner-paid rows in the settlement calculation.**

These rows may optionally appear in an informational Property P&L section of the report, but must not affect the client ledger or the settlement balance.

Confirmed applies to the following specific rows:
- Uriel Duplex, Row 1640 (DB: ce564d27), Software/Hostaway, €240.00
- Uriel Duplex, Row 2054 (DB: 606a58b9), Software/Hostaway, €200.00
- Uriel Duplex, Row 2056 (DB: 5eb331b6), Guest Service Expenses, €130.00
- Ofri Makarios 5 Floor, Row 2059 (DB: 8e17fc0d), Software/Hostaway, €120.00
- Ofri Makarios 5 Floor, Row 2053 (DB: 4f764bfa), Guest Service Expenses, €312.00

Affected audit issues resolved by this rule: BR-12, BR-13, BR-14, BR-15, BR-16.

---

### RULE 1.6 — Client Report Has Three Logical Stages ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A4 — answered by ChatGPT / Yossi)*

The Client Report is structured in three sequential stages:

**Stage 1 — Operating Ledger (balance-affecting transactions only)**
Transactions that change the settlement balance:
- Platform Income received by JJ on behalf of the owner
- Expenses paid by JJ on behalf of the owner
- Charges billed by JJ to the owner (client_charge > 0)
- Client cash payments received by JJ
- Other approved balance-affecting transactions

**Stage 2 — Closing Balance**
The result of Stage 1. Represents how much JJ owes the owner (positive) or how much the owner owes JJ (negative) before any bank transfer is applied.

**Stage 3 — Settlement Section**
Displayed separately from the operating ledger:
- Closing Balance (carried from Stage 2)
- Bank Payment(s) to Owner (transfers JJ made to the owner)
- Remaining Balance (Closing Balance minus payments made)

---

### RULE 1.7 — Bank Payment to Owner Belongs in the Settlement Section Only ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A4 — answered by ChatGPT / Yossi)*

**Bank Payment to Owner is NOT an operating transaction.**

It is the settlement payment made after the balance has already been calculated.

🚫 **Do NOT include Bank Payment to Owner in the Stage 1 operating ledger.**
🚫 **Do NOT treat it as a normal debit/credit transaction.**

Bank Payment to Owner rows (subcategory=Bank Payment to Owner, payer=JJ, payee=Owner) belong exclusively in the Stage 3 Settlement section. They reduce the Remaining Balance — confirming that JJ has already transferred funds to the owner — but they do not affect the Closing Balance calculation.

This rule resolves audit issue DB-04 at the classification level (independent of the data correction still required for the duplicate DB records).

---

## SECTION 2 — CLIENT LEDGER MECHANICS

### RULE 2.1 — client_charge > 0 Is an Unconditional Billing Instruction ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A6 — answered by ChatGPT / Yossi)*

**If client_charge > 0 on an active transaction row, it is an explicit billing instruction. It must always debit the client balance.**

This applies regardless of: payer, payee, category, subcategory, or the value of amount_eur.

**Case 1 — amount_eur = 0 and client_charge > 0 (pure billing row):**
No cash moved through amount_eur. The client is being charged via client_charge only.
→ Debit the client by client_charge.

**Case 2 — amount_eur > 0 and client_charge > 0:**
A cash transaction exists AND a client charge is set. client_charge is the amount billed to the client.
→ Use client_charge as the client-facing charge amount.

🚫 **Do NOT route a row with client_charge > 0 to "other" with zero balance effect.**
🚫 **Do NOT ignore client_charge regardless of payer or category.**

**Duplicate/exclusion exception:** If a row is later confirmed as a duplicate or excluded historical row, it is removed through the correction process. While the row is active, client_charge > 0 is never ignored.

Confirmed debit amounts for the following specific rows:
- Row 1641 (DB: 93c5aecf), Uriel Duplex, Guest Supplies, CC=252 → debit client €252
- Row 590 (DB: 4795b32a), Ofri Makarios, Consumable Supplies, CC=221 → debit client €221 (subject to separate date correction B1)
- Row 1960 (DB: 6fcbfbbc), Tamir dekelia, Software/Hostaway, CC=160 → debit client €160
- Row 1957 (DB: 2f287785), Tamir redisson, Software/Hostaway, CC=160 → debit client €160
- Row 1321 (DB: cdd87174), Tamir dekelia, Design Fee, CC=500 → debit client €500
- Row 1018 (DB: 83c78020), Tamir redisson, Design Fee, CC=500 → debit client €500
- Row 1160 (DB: 88862704), Tamir dekelia, Photography, CC=600 → debit client €600
- Row 1344 (DB: 75433e3d), Tamir redisson, Photography, CC=600 → debit client €600

Affected audit issues resolved by this rule: BR-05, BR-06, BR-07, BR-08, BR-10a, BR-10b, BR-11a, BR-11b.

---

### RULE 2.2 — Client Cash Payment Must Affect the Client Ledger ✅ CONFIRMED
*Confirmed: 2026-06-30 (Question A5 — answered by ChatGPT / Yossi)*

**If payer=Client and amount_eur > 0, the transaction must NEVER have zero balance effect.**

It means the client/owner paid money to JJ or to a JJ-side person/entity. It must affect the client ledger. How it is shown depends on the subcategory:

**Type 1 — Fee / Charge paid by client to JJ:**
Subcategories: Design Fee, Management Fee, Photography, Setup Cost, other JJ service charges.
Treatment: Show as a **client charge / JJ fee** — reduces what JJ owes the owner.

**Type 2 — Explicit payment from client to JJ:**
Subcategories: Client Payment, Owner Payment to JJ, equivalent.
Treatment: Show as a **payment received from client** — reduces the client's outstanding debt.

🚫 **payer=Client + amount_eur > 0 must NEVER fall into "other" with zero balance effect.**

**Duplicate exception:** If a row is later confirmed as a duplicate (e.g., PD-02a pending Yossi review), it is excluded as a duplicate — not because payer=Client rows are exempt. While any row is active, this rule applies without exception.

Confirmed applies to the following specific rows (while active):
- Row 1020 (DB: acb42c5b), Uriel Duplex, Design Fee, €650.00 — must affect client ledger
- Row 1652 (DB: 24529070), Tamir redisson, Management Fee, €200.00 — must affect client ledger
- Row 1618 (DB: 4bfc2c40), Ofri Makarios 5 Floor, Management Fee, €70.00 — must affect client ledger if row remains active after duplicate review (C4)

Affected audit issues resolved by this rule: BR-09, BR-17, BR-18.

---

### RULE 2.3 — JJ-Paid Property Expense Billing Rule ✅ CONFIRMED
*Confirmed: 2026-06-30 (Group B / B5 — Yossi)*

**If payer ∈ JJ_PAYERS and the row is an active property operating expense, the client is billed for the full cost.**

The client_charge field controls the *amount billed*, not *whether* to bill:

- **client_charge = NULL** → bill client at amount_eur (actual cost)
- **client_charge > 0** → bill client at client_charge (may include JJ markup)

🚫 **Do NOT absorb JJ-paid property expenses as JJ's own cost unless the row falls into an explicit skip subcategory.**
🚫 **client_charge = NULL does not mean "do not bill" — it means "bill at cost".**

**Skip subcategories** (excluded from client billing regardless of payer):
`client payment, bank payment to owner, renovation contract, sale contract, purchase contract, third-party payment, deposit, deposit refund, transfer`

**Also excluded (handled by earlier classification steps):**
- Platform-side Management Fee and Cleaning already netted into Platform Income (Rule 1.2 Pattern A, Rule 1.3)
- Bank Payment to Owner (Rule 1.7)
- Owner-paid rows where JJ did not advance funds (Rule 1.5)
- Duplicate / pending-review rows

classifyTx implementation: JJ-paid expense catch-all fires for `payer ∈ JJ_PAYERS AND subLo ∉ SKIP_EXPENSE_SUBS`. A6 (client_charge > 0) fires first and overrides the billing amount when a markup exists.

This rule is global — applies across all active client properties and all categories (Airbnb, Management, Renovation, etc.).

---

### RULE 2.4 — Staff Accommodation Rent ✅ CONFIRMED
*Confirmed: 2026-06-30 (Group C / C2 — Yossi)*

**When JJ provides housing to its own staff on a client property, the arrangement produces two separate settlement effects that must never be mixed:**

**Layer 1 — Client Settlement (this report):**
- The client/owner earned rent on their property.
- Credit the owner identically to a normal Tenant Payment.
- Balance effect: negative (JJ owes owner the rent amount).

**Layer 2 — Partner/JJ Settlement (separate layer, not in client report):**
- JJ funded the accommodation as a staff expense.
- JJ absorbs this cost internally.
- Not handled in the client report.

**Transaction pattern:** category=Management, subcategory=Staff Accommodation Rent, payer=JJ.

🚫 **Do NOT route Staff Accommodation Rent through the JJ-paid expense catch-all (Rule 2.3).**
🚫 **Do NOT change payer from JJ to Tenant** — JJ staff are not external tenants.
🚫 **Do NOT mix client settlement and partner settlement layers.**

classifyTx implementation: Step 5b fires before the JJ-paid expense catch-all. Match: `cat === 'Management' && subLo === 'staff accommodation rent'` → `{ section: 'platform', label: 'Staff Accommodation Rent', credit: amt, debit: 0, balEff: -amt, infoOnly: false }`.

Confirmed example: Uriel Duplex, Excel Row 2058 (DB: 0fbf488c), corrected 2026-06-30, €1,000.00, staff accommodation for Fabi/Shifra Apr–May 2026.

---

### RULE 2.5 — Airbnb Cleaning vs Management Cleaning ✅ CONFIRMED
*Confirmed: 2026-06-30 (Group E / E1b — Yossi)*

**Cleaning fee treatment differs by category. The two must never be treated the same.**

#### Airbnb Cleaning (category = Airbnb, subcategory = Cleaning)
- Platform Income is always the **NET** amount after all platform-side deductions, including cleaning.
- Therefore: the cleaning fee is **already embedded in the Platform Income figure**.
- The Cleaning row is **informational only** — zero balance effect.
- **Do NOT bill the owner again for Airbnb cleaning.**
- classifyTx: A2 fires → `{ section: 'platform_info', balEff: 0, infoOnly: true }`
- A2 requires `PLATFORM_PAYERS.has(payer)` — payer must be Airbnb/platform. If payer=JJ on an Airbnb/Cleaning row, it remains infoOnly (same business meaning: the fee was platform-deducted, JJ is simply the recording entity).

#### Management Cleaning (category = Management, subcategory = Cleaning)
- Applies to long-term rental logic: JJ sends a cleaner at end of tenancy, or scheduled cleaning for a managed property.
- The owner **pays** for this cleaning separately — it is not embedded in any platform payout.
- This cleaning **must** be charged/deducted from the owner's balance.
- classifyTx: falls through to A6 (if client_charge > 0) or JJ-paid expense catch-all (Rule 2.3).

🚫 **Do NOT apply Airbnb Cleaning infoOnly treatment to Management Cleaning.**
🚫 **Do NOT double-bill an Airbnb Cleaning by treating it as a Management Cleaning.**
🚫 **Do NOT reverse a dedup decision on an Airbnb Cleaning row solely because payer=company — payer=company on an Airbnb Cleaning row is a recording convention, not a billing instruction (confirmed: E1b, 2026-06-30).**

**Confirmed example (E1b):** Tamir Dekelia, 2026-04-30, Airbnb/Cleaning, €770, payer=company (General.xlsx Row 1959). Platform Income for same period = €3,404.03 net. Cleaning is already embedded — kept as Airbnb-payer (infoOnly) record; company-payer record remains excluded. No +€770 charge to owner.

---

## SECTION 3 — TRANSACTION TYPE EXCLUSIONS

### RULE 3.1 — Contracts Are Not Cash Flows ✅ CONFIRMED
*Pre-existing rule from CLAUDE.md*

- subcategory = "Purchase Contract" → transaction value only. **Not a cash movement.**
- subcategory = "Sale Contract" → transaction value only. **Not a cash movement.**

Exclude from all cash flow calculations, cashbox balances, and partner balance statements.

---

### RULE 3.2 — Skip Subcategories (classifyTx) ✅ CONFIRMED
*Pre-existing rule from session documentation*

The following subcategories must be excluded from client balance calculations:

`client payment, bank payment to owner, renovation contract, sale contract, purchase contract, third-party payment, deposit, deposit refund, transfer`

---

## SECTION 4 — PAYER CLASSIFICATION

### RULE 4.1 — Payer Sets ✅ CONFIRMED
*Pre-existing rule*

| Set | Values |
|-----|--------|
| JJ_PAYERS | Yossi, Jacob, JJ, Anastasia |
| CLIENT_PAYERS | Client, Owner, Tenant |
| PLATFORM_PAYERS | Airbnb (incl. normalised: AIRBMB, COMPANI, CLAINT → Airbnb) |

---

## SECTION 5 — REPORTING PERIOD

### RULE 5.1 — Reporting Period Is Filter-Driven, Not Property-Specific ✅ CONFIRMED
*Confirmed: 2026-06-30 (C1 — Yossi)*

**There is no fixed reporting start date per property.**

All historical transactions remain in the database with their real dates. The Client Report always works from the user-selected date range filter. The same reporting engine must work for every property.

🚫 **Do NOT hardcode a property-specific reporting start date into the report engine.**
🚫 **Do NOT exclude pre-period rows from the database.**

Pre-period rows (e.g., Ofri Makarios rows dating to March 2025) are valid historical data and remain in the DB. They appear in the report only when the user's selected date range includes them.

---

## OPEN QUESTIONS REGISTER

*Full detail in the separate question log. Summary:*

| Q# | Topic | Status |
|----|-------|--------|
| A1 | Management Fee row display in client report | ✅ Confirmed — zero balance effect; informational only if shown |
| A2 | Cleaning Fee row — was it platform-deducted per property? | ✅ Confirmed — zero balance effect; informational only if shown |
| A3 | Owner-paid expenses — include in client report? | ✅ Confirmed — zero balance effect; report is settlement-only, not full P&L |
| A4 | Bank Payment to Owner display | ✅ Confirmed — Settlement section only (Stage 3); not in operating ledger |
| A5 | Client cash payment rule — any exceptions? | ✅ Confirmed — no exceptions; payer=Client + amount>0 always affects ledger (Type 1 = fee, Type 2 = payment) |
| A6 | Billing row rule — any exceptions? | ✅ Confirmed — no exceptions; client_charge > 0 always debits client, regardless of payer/category |
| B1 | Date correction — Row 590 (Consumable Supplies, Ofri) | ✅ Confirmed — date set to 2026-02-28, CC=221 |
| B2 | Date + CC correction — Row 591 (Hostaway, Ofri) | ✅ Confirmed — date set to 2026-02-28, CC=160 |
| B3 | Row 2053 (Guest hospitality, Ofri) — payer/cc clarification | ✅ Confirmed — amount_eur=0, CC=312, payer=Client; "Guest hospitality supplies billed to owner" |
| B4 | Row (Jacob-paid, Ofri) — two-layer settlement | ✅ Confirmed — CC=34.13, payer=Jacob stays; client owes JJ (Layer 1), JJ owes Jacob (Layer 2) |
| B5 | JJ-paid expense billing rule — scope | ✅ Confirmed — global rule (Rule 2.3); no SQL change, no CC change needed |
| C1 | Reporting period start date | ✅ Confirmed — filter-driven, no fixed start date (Rule 5.1) |
| C2 | Staff accommodation rent (Uriel Duplex, Row 2058) | ✅ Confirmed — Staff Accommodation Rent subcategory, credits owner, payer stays JJ (Rule 2.4) |
| C3 | Ofri €70 split (Rows 1618 + 1619) — both valid? | ✅ Confirmed — both valid Pattern B rows; global rule for manual splits (Rule 1.2 Pattern B) |
| Q8 | Fire safety expense + subcategory correction | ✅ Closed — Tom Dekelia `e505afa5` category corrected Renovation → Airbnb (2026-06-30) |
| Q9 | Uriel Duplex: consolidated €2,500 vs individual €500 payments | ✅ Closed — standalone contractor payment via lawyer; no duplicate (2026-06-30) |
| Q12 | Correct electricity amount DB-01 (€8.55 vs €10.00) | ✅ Closed — WhatsApp records confirm €8.55 is correct for both rows; no change (2026-06-30) |
| Q14 | Correct payer for BR-01b duplicate — Tamir Dekelia Mgmt Fee 2026-04-30 | ✅ Closed — source Excel Row 1959 confirms payer=JJ (`d978b87a`); Airbnb-payer record (`feec461f`) is the duplicate. Executed: feec461f soft-deleted + excluded; d978b87a restored. ⚠️ See audit note below. |
| Q15 | Authoritative DB record for DB-04 Bank Payment (Ofri Makarios 2026-06-04) | ✅ Closed — source Excel Row 2089 confirms single transfer; `49a6d8b5` is authoritative. `20eaeb18` (manual import) soft-deleted + excluded (2026-06-30). |

---

## AUDIT NOTES

### Note D-01 — Dedup Batch `dedup_2026_06_29` Made Incorrect Decision on Q14
*Logged: 2026-06-30*

During Group D investigation, a previous automated dedup run (`source_batch = 'dedup_2026_06_29'`) was found to have excluded the **wrong** record for the Tamir Dekelia Management Fee duplicate:

| Record | ID | Payer | Previous decision | Correct decision |
|--------|-----|-------|------------------|-----------------|
| `d978b87a` | Tamir Dekelia, 2026-04-30, €850.98 | JJ (company) | ❌ Excluded as duplicate | ✅ Authoritative — matches source Excel Row 1959 |
| `feec461f` | Tamir Dekelia, 2026-04-30, €850.98 | Airbnb | ❌ Kept as authoritative | ✅ Duplicate — not present in original source |

**Corrective actions taken (2026-06-30):**
1. Old exclusion on `d978b87a` set `is_active = false` (deactivated, preserved as audit trail).
2. New exclusion added for `feec461f` via Group D batch (`source_batch = 'Group D audit 2026-06-30'`).
3. `feec461f` soft-deleted (`is_deleted = true`, `deleted_by = 'Yossi — Group D audit 2026-06-30'`).

**Balance impact:** None. Both records routed to `platform_info` (zero balance) via A1 (Management Fee, payer ∈ {Airbnb, JJ}). The only report change is removal of the duplicate informational row.

**Action for Group E:** Audit all other decisions made by `dedup_2026_06_29` to verify no other records were excluded incorrectly.

---

### Note E-01 — Dedup Batch `dedup_2026_06_29` Full Audit Complete
*Logged: 2026-06-30*

All 8 active exclusions from the `dedup_2026_06_29` batch were reviewed. Results:

| Pair | Property | Subcategory | Amount | Decision | Reason |
|------|----------|-------------|--------|----------|--------|
| 1 | Liron and Alon | Client Payment | €1,000 | ✅ Correct | Same payer both sides; original import kept |
| 2 | Liron and Alon | Client Payment | €800 | ✅ Correct | Same payer both sides; original import kept |
| 3 | Ofri Makarios 5F | Platform Income | €3,917.49 | ✅ Reversed | Source Excel Row 2058: payer=company. Airbnb-payer archived. |
| 4 | Tamir Dekelia | Platform Income | €3,404.03 | ✅ Reversed | Source Excel Row 1961: payer=company. Airbnb-payer archived. |
| 5 | Tamir Dekelia | Cleaning | €770 | ✅ Kept as-is | E1b answer A: Airbnb Platform Income is NET. Cleaning already embedded. No charge to owner. (Rule 2.5) |
| 6 | Tom Dekelia | Platform Income | €1,553.96 | ✅ Reversed | Source Excel Row 2060: payer=company. Airbnb-payer archived. |
| 7 | Uriel Duplex | Platform Income | €1,900.52 | ✅ Reversed | Source Excel Row 2055: payer=company. Airbnb-payer archived. |
| 8 | Yogev Port | Client Payment | €11,905 | ✅ Correct | Same payer both sides; original import kept |

**Pair 5 intentionally excluded from reversal:** Airbnb/Cleaning and Management/Cleaning follow different business rules (Rule 2.5). The payer=Airbnb record remains the active authoritative record for this row. The payer=company duplicate from General.xlsx remains excluded.

**Balance impact of all reversals:** Zero — Platform Income fires on subcategory at line 416 of classifyTx regardless of payer.

**Batch source_batch references:**
- Old wrong exclusions deactivated: `is_active=false` on `dedup_2026_06_29` for Pairs 3, 4, 6, 7
- New correct exclusions inserted: `source_batch='Group E audit 2026-06-30'` for Pairs 3, 4, 6, 7

---

## REVIEW GROUP STATUS

| Group | Scope | Status |
|-------|-------|--------|
| A | Classification rules (Management Fee, Cleaning, Owner-paid, Bank Payment, client_charge, payer=Client) | ✅ Closed 2026-06-30 |
| B | Data corrections (dates, amounts, client_charge values, JJ-paid expense rule) | ✅ Closed 2026-06-30 |
| C | Business decisions (reporting period, pending-review rows, manual split rule) | ✅ Closed 2026-06-30 |
| D | Remaining open questions (Q8, Q9, Q12, Q14, Q15) | ✅ Closed 2026-06-30 |
| E | Dedup batch audit (`dedup_2026_06_29`) + client_report.html deployment | ✅ Closed 2026-06-30 |

---

*End of Business Rule Book v1.2 — updated 2026-06-30*
