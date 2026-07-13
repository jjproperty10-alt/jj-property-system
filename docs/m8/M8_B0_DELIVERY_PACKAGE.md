# M8-B0 — Business Fact Completion & Migration Design
**Date:** 2026-07-13 · **Updated:** 2026-07-13 (authoritative Yossi business update)
**Status:** AWAITING YOSSI + CHATGPT APPROVAL — no SQL, no migration, design only  
**Scope:** Villa Mazotos (Avi, 50%) · Villa Mazotos 2 (Oren, 35%)  
**Principle:** Business Reality First. DB records facts; it does not create them.

> **📌 UPDATE 2026-07-13 — CONFIRMED FACTS FROM YOSSI (authoritative):**
> - Villa Mazotos Purchase Price: **€400,000** ✅
> - Avi Agreed Entry Valuation: **€500,000** ✅ ← Hard blocker D1 **RESOLVED**
> - Avi Required Entry Capital: **€250,000** (= €500K × 50%) ✅
> - Avi Capital Paid: **€250,000** (€200K to seller + €50K to Yossi) ✅
> - Avi Capital Remaining: **€0** — entry fully paid ✅
> - €50K to Yossi = partner-entry capital, **NOT JJ operating income** ✅
> - JJ Entry Margin (confidential): **~€50,000** ✅
> - Villa Mazotos 2 / Oren: **B3 RESOLVED 2026-07-13** — Purchase Price €400,000 ✅ · Entry Valuation **€520,000** ✅ · Ownership 35% ✅ · Required Capital **€182,000** ✅ · JJ entry margin **€42,000** (internal only) ✅ · Oren from inception ✅ · Capital paid: ❌ UNKNOWN (do not infer)
> - Legacy DB row (2024-06-16, Owner→Yossi) shows €30,000. **Known historical data correction: €30K is the old incorrect value; €50K is the approved authoritative amount.** No unexplained gap.
> - Renovation rows (€5.6K + €5K + €20K = €30.6K) are **billable events, not capital** — ClientCharge on renovation costs

---

## LOCKED PRINCIPLES (reference — do not modify)

| Principle | Rule |
|---|---|
| P1 | Business Reality First |
| P2 | DB records business facts. Does not create them. |
| P3 | Purchase Price ≠ Partner Entry Valuation |
| P4 | Capital Paid ≠ Required Entry Capital |
| P5 | Ownership % ≠ Amount Paid |
| P6 | Entry Date ≠ Payment Date |
| P7 | Ownership Effective Date ≠ Profit Participation Start |
| P8 | Every field: Why does this value exist? From which Business Source? |
| P9 | Corrections: void-and-replace. No silent UPDATE of confirmed events. |

---

## PART 1 — BUSINESS DECISION WORKSHEET

### Confidence Scale

| Code | Meaning |
|---|---|
| ✅ CONFIRMED | Documented, certain, approved by Yossi. Can enter DB. |
| 🔶 INFERRED | Reasonable from evidence. Cannot enter DB until Yossi confirms + cites source. |
| ❌ UNKNOWN | No basis. Yossi must supply from memory, agreement, or bank records. |
| N/A | Not applicable to this case. |

---

## Case 1 — Villa Mazotos

### 1-A: Original Acquisition (JJ Internal — never shown to Avi)

| Field | Value | Confidence | Business Source | Source Reference | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|---|---|
| canonical_entity_id | `villa-mazotos` (proposed) | 🔶 INFERRED | DB property name | `transactions.property = 'Villa Mazotos'` | Yossi | Yes | Must be formally assigned; existing `property_definitions` row exists |
| acquisition_date (contract) | 2024-04-15 | 🔶 INFERRED | Transaction evidence | CSV row: Purchase Contract, date 2024-04-15 | Yossi | Yes | Contract date ≠ closing/transfer date; need both |
| acquisition_date (closing) | ❓ | ❌ UNKNOWN | No document in system | — | Yossi | Yes | When title transferred to JJ+Avi? Notary deed reference? |
| purchase_price (contract) | €400,000 | 🔶 INFERRED | Transaction: Purchase Contract row | CSV: category=Purchase, subcategory=Purchase Contract, amount=€400,000 | Yossi | Yes | Is this the full agreed price or only JJ portion? |
| currency | EUR | ✅ CONFIRMED | All transactions in EUR | — | — | — | — |
| seller | Unknown | ❌ UNKNOWN | Not in any document on file | — | Yossi | No | Nice to have |
| JJ purchase payments to seller | €200,000 | 🔶 INFERRED | Transaction rows | Yossi €120,000 (3 rows) + Jacob €80,000 (2 rows) to payee=Owner | Yossi | No | Sum of direct payments by Yossi+Jacob to seller |
| Avi purchase payment to seller | €200,000 | 🔶 INFERRED | Transaction row | 2024-10-10: payer=Owner, payee=Owner, €200,000, desc "אבי העביר למוכר" | Yossi | Yes | **DECISION REQUIRED:** Was this Avi paying his 50% of purchase price directly to seller? |
| purchase_expenses — stamps/lawyer (Yossi) | €750 | 🔶 INFERRED | Transaction | 2024-04-17, Yossi→Yanis, "בולים יאניס" | Yossi | No | Lawyer stamps |
| purchase_expenses — purchase tax | €14,300 (total) | 🔶 INFERRED | Multiple transaction rows | Oct 2024, Yossi+Jacob+Anastasia → Yanis/company | Yossi | No | Breakdown: Yossi €1,750, Jacob €10,150, Anastasia €2,400 |
| total_jj_cost | ~€214,300 | ❌ UNKNOWN | Derived from inferred values | = €200,000 JJ share + €14,300 expenses | Yossi | Yes | Cannot confirm until purchase price and all expenses confirmed |
| acquisition_method | Direct purchase | 🔶 INFERRED | Transaction structure | — | Yossi | No | — |
| purchase_contract_reference | ❓ | ❌ UNKNOWN | No contract number on file | — | Yossi | No | Contract date known; doc reference needed for audit trail |
| notary_reference | ❓ | ❌ UNKNOWN | — | — | Yossi | No | — |
| acquisition_status | Completed | 🔶 INFERRED | Property is in active use (Airbnb income rows) | — | Yossi | No | — |

**OPEN DECISION 1-A-i:** The Purchase Contract row is €400,000. Avi paid €200,000 directly to the seller. JJ (Yossi+Jacob) paid €200,000 to the seller. Total = €400,000. Is this interpretation correct? Or did Avi pay his €200K through JJ accounts?

---

### 1-B: Avi Partner Entry (Partner-visible fields)

| Field | Value | Confidence | Business Source | Source Reference | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|---|---|
| canonical_partner_name | Avi | ✅ CONFIRMED | Mandate — confirmed fact | M8-B0 mandate 2026-07-13 | — | — | Not a JJ company partner; property-level investor only |
| entity_type | external_property_partner | ✅ CONFIRMED | Mandate | M8-B0 mandate + EXTERNAL_PARTNER_ENTITY_ARCHITECTURE.md | — | — | Distinct from Yossi/Jacob/JJ |
| ownership_pct | 50% | ✅ CONFIRMED | CLAUDE.md + property_owners table | `property_owners`: Avi 50%, Yossi 25%, Jacob 25% | — | — | — |
| jj_ownership_pct | 50% (Yossi 25% + Jacob 25%) | ✅ CONFIRMED | CLAUDE.md | — | — | — | JJ remains undivided in lifecycle records |
| entry_date (ownership effective) | ❓ | ❌ UNKNOWN | No signed agreement on file | Earliest candidate: 2024-04-15 (contract date) or 2024-10-10 (closing candidate) | Yossi | Yes | **DECISION REQUIRED: When did Avi's 50% ownership legally begin?** |
| profit_participation_start | ❓ | ❌ UNKNOWN | No agreement | Likely = entry_date but may differ contractually | Yossi | Yes | **DECISION REQUIRED: Same as entry_date or different?** |
| loss_participation_start | ❓ | ❌ UNKNOWN | No agreement | — | Yossi | No | Assume = profit_participation_start unless stated otherwise |
| agreed_entry_valuation | **€500,000** | Yossi confirmed 2026-07-13 | ✅ CONFIRMED | — | — | **D1 RESOLVED** |
| required_entry_capital | **€250,000** | = €500,000 × 50% | ✅ CONFIRMED | — | — | — |
| capital_paid (installment 1 — seller) | **€200,000** | Transaction: Owner→Owner, 2024-10-10, "אבי העביר למוכר" | ✅ CONFIRMED | Avi paid seller directly (his 50% of €400K purchase price) | — | — |
| capital_paid (installment 2 — Yossi) | **€50,000** | Yossi confirmed 2026-07-13. DB row: Owner→Yossi, 2024-06-16, €30,000, "אבי נתן ליוסי". Legacy DB shows €30K — known historical data correction; €30K is the old incorrect value, €50K is the approved authoritative amount. | ✅ CONFIRMED (amount) / ⚠️ DB legacy correction | **THIS IS PARTNER-ENTRY CAPITAL — not JJ operating income. DB row is currently category=JJ Income. Reclassification required.** | No (reclassification is post-M8-B scope) | — |
| capital_paid (total) | **€250,000** | Sum of both installments | ✅ CONFIRMED | — | — | — |
| capital_remaining | **€0** | = €250,000 − €250,000 | ✅ CONFIRMED | — | — | — |
| is_entry_fully_paid | **TRUE** | Confirmed 2026-07-13 | ✅ CONFIRMED | — | — | — |
| partnership_agreement_reference | ❓ | ❌ UNKNOWN | No document on file | — | Yossi | No | Is there a written partnership agreement with Avi? |
| exit_rights | ❓ | ❌ UNKNOWN | No agreement reviewed | — | Yossi | No | Waterfall? Preferred return? Pro-rata? |
| contractual_exceptions | ❓ | ❌ UNKNOWN | No agreement reviewed | — | Yossi | No | Any deviation from proportional split? |
| status | active | 🔶 INFERRED | Property in active Airbnb use | — | Yossi | No | — |

