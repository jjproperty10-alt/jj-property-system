# M8 — Event Type Audit: Constitutional Map
**JJ Property 10 · Architecture Gate Document**
**Status:** ✅ GATE B7 — PASS (2026-07-13)
**Date:** 2026-07-13 · **Issued by:** Architecture Review — Yossi + Claude
**Based on:** Yossi's authoritative event constitution message 2026-07-13

> This is the constitutional map of every event type the system handles. SQL proceeds only after this gate passes. **Gate B7 is PASSED.**

---

## B7 Verification Results

| Check | Result | Notes |
|---|---|---|
| B7-a: Four Primitives model correct? | ✅ PASS — expanded to 7 primitives | See Section: Seven Economic Primitives |
| B7-b: Event Type Audit Table complete for RC1? | ✅ PASS | All RC1 event types mapped; RC2+ events documented-in-principle |
| B7-c: OQ-1 through OQ-6 resolved? | ✅ ALL RESOLVED | See resolutions below |
| B7-d: P10 (Ownership → Investment Events) correct? | ✅ PASS | Confirmed by OQ-3 (Refinance) and OQ-6 (Buyout) resolutions |
| B7-e: P11 (Capital Event ≠ P&L) correct? | ✅ PASS | Confirmed by OQ-4 and OQ-5 |
| B7-f: P9 (One movement → one canonical event) internally consistent? | ✅ PASS | No double-counting found in current design |
| Duplicate financial movements found? | ❌ NONE | Void-and-replace + one canonical event prevents duplication |
| Projections are read-only? | ✅ | Views only; no projection writes back to canonical event |
| Existing engines affected? | ❌ NONE | M8 tables are additive; accounting engine untouched |

**B7 VERDICT: PASS**

**Documented RC1 Limitation:** RC1 schema implements Acquisition, Partner Entry, Capital Payment, Ownership Period, and Disposition. Refinance, Capital Call, and Partner Buyout are architecturally defined (event types documented, subtype values registered) but not yet table-implemented. These are RC2+ scope and do not block RC1 SQL.

---

## Seven Economic Primitives — Locked

Every economic movement in the system belongs to exactly one of these seven primitives. They are mutually exclusive at the event-classification level.

| # | Primitive | Definition | Changes Capital Position? | Flows Through P&L? | Creates Ownership Change? | Example |
|---|---|---|---|---|---|---|
| 1 | **Capital Event** | Changes investment position, capital account, funding, ownership economics, or investor cash position | ✅ Yes | ❌ No | ❌ (no) | Avi pays €50K entry capital |
| 2 | **Expense** | Economic cost of the property/project | ❌ No | ✅ Yes (cost) | ❌ No | JJ pays plumber €200 |
| 3 | **Income** | Operating or disposal revenue | ❌ No | ✅ Yes (revenue) | ❌ No | Airbnb payout €1,200 |
| 4 | **ClientCharge** | Contractual amount charged to an owner/client. Does not overwrite Actual Cost | ❌ No | ✅ Yes (CC revenue) | ❌ No | Renovation billed at €1,300 vs cost €1,000 |
| 5 | **Ownership Event** | Changes ownership percentage or creates/closes an ownership period | ❌ No | ❌ No | ✅ Yes | Avi enters at 50% from acquisition date |
| 6 | **Settlement Event** | Represents an entitlement, receivable, or payable — "what is owed" | ❌ No | ✅ Accrual | ❌ No | Owner balance at period-end: JJ owes €2,500 |
| 7 | **Distribution / Payment Event** | Actual movement of funds satisfying part or all of a Settlement | ✅ (net position) | ❌ No | ❌ No | JJ wires Avi €2,000 (partial distribution) |

**Critical separation — Primitive 6 vs 7:**
- Primitive 6 (Settlement) = what is owed, computed by the Settlement Engine
- Primitive 7 (Distribution) = what was actually paid, recorded as a capital_event
- These must never be merged. A partial payment leaves an outstanding balance.

