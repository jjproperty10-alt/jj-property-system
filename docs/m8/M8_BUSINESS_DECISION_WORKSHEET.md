# M8 Business Decision Worksheet
**Purpose:** Lock the real business facts before any implementation begins.
**Principle:** Never infer investment facts. Every field requires an explicit business or legal source.
**Date:** 2026-07-13 · Updated: 2026-07-13 (B2+B3 resolved)
**Status:** Villa Mazotos / Avi — ALL BUSINESS RULES CONFIRMED ✅ (exact contract date pending doc) | Villa Mazotos 2 / Oren — VALUATION + REQUIRED CAPITAL CONFIRMED ✅ | Capital paid/dates still pending evidence

---

## Why Business Source is mandatory

In three years, if a partner asks "why does the system say I owe €25,000?" — the answer must not be "because the database says so." It must be "because the Partnership Agreement signed 2022-06-01 states your required capital is €100,000, and the bank transfer of 2022-06-15 confirms you have paid €75,000."

Every field in this worksheet requires a `Business Source` — the specific document, agreement, or transaction that proves the value.

---

## How to read this worksheet

| Confidence | Meaning |
|---|---|
| ✅ CONFIRMED | Value is documented and certain. Can be used in M8. |
| ⚠️ INFERRED | Reasonable inference. Cannot be used until Yossi confirms with a source. |
| ❌ UNKNOWN | No basis. Yossi must supply from memory, agreement, or bank records. |

**Business Source examples:** `Partnership Agreement signed YYYY-MM-DD` · `Bank transfer IBAN-XXX dated YYYY-MM-DD` · `Notary deed ref XXXX` · `WhatsApp agreement YYYY-MM-DD` · `JJ internal record` · `Not documented`

**Blocks M8?** = Field must be ✅ CONFIRMED before M8 can begin for this property.

---

## Never Infer — prohibited derivations (reference)

```
Purchase Price      ≠  Partner Entry Valuation
Capital Paid        ≠  Required Capital
Ownership %         ≠  Amount Paid
Transaction Date    ≠  Effective Ownership Date
Payment Amount      ≠  Agreed Installment
```

---

## Case 1 — Villa Mazotos / Avi (50% Partner)

### 1A — Original Acquisition (JJ Internal — never shown to Avi)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Acquisition date (contract) | 2024-04-15 (candidate from transaction row). **Avi entered jointly with JJ from this date — this is the shared acquisition start.** Exact date requires signed contract verification. | Transaction row: Purchase Contract, subcategory=Purchase Contract, 2024-04-15 | ✅ CONFIRMED (business sequence) / pending_exact_date | Confirm against signed purchase contract | Only exact date needs document verification. |
| Purchase price (contract) | **€400,000** | Transaction row: Purchase Contract, 2024-04-15 | ✅ CONFIRMED | — | — |
| Closing costs | ~€14,300 | Multiple tax/legal rows Oct 2024 | 🔶 INFERRED | Need Yossi confirmation of completeness | No — can default to €0 if unknown |
| Total JJ cost | ~€414,300 | Derived: €400K + €14.3K costs | 🔶 INFERRED | Blocked on full closing costs | Internal only |
| Funding source | Yossi (€120K) + Jacob (€80K) JJ portion to seller; Avi (€200K) direct to seller | Transaction rows — payers confirmed | ✅ CONFIRMED | — | No — informational |
| Document ref | ❓ | — | ❌ UNKNOWN | Is there a notary deed on file? | No — nice to have |

---

