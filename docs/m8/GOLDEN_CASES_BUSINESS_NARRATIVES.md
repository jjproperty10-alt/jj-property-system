# JJ Property 10 — Golden Cases: Business Narratives
**Version:** 1.0 · **Date:** 2026-07-13 · **Author:** QA Autonomous Review

This document is the canonical business reference for the six Golden Cases that anchor the ownership engine.
Every developer, QA engineer, or auditor who touches the ownership layer should read this before writing a line of code.

The goal is not to describe what the tests do — it is to describe what the **business** does, and then show that the software agrees exactly.

---

## How to read each case

Each case has three parts:

1. **Business Reality** — what happened in the real world, in plain language
2. **JJ Calculates** — what the system computes, step by step
3. **Expected Settlement** — the exact financial outcome, with direction (who pays whom)

---

## G1 — Avi / Villa Mazotos (50%)

### Business Reality

Avi is an external investor who co-bought Villa Mazotos together with JJ. The ownership split was agreed and registered: Avi 50%, JJ 50%. No other partners.

The property generated income and had expenses during the report period. In total, the project (100%) earned a net surplus of **€5,000** — meaning JJ owes the owners money.

Avi's share of that surplus is exactly half.

### JJ Calculates

| Step | Input | Output |
|---|---|---|
| Ownership lookup | `partnership_ownership` for Villa Mazotos · Avi | `ownershipPct = 50` |
| Routing flag | `hasOwnershipRecords = true` | apply pct to figures |
| Project balance (100%) | owner_credit account, closing_balance = +5,000 | `projectBalance100 = +5,000` |
| Owner adjustment | 5,000 × 50% | `ownerAdjustedBalance = +2,500` |
| Direction | positive balance | `payable_to_owner` |
| Per-account scaling | each account figure × 0.50 | confirmed in all line items |

### Expected Settlement

> **JJ pays Avi €2,500.**
> JJ retains €2,500 for its own 50%.
> The project balance splits symmetrically.

---

## G2 — JJ / Villa Mazotos (50%)

### Business Reality

JJ itself owns the other 50% of Villa Mazotos. JJ is treated as a single undivided entity — the Yossi/Jacob capital split is an internal JJ matter that does not appear in the ownership engine.

The project balance is the same €5,000 surplus. JJ's 50% share is the mirror image of Avi's.

### JJ Calculates

| Step | Input | Output |
|---|---|---|
| Ownership lookup | `partnership_ownership` for Villa Mazotos · JJ | `ownershipPct = 50` |
| JJ entity structure | `ownerType = 'jj_group'` | no Yossi/Jacob sub-split |
| Project balance (100%) | same report as G1 | `projectBalance100 = +5,000` |
| Owner adjustment | 5,000 × 50% | `ownerAdjustedBalance = +2,500` |
| Direction | positive balance | `payable_to_owner` |

### Expected Settlement

> **JJ's own account is credited €2,500.**
> JJ does not owe itself cash — this figure becomes an internal capital entry.
> Yossi/Jacob division of that €2,500 is handled separately at the partner capital layer, never here.

**Invariant:** ownership structure for Villa Mazotos sums to exactly 100% (Avi 50 + JJ 50 = 100). The engine validates this.

---

## G3 — Oren / Villa Mazotos 2 (35%)

### Business Reality

Villa Mazotos 2 is a client property — the client (Oren) paid a purchase price but owes the remaining balance to JJ. Oren owns 35% of the project. JJ owns 65%.

The project is in a **debt position**: the client still owes JJ money. The project balance is negative from the owner's perspective — `client_debt` convention means a positive account closing_balance reads as money owed *to* JJ, not to the owner.