**📌 CAPITAL RECONCILIATION — Updated 2026-07-13:**

Yossi confirmed total capital paid = **€250,000** in two installments. DB rows mapped:

| Installment | Date | Payer→Payee | DB Amount | Confirmed Amount | Status | Classification |
|---|---|---|---|---|---|---|
| #1 (to seller) | 2024-10-10 | Owner→Owner | €200,000 | **€200,000** | ✅ Matches | Capital payment (Avi's 50% of purchase price to seller directly) |
| #2 (to Yossi) | 2024-06-16 | Owner→Yossi | €30,000 (legacy) | **€50,000** | ✅ Known historical correction | Partner-entry capital (NOT JJ income). The €30,000 in the DB is the old incorrect value. The authoritative approved amount is €50,000. |

**Known historical data correction on installment #2:**
The legacy DB row shows €30,000. The approved authoritative business fact is €50,000. This is not an unexplained missing payment — it is a previously approved correction. The €20,000 difference is the gap between the wrong historical entry and the correct business fact.

**Future correction model:**
1. Preserve the original €30,000 row for audit history (do not delete)
2. Mark it as superseded / historically corrected (void-and-replace lifecycle)
3. Create one authoritative capital event for **€50,000**, referencing the legacy transaction row
4. Do not create two separate events (€30,000 + €20,000) — there was one payment of €50,000
5. Remove from JJ Income classification; classify under Villa Mazotos partner-entry capital

**What the three other rows are (NOT capital):**