**ClientCharge does not overwrite Actual Cost.** Both must be preserved:
```
Actual Cost     → owner_cost_share = actual_cost × ownershipPct
ClientCharge    → owner_charge = client_charge × ownershipPct
JJ Margin       → (client_charge − actual_cost) × ownershipPct  [JJ internal only]
JJ does not invoice itself.
```

---

## Principle P9 — One Economic Movement → One Canonical Event

> **Every economic movement belongs to exactly one authoritative business event.**

A movement must not simultaneously be stored as an Expense, Capital Contribution, ClientCharge, and Profit Distribution.

If several business projections need the same movement:
- Keep **one authoritative canonical event**
- Create **links / read-only projections**
- Do not duplicate the financial event
- Do not count it more than once

**Formal rule:**
```
One economic movement
    → one canonical_event (lifecycle layer or accounting layer)
    → many read-only projections (views, reports, statements)
```

**Required fields on every canonical event:**
```
canonical_event_id         UUID PK of the event itself (its own id IS its canonical_id)
event_type                 TEXT — what kind of event
event_nature               TEXT — 'lifecycle_event' | 'accounting_event' | 'settlement_event'
business_source_id         UUID FK → lifecycle.business_source
effective_date             DATE
recorded_at                TIMESTAMPTZ (created_at)
recorded_by                TEXT
status                     TEXT — 'pending_verification' | 'confirmed' | 'void'
linked_accounting_transaction_id  UUID FK → public.transactions.id (nullable)
linked_lifecycle_event_id         UUID FK → the parent lifecycle event (nullable)
```

---

## Open Questions — All Resolved

### OQ-1 — VACANCY COSTS ✅ RESOLVED

**Decision:** Vacancy costs are property costs.

Examples: electricity, water, internet, insurance, HOA/common expenses, pool, garden, maintenance, municipal/property charges.

**Allocation:** Property owners participate according to their confirmed ownership percentages. JJ does not absorb the external owner's share unless a specific approved agreement says otherwise.

**ClientCharge:** If a billable vacancy-related service has a CC, apply standard ClientCharge rules.

**Event Type classification:** Vacancy Cost → **Expense** (Primitive 2) + optional **ClientCharge** (Primitive 4). Ownership splits apply per confirmed ownership percentages.

---

### OQ-2 — LONG-TERM RENTAL MANAGEMENT FEE ✅ RESOLVED

**Decision:** Long-Term Rental uses the same Billable Event model as Management and Airbnb.

**Preserved separately:**
- `actual_cost`
- `client_charge`
- `owner_charge` = ClientCharge × OwnershipPct
- `owner_cost_share` = ActualCost × OwnershipPct
- `jj_margin` = (ClientCharge − ActualCost) × OwnershipPct [internal only]

**For external owner (e.g. Avi 50%):**
JJ Margin from Avi = (ClientCharge − Actual Cost) × 50%

**For 100% client property:**
JJ Margin = ClientCharge − Actual Cost

**JJ does not invoice itself.** A fixed management fee is a ClientCharge rule, not a separate accounting philosophy.

---

### OQ-3 — REFINANCE ✅ RESOLVED

**Decision:** Refinance does not automatically create a new Ownership Period. It creates a **financing / capital event** (Capital Event — Primitive 1).

Only if the refinance legally or economically changes ownership should a linked **Ownership Event** (Primitive 5) create a new Ownership Period.

```
Refinance
    → Financing / Capital Event (Primitive 1)
    → optional Ownership Event (Primitive 5)
    → new Ownership Period only if ownership actually changes
```

**Event type:** `refinance_capital_event` in `capital_event` table. Linked to `ownership_period` only if ownership changes.

---

### OQ-4 — CAPITAL CALL VS PARTNER ENTRY ✅ RESOLVED

**Decision:** One unified Capital Event ledger with distinct event types/subtypes.

**Subtypes in `capital_event.event_type`:**
- `partner_entry_payment` — installment toward entry capital from `partner_entry`
- `capital_call` — JJ requests additional capital
- `additional_capital_contribution` — voluntary additional capital beyond required
- `capital_refund` — JJ returns capital to partner
- `capital_withdrawal` — partner withdraws capital
- `ownership_increase` — partner acquires additional %
- `ownership_decrease` — partner sells partial %
- `acquisition_payment` — JJ payment for property acquisition
- `acquisition_expense` — JJ acquisition closing cost
- `distribution_payment` — actual payment satisfying a settlement (Primitive 7)
- `buyout_internal` — JJ buys partner's stake
- `refinance_capital_event` — financing event (OQ-3)

