# ~~ADR — Property Lifecycle & Capital Events~~

## ⚠️ SUPERSEDED — 2026-07-13

**Superseded by:** [`ADR_M8_INVESTMENT_LIFECYCLE.md`](ADR_M8_INVESTMENT_LIFECYCLE.md) — the M8 Definitive ADR.

**Retained for:** Decision audit trail. Do not use as basis for any implementation.

**Why superseded:** This ADR was correct in direction but pre-M8. The definitive ADR adds: Business Reality First principle, event classification (business/accounting/reporting), explicit M8 implementation phases with gates, and migration gates. The entity definitions here remain valid and are carried forward unchanged.

---

**JJ Property 10 Platform · Architecture Decision Record**
**Status:** ~~Approved~~ **SUPERSEDED** · Original date: 2026-07-13
**Original superseded:** ADR_ACQUISITION_LAYER.md

---

## The Foundational Principle

> **A property has one acquisition. A property can have many partner entry events.**

This single sentence is the most important architectural decision in this ADR. Everything else follows from it.

A property is not a set of transactions. It is a **living entity** that moves through a lifecycle. Each significant event in that lifecycle is recorded as an immutable fact. The current ownership table, the current partner positions, the current capital structure — all of these are *derived* from the event history, not stored as primary data.

---

## Why This Matters

Without this model, the system cannot handle:

- A partner who enters **two years after** JJ bought the property (at a completely different valuation)
- A partner who exits and is replaced by a new partner
- An additional capital injection mid-lifecycle (neither acquisition nor operations)
- A partial sale where one partner exits but others remain
- A refinancing that changes the capital structure without changing ownership %
- A future investment fund structure with rolling entry/exit windows

With this model, **none of these require code changes**. They require only a new event record.

---

## What Changes vs. the Previous ADR

The previous ADR proposed an "Acquisition Engine" — a computational layer that derives partner investment from acquisition cost. That framing was wrong for one specific reason:

> JJ bought Villa Mazotos in 2020 for €180,000.
> Avi entered in 2022 at an agreed valuation of €240,000.
> These two numbers have no arithmetic relationship.

The previous ADR would have tried to connect them. This ADR forbids it. They are separate events, recorded separately, with no implied relationship between their valuations.

---

## The Property Lifecycle

```
Property Lifecycle

Opening Event
│
├── property_acquisition      ← JJ buys the property (one, immutable)
│
├── partner_entry             ← A partner joins (many, each independent)
│
├── ownership_period          ← Derived result of entries and exits
│
├── capital_event             ← Any capital movement (contributions, withdrawals)
│
├── [Operations]              ← Renovation, Management, Airbnb (existing engines)
│
├── partner_exit              ← A partner leaves (recorded as capital_event)
│
├── property_disposition      ← Property sold or transferred (one per exit)
│
└── closing_settlement        ← Final reconciliation of all positions
```

Each step is an **event** — a timestamped, immutable fact about what happened. The system derives current state from the event log, it does not store mutable "current state" directly (except as computed views).

---

## Entity Definitions

### `property_acquisition`
**One per property. Records JJ's original purchase. Confidential.**