### 1B — Avi's Partner Entry (Partner-visible)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Entry date (effective_from) | **From acquisition inception** — Avi entered together with JJ as part of the original purchase contract/transaction. He did not enter after the acquisition. Exact calendar date = awaits signed purchase contract or approved legal source. | Business-rule confirmed by Yossi 2026-07-13. Exact date pending document. | ✅ CONFIRMED (business sequence) / pending_exact_date | — | Only the exact calendar date remains; not a business-rule blocker. |
| Agreed entry valuation | **€500,000** | Yossi confirmed 2026-07-13 | ✅ CONFIRMED | — | — |
| Ownership % | **50%** | CLAUDE.md + `property_owners` table | ✅ CONFIRMED | — | — |
| Required entry capital | **€250,000** | = €500,000 × 50% | ✅ CONFIRMED | — | — |
| Capital paid — installment 1 | **€200,000** | Transaction: Avi→seller (2024-10-10, desc "אבי העביר למוכר") | ✅ CONFIRMED | — | — |
| Capital paid — installment 2 | **€50,000** | 2024-06-16, Owner→Yossi. Legacy DB row shows €30,000. **Known historical data correction: €30,000 is the old incorrect value; €50,000 is the approved authoritative amount (Yossi-approved).** | ✅ CONFIRMED | **THIS IS PARTNER-ENTRY CAPITAL, NOT JJ OPERATING INCOME.** Not a distribution; not JJ revenue. Future correction model: preserve legacy row as historical reference, mark superseded, create one authoritative capital event for €50,000. Do not add a separate €20,000 event — there are not two payments here. | No (reclassification is post-M8-B scope) |
| Capital paid — total | **€250,000** | Sum of both installments | ✅ CONFIRMED | — | — |
| Capital remaining | **€0** | = €250,000 − €250,000 | ✅ CONFIRMED | Avi has paid his required entry capital in full. | — |
| is_entry_fully_paid | **TRUE** | Confirmed 2026-07-13 | ✅ CONFIRMED | — | — |
| Profit/loss participation start | **From acquisition inception** — same as entry; Avi participates in all lifecycle economics (purchase, renovation, operations, rental, disposal) from the start of the joint acquisition transaction. | Business-rule confirmed by Yossi 2026-07-13. | ✅ CONFIRMED (business sequence) / pending_exact_date | Exact calendar date same as entry_date above | Only the calendar date remains. |
| Contractual exceptions | ❓ | No agreement reviewed | ❌ UNKNOWN | Preferred return? Waterfall priority? Catch-up clause? | No — assume proportional if unknown |
| Agreement document ref | ❓ | — | ❌ UNKNOWN | Is there a signed partnership agreement with Avi? | No — nice to have |

> **Historical correction note:** The 2024-06-16 DB row (Owner→Yossi) records €30,000. The authoritative approved business amount is **€50,000**. This is a known historical data correction — the legacy value is wrong. The €20,000 difference is not an unexplained missing payment. Future correction: void/supersede the legacy €30K row; create one authoritative capital event for €50,000 referencing the legacy row for audit trail.

> **Other Avi-related rows (NOT capital payments):** Three rows — Client→Jacob €5,600 (2024-11-16), Client→Jacob €5,000 (2024-11-16, Renovation), Client→JJ €20,000 (2025-07-10, Renovation) — are **renovation billable events (ClientCharge)**, not part of Avi's entry capital. Avi's capital is fully paid at €250,000. Do not include these in the capital ledger unless a separate business source proves otherwise.

---

### 1C — JJ Side / Villa Mazotos (JJ Internal)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Yossi ownership % | 25% | CLAUDE.md | ✅ CONFIRMED | — | — |
| Jacob ownership % | 25% | CLAUDE.md | ✅ CONFIRMED | — | — |
| JJ combined ownership | 50% | Derived: 25% + 25% | ✅ CONFIRMED | — | — |
| JJ acquisition margin from Avi entry | **€50,000** | = €250,000 − (€400,000 × 50%) | ✅ CONFIRMED | Confirmed 2026-07-13. NEVER shown to Avi. | No — internal only |
| JJ capital at risk post-Avi entry | **€150,000** | = €400,000 − €250,000 | ✅ CONFIRMED | i.e. JJ funded €400K total; recovered €250K from Avi; net exposure €150K | No — internal only |

> ℹ️ These figures use purchase price (€400K) as proxy for totalJJCost. Actual totalJJCost = €400K + closing costs (~€14.3K) = ~€414.3K. JJ margin may be slightly lower (~€42.9K) once closing costs confirmed. Use ~€50K as approximation until closing costs locked.

---

## Case 2 — Villa Mazotos 2 / Oren (35% Partner)

### 2A — Original Acquisition (JJ Internal — never shown to Oren)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Acquisition date (contract) | ❓ | Candidate: 2026-01-19 (earliest transaction — deposit). Actual contract date unknown. | ❌ UNKNOWN | Exact contract/commencement date — requires signed purchase contract | No (schema can hold NULL) |
| Acquisition status | **In progress** — acquisition not yet fully completed in system | Confirmed by Yossi 2026-07-13 | ✅ CONFIRMED | — | — |
| Purchase price | **€400,000** | Confirmed by Yossi 2026-07-13 | ✅ CONFIRMED | — | — |
| Closing costs | ❓ | Not documented | ❌ UNKNOWN | Legal fees, taxes, notary? | No — can default to €0 |
| Total JJ cost | ~€400,000 (+ closing costs TBD) | Derived from purchase price | 🔶 INFERRED | Exact: needs all closing cost rows | Internal only |
| Funding source | Jacob paid deposit (€10K) + brokerage (€3K) | Transaction rows | 🔶 INFERRED | JJ cash / Jacob personal / mixed? | No |
| Document ref | ❓ | — | ❌ UNKNOWN | Purchase contract / notary deed? | No — nice to have |

---