**Partner Entry** remains a richer lifecycle entity (with agreed_entry_valuation, required_entry_capital, entry date, etc.). Its payment movements use the shared capital_event ledger.

**No competing payment ledgers.** One immutable append-only ledger for all capital movements.

---

### OQ-5 — PROFIT DISTRIBUTION VS BPO ✅ RESOLVED

**Decision:** These are separate records.

| Record | Primitive | Source | Content |
|---|---|---|---|
| Settlement / Owner Balance | 6 — Settlement Event | Computed by Settlement Engine from `ownerAdjustedBalance` | What is owed to the owner at period-end |
| Distribution Payment | 7 — Distribution/Payment Event | `capital_event` with type=`distribution_payment` | What was actually paid |

**Must support:** partial payments; outstanding balances (Settlement − sum of all Distribution Payments ≠ 0 → balance remains).

**Never merge what is owed and what was paid.**

---

### OQ-6 — PARTNER BUYOUT ✅ RESOLVED

**Decision:** Two supported business models, with explicit subtype.

**A. External Transfer (e.g. Avi sells to new investor)**
JJ is not buyer or seller. System records:
- Ownership decrease for seller (Avi) → closing ownership period
- Ownership increase for buyer → opening new ownership period
- Optional: transaction evidence in `capital_event` if JJ handled any funds
- No JJ capital_event unless JJ actually funded or participated