```sql
CREATE TABLE property_acquisition (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entity_registry(id),  -- the property
  acquisition_date  DATE NOT NULL,
  purchase_price    NUMERIC(12,2) NOT NULL,   -- what JJ paid
  closing_costs     NUMERIC(12,2) DEFAULT 0,  -- legal, taxes, fees
  total_jj_cost     NUMERIC(12,2) GENERATED ALWAYS AS
                      (purchase_price + closing_costs) STORED,
  funding_notes     TEXT,     -- "JJ cash" / "mortgage" / "Yossi personal capital"
  document_ref      TEXT,     -- link to purchase agreement
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

**Rules:**
- One row per property. No UPDATE once signed — create a correction event if needed.
- Never exposed to partners in any report.
- `total_jj_cost` is the cost basis for JJ's own P&L and capital gain calculation.

---

### `partner_entry`
**Many per property. Records each partner's commercial entry terms. Partially visible to that partner.**

```sql
CREATE TABLE partner_entry (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entity_registry(id),  -- the property
  partner_name          TEXT NOT NULL,
  entry_date            DATE NOT NULL,
  agreed_entry_valuation NUMERIC(12,2) NOT NULL,  -- property "value" agreed for this entry
  entry_ownership_pct   NUMERIC(5,2) NOT NULL,    -- % this partner receives
  entry_amount          NUMERIC(12,2) GENERATED ALWAYS AS
                          (agreed_entry_valuation * entry_ownership_pct / 100) STORED,
  capital_paid          NUMERIC(12,2) DEFAULT 0,  -- actual payments received to date
  agreement_ref         TEXT,    -- link to entry agreement / SHA
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- Derived (not stored):
-- capital_remaining = entry_amount - capital_paid
-- jj_gain_from_entry = entry_amount - (total_jj_cost × entry_ownership_pct / 100)
--                      [internal only, never shown to partner]
```

**Rules:**
- `agreed_entry_valuation` has **no required relationship** to `property_acquisition.purchase_price`. They may differ by any amount and by any time gap.
- `entry_ownership_pct` must be consistent with `partnership_ownership` records on `entry_date`.
- `capital_paid` is the running total of actual Purchase Payment transactions linked to this entry.
- The partner sees: `agreed_entry_valuation`, `entry_ownership_pct`, `entry_amount`, `capital_paid`, `capital_remaining`.
- The partner never sees: JJ's purchase price, JJ's total cost, JJ's margin on this entry.

---

### `ownership_period`
**Derived from partner entries and exits. Replaces direct editing of `partnership_ownership`.**

This is the table the existing Ownership Engine already reads. Its rows are now **generated by events** rather than entered manually.

```sql
-- Existing table: partnership_ownership (unchanged structure)
-- New constraint: rows are inserted by event handlers, not edited directly

-- Source mapping:
-- property_acquisition  → ownership_period for JJ at 100% from acquisition_date
-- partner_entry         → new ownership_period rows for all partners as of entry_date
-- partner_exit          → closes ownership_period for exiting partner; adjusts others
-- property_disposition  → closes all ownership_periods
```

**The Ownership Engine reads this table exactly as it does today. No code change required.**

---

### `capital_event`
**The unified ledger of all capital-changing events across a property's lifecycle.**

```sql
CREATE TABLE capital_event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entity_registry(id),  -- the property
  event_date    DATE NOT NULL,
  event_type    TEXT NOT NULL,
  -- Allowed values:
  -- 'acquisition'           → property_acquisition record
  -- 'partner_entry'         → partner_entry record
  -- 'partner_exit'          → partner selling/transferring their stake
  -- 'capital_contribution'  → additional cash injected (not a new partner)
  -- 'capital_withdrawal'    → partner withdrawing capital (not a full exit)
  -- 'renovation_capital'    → renovation treated as capitalized improvement
  -- 'refinancing'           → debt restructure affecting capital stack
  -- 'disposition'           → property_disposition record
  counterparty  TEXT,          -- who the event involves
  amount_eur    NUMERIC(12,2),
  direction     TEXT,          -- 'in' (capital entering JJ/property) / 'out' (exiting)
  source_table  TEXT,          -- 'property_acquisition' / 'partner_entry' / etc.
  source_id     UUID,          -- FK to the source record
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

**Purpose:** This table gives JJ a single timeline view of all capital movements across a property's life. It powers:
- Capital waterfall analysis (who put in what, when, at what valuation)
- IRR / return calculations per partner
- Audit trail for any investor dispute
- Future fund reporting

---

### `property_disposition`
**One per property exit. Records the closing event.**

```sql
CREATE TABLE property_disposition (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entity_registry(id),
  disposition_date  DATE NOT NULL,
  disposition_type  TEXT NOT NULL,  -- 'sale' / 'partial_sale' / 'transfer'
  sale_price        NUMERIC(12,2),
  selling_costs     NUMERIC(12,2) DEFAULT 0,
  net_proceeds      NUMERIC(12,2) GENERATED ALWAYS AS
                      (sale_price - selling_costs) STORED,
  buyer_name        TEXT,
  document_ref      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Derived per partner (computed at settlement):
-- partner_net_proceeds = net_proceeds × ownership_pct_at_disposition
-- partner_gain_loss    = partner_net_proceeds - partner_entry_amount
-- jj_total_return      = jj_net_proceeds - total_jj_cost + jj_operating_balance
```

---

## How the Existing Engines Are Unaffected

| Engine | What it reads | Change required |
|---|---|---|
| Ownership Engine | `partnership_ownership` (= `ownership_period`) | ❌ None |
| Settlement Engine | `RC3PropertyReport` + `PropertyOwnershipRecord` | ❌ None |
| Portfolio Engine | `PropertySettlementDTO[]` | ❌ None |
| Reporting Engine | `OwnerPortfolioSettlementDTO` | ❌ None |

The new entities feed INTO `ownership_period`. Everything downstream is unchanged.

New output only:
- `AcquisitionSummaryDTO` — partner-facing summary of their entry terms
- `CapitalWaterfallDTO` — JJ-internal full capital timeline
- `DispositionSettlementDTO` — final settlement on property exit

---

## Worked Example: Villa Mazotos Full Lifecycle

```
EVENT 1 — 2020-03-15: JJ acquires property
  property_acquisition:
    purchase_price:  €180,000
    closing_costs:   €7,000
    total_jj_cost:   €187,000
  ownership_period (derived):
    JJ: 100% from 2020-03-15

EVENT 2 — 2022-07-01: Avi enters
  partner_entry:
    agreed_entry_valuation: €240,000   ← no relation to €180K
    entry_ownership_pct:    50%
    entry_amount:           €120,000
    capital_paid:           €120,000   (Avi paid in full)
  ownership_period (updated):
    JJ: 50% from 2022-07-01
    Avi: 50% from 2022-07-01
  capital_event:
    type: partner_entry, amount: €120,000, direction: in, counterparty: Avi

EVENT 3 — 2024-01-01: Oren enters at 20% (JJ sells portion of its stake)
  partner_entry:
    agreed_entry_valuation: €300,000
    entry_ownership_pct:    20%
    entry_amount:           €60,000
  ownership_period (updated):
    JJ: 30% from 2024-01-01
    Avi: 50% from 2024-01-01
    Oren: 20% from 2024-01-01

EVENT 4 — 2026-07-01: Avi exits, Liron enters at Avi's position
  capital_event (Avi exit): type: partner_exit, counterparty: Avi
  partner_entry (Liron):
    agreed_entry_valuation: €350,000
    entry_ownership_pct:    50%
    entry_amount:           €175,000
  ownership_period (updated):
    JJ: 30% from 2026-07-01
    Liron: 50% from 2026-07-01
    Oren: 20% from 2026-07-01

Throughout all of this — the Accounting Engine, Settlement Engine, Portfolio Engine,
and Reporting Engine required ZERO code changes.
Each ownership_period change automatically propagated through the existing engines.
```

---

## What JJ Sees vs. What Partners See

### Partner report (Avi, 2022–2026):
```
Your Entry
  Agreed Property Valuation:   €240,000
  Your Ownership:               50%
  Your Acquisition Investment: €120,000
  Capital Paid:                €120,000
  Remaining Entry Balance:     €0

Your Operations (2022-07-01 → 2026-07-01)
  [ownerAdjustedBalance from Settlement Engine]

Your Total Position:
  Entry Balance:               €0
  Operations Balance:          +€X,XXX
  Net:                         +€X,XXX
```

### JJ Internal (same property, all events):
```
Acquisition
  Purchase Price:              €180,000
  Closing Costs:               €7,000
  Total JJ Cost:               €187,000

Partner Entries
  Avi (2022):   entry €120,000, JJ gain €120,000 − (€187,000 × 50%) = +€26,500
  Oren (2024):  entry €60,000,  JJ gain €60,000 − (€187,000 × 20%) = +€22,600

Capital Waterfall
  JJ net capital at risk after partner entries: €187,000 − €120,000 − €60,000 = €7,000

Operations (30% of project balance)
  [JJ ownerAdjustedBalance from Settlement Engine]
```

---

## The Principle, Restated Formally

```
PRINCIPLE: Property Lifecycle Immutability

1. A property has exactly one property_acquisition record.
   It cannot be deleted. It can be annotated but not changed.

2. A property can have zero or more partner_entry records.
   Each is independent. Each has its own valuation, date, and terms.
   None inherit values from property_acquisition or from prior partner_entry records.

3. ownership_period is derived from events, never edited directly.
   The source of truth is the event log, not the current ownership row.

4. Operational flows (Renovation, Management, Airbnb) are not capital events.
   They flow through the existing Accounting Engine unchanged.
   They are split by ownership_period at the time of each transaction's date.

5. property_disposition is the closing event.
   It triggers final settlement of all open partner positions.
   It cannot exist without a property_acquisition.
```

---

## The Investment Lifecycle Layer

The Property Lifecycle describes what happened to the **asset**.
The Investment Lifecycle describes what happened to each **investor's position** in that asset.

These are two separate views of the same events.

```
Property Lifecycle (one per property — describes the asset)
│
│   acquisition → development → operations → disposition
│
└─► Investment Lifecycle (one per investor per property — describes their journey)
        │
        ├── Entry:         Partner enters at agreed valuation
        ├── Operations:    Participates in revenue and costs at ownership %
        ├── Capital Events: Additional contributions, withdrawals, injections
        └── Exit:          Full or partial exit, or final settlement at disposition
```

**Why this matters:** A partner does not invest in a property. A partner invests in an **investment**. The investment has its own lifecycle — beginning when the partner enters and ending when they exit or the property is disposed.

One property can carry multiple concurrent investment lifecycles:

```
Villa Mazotos — Property Lifecycle
│
├── JJ Investment Lifecycle:   Acquisition 2020 → ... → Disposition (TBD)
│
├── Avi Investment Lifecycle:  Entry 2022 → ... → Exit or Disposition
│
└── Oren Investment Lifecycle: Entry 2024 → ... → Exit or Disposition
    (hypothetical — illustrating the general principle)
```

Each investor's lifecycle is a filtered view of the property's capital event log, showing only the events that affect their position. The Ownership Engine already computes this split; the Investment Lifecycle layer gives it a formal name and a reportable structure.

**Architectural consequence:** Every partner-facing report is a projection of their Investment Lifecycle — not a summary of the property. The property summary (JJ internal) is the union of all investment lifecycles plus JJ's own position.

---

## The Immutable Capital Ledger

Capital events are facts. Facts cannot be changed. They can only be corrected by recording a new fact that supersedes the old one.

This is the Ledger Principle: **every capital event is immutable from the moment it is recorded**.

```sql
CREATE TABLE capital_event (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID NOT NULL REFERENCES entity_registry(id),
  event_date       DATE NOT NULL,
  event_type       TEXT NOT NULL,
  counterparty     TEXT,
  amount_eur       NUMERIC(12,2),
  direction        TEXT,           -- 'in' (capital entering) / 'out' (capital exiting)
  source_table     TEXT,           -- 'property_acquisition' / 'partner_entry' / etc.
  source_id        UUID,
  business_source  TEXT NOT NULL,  -- "Partnership Agreement signed 2022-06-01"
                                   -- "Bank transfer ref IBAN-XXX date 2022-06-15"
                                   -- "Notary deed ref 2020-03-15"
  created_by       TEXT NOT NULL,  -- who entered this fact into the system
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- IMMUTABILITY ENFORCEMENT
  -- If a capital event was entered incorrectly:
  --   1. Void the incorrect row (set voided = true, provide void_reason)
  --   2. Create a new corrected row
  --   Never UPDATE amount_eur, event_date, event_type, or business_source
  voided           BOOLEAN NOT NULL DEFAULT false,
  void_reason      TEXT,           -- required when voided = true
  voided_at        TIMESTAMPTZ,
  voided_by        TEXT
);

-- Active ledger view (what all reports read):
CREATE VIEW v_capital_events_active AS
  SELECT * FROM capital_event WHERE voided = false;
```

**All reports derive from `v_capital_events_active`. No report modifies the ledger.**

**Why `business_source` is non-nullable:** In three years, when a partner asks "why does the system say I owe €25,000?", the answer must not be "because the database says so." The answer must be "because the Partnership Agreement signed on 2022-06-01 states your required capital is €100,000, and the bank transfer of 2022-06-15 confirms you have paid €75,000 to date." The `business_source` field makes this answer automatic.

---

## Principle: Never Infer Investment Facts

Investment facts are legal and financial realities established by agreements and transactions. The system must record them as given — it must never compute them from other facts.

**Formal invariants — these equalities are prohibited:**

```
Purchase Price  ≠  Partner Entry Valuation
  JJ paid €180K in 2020. Avi agreed to €240K in 2022. These are unrelated numbers.

Capital Paid  ≠  Required Capital
  Avi transferred €50K. This tells us what he paid, not what he owes in total.

Ownership %  ≠  Amount Paid
  50% ownership does not imply any specific cash amount has been transferred.

Transaction Date  ≠  Effective Ownership Date
  A payment may be dated before or after the legal ownership transfer date.

Payment Amount  ≠  Agreed Installment
  A partner may pay more or less than a specific scheduled installment.

Renovation Cost  ≠  Capital Contribution
  A renovation paid by JJ on behalf of a partner is not automatically a capital event.
```

**The rule applied to the system:**

| Field | Allowed source | Prohibited derivation |
|---|---|---|
| `purchase_price` | Notary deed / purchase contract | Cannot derive from transactions |
| `agreed_entry_valuation` | Signed partnership agreement | Cannot derive from Capital Paid ÷ Ownership % |
| `entry_ownership_pct` | Signed partnership agreement | Cannot derive from payment amounts |
| `required_entry_capital` | = agreed_entry_valuation × pct (formula from agreement) | Cannot derive from transaction history |
| `capital_paid` | Sum of confirmed bank transfers | Cannot derive from agreement terms |
| `effective_from` | Legal effective date in agreement | Cannot derive from first payment date |

If a value cannot be sourced, it must be recorded as `NULL` with a `business_source = 'MISSING — requires Yossi decision'`. The system must not substitute a computed value for a missing agreement fact.

---

## M8 Scope — Investment Lifecycle Engine

M8 is not an Acquisition Engine. It is the **Investment Lifecycle Engine**.

This distinction matters because Acquisition is only the first event. The Engine must handle every event in every investor's lifecycle for the full life of every property.

**M8 components:**

| Component | What it does |
|---|---|
| 1. Property Acquisition | Records JJ's purchase as an immutable capital event. Anchors the property timeline. |
| 2. Partner Entry | Records each partner's entry terms: agreed valuation, ownership %, required capital, effective date. Independent of acquisition. |
| 3. Ownership Timeline | Derives `ownership_period` rows from entry/exit events. Feeds the existing Ownership Engine without code changes. |
| 4. Capital Events Ledger | Immutable append-only log of all capital movements. `business_source` required on every row. |
| 5. Disposition | Records the property's exit event. Triggers final settlement computation across all open investment lifecycles. |
| 6. Investment Summary | Per-investor, per-property summary: entry terms, capital status, operations balance, net position. Two versions: partner-facing (no JJ margin) and JJ internal (full picture). |

**What M8 is NOT:**
- Not a replacement for the existing Accounting / Settlement / Portfolio engines — those are unchanged
- Not a cross-property settlement engine — that remains RC2
- Not a fund management platform — that is post-M8

**M8 gate:** Cannot begin until M7 (Business Validation) is closed AND the M8 Business Decision Worksheet is completed by Yossi with ✅ CONFIRMED values for all blocking fields.

---

## Scope

**This ADR defines the data model, the principles, and the M8 scope. It does not define the implementation sequence.**

M8 cannot begin until:
- M7 (Business Validation) is closed
- M8 Business Decision Worksheet fully completed — all blocking fields ✅ CONFIRMED by Yossi
- Open Questions below answered

---

## Open Questions (require Yossi decision before M8)

**Q1 — Villa Mazotos entry valuation:** What was the agreed valuation when Avi entered? Is this documented in an agreement?

**Q2 — Villa Mazotos 2 (Oren):** Same question for Oren's entry.

**Q3 — Temporal gap:** For properties where JJ acquired long before any partner entered — is the acquisition record reconstructable from existing bank/notary documents?

**Q4 — Capital contributions after entry:** If Avi contributed additional capital post-entry (not at acquisition), is this tracked anywhere in the existing transactions?

**Q5 — Partner exit mechanics:** When a partner exits, does JJ buy them out, or does a new partner pay the existing partner directly (outside JJ's books)?

**Q6 — `partnership_ownership` migration:** The existing table has rows entered manually. When M8 is implemented, do we migrate these rows to be event-sourced, or do we maintain both systems in parallel for legacy properties?

---

*This ADR establishes the architectural foundation for JJ to manage not just property reporting, but the complete financial lifecycle of every real estate investment — from acquisition to disposition, across any ownership structure, for any number of partners.*