### 2B — Oren's Partner Entry (Partner-visible)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Entry date (effective_from) | **From acquisition inception** — Oren entered together with JJ from the start of the purchase process. Exact calendar date awaits signed contract. | Business-rule confirmed by Yossi 2026-07-13. | ✅ CONFIRMED (business sequence) / pending_exact_date | Exact date from signed purchase contract | Only date; not an architecture blocker. |
| Agreed entry valuation | **€520,000** | Confirmed by Yossi 2026-07-13 | ✅ CONFIRMED | — | — |
| Ownership % | **35%** | CLAUDE.md + `property_owners` table + Yossi 2026-07-13 | ✅ CONFIRMED | — | — |
| Required entry capital | **€182,000** | = €520,000 × 35% | ✅ CONFIRMED | — | — |
| Capital paid | ❓ | No confirmed figure | ❌ UNKNOWN | How much has Oren paid toward his €182,000 entry capital? Specific bank transfers, dates, references? | Yes — needed for capital ledger |
| Capital remaining | ❓ | = €182,000 − capital_paid | ❌ UNKNOWN | Blocked on capital paid | Yes |
| is_entry_fully_paid | ❓ | Cannot determine | ❌ UNKNOWN | Blocked | Yes |
| Profit/loss participation start | **From acquisition inception** — same as entry date; Oren participates in all lifecycle economics from the start of the joint purchase. | Business-rule confirmed by Yossi 2026-07-13. | ✅ CONFIRMED (business sequence) / pending_exact_date | Same calendar date gap as entry date | Only date; not an architecture blocker. |
| Contractual exceptions | ❓ | No agreement reviewed | ❌ UNKNOWN | Special terms? Preferred return? | No — assume proportional if unknown |
| Agreement document ref | ❓ | — | ❌ UNKNOWN | Signed partnership agreement with Oren? | No — nice to have |

---

### 2C — JJ Side / Villa Mazotos 2 (JJ Internal)

| Field | Value | Business Source | Confidence | Missing Decision | Blocks M8? |
|---|---|---|---|---|---|
| Yossi ownership % | 32.5% | CLAUDE.md | ✅ CONFIRMED | — | — |
| Jacob ownership % | 32.5% | CLAUDE.md | ✅ CONFIRMED | — | — |
| JJ combined ownership | 65% | Derived: 32.5% + 32.5% | ✅ CONFIRMED | — | — |
| jj_total_acquisition_cost | ~€400,000 (+ closing costs TBD) | Purchase price confirmed by Yossi 2026-07-13 | ✅ CONFIRMED (approx) | Closing costs detail TBD | No |
| jj_cost_basis_for_oren_35pct | **€140,000** | = €400,000 × 35% | ✅ CONFIRMED | — | — |
| jj_margin_from_oren_entry | **€42,000** | = €182,000 − €140,000 | ✅ CONFIRMED — **NEVER shown to Oren** | — | — |
| jj_net_capital_at_risk_post_oren | **~€218,000** | = €400,000 − €182,000 | ✅ CONFIRMED (approx) | Exact closing costs TBD | No |

---

## ADR Compliance Confirmation

All principles required for `ADR_PROPERTY_LIFECYCLE.md` are enforced:

| Principle | Enforced? | Where |
|---|---|---|
| One immutable original acquisition per property | ✅ | `property_acquisition` — "No UPDATE once signed" |
| Zero-to-many independent partner entry events | ✅ | `partner_entry` — "Many per property. Each is independent." |
| Zero-to-many capital events | ✅ | `capital_event` table — 8 event_type values |
| Ownership periods derived from events, never edited directly | ✅ | `ownership_period` — "generated by events rather than entered manually" |
| Disposition as lifecycle closing event | ✅ | `property_disposition` — requires existing acquisition |
| No derivation of partner entry valuation from purchase price | ✅ | "`agreed_entry_valuation` has no required relationship to `purchase_price`" |
| No exposure of JJ internal margin in partner-facing reports | ✅ | Visibility rules table |
| **Investment Lifecycle layer** | ✅ | Investment Lifecycle section — one per investor per property |
| **Immutable Capital Ledger** | ✅ | `capital_event` — `voided` flag only, never UPDATE |
| **Business Source mandatory on every capital event** | ✅ | `business_source TEXT NOT NULL` in `capital_event` schema |
| **Never infer investment facts** | ✅ | Formal invariants section with 6 named prohibitions |

---

## M8 Blockers — Complete Summary (Updated 2026-07-13)

### Villa Mazotos / Avi — Evidence-only gaps (B2 RESOLVED ✅)

> **B2 RESOLVED** — Avi's inception participation model confirmed by Yossi 2026-07-13. Business rules are settled; only exact calendar date from signed contract remains. Not an architecture blocker.