Project balance (100%): **−€10,000** (owner owes JJ, before applying Oren's %).

### JJ Calculates

| Step | Input | Output |
|---|---|---|
| Ownership lookup | `partnership_ownership` for Villa Mazotos 2 · Oren | `ownershipPct = 35` |
| Balance convention | `client_debt` account → negate closing_balance | `projectBalance100 = −10,000` |
| Owner adjustment | −10,000 × 35% | `ownerAdjustedBalance = −3,500` |
| Direction | negative balance | `payable_to_jj` |

### Expected Settlement

> **Oren owes JJ €3,500** (his 35% share of the outstanding project debt).
> Oren is not responsible for JJ's 65% — that is JJ's own exposure.

**Key point:** the `client_debt` account convention flips the sign before any ownership percentage is applied. The convention flip happens in `computeProjectBalance100`, and the pct is applied exactly once afterward. These two operations are never interleaved.

---

## G4 — JJ / Villa Mazotos 2 (65%)

### Business Reality

JJ holds the majority stake (65%) of Villa Mazotos 2. The same €10,000 project debt applies. JJ's 65% exposure is the larger portion.

### JJ Calculates

| Step | Input | Output |
|---|---|---|
| Ownership lookup | `partnership_ownership` for Villa Mazotos 2 · JJ | `ownershipPct = 65` |
| Project balance (100%) | same as G3 | `projectBalance100 = −10,000` |
| Owner adjustment | −10,000 × 65% | `ownerAdjustedBalance = −6,500` |
| Direction | negative balance | `payable_to_jj` |

### Expected Settlement

> **JJ carries €6,500 of the outstanding project debt** (its 65% share).
> Combined with G3: Oren (€3,500) + JJ (€6,500) = €10,000 — the full project debt. ✅

**Ownership sums to 100%:** Oren 35 + JJ 65 = 100. Enforced by the engine. If ownership rows do not sum to 100%, the settlement will not balance — this is by design (the engine does not normalize; it uses the registered percentages as-is).

---

## G5 — Liron (client property, 100% passthrough)

### Business Reality

Tamir Dekelia is a pure client property managed by JJ. Liron is the client contact. There are no partner investors — JJ manages and settles the full balance directly with the client. No entry exists in `partnership_ownership` for this property.

The project earned a net surplus of **€8,000** (illustrative), meaning JJ owes the client money. Since there is no ownership split, the full 100% balance belongs to the client.

### JJ Calculates

| Step | Input | Output |
|---|---|---|
| Ownership lookup | `partnership_ownership` for Tamir Dekelia | 0 rows found |
| Routing flag | `hasOwnershipRecords = false` | passthrough mode |
| ownershipPct | default when no records | `100` |
| Owner adjustment | 8,000 × 100% | `ownerAdjustedBalance = 8,000` (unchanged) |
| Direction | positive balance | `payable_to_owner` |

### Expected Settlement

> **JJ pays Liron the full project balance.**
> No percentage applied. `ownerAdjustedBalance = projectBalance100` — they are identical.
> This is the standard client settlement path.

**Design contract:** the `hasOwnershipRecords` flag is the only routing signal. The fact that `entity_type = 'client_property'` is a presentation label only — it does not change the routing. If tomorrow a client property gains a partnership entry, the routing changes automatically from the flag, without any code change.

---

## G6 — Multi-property Portfolio: JJ (Villa Mazotos 50% + Villa Mazotos 2 65%)

### Business Reality

JJ has stakes in both Villa Mazotos and Villa Mazotos 2. At portfolio review time, the two properties have opposite settlement positions:

- Villa Mazotos: JJ is owed **+€2,500** (surplus)
- Villa Mazotos 2: JJ carries **−€6,500** (debt)

The portfolio view shows JJ's **net position** across both — the positive balance partially offsets the debt.

### JJ Calculates

| Step | Property | ownerAdjustedBalance | Side |
|---|---|---|---|
| Settlement 1 | Villa Mazotos (JJ 50%) | +2,500 | credit |
| Settlement 2 | Villa Mazotos 2 (JJ 65%) | −6,500 | debt |

| Portfolio aggregation | Calculation | Result |
|---|---|---|
| totalOwnerCredits | Σ positive balances | 2,500 |
| totalOwnerDebts | Σ abs(negative balances) | 6,500 |
| finalNetBalance | 2,500 − 6,500 | −4,000 |
| finalDirection | negative net | `payable_to_jj` |

### Expected Settlement

> **JJ's net position across its portfolio is −€4,000.**
> The Villa Mazotos surplus (€2,500) partially offsets the Villa Mazotos 2 debt (€6,500).
> JJ still owes a net €4,000 in project obligations.

**Portfolio rules:**
- Credits and debts are **never mixed before they are separated** — they are aggregated into `totalOwnerCredits` and `totalOwnerDebts` independently before netting. This gives the portfolio view transparent visibility into gross exposure on both sides.
- Per-property settlement DTOs are preserved in full — the portfolio layer adds only, never recalculates.
- The portfolio is computed for **one owner at a time**. Avi's portfolio and JJ's portfolio are independent calls. They are never co-mingled.

---

## G7 — Partner Entry Capital: Avi enters Villa Mazotos (confirmed 2026-07-13)

### Business Reality

Avi agreed to co-own Villa Mazotos with JJ at an agreed entry valuation of **€500,000**, owning **50%**. His required entry capital is therefore **€250,000**.

Avi paid in two installments:
1. **€200,000 direct to the seller** (transaction: Owner→Owner, "אבי העביר למוכר")
2. **€50,000 to Yossi** — partner-entry capital, NOT JJ operating income. The legacy DB row recorded this as €30,000 with category=JJ Income. This is a **known historical data correction**: the €30,000 is the wrong old value; the approved authoritative amount is €50,000.

Total paid: **€250,000**. Required capital: **€250,000**. Capital remaining: **€0**. Entry is **fully paid**.

### JJ Calculates (Investment Lifecycle Layer)

| Step | Input | Output |
|---|---|---|
| Read partner entry | `agreedEntryValuation = 500,000`, `ownershipPct = 50%` | `requiredEntryCapital = 250,000` |
| Sum capital payments | Installment 1 (€200,000) + Installment 2 (€50,000) | `capitalPaid = 250,000` |
| Compute remaining | 250,000 − 250,000 | `capitalRemaining = 0` |
| Fully paid check | capitalPaid ≥ requiredEntryCapital | `isEntryFullyPaid = true` |

### Expected Output (partner-facing)

> **Avi has fulfilled his entry capital commitment in full.**
> Required: €250,000. Paid: €250,000. Remaining: €0.

---

## G8 — JJ Internal: Acquisition Margin from Avi's Entry (confidential — never shown to Avi)

### Business Reality

JJ purchased Villa Mazotos for **€400,000** (purchase price). Avi entered at an agreed valuation of **€500,000**, paying **€250,000** for his 50%. JJ's proportional cost for Avi's 50% share was **€200,000** (= €400,000 × 50%). The difference is JJ's acquisition margin from this partner entry.

This is a one-time capital gain for JJ at the moment of Avi's entry. It is entirely separate from the ongoing operational margin on billable events.

### JJ Calculates (JJ Internal Report only)

| Step | Input | Output |
|---|---|---|
| JJ total acquisition cost (approx.) | Purchase price (closing costs TBD) | `totalJJCost ≈ 400,000` |
| Avi's required entry capital | €500,000 × 50% | `requiredEntryCapital = 250,000` |
| JJ cost for Avi's 50% | €400,000 × 50% | `jjCostShareForAvi = 200,000` |
| JJ margin from Avi's entry | €250,000 − €200,000 | `jjMarginFromEntry = 50,000` |
| JJ net capital at risk (post-Avi entry) | €400,000 − €250,000 | `jjNetCapitalAtRisk = 150,000` |

### Expected Output (JJ internal only)

> **JJ earned €50,000 margin from Avi's entry at the €500K valuation.**
> JJ's net capital at risk after Avi's entry: €150,000.
> This data is NEVER included in any partner-facing report or delivery channel.

**Note:** If closing costs (~€14,300) are included, `totalJJCost ≈ €414,300`, and `jjMarginFromEntry ≈ €42,850`. Use €50,000 until closing costs are locked.

---

## G9 — Billable Event with ClientCharge: Renovation on Villa Mazotos

### Business Reality

JJ commissions a renovation on Villa Mazotos. The actual cost (what JJ pays the contractor) is **€10,000**. JJ bills Avi **€13,000** for his 50% share of the project — reflecting JJ's standard markup.

Avi (50% owner) is charged his proportional share of the **ClientCharge**, not the actual cost. The difference is JJ's operational margin from this event.

### JJ Calculates (Billable Event model)

| Field | Formula | Avi (50%) |
|---|---|---|
| `actualCost` (total project) | Contractor invoice | €10,000 |
| `clientCharge` (total project) | JJ billing rate | €13,000 |
| `investorShare_clientCharge` | €13,000 × 50% | **€6,500** (billed to Avi) |
| `investorShare_actualCost` | €10,000 × 50% | €5,000 (internal only) |
| `jjMarginFromInvestor` | (€13,000 − €10,000) × 50% | **€1,500** (internal only) |

### Expected Output

> **Avi is charged €6,500 for his 50% share of the renovation.**
> JJ's operational margin from Avi on this event: €1,500 (never shown to Avi).

**Invariant:** `investorShare_actualCost` and `jjMarginFromInvestor` are excluded from all partner-facing output.

---

## G10 — Full Investment Lifecycle Summary: Avi at a point in time

### Business Reality

After paying his full entry capital, Avi participates in Villa Mazotos operations for a report period. The property generated a net surplus (from G1): **€5,000 at 100%**, of which Avi's 50% share is **€2,500** (owed to Avi by JJ). He has received no distributions. His entry capital is fully paid.

### JJ Calculates (Investment Lifecycle Summary)

| Field | Value | Source |
|---|---|---|
| `partnerName` | Avi | Partner Entry record |
| `entryOwnershipPct` | 50% | Partner Entry record |
| `agreedEntryValuation` | €500,000 | Partner Entry record ✅ CONFIRMED |
| `requiredEntryCapital` | €250,000 | Partner Entry record ✅ CONFIRMED |
| `capitalPaid` | €250,000 | Capital Events |
| `capitalRemaining` | €0 | Computed: €250K − €250K |
| `isEntryFullyPaid` | true | Computed |
| `additionalContributions` | €0 | No extra capital events |
| `totalDistributions` | €0 | No distribution events |
| `ownerAdjustedBalance` | +€2,500 | Settlement Engine (G1) |
| `netPosition` | +€2,500 | = €2,500 + €0 − €0 |

### Expected Output (partner-facing)

> **Avi's net position: JJ owes Avi €2,500.**
> Entry capital: fully paid. Operations balance: +€2,500. No outstanding obligations.

**Formula verification:** `netPosition = ownerAdjustedBalance + totalDistributions − capitalRemaining = €2,500 + €0 − €0 = €2,500` ✅

---

## G11 — Void-and-Replace: Known Historical Data Correction (Avi installment #2)

### Business Reality

Avi's second installment (the payment to Yossi) was recorded in legacy data as **€30,000** with category=JJ Income. This is a **known historical data error** — the approved authoritative business amount is **€50,000**, and the correct classification is partner-entry capital, not JJ operating income.

This is not an unexplained missing payment. The €20,000 difference between the legacy value (€30,000) and the authoritative amount (€50,000) is the gap between the wrong historical entry and the correct business fact. The correction was approved by Yossi.

**Correction rule:** One approved event of **€50,000**. Do NOT create two events (€30,000 + €20,000). There was one payment; the old value was simply wrong.

### JJ Calculates (Immutable Capital Ledger — Historical Correction)

```
LEGACY STATE (wrong):
  capitalEvent {
    id: 'ev-avi-002-legacy',
    amountEur: 30000,          ← WRONG — approved amount is €50,000
    category: 'JJ Income',    ← WRONG — is partner-entry capital
    voided: false
  }

CORRECTION SEQUENCE:
  Step 1 — VOID legacy row:
    UPDATE: voided = true
            voidReason = 'Historical data error. Correct amount: €50,000.
                         Also mis-classified as JJ Income.
                         Correct classification: Villa Mazotos partner-entry capital.
                         Approved by Yossi 2026-07-13.'
            voidedBy = 'Yossi'
            voidedAt = '2026-07-13'
  
  Step 2 — CREATE authoritative event:
    INSERT: capitalEvent {
      id: 'ev-avi-002',
      amountEur: 50000,                       ← authoritative amount
      eventType: 'capital_payment',
      partnerName: 'Avi',
      counterparty: 'Yossi',
      supersedesEventId: 'ev-avi-002-legacy', ← auto-set by createReplacementCapitalEvent()
      businessSource: 'Yossi approval 2026-07-13'
    }
```

### Expected Output

| Event ID | Amount | Voided | Supersedes | Active? |
|---|---|---|---|---|
| `ev-avi-002-legacy` | €30,000 | ✅ yes | — | ❌ excluded — legacy error, permanently preserved for audit |
| `ev-avi-002` | **€50,000** | ❌ no | `ev-avi-002-legacy` | ✅ included in capitalPaid |

> **The capital ledger is never silently edited.** The legacy €30K row remains permanently — an auditor can always see the old value, who corrected it, when, and why. The €50K is the only amount counted in Avi's capital ledger.

**Key invariant:** `createReplacementCapitalEvent()` auto-sets `supersedesEventId`. Do not create two events to account for the €20K difference — that would double-count a payment that never happened.

**Combined with installment #1 (ev-avi-001, €200,000):** Total active capitalPaid for Avi = €200,000 + €50,000 = **€250,000**. ✅

---

## G12 — Partner Portfolio: Avi (single property)

### Business Reality

Avi holds a stake in one property: Villa Mazotos (50%). At period end, his `ownerAdjustedBalance` for that property is +€2,500. He has no other properties in the portfolio.

The portfolio view aggregates his positions — even though there is only one, the aggregation must apply the same logic as a multi-property portfolio.

### JJ Calculates (Portfolio Layer)

| Property | ownerAdjustedBalance | Side |
|---|---|---|
| Villa Mazotos | +€2,500 | credit |

| Portfolio total | Calculation | Result |
|---|---|---|
| `totalOwnerCredits` | Σ positive balances | €2,500 |
| `totalOwnerDebts` | Σ abs(negative balances) | €0 |
| `totalRequiredCapital` | Σ requiredEntryCapital | €250,000 |
| `totalCapitalPaid` | Σ capitalPaid | €250,000 |
| `totalCapitalRemaining` | Σ capitalRemaining | €0 |
| `totalDistributions` | Σ totalDistributions | €0 |
| `totalNetPosition` | €2,500 + €0 − €0 | **+€2,500** |

### Expected Output (partner-facing)

> **Avi's portfolio net position: +€2,500 owed by JJ.**
> Total investment committed: €250,000. Total paid: €250,000. No outstanding entry capital balance.
> Net distributions received: €0.

---

## G13 — Avi Inception Participation / Villa Mazotos

### Business Reality

Avi did not join Villa Mazotos as an afterthought. He entered **from the very beginning of the acquisition transaction** — together with JJ, as part of the original purchase contract.

His 50% ownership covers the full arc of the property's lifecycle from day one: the original purchase price and associated costs, legal and registration fees, all renovation work, all operating activity (utilities, management, maintenance), all rental and Airbnb income, all profits and losses, and any future sale or disposition proceeds.

There was no period where JJ owned 100% and then transferred 50% to Avi. The joint acquisition was the inception of Avi's 50% stake.

**Exact calendar date:** Awaits the signed purchase contract. Business rule confirmed by Yossi 2026-07-13. Status: `confirmed_business_sequence_pending_exact_date`.

### JJ Calculates

| Step | Business Rule | System Behaviour |
|---|---|---|
| Ownership effective from | = original acquisition contract/commencement date | `partner_entry.ownership_effective_from` = acquisition contract date (once retrieved from signed contract) |
| Lifecycle economics scope | ALL categories from inception | Includes: purchase, legal, taxes, renovation, capex, operations, rental, Airbnb, profits, losses, future sale |
| No delayed-entry adjustment | Avi did not join one week or one year later | No proration of pre-Avi period; no "catch-up" calculation required |
| `ownership_period` start | = `partner_entry.ownership_effective_from` | First ownership period record: Avi 50%, JJ 50% — from acquisition inception |
| `profit_participation_start` | = same as `ownership_effective_from` | One unified effective date for ownership AND economics |

### Expected Output

> **No "JJ-only pre-Avi period" exists for Villa Mazotos.**
> Any report that computes a pre-Avi JJ period is architecturally incorrect.
> `ownership_period[0].effective_from` = acquisition start date.
> `partner_entry.entry_date` = acquisition start date.
> The system must not infer a later entry date from payment timing.

---

## G14 — Oren Entry / Villa Mazotos 2 (€520K valuation, €42K JJ margin)

### Business Reality

Oren entered Villa Mazotos 2 as a 35% investor. Like Avi at Villa Mazotos, Oren joined **from the acquisition inception** — together with JJ, not later.

The agreed terms (confirmed by Yossi 2026-07-13):
- **Agreed entry valuation:** €520,000 (the agreed property value at the time of Oren's entry)
- **Oren's ownership:** 35%
- **Required entry capital:** €182,000 (= €520,000 × 35%)
- **JJ's actual purchase price:** €400,000

JJ's cost for Oren's 35% is €140,000 (= €400,000 × 35%). But JJ charged Oren based on the €520,000 agreed valuation, not the €400,000 purchase price. The €42,000 difference (= €182,000 − €140,000) is JJ's one-time entry premium from Oren — **never shown to Oren**.

Capital paid by Oren: **UNKNOWN** — do not infer from any transaction rows. Must be confirmed explicitly by Yossi.

### JJ Calculates

#### Partner-visible output (what Oren sees)

| Field | Value | Source |
|---|---|---|
| Agreed entry valuation | €520,000 | Confirmed by Yossi 2026-07-13 |
| Ownership % | 35% | Confirmed |
| Required entry capital | €182,000 | = €520,000 × 35% |
| Capital paid | ❓ UNKNOWN | Must not be inferred |
| Capital remaining | ❓ UNKNOWN | = €182,000 − capital_paid; cannot calculate |
| Inception | From acquisition start | Confirmed by Yossi 2026-07-13 |

#### JJ-internal only (never shown to Oren)

| Field | Value | Formula |
|---|---|---|
| JJ acquisition cost (Oren's 35% share) | €140,000 | €400,000 × 35% |
| JJ entry margin from Oren | **€42,000** | €182,000 − €140,000 |
| JJ net capital at risk post-Oren | **~€218,000** | €400,000 − €182,000 |

#### ClientCharge formula at Oren 35%

| Item | Formula | Example (Cost=€100, CC=€130) |
|---|---|---|
| Owner charge (Oren sees) | CC × 35% | €45.50 |
| Owner cost share (internal) | Cost × 35% | €35.00 |
| JJ margin from Oren (internal) | (CC − Cost) × 35% | €10.50 |

### Expected Output

> **Oren's capital_paid must not be inferred.** No DB transaction rows are confirmed as Oren capital payments.
> **€42,000 JJ entry premium must never appear in any partner-facing API, report, or UI component.**
> `partner_entry.agreed_entry_valuation_eur` = €520,000 (partner-visible).
> `property_acquisition.purchase_price_eur` = €400,000 (JJ internal only).
> The two figures coexist without any forced relationship.

---

## G15 — Vacancy Cost Allocation / Villa Mazotos

### Business Reality

Villa Mazotos is empty for two months. JJ pays €800 in property costs: electricity €200, water €100, HOA €300, insurance €200. Avi owns 50%. There is no ClientCharge (no markup — costs passed at actual).

### JJ Calculates

| Field | Value | Formula |
|---|---|---|
| actual_cost (total) | €800 | Sum of vacancy period costs |
| ClientCharge | €0 | No markup applied |
| owner_charge (Avi) | €400 | €800 × 50% |
| owner_cost_share (Avi) | €400 | €800 × 50% |
| jj_margin_from_avi | €0 | (€0 − €800) × 50% = €0 (no CC) |

### Expected Output
> **Avi is charged €400 (his 50% of actual costs). JJ does not absorb Avi's share. JJ margin = €0 when CC = €0.**

---

## G16 — LTR Management Fee / Same Billable Event Model

### Business Reality

JJ manages a long-term rental for Avi (Villa Mazotos, 50%). Monthly management fee agreed: €200/month (ClientCharge). JJ's actual cost for this service: €0 (no sub-contractor). JJ margin = full ClientCharge × ownership%.

### JJ Calculates

| Field | Value | Formula |
|---|---|---|
| actual_cost | €0 | No sub-contractor |
| ClientCharge | €200 | Agreed management fee |
| owner_charge (Avi, 50%) | €100 | €200 × 50% |
| owner_cost_share (Avi, 50%) | €0 | €0 × 50% |
| jj_margin_from_avi | **€100** | (€200 − €0) × 50% — **internal only** |

### Expected Output
> **Avi is billed €100. JJ retains €100 margin (internal). Same Billable Event model as Renovation and Airbnb. `actual_cost`, `client_charge`, `owner_charge`, `owner_cost_share`, `jj_margin` all preserved separately.**

---

## G17 — Refinance Without Ownership Change

### Business Reality

JJ refinances Villa Mazotos. A bank provides €100,000. JJ's net capital at risk decreases. Avi's ownership percentage (50%) does not change. No new partner enters.

### JJ Calculates

| Step | Result |
|---|---|
| Refinance amount | €100,000 |
| Event created | `capital_event`, type=`refinance_capital_event` |
| New `ownership_period` record | ❌ Not created |
| Avi's ownership % after | 50% — unchanged |
| JJ net capital at risk | Decreases by refinance proceeds |

### Expected Output
> **Refinance = capital event only. Ownership model unchanged. No new ownership_period. If a new partner had been introduced via the refinance, a separate Ownership Event would create a new period.**

---

## G18 — Distribution vs Payment: Two Separate Records

### Business Reality

Settlement Engine computes Avi is owed €2,500 (his ownerAdjustedBalance). JJ can only pay €2,000 now. Outstanding balance = €500 remains.

### JJ Calculates

| Record | Primitive | Amount | What it represents |
|---|---|---|---|
| Settlement balance (computed) | 6 — Settlement Event | €2,500 | What JJ owes Avi (computed by Settlement Engine) |
| Distribution Payment #1 | 7 — Distribution/Payment Event | €2,000 | Actual cash wired to Avi |
| Outstanding balance | Computed | €500 | Settlement − ΣDistribution Payments |

### Expected Output
> **Settlement Engine output (€2,500) is never modified. Distribution Payment records what was actually paid (€2,000). Outstanding balance (€500) = Settlement − ΣPayments. Partial payments are supported. These records never merge.**

---

## G19 — P9: One Economic Movement, One Canonical Event

### Business Reality

Avi wires €50,000 to Yossi as installment 2 of entry capital. This is one bank transfer. The system must record it exactly once.

### JJ Calculates

| Concern | Answer |
|---|---|
| Canonical event | One `capital_event`, type=`partner_entry_payment`, amountEur=50000 |
| Accounting link | `linked_accounting_transaction_id` → the matching `transactions` row |
| Lifecycle link | `linked_lifecycle_event_id` → the `partner_entry.id` for Avi |
| Is it also an Expense? | ❌ No |
| Is it also Income? | ❌ No (it is NOT JJ operating income — confirmed business fact) |
| Is it also a ClientCharge? | ❌ No |
| capitalPaid includes this event? | ✅ Yes — counted once |
| Can it appear in two capital_event rows? | ❌ No — P9 violation |

### Expected Output
> **One economic movement = one canonical capital_event. It is projected into partner-facing reports as "capital paid" and into JJ-internal reports as "capital received." The underlying event is never duplicated. The legacy €30K row is voided; one replacement event for €50K is created. Total capitalPaid = €250,000 — counted once.**

---

## G20 — External Partner Transfer (No JJ Capital Event)

### Business Reality

Avi decides to sell his 50% Villa Mazotos stake directly to a new investor (David). JJ is not a buyer. The sale is a direct transaction between Avi and David.

### JJ Calculates

| Step | System Action |
|---|---|
| Avi's ownership_period | Closed: `effective_to` = transfer date |
| David's partner_entry | Created: ownership 50%, entry date = transfer date |
| David's ownership_period | Opened: 50%, from transfer date |
| JJ capital_event | ❌ NOT created — JJ is not a financial party |
| JJ's ownership % | Unchanged — 50% |
| Optional: transaction evidence | May reference the transfer agreement in business_source |

### Expected Output
> **External transfer creates two Ownership Events (one closing, one opening) and has no JJ capital event unless JJ actually handled or funded the transfer. JJ's 50% stake is unaffected. Existing accounting engine continues operating on unchanged ownership percentages.**

---

## Summary Table

| Case | Layer | Owner | Property | Key input | Key output |
|---|---|---|---|---|---|
| G1 | Settlement | Avi | Villa Mazotos | ownershipPct=50%, projectBalance=+5K | ownerAdjustedBalance=+2,500 |
| G2 | Settlement | JJ | Villa Mazotos | ownershipPct=50%, projectBalance=+5K | ownerAdjustedBalance=+2,500 (internal) |
| G3 | Settlement | Oren | Villa Mazotos 2 | ownershipPct=35%, projectBalance=−10K | ownerAdjustedBalance=−3,500 |
| G4 | Settlement | JJ | Villa Mazotos 2 | ownershipPct=65%, projectBalance=−10K | ownerAdjustedBalance=−6,500 |
| G5 | Settlement | Liron | Tamir Dekelia | no ownership rows, projectBalance=+8K | ownerAdjustedBalance=+8,000 |
| G6 | Portfolio | JJ | VM + VM2 | +2,500 + −6,500 | net=−4,000 |
| G7 | Lifecycle | Avi | Villa Mazotos | entry €500K val, 2 payments (€200K+€50K) | capitalRemaining=0, isFullyPaid=true |
| G8 | Lifecycle (JJ internal) | JJ | Villa Mazotos | totalJJCost=€400K, Avi entry=€250K | jjMarginFromEntry=€50K, netAtRisk=€150K |
| G9 | Lifecycle (Billable) | Avi | Villa Mazotos | cost=€10K, CC=€13K, pct=50% | billed=€6,500, jjMargin=€1,500 |
| G10 | Lifecycle (Summary) | Avi | Villa Mazotos | ops=+€2,500, capitalRemaining=€0 | netPosition=+€2,500 |
| G11 | Lifecycle (Audit) | Avi | Villa Mazotos | legacy €30K (wrong) → authoritative €50K (approved correction) | voided legacy ev + one replacement at €50K; total capitalPaid=€250K |
| G12 | Portfolio (Lifecycle) | Avi | VM portfolio | 1 property, netPosition=+€2,500 | totalNetPosition=+€2,500 |
| G13 | Lifecycle (Inception) | Avi | Villa Mazotos | from acquisition start; all lifecycle economics | ownership_effective_from = acquisition date; no pre-Avi period |
| G14 | Lifecycle (Entry) | Oren | Villa Mazotos 2 | val=€520K, required=€182K, jjPremium=€42K (internal) | capital_paid=UNKNOWN; jjMargin never shown to Oren |
| G15 | Lifecycle (Vacancy) | Avi 50% | Villa Mazotos | vacancy cost €800 during empty period | owner_charge=€400 (50%); owner_cost_share=€400; JJ margin=€0 if no CC |
| G16 | Lifecycle (LTR Mgmt) | Avi 50% | Villa Mazotos | cost=€0, CC=€200 mgmt fee | owner_charge=€100; jjMargin=€100 (internal) |
| G17 | Lifecycle (Refinance) | JJ | Villa Mazotos | refinance; no ownership change | capital_event only; no new ownership_period |
| G18 | Lifecycle (Distribution) | Avi 50% | Villa Mazotos | Settlement=€2,500; payment=€2,000 | distribution_payment capital_event; outstanding balance=€500 |
| G19 | Lifecycle (P9 — one event) | Avi | Villa Mazotos | one bank transfer | one canonical capital_event; no duplication across primitives |
| G20 | Lifecycle (External Buyout) | Avi→NewPartner | Villa Mazotos | Avi sells 50% directly to new investor | ownership_period closes for Avi; opens for new partner; no JJ capital_event |

---

## Architectural invariants encoded in these cases

**From G1–G6 (Settlement Engine layer):**

1. **Ownership pct applied exactly once** — in `buildPropertySettlement()`, never again in Portfolio or PDF.
2. **`hasOwnershipRecords` is the only routing flag** — `entity_type` is never used for calculation.
3. **`property_owners` is never referenced** — all ownership data comes from `partnership_ownership` exclusively.
4. **Portfolio credits and debts are separated before netting** — transparent gross exposure.
5. **JJ remains undivided** — Yossi/Jacob split belongs to the partner capital layer, not here.
6. **Effective dates are respected** — future or expired rows are excluded before any calculation.
7. **Unconfirmed rows are ignored** — only `confirmation_status = 'confirmed'` rows qualify.
8. **100% passthrough for zero ownership rows** — client properties always receive the full balance.

**From G7–G12 (Investment Lifecycle layer):**

9. **Agreed entry valuation has no arithmetic relationship to purchase price** — confirmed: €500K valuation ≠ €400K purchase price.
10. **Capital paid does not equal required capital without explicit confirmation** — only a direct business source can establish required_entry_capital.
11. **Partner-entry capital must not be mis-classified as JJ operating income** — the €50K Avi→Yossi row is capital, not revenue.
12. **JJ margin from entry is computed, never stored in the ledger** — reporting-time derivation only.
13. **Operational margin (ClientCharge−ActualCost)×pct is computed per event** — never stored as a separate entry.
14. **Capital ledger is immutable** — corrections are void-and-replace only; `supersedesEventId` auto-links replacement to voided event. For historical data errors (e.g. legacy €30K → authoritative €50K): one corrected event, not two split events for the difference.
15. **Partner-facing reports never include**: `purchasePrice`, `totalJJCost`, `jjMarginFromEntry`, `investorShare_actualCost`, `jjMarginFromInvestor`.
16. **`netPosition = ownerAdjustedBalance + totalDistributions − capitalRemaining`** — this formula is invariant across all lifecycle summaries.

**From G13–G14 (Inception participation + confirmed Oren facts):**

17. **Inception participation is the default model** — when a partner entered at acquisition start (confirmed by Yossi), `ownership_effective_from` = acquisition contract date. The system must never fabricate a delayed entry date from payment timing or other evidence. Only a signed document can establish a different date.

18. **Entry valuation and purchase price coexist without forced relationship** — `agreed_entry_valuation_eur` (Oren: €520K) and `property_acquisition.purchase_price_eur` (€400K) are independent confirmed facts. The JJ entry premium (€42K for Oren) is internal. Neither fact is derived from the other; both are sourced independently from Yossi's confirmation.

**From G15–G20 (OQ resolutions: Vacancy, LTR, Refinance, Distribution, P9, Buyout):**

19. **Vacancy costs are property costs — owners pay per ownership %** — JJ does not absorb a partner's cost share. When CC = €0 (pass-through at actual), jj_margin = €0.

20. **LTR uses the same Billable Event model as Renovation and Airbnb** — `actual_cost`, `client_charge`, `owner_charge`, `owner_cost_share`, and `jj_margin` are all preserved as separate fields on every lifecycle event. JJ does not invoice itself.

21. **Refinance creates a capital_event only; no new ownership_period is created unless ownership actually changes** — the refinance event type is `refinance_capital_event`. The ownership model is untouched if no partner changes.

22. **Settlement Engine output (what is owed) is never modified by payments** — what was actually paid is recorded as a separate `distribution_payment` capital_event. Outstanding balance = Settlement − ΣDistribution Payments. Partial payments are supported natively. Primitive 6 (Settlement) and Primitive 7 (Distribution/Payment) are never merged.

23. **P9: One economic movement → one canonical event** — a single bank transfer creates exactly one canonical event in the lifecycle layer. It may be linked to an accounting row via `linked_accounting_transaction_id`, but the canonical record is the lifecycle event. No event may exist in two primitives simultaneously.

24. **External partner transfer (buyout) does not create a JJ capital_event** — only two Ownership Events are created (one closing, one opening). JJ's capital exposure changes only if JJ was actually a financial party to the transfer. External = no JJ capital_event.

---

*This document is the source of truth for business intent. When the tests pass, they prove the code matches this narrative exactly. When the narrative changes, the tests must be updated first.*
*Version: 3.0 · Updated 2026-07-13 — Added G15–G20 (OQ-1 vacancy, OQ-2 LTR, OQ-3 refinance, OQ-5 distribution, P9 canonical, OQ-6 external buyout). Summary table updated to 20 cases. Invariants 19–24 added.*