**B. Internal Buyout (e.g. JJ buys Avi's stake)**
System records:
- JJ capital_event (`buyout_internal`)
- Seller settlement record
- Ownership change (Avi ownership period closes; JJ ownership period expands)
- Payment evidence, buyout valuation, agreement reference

**Subtypes:** `external_transfer` | `internal_buyout` — required field on all buyout events.

---

## Event Type Audit Matrix

### Column Definitions

| Column | Meaning |
|---|---|
| **Primitive** | Which of the 7 primitives owns this event |
| **Lifecycle** | Creates/updates records in `lifecycle.*` tables |
| **Accounting** | Flows through `public.transactions` / `classifyTx()` |
| **Capital** | Changes investor capital position |
| **Ownership** | Creates/modifies `ownership_period` |
| **ClientCharge** | Generates a charge to client/owner (CC) |
| **JJ Margin** | Generates `(CC − Cost) × pct` — internal only |
| **Partner Visible** | Partner can see this or its output in investment statement |

---

### Group A — Investment Lifecycle (structural changes)

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Acquisition** | 1 + 5 | ✅ | ❌ | ✅ JJ | ✅ | ❌ | ❌ | ❌ internal | ✅ | Creates `property_acquisition` + initial `ownership_period`. Never shown to external partner directly. |
| **Partner Entry** | 1 + 5 | ✅ | ❌ | ✅ partner | ✅ | ❌ | ❌ ¹ | ✅ entry terms | ✅ | Creates `partner_entry` + `ownership_period`. ¹JJ entry margin computed from terms — internal only. |
| **Capital Payment (installment)** | 1 | ✅ | ✅ evidence | ✅ partner | ❌ | ❌ | ❌ | ✅ own payments | ✅ | Appended to `capital_event`, type=`partner_entry_payment`. |
| **Capital Call** | 1 | ✅ | ✅ | ✅ partner | ❌ | ❌ | ❌ | ✅ | RC2 | Same ledger as Partner Entry; distinct subtype. |
| **Additional Capital Contribution** | 1 | ✅ | ✅ | ✅ partner | ❌ | ❌ | ❌ | ✅ | RC2 | Voluntary extra capital beyond required. |
| **Capital Refund** | 1 | ✅ | ✅ | ✅ partner | ❌ | ❌ | ❌ | ✅ | RC2 | JJ returns principal to partner. |
| **Distribution Payment** | 7 | ✅ | ✅ | ✅ net pos | ❌ | ❌ | ❌ | ✅ | ✅ | Actual cash paid; satisfies part/all of Settlement. |
| **Partner Buyout (Internal)** | 1 + 5 | ✅ | ✅ | ✅ JJ | ✅ | ❌ | ❌ | ✅ | RC2 | JJ capital_event + ownership change. |
| **Partner Transfer (External)** | 5 | ✅ | Optional | ❌ JJ | ✅ | ❌ | ❌ | ✅ | RC2 | Ownership transfers; JJ not a financial party. |
| **Refinance** | 1 | ✅ | ✅ | ✅ JJ | ⚠️ Only if ownership changes | ❌ | ❌ | ⚠️ Partial | RC2 | Capital event only; optional Ownership Event if structure changes. |
| **Disposition / Sale** | 1 + 5 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | Creates `property_disposition`. Closes all ownership periods. |

---

### Group B — Acquisition Cost Events

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Purchase Payment (to seller)** | 1 (JJ) | ❌ | ✅ | ✅ JJ | ❌ | ❌ | ❌ | ❌ | ✅ | `acquisition_payment` in capital_event. |
| **Purchase Deposit** | 1 (JJ) | ❌ | ✅ | ✅ JJ | ❌ | ❌ | ❌ | ❌ | ✅ | Part of purchase price; same treatment. |
| **Purchase Expense** (legal, tax, notary, brokerage) | 1 (JJ) | ❌ | ✅ | ✅ JJ | ❌ | ❌ | ❌ | ❌ | ✅ | Adds to `total_jj_cost`. Internal only. |

---

### Group C — Renovation Events

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Renovation Cost** | 2 Expense | ✅ | ✅ | ❌ | ✅ (per %) | Optional | Optional | ✅ cost share | ✅ | Actual cost. If CC set → JJ Margin on the delta. |
| **Renovation ClientCharge** | 4 CC | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ internal | ✅ CC amount | ✅ | Amount billed to owner. May exceed actual cost. |
| **Vacancy Cost** | 2 Expense | ✅ | ✅ | ❌ | ✅ (per %) | Optional | Optional | ✅ cost share | ✅ | **OQ-1 RESOLVED.** Property costs during vacancy. Owner pays per % unless agreed otherwise. |

---

### Group D — Airbnb / Short-Term Rental Events

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Platform Income** (net payout) | 3 Income | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | Authoritative: payout = totalPrice − hostFee. Already confirmed. |
| **Airbnb Mgmt Fee** (tracking) | — tracking | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ internal | ✅ | Platform-side deduction, already in Platform Income. Not deducted again. |
| **Airbnb Cleaning** (tracking) | — tracking | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ internal | ✅ | Same. Informational only. |
| **Bank Payment to Owner (BPO)** | 7 Distribution | ✅ | ✅ | ✅ net pos | ✅ | ❌ | ❌ | ✅ | ✅ | Actual disbursement. Distinct from Settlement balance. |
| **Owner Expense** (utilities, repairs via JJ) | 2 Expense | ✅ | ✅ | ❌ | ✅ | ✅ | Optional | ✅ | ✅ | Real expenses charged to owner. Only these reduce owner balance directly. |

---

### Group E — Management / Long-Term Rental Events

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **LTR Income** | 3 Income | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | Rent received. |
| **LTR Management Fee** | 4 CC | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ internal | ✅ | ✅ | **OQ-2 RESOLVED.** Same Billable Event model. Preserves: actual_cost, client_charge, owner_charge, owner_cost_share, jj_margin. |
| **Management Expense** (on behalf of owner) | 2 Expense | ✅ | ✅ | ❌ | ✅ | ✅ | Optional | ✅ | ✅ | HOA, insurance, municipal rates. Reimbursable. |
| **Management ClientCharge** | 4 CC | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ internal | ✅ | ✅ | JJ's management fee to client. |
| **Settlement / Owner Receivable** | 6 Settlement | ❌ | ✅ (computed) | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | **OQ-5.** What is owed. Computed by Settlement Engine. Not a payment. |

---

### Group F — JJ Company Events (not property-level)

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **JJ Salary** | 2 Expense | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Company P&L via `v_jj_company_pl`. |
| **JJ Office/Marketing Expense** | 2 Expense | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Company P&L. |
| **JJ Income** (service revenue) | 3 Income | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | Company revenue. Not a property-level event. |

---

### Group G — Settlement / Transfer Events

| Event Type | Primitive | Lifecycle | Accounting | Capital | Ownership | CC | JJ Margin | Partner Visible | RC1? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| **Transfer / Internal Offset** | — | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ context | ✅ | Balance clearing. Cross-property settlement → RC2. |
| **External Personal Payment to Client Balance** | — | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ context | ✅ | Partner Capital Rule applies. Yossi ≠ Jacob ≠ JJ. Payer identity preserved. |

---

## P9 Compliance Verification

| Scenario | P9 Compliant? | Notes |
|---|---|---|
| Avi pays €50K — one transaction row, one capital_event | ✅ | `capital_event` is the canonical event; `transactions` row is the accounting evidence (linked via `linked_accounting_transaction_id`) |
| Airbnb payout — one income event, owner settlement computed separately | ✅ | Income = 1 canonical event; settlement balance = computed projection; BPO = separate Distribution Payment event |
| Renovation: actual cost €1K, CC €1.3K — same row | ✅ | One `transactions` row; classifyTx() projects Expense (€1K) and ClientCharge (€1.3K) as read-only outputs; no duplication |
| Avi legacy €30K → corrected to €50K | ✅ | One voided legacy event + one replacement event for €50K; `capitalPaid` counts only the active event once |
| Profit Distribution: Settlement says JJ owes Avi €2.5K; JJ pays €2K, balance €500 remains | ✅ | Settlement (€2.5K) = Settlement Engine output; Distribution Payment (€2K) = capital_event; outstanding balance (€500) = Settlement − ΣDistributions |

**P9 result: No double-counting found in current design.** ✅

---

## RC1 Scope vs RC2+ Scope

### RC1 (M8-B SQL — ready to proceed)
✅ property_acquisition
✅ partner_entry
✅ capital_event (subtypes: partner_entry_payment, acquisition_payment, acquisition_expense, partner_acquisition_payment, distribution_payment)
✅ ownership_period
✅ property_disposition
✅ business_source
✅ entity_identity / entity_registry extension

### RC2+ (Architecturally defined, not yet table-implemented)
⏳ Capital Call workflow (subtype registered; table support RC2)
⏳ Capital Refund / Withdrawal
⏳ Refinance table
⏳ Partner Buyout (Internal / External) workflow
⏳ Settlement Event table (currently computed in memory by Settlement Engine)
⏳ Cross-property settlement engine

---

## Gate Status

| Gate Item | Status |
|---|---|
| B7-a: Primitives model | ✅ PASS |
| B7-b: Event matrix complete (RC1) | ✅ PASS |
| B7-c: OQ-1 through OQ-6 resolved | ✅ ALL RESOLVED |
| B7-d: P10 correct | ✅ PASS |
| B7-e: P11 correct | ✅ PASS |
| B7-f: P9 consistent | ✅ PASS |
| Duplicate movements | ✅ NONE FOUND |
| Existing engines affected | ✅ NONE |

## ✅ GATE B7: PASS — SQL may proceed

**Approved facts preserved:**
- Avi: €500K entry val, €250K required, €250K paid, €0 remaining, from inception — ✅
- Avi legacy correction: one €50K event (not €30K + €20K) — ✅
- Oren: €520K val, €182K required, €42K JJ margin internal, capital paid UNKNOWN — ✅
- JJ internal margins never exposed to partners — ✅
- Partner Capital Rule (Yossi ≠ Jacob ≠ JJ) — ✅
- Void-and-replace immutability — ✅
- Existing engines untouched — ✅

---

*Version: 2.0 · Gate issued 2026-07-13 · B7: PASS*
*Supersedes: v1.0 (2026-07-13) — original audit with 4 primitives and 6 open questions*