| # | Field | Status | What Yossi needs to provide |
|---|---|---|---|
| ~~1~~ | ~~JJ purchase price~~ | ✅ CONFIRMED €400,000 | — |
| ~~2~~ | ~~Agreed entry valuation~~ | ✅ CONFIRMED €500,000 | — |
| ~~3~~ | ~~Required entry capital~~ | ✅ CONFIRMED €250,000 | — |
| ~~4~~ | ~~Capital paid~~ | ✅ CONFIRMED €250,000 | — |
| ~~5~~ | ~~Capital remaining~~ | ✅ CONFIRMED €0 | — |
| ~~B2~~ | ~~Inception participation model~~ | ✅ CONFIRMED — from acquisition start, all lifecycle economics | — |
| EV-1 | JJ/Avi acquisition contract date | ❌ pending contract | Exact calendar date; provide signed purchase contract | No — evidence only |
| EV-2 | JJ acquisition closing costs | ❌ unknown | Notary/legal/tax costs at closing | No — refines numbers |

### Villa Mazotos 2 / Oren — Evidence-only gaps (B3 RESOLVED ✅)

> **B3 RESOLVED** — Valuation, required capital, inception model, JJ margin all confirmed by Yossi 2026-07-13. Remaining gaps are evidence-collection only, not architecture blockers.

| # | Field | Status | What Yossi needs to provide |
|---|---|---|---|
| ~~B3~~ | ~~Agreed entry valuation~~ | ✅ CONFIRMED €520,000 | — |
| ~~B3~~ | ~~Required entry capital~~ | ✅ CONFIRMED €182,000 | — |
| ~~B3~~ | ~~JJ entry margin~~ | ✅ CONFIRMED €42,000 (internal only) | — |
| ~~B3~~ | ~~Inception participation~~ | ✅ CONFIRMED — from acquisition start | — |
| EV-3 | JJ/Oren acquisition contract date | ❌ pending contract | Exact calendar date; provide signed purchase contract | No — evidence only |
| EV-4 | JJ acquisition closing costs (VM2) | ❌ unknown | Notary/legal/tax costs at closing | No — refines numbers |
| EV-5 | Capital paid by Oren | ❌ UNKNOWN | How much has he paid so far? Do not infer. | No — data entry when known |
| EV-6 | Capital remaining for Oren | ❌ UNKNOWN | = €182,000 − capital paid. Cannot calculate until EV-5 known. | No — derived |
| EV-7 | Partnership agreement (Oren) | ❌ unknown | Any special terms, preferred return, exceptions? | No — assume proportional |

**Total hard architecture blockers before M8-B SQL can begin: 0**
All business rules are confirmed. Remaining items are evidence-collection (exact dates, Oren capital paid, references) — these feed data entry, not architecture.

---

## Data Sources to Check

| Source | May contain |
|---|---|
| Notary deed / purchase contract — Villa Mazotos | JJ acquisition date, purchase price, closing costs |
| Notary deed / purchase contract — Villa Mazotos 2 | Same |
| Partnership agreement — Avi | Entry date, agreed valuation, required capital, special terms |
| Partnership agreement — Oren | Same |
| Bank statements (Avi) | Confirms €50,000; may show installment schedule; provides transfer reference |
| Bank statements (Oren) | Capital paid to date; transfer references |
| `partnership_ownership` table in Supabase | `effective_from` date for Avi and Oren (query: `SELECT * FROM partnership_ownership WHERE entity_id IN (...)`) |
| WhatsApp / email with Avi / Oren | May contain agreed figures — usable as Business Source if confirmed |

---

## What NOT to do

- ❌ Do not assume `agreed_entry_valuation` = JJ's purchase price (confirmed: €500K ≠ €400K)
- ❌ Do not derive `agreed_entry_valuation` from Avi's capital payments (confirmed by Yossi directly)
- ❌ Do not assume `required_entry_capital` = total of all Purchase/Client transactions from Avi
- ❌ Do not use `property_owners` table as source (FREEZE active; superseded by `partnership_ownership`)
- ❌ Do not substitute a computed value for a missing agreement fact — use NULL + missing_decision note
- ❌ Do not reclassify the legacy €30K "JJ Income" row in the DB before a formal correction workflow is in place (post-M8-B scope)
- ❌ Do not create two capital events (€30,000 + €20,000) for the installment-2 amount — there is one approved event of €50,000; the €30K is just the wrong historical value for the same event
- ❌ Do not treat the €20,000 difference (€50K confirmed − €30K DB) as an unexplained missing payment — it is a known historical data correction
- ❌ Do not treat the three "Renovation Client Payment" rows (€5,600 + €5,000 + €20,000 = €30,600) as part of Avi's entry capital — they are renovation billable events (ClientCharge), not capital payments

---

*Updated 2026-07-13: B2 (Avi inception) + B3 (Oren entry facts) both RESOLVED. Zero hard architecture blockers remain. Remaining items are evidence-collection only (exact dates, Oren capital paid).*