| Date | Payer→Payee | Amount | Category | Classification per confirmed facts |
|---|---|---|---|---|
| 2024-11-16 | Client→Jacob | €5,600 | Purchase | **Renovation billable event** (Avi's ClientCharge share) |
| 2024-11-16 | Client→Jacob | €5,000 | Renovation | **Renovation billable event** (Avi's ClientCharge share) |
| 2025-07-10 | Client→JJ | €20,000 | Renovation | **Renovation billable event** (Avi's ClientCharge share) |

These three rows total €30,600. Per confirmed facts, Avi's required capital is fully paid (€250K). These are renovation charges billed to Avi — not capital contributions. They belong in the Billable Events model, not the capital ledger.

---

### 1-C: JJ Side — Villa Mazotos (JJ Internal, never shown to Avi)

| Field | Value | Confidence | Business Source | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|---|
| jj_total_acquisition_cost | ~€414,300 | 🔶 INFERRED | Purchase price €400K + closing costs ~€14.3K | Yossi | No — internal only | Closing costs approximate until all expense rows confirmed |
| jj_margin_from_avi_entry | **~€50,000** | ✅ CONFIRMED (approx) | = €250,000 − (€400,000 × 50%) = €250,000 − €200,000 = €50,000. Exact: €250,000 − (€414,300 × 50%) ≈ €42,850 | Yossi | No — internal only | **NEVER shown to Avi. Exact value pending closing costs confirmation.** |
| yossi_ownership_pct | 25% | ✅ CONFIRMED | CLAUDE.md | — | — | JJ internal split |
| jacob_ownership_pct | 25% | ✅ CONFIRMED | CLAUDE.md | — | — | JJ internal split |
| jj_capital_at_risk_post_entry | **~€150,000** | ✅ CONFIRMED (approx) | = €400,000 − €250,000 = €150,000 | Yossi | No — internal only | Using purchase price as proxy; exact: ~€164,300 with closing costs |

---

## Case 2 — Villa Mazotos 2

### 2-A: Original Acquisition (JJ Internal — never shown to Oren)

| Field | Value | Confidence | Business Source | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|---|
| canonical_entity_id | `villa-mazotos-2` (proposed) | 🔶 INFERRED | DB property name | Yossi | Yes | — |
| acquisition_date (contract) | ❓ | ❌ UNKNOWN | No contract row in CSV | Earliest TX: 2026-01-19 (deposit) — likely pre-contract | Yossi | Yes | **Contract signed when? With whom?** |
| acquisition_date (closing) | ❓ | ❌ UNKNOWN | No data | — | Yossi | Yes | Property likely not yet closed (very few TXs) |
| purchase_price | **€400,000** | ✅ CONFIRMED | Yossi confirmed 2026-07-13 | — | — | No | — |
| deposit_paid | €10,000 | 🔶 INFERRED | Transaction | 2026-01-19, Jacob→Yanis, "דיפוזיט" | Yossi | No | Payer=Jacob; is this JJ deposit or Oren's portion? |
| brokerage_paid | €3,000 | 🔶 INFERRED | Transaction | 2026-01-26, Jacob→Owner, "תיווך לניקוס עח" | Yossi | No | Jacob paid brokerage. Is this JJ cost? |
| total_jj_cost | ❓ | ❌ UNKNOWN | Only €13,000 in TXs so far | — | Yossi | Yes | Acquisition is early-stage or incomplete in DB |
| acquisition_status | **In progress** | ✅ CONFIRMED | Yossi confirmed 2026-07-13 | — | No | — |
| seller / counterparty | Unknown (paid to Nikos?) | 🔶 INFERRED | "תיווך לניקוס עח" = brokerage to Nikos | Yossi | No | — |
| currency | EUR | ✅ CONFIRMED | Transactions | — | — | — |

### 2-B: Oren Partner Entry (Partner-visible)

| Field | Value | Confidence | Business Source | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|---|
| canonical_partner_name | Oren | ✅ CONFIRMED | CLAUDE.md + property_owners | — | — | Property-level investor, not JJ company partner |
| ownership_pct | 35% | ✅ CONFIRMED | CLAUDE.md: "Oren 35%, Yossi 32.5%, Jacob 32.5%" | Yossi | — | — |
| jj_ownership_pct | 65% (Yossi 32.5% + Jacob 32.5%) | ✅ CONFIRMED | CLAUDE.md | — | — | — |
| entry_date | **From acquisition inception** | ✅ CONFIRMED (business sequence) | Yossi confirmed 2026-07-13 — Oren entered together with JJ from the start of the purchase transaction | — | No | Exact calendar date = awaits signed purchase contract. Status: confirmed_business_sequence_pending_exact_date |
| agreed_entry_valuation | **€520,000** | ✅ CONFIRMED | Yossi confirmed 2026-07-13 | — | — | — |
| required_entry_capital | **€182,000** | ✅ CONFIRMED | = €520,000 × 35%. Yossi confirmed 2026-07-13 | — | — | — |
| capital_paid | ❓ | ❌ UNKNOWN | No Oren payment rows confirmed yet | — | Yossi | No — data entry when known | Do not infer from deposit/brokerage rows (payer=Jacob) |
| capital_remaining | ❓ | ❌ UNKNOWN | = €182,000 − capital_paid. Cannot calculate. | — | Yossi | No | Derives from capital_paid |
| profit_participation_start | **From acquisition inception** | ✅ CONFIRMED (business sequence) | Same as entry — Oren participates in all lifecycle economics from start of joint purchase | — | No | Exact date pending contract |
| partnership_agreement_reference | ❓ | ❌ UNKNOWN | No document on file | Yossi | No | Written agreement exists? |
| status | Active / in progress | ✅ CONFIRMED | Acquisition in progress, Oren from inception | — | No | — |

### 2-C: JJ Side — Villa Mazotos 2 (Internal)

| Field | Value | Confidence | Approver | Blocks M8-B? | Notes |
|---|---|---|---|---|---|
| jj_total_acquisition_cost | ~€400,000 (+ closing costs TBD) | ✅ CONFIRMED (approx) | Yossi confirmed 2026-07-13 | No | Exact with closing costs TBD |
| jj_cost_basis_for_oren_35pct | **€140,000** | ✅ CONFIRMED | = €400,000 × 35%. Confirmed 2026-07-13. | No — internal | — |
| jj_margin_from_oren_entry | **€42,000** | ✅ CONFIRMED | = €182,000 − €140,000. Confirmed 2026-07-13. | No — internal | **NEVER shown to Oren** |
| jj_net_capital_at_risk_post_oren | **~€218,000** | ✅ CONFIRMED (approx) | = €400,000 − €182,000. Confirmed 2026-07-13. | No | Exact pending closing costs |
| yossi_ownership_pct | 32.5% | ✅ CONFIRMED | CLAUDE.md | — | — |
| jacob_ownership_pct | 32.5% | ✅ CONFIRMED | CLAUDE.md | — | — |

---

## PART 2 — CONFIRMED FACTS (ready for M8-B)

| # | Fact | Value | Source |
|---|---|---|---|
| F1 | Villa Mazotos — Avi ownership % | 50% | CLAUDE.md + property_owners table |
| F2 | Villa Mazotos — JJ ownership % | 50% | CLAUDE.md |
| F3 | Villa Mazotos — Yossi JJ split | 25% | CLAUDE.md |
| F4 | Villa Mazotos — Jacob JJ split | 25% | CLAUDE.md |
| F5 | Villa Mazotos — Avi capital paid (installment 1 to seller) | €200,000 | Transaction: Owner→Owner, 2024-10-10, "אבי העביר למוכר" — Avi paid seller directly |
| F6 | Villa Mazotos — Avi capital paid (installment 2 to Yossi) | **€50,000** (authoritative) | Yossi confirmed 2026-07-13. Legacy DB row shows €30K — known historical data correction; €30K is the wrong old value; €50K is the approved authoritative amount. |
| F6b | Villa Mazotos — installment 2 is PARTNER-ENTRY CAPITAL | Not JJ operating income. DB row currently category=JJ Income — reclassification required (post-M8-B scope). | Yossi confirmed 2026-07-13 |
| F7 | Villa Mazotos — Purchase Contract value | €400,000 | CSV transaction row, subcategory=Purchase Contract, 2024-04-15 |
| F17 | Villa Mazotos — Avi agreed entry valuation | **€500,000** | Yossi confirmed 2026-07-13. D1 RESOLVED. |
| F18 | Villa Mazotos — Avi required entry capital | **€250,000** | = €500,000 × 50%. Confirmed 2026-07-13. |
| F19 | Villa Mazotos — Avi capital paid (total) | **€250,000** | €200K (seller) + €50K (Yossi). Confirmed 2026-07-13. |
| F20 | Villa Mazotos — Avi capital remaining | **€0** | Avi has paid his required entry capital in full. Confirmed 2026-07-13. |
| F21 | Villa Mazotos — Avi is_entry_fully_paid | **TRUE** | Confirmed 2026-07-13. |
| F22 | Villa Mazotos — JJ entry margin from Avi | **~€50,000** (internal only) | = €250,000 − (€400,000 × 50%). Exact pending closing costs. NEVER shown to Avi. |
| F23 | Villa Mazotos renovation rows are billable events | €5,600 + €5,000 + €20,000 = €30,600 are ClientCharge rows (renovation billing), NOT capital | Yossi confirmed 2026-07-13 — Avi's capital is fully paid at €250K; these rows are operational charges |
| F8 | Villa Mazotos — Avi is property-level investor only | Not a JJ Property 10 company partner | Mandate 2026-07-13 |
| F9 | Villa Mazotos 2 — Oren ownership % | 35% | CLAUDE.md + property_owners table |
| F10 | Villa Mazotos 2 — JJ ownership % | 65% | CLAUDE.md |
| F11 | Villa Mazotos 2 — Yossi JJ split | 32.5% | CLAUDE.md |
| F12 | Villa Mazotos 2 — Jacob JJ split | 32.5% | CLAUDE.md |
| F13 | Oren is property-level investor only | Not a JJ Property 10 company partner | Mandate 2026-07-13 |
| F14 | JJ remains undivided in Investment Lifecycle records | Do not split JJ into Yossi/Jacob at this layer | Mandate 2026-07-13 |
| F15 | JJ Internal acquisition margin must never appear in partner-facing projections | Avi/Oren must not see JJ's purchase price or margin | Mandate 2026-07-13 + ADR_M8 |
| F16 | Capital events are append-only after confirmation | Void-and-replace for corrections | ADR_M8_INVESTMENT_LIFECYCLE.md |
| F24 | Villa Mazotos 2 — Oren agreed entry valuation | **€520,000** | Yossi confirmed 2026-07-13. B3 RESOLVED. |
| F25 | Villa Mazotos 2 — Oren required entry capital | **€182,000** | = €520,000 × 35%. Yossi confirmed 2026-07-13. |
| F26 | Villa Mazotos 2 — Oren inception participation | From acquisition start — same lifecycle model as Avi | Yossi confirmed 2026-07-13. Status: confirmed_business_sequence_pending_exact_date. |
| F27 | Villa Mazotos 2 — JJ entry margin from Oren | **€42,000** (= €182,000 − €140,000) | Yossi confirmed 2026-07-13. **Internal only — NEVER shown to Oren.** |
| F28 | Villa Mazotos 2 — purchase price | **€400,000** | Yossi confirmed 2026-07-13. |
| F29 | Villa Mazotos 2 — acquisition status | **In progress** | Yossi confirmed 2026-07-13. |

---

## PART 3 — UNKNOWN FACTS (Yossi must decide before M8-B SQL)

| # | Unknown | Why it blocks | What Yossi must supply |
|---|---|---|---|
| U1 | Villa Mazotos — agreed entry valuation for Avi | Blocks required_entry_capital, JJ margin, capital_remaining | "The entry valuation agreed with Avi when he entered the partnership was €[X]" + the source document |
| U2 | Villa Mazotos — entry date (ownership effective) | Blocks partner_entry record creation | "Avi's 50% began on [date]" — contract date? Deed date? Payment date? |
| U3 | Villa Mazotos — profit participation start date | May differ from entry date | "Avi starts participating in profits from [date]" |
| U4 | Villa Mazotos — capital paid breakdown (bank source) | €50,000 confirmed; need to know which specific payment(s) to create correct capital_events | Which transactions constitute Avi's €50,000? (dates + refs) |
| U5 | Villa Mazotos — gap: DB shows ~€40,600, confirmed = €50,000 | €9,400 unaccounted in DB | Was there an additional payment not recorded? |
| U6 | Villa Mazotos — acquisition closing date | Entry date cannot precede closing | Exact date property title transferred to JJ+Avi |
| ~~U7~~ | ~~Villa Mazotos 2 — agreed entry valuation for Oren~~ | **✅ RESOLVED 2026-07-13** — €520,000 | — |
| ~~U8~~ | ~~Villa Mazotos 2 — acquisition status~~ | **✅ RESOLVED 2026-07-13** — In progress | — |
| ~~U9~~ | ~~Villa Mazotos 2 — purchase price~~ | **✅ RESOLVED 2026-07-13** — €400,000 | — |
| U10 | Villa Mazotos 2 — Oren exact entry date | Exact calendar date from signed contract | Signed purchase contract or approved legal source |
| U11 | Villa Mazotos 2 — Oren capital paid | No payment rows confirmed for Oren in DB. Do not infer. | Has Oren paid anything? Amount? When? |
| U12 | Partnership agreement documents | Required for BusinessSource.reference | Are there signed partnership agreements with Avi and Oren? |

---

## PART 4 — CONFLICTING FACTS

| # | Conflict | Description | Resolution required |
|---|---|---|---|
| C1 | Villa Mazotos — €200,000 payer identity | Row: payer=Owner, payee=Owner, "אבי העביר למוכר". Payer=Owner in DB obscures that this was Avi paying seller directly. | Yossi to confirm: was this Avi's direct payment? If yes, this row needs payer_correction to 'Avi' |
| C2 | Villa Mazotos — Capital Paid evidence gap | Confirmed €50,000 ≠ DB evidence sum ~€40,600. €30,000 JJ Income row has notes='???' (pre-existing uncertainty). | Yossi to reconcile: which transactions = Avi's €50K capital? |
| C3 | Villa Mazotos — Is €30,000 "profit" or "entry capital"? | Row categorized as JJ Income ("רווח מהוילה מזוטוס"). Per Principle 6 (€50K is Capital Paid, not JJ income), this may be miscategorized. | Yossi to decide: was the €30,000 paid by Avi to Yossi part of Avi's entry capital contribution, or an actual profit distribution? |
| C4 | Villa Mazotos — Possible duplicate Avi payment | Prior audit (2026-06-22) flagged a potential duplicate €200,000 row (Owner→Owner). The CSV has only 1 such row. | Confirmed in DB: one row has review_status='confirmed_duplicate'? Or was it cleaned? Verify in DB. |
| C5 | Villa Mazotos — purchase_expenses attribution | €2,400 paid by Anastasia categorized as Purchase Expense. Per Partner Capital Rule: Anastasia ≠ Yossi/Jacob/JJ. How does this affect JJ total cost? | Yossi to confirm: does Anastasia's €2,400 count as JJ cost (reimbursed to Anastasia) or as Anastasia's personal cost? |

---

## PART 5 — BUSINESS SOURCES AVAILABLE

| Source Type | Available | Notes |
|---|---|---|
| Partnership agreement (Avi) | ❓ Unknown | Yossi must confirm if signed document exists |
| Partnership agreement (Oren) | ❓ Unknown | Yossi must confirm if signed document exists |
| Purchase contract (Villa Mazotos) | Partial — date 2024-04-15, amount €400K in DB | Full document not on file in system |
| Purchase contract (Villa Mazotos 2) | ❌ Not found | No Purchase Contract row in CSV |
| Notary deed (Villa Mazotos) | ❓ Unknown | Lawyer Yanis reference known; deed document not on file |
| Bank transfers (Avi capital) | ❓ Partial | Transaction descriptions exist; bank transfer references unknown |
| WhatsApp/email agreement | ❓ Unknown | If no signed doc, Yossi to confirm via WhatsApp record |
| JJ internal record | ✅ Available | CLAUDE.md, property_owners table, M8 mandate |
| Transaction rows | ✅ Available (2,127 rows) | Evidence only; not treated as legal source |

---

## PART 6 — EXISTING DATA RECONCILIATION

### 6-A: Records that already match confirmed facts

| Source | Field | Value | Status |
|---|---|---|---|
| `property_owners` table | Avi 50%, Yossi 25%, Jacob 25% (Villa Mazotos) | Matches F1–F4 | ✅ Matches |
| `property_owners` table | Oren 35%, Yossi 32.5%, Jacob 32.5% (Villa Mazotos 2) | Matches F9–F12 | ✅ Matches |
| `property_definitions` table | Villa Mazotos: type='partnership' | Correct | ✅ Matches |
| `property_definitions` table | Villa Mazotos 2: type='partnership' | Correct | ✅ Matches |
| `transactions` CSV | Purchase Contract €400,000, 2024-04-15 | Matches F7 | ✅ Matches |
| `transactions` CSV | Avi payment €200,000 to seller, 2024-10-10 | Matches Avi's 50% share of €400K | ✅ Matches (pending payer correction) |

### 6-B: Records that are incomplete

| Source | Gap | Impact |
|---|---|---|
| `transactions` | No canonical `partner_entry` record for Avi | Lifecycle model has no Avi entry start date or agreed valuation |
| `transactions` | No `property_acquisition` record; only individual payment rows | Cannot link payments to a formal acquisition event |
| `transactions` | Avi capital_paid rows not tagged as capital events; categorized as JJ Income / Purchase / Renovation | Misclassified in current system; cannot auto-derive ledger from category labels |
| `property_owners` | Ownership% only; no entry_date, no valuation, no capital tracking | Ownership model has no temporal or financial dimension |
| `transactions` | Villa Mazotos 2: only €13,000 in TXs; no contract row | DB is far behind reality on VM2 |

### 6-C: Records that conflict

| Source | Conflict | Detail |
|---|---|---|
| `transactions` (JJ Income row) | €30,000 payer=Owner, "Avi gave Yossi profit" | Notes='???'; may be entry capital wrongly labeled as income |
| `transactions` (Purchase row) | Client→Jacob €5,600 "Avi gave Jacob" | Payer=Client, should be Avi; mislabeled payer |
| `transactions` (Renovation row) | Client→Jacob €5,000 "on account of renovation" | May be Avi's renovation contribution, not a partner capital event |
| Total inferred Avi payments | ~€40,600 | Does not match confirmed €50,000; €9,400 missing |

### 6-D: Records that should be superseded

| Record | Action | Reason |
|---|---|---|
| Current `v_property_pl_split` Avi rows | Do not delete; mark as pre-lifecycle-model output | Will be superseded by M8 partner investment report; old view not authoritative for lifecycle |
| `property_owners` ownership% only | Will be supplemented (not replaced) by `partner_entry` + `ownership_period` | property_owners remains as reference; lifecycle adds temporal + capital dimension |

### 6-E: Records that must remain untouched

| Table/View | Rule |
|---|---|
| `transactions` | No DELETE, no UPDATE of confirmed rows. `review_status` only. |
| `v_cashbox_audit`, `v_anastasia_clearing`, `v_employee_reimbursements`, `v_ceo_summary`, `v_jj_company_pl` | Existing engines must not change |
| `computeBalance.ts` | No changes |
| All Accounting Engine, Settlement Engine, Portfolio Engine, Reporting Engine code | No changes |
| RLS policies on `transactions` | No changes |

### 6-F: Legacy rows requiring mapping into Lifecycle model

| Row type | Property | How to map |
|---|---|---|
| Purchase Contract (€400K) | Villa Mazotos | → `property_acquisition.purchase_price_eur` (after Yossi confirms) |
| Purchase Payments (Yossi+Jacob to Owner) | Villa Mazotos | → `capital_event` type=`acquisition_payment`, counterparty=`JJ`, direction=`out` |
| Avi payment to Seller (Owner→Owner €200K) | Villa Mazotos | → `capital_event` type=`partner_acquisition_payment`, counterparty=`Avi`, direction=`out` — PENDING payer correction |
| JJ Income €30K "Avi gave Yossi" | (NULL property, related to Villa Mazotos) | → **DECISION C3 required first**: capital_event or distribution? |
| Client→Jacob €5,600 "Avi gave Jacob" | Villa Mazotos | → `capital_event` type=`capital_payment`, counterparty=`Avi` — PENDING Yossi confirmation |
| Renovation Client Payment €5,000 | Villa Mazotos | → May be `capital_event` or renovation cost-sharing — PENDING Yossi confirmation |
| Renovation Client Payment €20,000 | Villa Mazotos | → Same — PENDING Yossi confirmation |
| VM2 Deposit €10,000 (Jacob→Yanis) | Villa Mazotos 2 | → `capital_event` type=`acquisition_deposit`, counterparty=`JJ` — pending acquisition record |
| VM2 Brokerage €3,000 (Jacob→Owner) | Villa Mazotos 2 | → `capital_event` type=`acquisition_expense`, counterparty=`JJ` |

---

## PART 7 — PROPOSED M8-B SCHEMA DESIGN

> No SQL. No migrations. Design only. Every table below is a proposal pending approval.

### 7-A: Core Tables

---

#### Table: `property_acquisition`

**Purpose:** One confirmed acquisition event per property. Records JJ's internal economics of buying the asset. Never shown to partners directly.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK, gen_random_uuid() |
| entity_id | TEXT | NOT NULL | Canonical property identifier. Matches property_definitions.property_name (or future canonical_id). |
| acquisition_type | TEXT | NOT NULL | 'direct_purchase', 'phased_purchase', 'inherited'. CHECK IN ('direct_purchase', 'phased_purchase', 'inherited', 'gift') |
| purchase_price_eur | NUMERIC(12,2) | NULLABLE | Agreed price per purchase contract. Null if unknown. |
| total_jj_cost_eur | NUMERIC(12,2) | NULLABLE | Purchase price + all JJ acquisition expenses. Null until all expenses confirmed. |
| acquisition_date_contract | DATE | NULLABLE | Purchase contract date. |
| acquisition_date_closing | DATE | NULLABLE | Title transfer / notary deed date. Often ≠ contract date. |
| currency | TEXT | NOT NULL DEFAULT 'EUR' | |
| seller_name | TEXT | NULLABLE | Seller's name; optional. |
| purchase_contract_ref | TEXT | NULLABLE | Contract document reference. |
| notary_ref | TEXT | NULLABLE | Notary deed reference. |
| status | TEXT | NOT NULL DEFAULT 'pending_verification' | 'pending_verification', 'confirmed', 'void'. CHECK constraint. |
| business_source_id | UUID | NULLABLE | FK → business_source.id. Required when status='confirmed'. |
| recorded_by | TEXT | NOT NULL | Who entered this record. |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraints:**
- UNIQUE (entity_id) WHERE status != 'void' — one active acquisition per property
- CHECK (status IN ('pending_verification', 'confirmed', 'void'))
- CHECK (purchase_price_eur >= 0 OR purchase_price_eur IS NULL)
- CHECK (total_jj_cost_eur >= 0 OR total_jj_cost_eur IS NULL)
- CHECK (acquisition_date_closing >= acquisition_date_contract OR acquisition_date_closing IS NULL)

**Immutable fields after status='confirmed':** entity_id, purchase_price_eur, total_jj_cost_eur, acquisition_date_contract, acquisition_date_closing

**RLS:** Read: authenticated JJ users only. Write: admin role only. Never exposed to partner-facing API.

**Client-visible:** No. Internal only. `total_jj_cost_eur` especially must never appear in any partner-facing query.

---

#### Table: `partner_entry`

**Purpose:** One record per partner per property, recording their investment entry. Independent of `property_acquisition` (no FK dependency — they share only entity_id).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| entity_id | TEXT | NOT NULL | Canonical property identifier (same namespace as property_acquisition.entity_id) |
| partner_name | TEXT | NOT NULL | Canonical name: 'Avi', 'Oren' (external partners), or 'JJ' |
| entry_date | DATE | NULLABLE | Date ownership legally transferred. Null if unknown. |
| ownership_effective_from | DATE | NULLABLE | Date ownership % becomes effective. May differ from entry_date. |
| profit_participation_start | DATE | NULLABLE | Date partner starts earning/losing from operations. |
| loss_participation_start | DATE | NULLABLE | Date partner starts bearing losses. Usually = profit_participation_start. |
| ownership_pct | NUMERIC(5,2) | NOT NULL | Partner's ownership percentage. CHECK (0 < ownership_pct <= 100) |
| agreed_entry_valuation_eur | NUMERIC(12,2) | NULLABLE | The agreed property value at time of entry. NOT the purchase price. May be higher or lower. |
| required_entry_capital_eur | NUMERIC(12,2) | NULLABLE | What the partner agreed to invest. = agreed_entry_valuation × ownership_pct / 100. Null if unknown. |
| status | TEXT | NOT NULL DEFAULT 'pending_verification' | 'pending_verification', 'confirmed', 'void'. |
| business_source_id | UUID | NULLABLE | FK → business_source.id. Required when status='confirmed'. |
| recorded_by | TEXT | NOT NULL | |
| voided_at | TIMESTAMPTZ | NULLABLE | Set on void |
| void_reason | TEXT | NULLABLE | Mandatory when status='void' |
| supersedes_entry_id | UUID | NULLABLE | FK → partner_entry.id — for replacement records |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraints:**
- UNIQUE (entity_id, partner_name, ownership_effective_from) WHERE status != 'void'
- CHECK (status IN ('pending_verification', 'confirmed', 'void'))
- CHECK (ownership_pct > 0 AND ownership_pct <= 100)
- CHECK (agreed_entry_valuation_eur IS NULL OR agreed_entry_valuation_eur > 0)
- CHECK (required_entry_capital_eur IS NULL OR required_entry_capital_eur >= 0)
- No FK to property_acquisition — independence is architectural (ADR Principle 6)

**Immutable fields after status='confirmed':** entity_id, partner_name, entry_date, ownership_pct, agreed_entry_valuation_eur, required_entry_capital_eur

**RLS:** Partner-facing read: show own record only (by partner_name match on authenticated session). JJ staff: all records. `agreed_entry_valuation_eur` is partner-visible. `required_entry_capital_eur` is partner-visible.

**Client-visible:** Yes — agreed_entry_valuation_eur, ownership_pct, required_entry_capital_eur, capital_paid (from capital_event), capital_remaining (computed).

---

#### Table: `capital_event`

**Purpose:** Immutable append-only ledger of all capital movements. Every payment in or out, linked to either a `partner_entry` or `property_acquisition`. Corrections via void-and-replace only.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| entity_id | TEXT | NOT NULL | Property identifier |
| event_type | TEXT | NOT NULL | 'capital_payment', 'capital_contribution', 'acquisition_payment', 'acquisition_expense', 'profit_distribution', 'capital_return', 'partner_acquisition_payment' |
| event_nature | TEXT | NOT NULL | 'accounting_event' |
| effective_date | DATE | NOT NULL | Date the money actually moved |
| amount_eur | NUMERIC(12,2) | NOT NULL | Always positive. Direction field carries sign. CHECK (amount_eur >= 0) |
| direction | TEXT | NOT NULL | 'in' (money enters JJ/property) or 'out' (money leaves). CHECK IN ('in', 'out') |
| counterparty | TEXT | NOT NULL | Who paid or received. 'Avi', 'Oren', 'JJ', 'Yossi', 'Jacob', seller name, etc. |
| linked_partner_entry_id | UUID | NULLABLE | FK → partner_entry.id. For partner capital payments. |
| linked_acquisition_id | UUID | NULLABLE | FK → property_acquisition.id. For acquisition payments. |
| is_voided | BOOLEAN | NOT NULL DEFAULT false | |
| void_reason | TEXT | NULLABLE | Required when is_voided = true |
| voided_at | TIMESTAMPTZ | NULLABLE | |
| voided_by | TEXT | NULLABLE | |
| status | TEXT | NOT NULL DEFAULT 'pending_verification' | 'pending_verification', 'confirmed', 'void' |
| supersedes_event_id | UUID | NULLABLE | FK → capital_event.id. Set on replacement. |
| business_source_id | UUID | NULLABLE | FK → business_source.id. Required when status='confirmed'. |
| source_transaction_id | UUID | NULLABLE | FK → transactions.id. Links to existing transaction row (read-only reference). |
| recorded_by | TEXT | NOT NULL | |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraints:**
- CHECK (amount_eur >= 0)
- CHECK (direction IN ('in', 'out'))
- CHECK (status IN ('pending_verification', 'confirmed', 'void'))
- CHECK (is_voided = true AND status = 'void' OR is_voided = false AND status != 'void')
- CHECK (void_reason IS NOT NULL OR is_voided = false)
- At most one of linked_partner_entry_id, linked_acquisition_id may link to the primary event

**Immutable fields after status='confirmed':** entity_id, event_type, effective_date, amount_eur, direction, counterparty (cannot UPDATE — must void-and-replace)

**Append-only rule:** No UPDATE or DELETE of confirmed events. Application layer must enforce. RLS should prevent UPDATE WHERE status = 'confirmed' for non-superuser roles.

**RLS:** Capital_events for a partner_entry: readable by that partner (filtered by linked_partner_entry_id). JJ-internal events (linked_acquisition_id, type=acquisition_payment): JJ staff only.

---

#### Table: `ownership_period`

**Purpose:** Temporal record of ownership percentages for a property. Derived from partner_entry events but stored explicitly for reporting and audit. Used by Settlement Engine integration.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| entity_id | TEXT | NOT NULL | |
| effective_from | DATE | NOT NULL | Start of this ownership configuration |
| effective_to | DATE | NULLABLE | NULL means current/open-ended |
| partner_name | TEXT | NOT NULL | |
| ownership_pct | NUMERIC(5,2) | NOT NULL | |
| source_event_type | TEXT | NOT NULL | 'original_acquisition', 'partner_entry', 'partner_exit', 'transfer' |
| source_event_id | UUID | NULLABLE | FK to partner_entry.id or property_acquisition.id |
| status | TEXT | NOT NULL DEFAULT 'confirmed' | 'confirmed', 'void' |
| recorded_by | TEXT | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraints:**
- No overlapping periods for same entity_id + partner_name (exclusive date ranges)
- CHECK (ownership_pct >= 0 AND ownership_pct <= 100)
- SUM(ownership_pct) per entity_id per date should = 100% (enforced via validation function, not CHECK, due to multi-row nature)

---

#### Table: `property_disposition`

**Purpose:** Records the exit of a property from JJ's portfolio (sale, transfer, gift). Optional; only created when property is disposed.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| entity_id | TEXT | NOT NULL | UNIQUE WHERE status != 'void' |
| disposition_type | TEXT | NOT NULL | 'sale', 'transfer', 'gift', 'foreclosure' |
| disposition_date | DATE | NULLABLE | |
| gross_sale_price_eur | NUMERIC(12,2) | NULLABLE | |
| net_proceeds_eur | NUMERIC(12,2) | NULLABLE | After costs |
| status | TEXT | NOT NULL DEFAULT 'pending_verification' | |
| business_source_id | UUID | NULLABLE | |
| recorded_by | TEXT | NOT NULL | |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

---

#### Table: `business_source`

**Purpose:** Every confirmed fact must cite a business source. This table is the provenance registry.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| id | UUID | NOT NULL | PK |
| source_type | TEXT | NOT NULL | 'partnership_agreement', 'purchase_contract', 'notary_deed', 'bank_transfer', 'payment_receipt', 'lawyer_confirmation', 'partner_resolution', 'email_confirmation', 'whatsapp_confirmation', 'approved_manual_decision', 'transaction_row' |
| reference | TEXT | NOT NULL | Must be ≥ 3 chars. The specific document identifier, URL, or description. |
| document_date | DATE | NULLABLE | Date of the source document |
| parties | TEXT[] | NULLABLE | Who signed / is referenced |
| file_url | TEXT | NULLABLE | If document is stored digitally |
| recorded_by | TEXT | NOT NULL | |
| notes | TEXT | NULLABLE | |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() | |

**Constraint:** CHECK (char_length(reference) >= 3) — prevents empty sources.

**Immutable:** All fields after creation (documents don't change; if wrong, create new source).

---

### 7-B: Supporting Tables

#### Table: `entity_registry` (existing — extend, do not replace)

Current: exists with property name mapping. Extend to add:
- `canonical_id` (TEXT UNIQUE) — the stable entity_id used across all M8 tables
- `entity_type` — 'property', 'pseudo_property', 'non_property' (already likely exists)

No migration yet — design only.

#### Table: `partner_payer_aliases` (from EXTERNAL_PARTNER_ENTITY_ARCHITECTURE.md — already designed)

Links raw payer strings ('AVI', 'Client', 'Owner') to canonical partner names ('Avi').

---

### 7-C: Domain-to-Table Mapping

| Domain Concept | Table | Notes |
|---|---|---|
| Property Acquisition | `property_acquisition` | One per property; JJ internal; never in partner view |
| Partner Entry | `partner_entry` | One per partner per property; independent of acquisition |
| Capital Movement | `capital_event` | All money in/out; append-only; linked to entry or acquisition |
| Ownership Over Time | `ownership_period` | Temporal ownership %; derived from entries but stored explicitly |
| Property Exit | `property_disposition` | Optional; only on sale/transfer/gift |
| Fact Provenance | `business_source` | Cited by every confirmed event |
| Partner Identity | `partner_payer_aliases` | Maps raw payer strings → canonical name |

---

### 7-D: Immutability Model

```
State machine for capital_event:

  CREATED (is_voided=false, status='pending_verification')
      ↓ confirmed by Yossi + business source cited
  CONFIRMED (is_voided=false, status='confirmed')
      ↓ error found
  [create voidedCopy]
  VOIDED (is_voided=true, status='void', void_reason=..., voided_at=..., voided_by=...)
  +
  [create replacementEvent]
  REPLACEMENT (is_voided=false, status='pending_verification', supersedes_event_id=voidedEvent.id)
      ↓ confirmed
  REPLACEMENT CONFIRMED

Rules:
  - No UPDATE of CONFIRMED events. Application + RLS enforcement.
  - No DELETE ever. Audit trail is permanent.
  - getActiveLedger() = events WHERE is_voided = false
  - Void requires void_reason.
  - Replacement auto-sets supersedes_event_id.
```

---

### 7-E: Provenance Model

```
Every event → business_source_id (required at status='confirmed')

business_source:
  type='bank_transfer'
  reference='Bank Hapoalim transfer XXXXXXXX dated 2024-10-10 (€50,000)'
  document_date=2024-10-10
  
business_source:
  type='approved_manual_decision'
  reference='Yossi approval 2026-07-13: Avi capital_paid = €50,000'
  document_date=2026-07-13
  parties=['Yossi']
```

If Yossi cannot produce a bank reference, he approves an `approved_manual_decision` source, which is valid but lower confidence. This must be flagged in partner reports: "Based on Yossi's confirmation; bank reference not on file."

---

### 7-F: RLS / Security Design

| Table | JJ Staff (authenticated) | Partner (e.g. Avi) | Public / Anon |
|---|---|---|---|
| `property_acquisition` | Full read; admin write | ❌ DENIED | ❌ DENIED |
| `partner_entry` | Full read; admin write | Read own rows only (WHERE partner_name = auth.partner_name) | ❌ DENIED |
| `capital_event` | Full read; admin write; no UPDATE of confirmed | Read own rows (linked_partner_entry.partner_name = auth.partner_name) | ❌ DENIED |
| `ownership_period` | Full read | Read own rows | ❌ DENIED |
| `property_disposition` | Full read | Read if partner_name in entity's ownership | ❌ DENIED |
| `business_source` | Full read; admin write | ❌ DENIED (internal) | ❌ DENIED |

**Critical rule:** `property_acquisition.total_jj_cost_eur` and `jjMarginFromEntry` must never appear in any view, function, or API endpoint accessible to partner roles.

---

## PART 8 — MIGRATION PLAN (design only — no SQL)

### 8-A: Migration Order

```
Step 1: Create business_source table (no dependencies)
Step 2: Create property_acquisition table (FK to business_source only)
Step 3: Create partner_entry table (FK to business_source; no FK to acquisition)
Step 4: Create capital_event table (FK to partner_entry, property_acquisition, business_source, transactions)
Step 5: Create ownership_period table (FK to partner_entry, property_acquisition)
Step 6: Create property_disposition table (FK to business_source)
Step 7: Extend entity_registry with canonical_id (ALTER TABLE — low risk)
Step 8: Create partner_payer_aliases table (FK to external_partners)
Step 9: Backfill — see 8-B
Step 10: Validate — see 8-D
```

### 8-B: Backfill Strategy

**Backfill is manual + approval-gated. No automatic inference from transactions.**

1. **property_acquisition (Villa Mazotos):**
   - After Yossi confirms purchase price and closing date → insert 1 row, status='confirmed', business_source=approved_manual_decision
   - total_jj_cost: insert only after all expense rows confirmed

2. **partner_entry (Avi, Villa Mazotos):**
   - After U1 (agreed_entry_valuation) and U2 (entry_date) approved → insert 1 row
   - status='pending_verification' until Yossi signs off with business_source

3. **capital_event (Avi, Villa Mazotos):**
   - After C3 resolved (is €30K income or capital?) → insert individual events
   - Each event links to source_transaction_id (the existing transaction row)
   - Status: 'pending_verification' initially; promoted to 'confirmed' per Yossi approval
   - The €50,000 total must be reconciled row-by-row

4. **ownership_period (Villa Mazotos):**
   - After U2 (entry_date) confirmed → insert period records
   - Before Avi's entry_date: JJ 100%
   - From entry_date: Avi 50%, JJ 50%

5. **Villa Mazotos 2:**
   - Block until U7 (Oren entry valuation), U8 (acquisition status), U9 (purchase price) resolved
   - Only insert after deal confirmed closed

### 8-C: Source-Row Mapping

| capital_event to create | Source transaction | source_transaction_id |
|---|---|---|
| Avi capital_payment €X | 2024-06-16 JJ Income €30,000 | link after C3 resolved |
| Avi capital_payment €5,600 | 2024-11-16 Purchase payer=Client | link after U4 confirmed |
| JJ acquisition_payment €10,000 | 2024-04-16 Jacob→Owner | link directly |
| JJ acquisition_payment €10,000 | 2024-04-16 Yossi→Owner | link directly |
| JJ acquisition_payment €70,000 | 2024-10-10 Jacob→Owner | link directly |
| JJ acquisition_payment €100,000 | 2024-10-10 Yossi→Owner | link directly |
| JJ acquisition_payment €10,000 | 2024-10-21 Yossi→Owner | link directly |
| JJ acquisition_expense €750 | 2024-04-17 Yossi→Yanis | link directly |
| (etc.) | (all expense rows) | link after acquisition confirmed |

### 8-D: Idempotency

- All inserts use `ON CONFLICT DO NOTHING` based on natural keys
- Backfill script is re-runnable; already-inserted rows are skipped
- Status promotes from pending_verification → confirmed only via explicit approval step (not automatic)

### 8-E: Rollback Strategy

```
All new tables: DROP TABLE ... CASCADE (removes M8-B layer entirely)
No existing tables are modified in Phase 1 of migration
existing: transactions, property_owners, property_definitions, entity_registry unchanged
Rollback = drop all M8-B tables (10 seconds; no impact on existing engines)
```

### 8-F: Validation Queries (design — actual SQL after approval)

1. SUM(capital_event.amount_eur WHERE counterparty='Avi' AND direction='in' AND entity_id='villa-mazotos' AND is_voided=false) = **€250,000** ✅ (updated 2026-07-13; was €50K when D1 was UNKNOWN)
2. partner_entry WHERE entity_id='villa-mazotos' AND partner_name='Avi' → 1 active row ✅
3. property_acquisition WHERE entity_id='villa-mazotos' → 1 active row ✅
4. All capital_event WHERE status='confirmed' → each has business_source_id ✅
5. No capital_event with is_voided=true has status != 'void' ✅
6. ownership_period ownership_pct SUM per date per entity_id = 100% ✅
7. No FK violations on supersedes_event_id ✅
8. getActiveLedger(entity_id='villa-mazotos') contains no voided events ✅

### 8-G: Reconciliation Checks

1. Every capital_event with source_transaction_id → transaction row exists in transactions table and is review_status='active'
2. No capital_event references a transaction row that is 'confirmed_duplicate'
3. partner_entry.required_entry_capital_eur = partner_entry.agreed_entry_valuation_eur × ownership_pct / 100 (within €0.01)
4. capital_remaining (computed) = required_entry_capital - SUM(active capital_payments) ≥ 0 or flagged

### 8-H: Zero-Downtime Considerations

- All M8-B tables are new (no ALTER on existing tables in initial migration)
- Existing engines read from `transactions`; M8-B tables are additive; no interference
- Views remain unchanged
- Zero risk to production during table creation (no locks on existing tables)
- If entity_registry extension is required: ALTER TABLE ADD COLUMN is zero-downtime in Postgres

### 8-I: Compatibility with Existing Engines

| Engine | Impact | Safety |
|---|---|---|
| Accounting Engine / computeBalance.ts | None — reads transactions only | ✅ Safe |
| Ownership Engine | None — reads property_owners only | ✅ Safe |
| Settlement Engine | None | ✅ Safe |
| Portfolio Engine | None | ✅ Safe |
| Reporting Engine | None in Phase 1 | ✅ Safe |
| v_cashbox_audit, v_property_pl_split | None | ✅ Safe |

### 8-J: Feature Flag / Rollout Plan

1. **Phase 1 (now):** Create tables; no UI exposure; backfill with status='pending_verification'
2. **Phase 2 (after Yossi approval):** Promote records to status='confirmed' one-by-one as facts resolved
3. **Phase 3:** Build read-only lifecycle report endpoints (internal JJ use only)
4. **Phase 4:** Build partner-facing Investment Statement (partner can see their own record)
5. **Phase 5:** Replace v_property_pl_split Avi/Oren rows with lifecycle-derived output
6. **Never:** Modify existing Settlement Engine or transaction layer

---

## PART 9 — REPORT PROJECTION DESIGN

### Partner Investment Statement — Field Inventory

| Field | Source | Visible to partner? | Notes |
|---|---|---|---|
| partner_name | partner_entry.partner_name | ✅ Yes | |
| property | partner_entry.entity_id | ✅ Yes | Shown as property display name |
| ownership_pct | partner_entry.ownership_pct | ✅ Yes | |
| entry_date | partner_entry.entry_date | ✅ Yes | |
| agreed_entry_valuation | partner_entry.agreed_entry_valuation_eur | ✅ Yes | |
| required_entry_capital | partner_entry.required_entry_capital_eur | ✅ Yes | |
| capital_paid | SUM(capital_event where type=capital_payment and direction=in) | ✅ Yes | |
| capital_remaining | required_entry_capital - capital_paid | ✅ Yes | |
| investment_timeline | capital_event rows (dates + amounts) | ✅ Yes | |
| ownership_timeline | ownership_period rows | ✅ Yes | |
| renovation_share | ownership_pct × renovation_total (from Settlement Engine) | ✅ Yes | Proportional |
| operating_share | ownership_pct × operating_total | ✅ Yes | Proportional |
| rental_share | ownership_pct × rental_income | ✅ Yes | Proportional |
| distributions | SUM(capital_event where type=profit_distribution and direction=out) | ✅ Yes | |
| current_settlement | ownerAdjustedBalance from Settlement Engine | ✅ Yes | Existing engine output |
| ROI | See ROI safety below | ⚠️ Only when all inputs verified | |
| JJ purchase price | property_acquisition.purchase_price_eur | ❌ NEVER shown to partner | Internal only |
| JJ total cost | property_acquisition.total_jj_cost_eur | ❌ NEVER shown to partner | Internal only |
| JJ margin | jjMarginFromEntry (computed) | ❌ NEVER shown to partner | Internal only |

### ROI Safety Gate

ROI is displayed only when ALL of:
- `partner_entry.agreed_entry_valuation_eur` IS NOT NULL AND status='confirmed'
- SUM(capital_event capital_payments) = required_entry_capital (fully paid)
- `property_disposition.net_proceeds_eur` IS NOT NULL (for realized ROI) OR current market value approved by Yossi (for unrealized)
- ROI calculation definition approved by Yossi

If any input is missing:
```
ROI status: UNAVAILABLE_DUE_TO_MISSING_VERIFIED_FACTS
Display: "ROI calculation pending verification of: [list of missing fields]"
```
Never estimate silently. Never use inferred values in ROI calculation.

---

## PART 10 — OPEN DECISIONS REQUIRING YOSSI

Listed in priority order (blocking decisions first):

| # | Decision | Why it blocks | Input format needed |
|---|---|---|---|
| ~~**D1**~~ | ~~Villa Mazotos — agreed entry valuation with Avi~~ | **✅ RESOLVED 2026-07-13** | Entry valuation = **€500,000**. Required capital = **€250,000**. Capital paid = **€250,000**. Remaining = **€0**. |
| **D2 [HARD BLOCKER]** | Villa Mazotos — Avi entry date (ownership effective) | Blocks partner_entry creation and ownership_period | "Avi's 50% ownership began on [date]" |
| **D3** | Villa Mazotos — Capital breakdown DB vs confirmed | Yossi confirmed €50K to Yossi; DB row shows €30K. Need source for the €20K difference | "The 2024-06-16 entry should be €[amount]: [explanation of €20K delta]" |
| **D4 — RESOLVED** | ~~Is the €30,000 JJ Income row entry capital or profit?~~ | **✅ RESOLVED 2026-07-13** | Yossi confirmed: the Avi→Yossi payment is **partner-entry capital**, NOT JJ operating income. Reclassification required post-M8-B. |
| **D5** | Villa Mazotos — Profit participation start date | May be same as D2 or different | "Avi starts earning/losing from [date]" |
| **D6** | Villa Mazotos — Avi's €200K payment to seller: was this independent or through JJ? | Affects how we map the transaction row | "Avi paid €200K directly to the seller, not via JJ accounts" — confirm or correct |
| ~~**D7**~~ | ~~Villa Mazotos 2 — acquisition status~~ | **✅ RESOLVED 2026-07-13** | Acquisition status = **In progress**. |
| ~~**D8**~~ | ~~Villa Mazotos 2 — purchase price~~ | **✅ RESOLVED 2026-07-13** | Purchase price = **€400,000**. |
| **D9 — PARTIAL RESOLUTION** | Villa Mazotos 2 — Oren entry | Agreed valuation: **✅ €520,000**. Required capital: **✅ €182,000**. Inception model: **✅ CONFIRMED**. Exact date: ❌ pending contract. Capital paid: ❌ UNKNOWN. | Provide: signed purchase contract for date. Confirm capital paid to date. |
| **D10 — CLOSED** | ~~Missing €9,400 in Avi capital paid~~ | Original gap analysis was based on wrong initial "confirmed" total (€50K). Full capital is €250,000. The €30K DB row is a known legacy data error. No unexplained gap. | — |
| **D11** | Partnership agreements — do signed documents exist? | Determines BusinessSource quality (approved_manual_decision vs signed_agreement) | "Signed partnership agreement with Avi [exists / does not exist]" |
| **D12** | Anastasia's €2,400 purchase expense — JJ cost or personal? | Affects JJ total acquisition cost | "Anastasia's €2,400 was [JJ cost / personal / reimbursed]" |

---

## PART 11 — EXACT BLOCKERS BEFORE SQL

The following must ALL be resolved before any SQL or migration is written:

| Blocker | Status | Owner |
|---|---|---|
| ~~B1: Agreed entry valuation for Avi (D1)~~ | ✅ **RESOLVED 2026-07-13** — €500,000 | — |
| ~~B2: Avi inception participation model~~ | ✅ **RESOLVED 2026-07-13** — Avi from acquisition start, all lifecycle economics. Only exact calendar date from contract remains. | — |
| ~~B3: Villa Mazotos 2 — Oren entry facts~~ | ✅ **RESOLVED 2026-07-13** — €520K valuation, €182K required capital, €42K JJ margin (internal), inception model confirmed. Only capital paid and exact date remain. | — |
| ~~**B7: Event Type Audit**~~ | ✅ **PASS 2026-07-13** | OQ-1 through OQ-6 resolved; 7 primitives locked; P9 locked; B7 verdict PASS. SQL approved. |
| ~~**B4: Design review approval**~~ | ✅ **APPROVED 2026-07-13** | Yossi's event constitution message constitutes explicit approval. Proceed autonomously. |
| ~~**B5: Schema design approval**~~ | ✅ **APPROVED 2026-07-13** | Same approval — autonomous execution authorized. |
| ~~**B6: Migration plan approval**~~ | ✅ **APPROVED 2026-07-13** | Same approval — autonomous execution authorized. |

**Remaining hard architecture blockers before M8-B SQL: 0** — ALL RESOLVED. SQL implementation proceeds autonomously.

**Evidence-only gaps (not blockers):** Exact contract dates for Avi and Oren (pending signed contracts); Oren capital paid to date.

Optional (can proceed with NULL values):
- D5 (profit participation start) — nullable; defaults to entry_date
- D11 (signed agreements) — affects confidence level but not structure
- D12 (Anastasia expense) — affects total_jj_cost but not table structure

---

## PART 12 — RECOMMENDED PR/MILESTONE BREAKDOWN

```
M8-B0 (this document) — AWAITING APPROVAL
  → Design-only. No code. No SQL. No PR.
  → Gates: B7 (Event Type Audit) → B4 (design review) → B5 (schema) → B6 (migration) → SQL

M8-B1 — Schema Tables (after B7+B4+B5+B6 approved)
  → PR: CREATE TABLE business_source, property_acquisition, 
         partner_entry, capital_event, ownership_period,
         property_disposition, partner_payer_aliases
  → Include: RLS policies, indexes, check constraints
  → CI: typecheck + migration validation
  → Milestone: tables exist in DB, empty, no backfill yet

M8-B2 — Seed Confirmed Facts (after B4+B5+B6 approved + Avi exact date + D3 resolved)
  → PR: INSERT statements for Villa Mazotos
         property_acquisition (1 row)
         partner_entry for Avi (1 row — entry from inception; date field = contract date when known)
         business_source entries (1+ rows)
         capital_events for confirmed Avi payments (€200K + €50K)
         ownership_period rows
  → All rows: status='confirmed' only for facts with business_source
  → CI: validation queries pass
  → B2 BUSINESS RULES CONFIRMED ✅ — only date field and capital event detail remain

M8-B3 — Villa Mazotos 2 / Oren (after B4+B5+B6 approved + Oren exact date + Oren capital paid confirmed)
  → PR: INSERT statements for VM2
         property_acquisition (1 row — purchase price €400K, in progress)
         partner_entry for Oren (entry from inception; date = contract date when known)
         business_source entries
         capital_events for Oren payments (when capital paid confirmed by Yossi)
         ownership_period rows
  → B3 BUSINESS RULES CONFIRMED ✅ — only date field and capital paid remain

M8-B4 — Lifecycle Projections API (after B2 confirmed)
  → PR: Edge Function or API route serving partner investment summary
  → Returns: partner_entry + capital_events + ownership_periods
  → Does NOT expose: acquisition.total_jj_cost, jjMarginFromEntry
  → CI: tests pass

M8-B5 — Partner Investment Statement UI (after B4)
  → PR: /partner/[name]/investment page
  → Partner can see own entry only
  → ROI: only if all safety gates pass

NEVER begins: changing transactions, Accounting Engine, Settlement Engine, Portfolio Engine
```

---

## DELIVERY CHECKLIST

| # | Item | Status |
|---|---|---|
| 1 | Business Decision Worksheet | ✅ Complete (Parts 1–4) |
| 2 | Confirmed facts | ✅ Part 2 (F1–F16) |
| 3 | Unknown facts | ✅ Part 3 (U1–U12) |
| 4 | Conflicting facts | ✅ Part 4 (C1–C5) |
| 5 | Exact source references | ✅ Parts 1, 5 |
| 6 | Existing-data reconciliation report | ✅ Part 6 (6-A through 6-F) |
| 7 | Proposed M8-B schema | ✅ Part 7 (7-A through 7-C) |
| 8 | Domain-to-table mapping | ✅ Part 7-C |
| 9 | Immutability model | ✅ Part 7-D |
| 10 | Provenance model | ✅ Part 7-E |
| 11 | RLS/security design | ✅ Part 7-F |
| 12 | Migration plan | ✅ Part 8 (8-A through 8-J) |
| 13 | Backfill plan | ✅ Part 8-B |
| 14 | Rollback plan | ✅ Part 8-E |
| 15 | Validation queries plan | ✅ Part 8-F through 8-G |
| 16 | Report projection plan | ✅ Part 9 |
| 17 | Open decisions requiring Yossi | ✅ Part 10 (D1–D12) |
| 18 | Exact blockers before SQL | ✅ Part 11 (B1–B6) |
| 19 | Recommended PR/milestone breakdown | ✅ Part 12 |

---

## STATUS SUMMARY

**M8-B0 is COMPLETE — AWAITING YOSSI + CHATGPT APPROVAL.**

**Update 2026-07-13 (Round 1):** B1 RESOLVED. Avi capital facts confirmed (€500K valuation, €250K required, €250K paid, €0 remaining). ClientCharge/Billable Events model confirmed and documented.

**Update 2026-07-13 (Round 3):** B2 + B3 RESOLVED. Avi inception model confirmed. Oren facts confirmed: €520K valuation, €182K required capital, €42K JJ margin (internal), inception participation. Only approval blockers (B4–B6) and evidence-collection gaps remain.

**Remaining hard architecture blockers before any SQL:** B4–B6 (design + schema + migration approval by Yossi + ChatGPT). B1–B3 are fully resolved.

**Legacy data correction (not a blocker):** The 2024-06-16 DB row (Owner→Yossi, €30K) is a known historical data error. Authoritative amount is €50K. Future backfill will create one corrected event for €50K referencing the legacy row. No unexplained gap.

**Update 2026-07-13 (Final):** ALL BLOCKERS CLEARED. B7 PASS. B4-B6 approved by Yossi's autonomous execution mandate. SQL implementation proceeds. See `M8_EVENT_TYPE_AUDIT.md` for Gate B7 full record and `ADR_M8_INVESTMENT_LIFECYCLE.md` for Principles 7–9. Schema implementation is the next deliverable.
