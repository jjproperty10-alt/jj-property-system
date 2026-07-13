# ADR — Property Lifecycle, Investment Lifecycle & Capital Events
**JJ Property 10 Platform · Architecture Decision Record · M8 Definitive**
**Status:** Approved · Date: 2026-07-13
**Author:** Architecture Review — Yossi + Claude

**Supersedes:**
- [`ADR_ACQUISITION_LAYER.md`](ADR_ACQUISITION_LAYER.md) — incorrect FK dependency between Partner Entry and Acquisition
- [`ADR_PROPERTY_LIFECYCLE.md`](ADR_PROPERTY_LIFECYCLE.md) — correct direction, but pre-M8; lacked event classification, Business Reality First principle, and implementation phases

Do not delete superseded ADRs. They are the audit trail of how we arrived here.

---

## Executive Summary

A property is an asset. An investment is a relationship between an investor and that asset over time.

JJ Property 10 manages both. The platform must represent not just what happened to each property, but what each investment means to each investor — from their first capital payment to their final settlement.

M8 introduces the **Investment Lifecycle Engine**: the layer that sits between the business reality (agreements, bank transfers, notary deeds) and the accounting engines (Settlement, Portfolio, Reporting) that already exist and will not be changed.

Every value the engines produce must be traceable to a documented business fact. The system records facts. It does not create them.

---

## Approved Architecture Stack

```
Business Reality                 ← Agreements, bank transfers, notary deeds
        │
        ▼
Property Lifecycle               ← What happened to the asset
        │
        ▼
Investment Lifecycle             ← What happened to each investor's position
        │
        ▼
Accounting                       ← classifyTx(), balance equations
        │
        ▼
Ownership                        ← partnership_ownership, effective dates
        │
        ▼
Settlement                       ← ownerAdjustedBalance per partner
        │
        ▼
Portfolio                        ← net position across properties
        │
        ▼
Reporting                        ← structured output DTOs
        │
        ▼
UI / PDF / API / WhatsApp        ← delivery channels
```

M8 implements the top two layers. Everything below is unchanged.

---

## Core Principles — Locked

### 1 — Business Reality First

Legal and commercial reality is authoritative. Database records represent business facts. Database records never create business facts.

A value that exists only in the database — with no corresponding agreement, transfer, or legal document — is not a business fact. It is a placeholder.

The system must distinguish:
- `status: 'confirmed'` — a value backed by a cited business source
- `status: 'pending_verification'` — a value awaiting source confirmation
- `status: 'draft'` — a value entered but not yet verified

### 2 — Never Infer Investment Facts

Every material investment fact must come from an approved business or legal source.

**Prohibited derivations — these are invariants, not suggestions:**

| Field | Must NOT be derived from |
|---|---|
| Partner Entry Valuation | Purchase Price |
| Required Entry Capital | Capital Paid |
| Ownership % | Payment amounts |
| Ownership Effective Date | Contract signature date |
| Profit Participation Start Date | Ownership Effective Date |
| Entry Date | Payment Date |

If a value cannot be sourced, it is recorded as `null` with `status: 'pending_verification'`. The system must never substitute a computed estimate for a missing legal fact.

### 3 — Every Financial Fact Must Answer Two Questions

1. **Why does this value exist?** — what business event produced it
2. **From which source was it obtained?** — the specific document, transfer, or agreement

This is implemented via the `BusinessSource` interface, required on every capital event and every partner entry field. The `businessSource` field is non-nullable for confirmed facts.

### 4 — Immutable Capital Ledger

Capital events cannot be edited or deleted silently. The correction model is:

```
WRONG:    UPDATE capital_event SET amount_eur = 120000 WHERE id = 'X'
CORRECT:  1. void original event (voided = true, void_reason = '...', voided_by = '...')
           2. create replacement event with corrected values
           3. link: replacement.supersedesEventId = original.id
```

All reports read from `v_capital_events_active` (WHERE voided = false). The voided row is never deleted — it is the audit trail.

### 5 — One Acquisition, Many Partner Events

A property has:
- **one** original acquisition event (immutable once confirmed)
- zero-to-many partner entry events (each independent)
- zero-to-many capital events (contributions, withdrawals, calls, distributions)
- zero-to-many ownership changes (each derived from an entry or exit event)
- zero-to-many partial exits
- **one** final disposition event, if the property is sold

### 6 — Acquisition and Partner Entry Are Independent

`partner_entry` must not have a foreign key dependency on `property_acquisition`. They relate only through the property entity (`entity_id`).

The partner entry valuation has no required arithmetic relationship to the acquisition price. JJ bought in 2020 at €180K. A partner may enter in 2022 at an agreed valuation of €240K. These numbers are unrelated.

---

### 7 — Ownership Is Always Allocated to Investment Events, Never Directly to Accounting Rows

**Added: 2026-07-13 — Yossi architectural review, pre-SQL gate**

A `transactions` row — even one that proves a payment occurred — never directly creates, modifies, or terminates an `ownership_period`. Only a confirmed **Investment Event** (`property_acquisition`, `partner_entry`, `partner_exit`, `property_disposition`, or future equivalents) can change the ownership model.

**Why this matters:** Accounting rows describe money flows. Investment Events are structural decisions about the shape of the investment (who owns what, from when). These are separate concerns that may be backed by the same evidence but must never be conflated.

**Implication:** The existence of a capital payment row (e.g., Avi paying €200K) does not, by itself, establish Avi's 50% ownership. The `partner_entry` record — confirmed from a business source — establishes that. The capital payment is evidence; the `partner_entry` is fact.

**Future-proofing:** In future lifecycle events (Refinance, Capital Call, Buyout), the same rule applies. Ownership changes only via Investment Events, regardless of how many accounting rows accompany them.

---

### 8 — Capital Events Are Distinct from Expenses, Income, and ClientCharges

**Added: 2026-07-13 — Yossi architectural review, pre-SQL gate**

The system recognizes four distinct economic primitives. They must never be merged or confused:

| Primitive | Changes Capital Position? | Flows Through P&L? | Example |
|---|---|---|---|
| **Capital Event** | ✅ Yes | ❌ No | Avi pays €50K entry capital |
| **Expense** | ❌ No | ✅ Yes (cost) | JJ pays plumber €200 |
| **Income** | ❌ No | ✅ Yes (revenue) | Airbnb payout €1,200 |
| **ClientCharge** | ❌ No | ✅ Yes (CC revenue + cost) | Renovation billed at €1,300 vs cost €1,000 |

**Rule:** `capital_event` records belong to the Investment Lifecycle layer. They do not appear in P&L reports. They change `capitalPaid`, `capitalRemaining`, and JJ's `netCapitalAtRisk`. A P&L entry for the same real-world event (if it produces one) is a separate, linked `transactions` row.

**Note:** A single real-world money transfer may generate entries in both layers — but the records are distinct and serve different purposes. The classification engine (`classifyTx()`) handles the accounting layer; the capital ledger handles the lifecycle layer.

---

### 9 — One Economic Movement → One Canonical Event

**Added: 2026-07-13 — Yossi event constitution, pre-SQL finalization**

Every economic movement belongs to exactly one authoritative business event. A movement must not independently exist as several conflicting event types.

**Formal rule:**
```
One economic movement
    → one canonical event (lifecycle or accounting layer)
    → many read-only projections (views, reports, statements)
```

**Required fields on every canonical event:**
- `id` (UUID) — serves as the canonical event identifier
- `event_type` — what kind of event
- `event_nature` — `'lifecycle_event'` | `'accounting_event'` | `'settlement_event'`
- `business_source_id` — FK to `lifecycle.business_source` (required when confirmed)
- `effective_date` — when it happened
- `created_at` — when recorded
- `recorded_by` — who entered it
- `status` — `'pending_verification'` | `'confirmed'` | `'void'`
- `linked_accounting_transaction_id` — FK to `public.transactions.id` (nullable)
- `linked_lifecycle_event_id` — FK to the owning lifecycle event (nullable)

**Violation examples (prohibited):**
- A bank payment simultaneously stored as Expense + Capital + ClientCharge
- A distribution simultaneously stored as Settlement + Payment Event (must be two linked records)
- A correction creating two events (€30K + €20K) instead of one void + one replacement (€50K)

---

## Domain Model

### Property Lifecycle — what happened to the asset

```
property_acquisition          One. Immutable. JJ's purchase of the asset.
        │
        ├── renovation         Capitalized improvement events
        ├── operations         Ongoing management, rental income/expenses
        ├── financing          Debt events that change capital structure
        ├── partner_entry  ─┐  New partner joins (any number, each independent)
        ├── partner_exit   ─┘  Partner leaves
        │
        └── property_disposition   One. Final disposal event. Triggers settlement.
```

### Investment Lifecycle — what happened to each investor's position

```
partner_entry                 Investor joins: agreed valuation, %, required capital
        │
        ├── capital_payment    Installment toward required entry capital
        ├── capital_contribution  Additional capital beyond required
        ├── capital_call       JJ calls additional capital from partner
        ├── capital_withdrawal Partner withdraws capital (not a full exit)
        ├── profit_distribution  JJ distributes profits to partner
        ├── loss_allocation    Loss allocated to partner
        ├── ownership_increase Partner buys additional %
        ├── ownership_decrease Partner sells partial %
        ├── partial_exit       Partner sells significant stake, remains minority
        │
        └── full_exit          Partner exits completely
              OR
        └── disposition        Property sold — triggers final settlement
```

One property's lifecycle → multiple investment lifecycles (one per investor).

### The Two-Layer Relationship

```
Villa Mazotos — Property Lifecycle
│
├── JJ Investment Lifecycle
│     Acquisition 2020 → Renovation → Operations → ...
│
├── Avi Investment Lifecycle
│     Entry 2022 → Capital Payments → Operations Participation → Exit/Disposition
│
└── [Future Partner] Investment Lifecycle
      Entry [date] → ...
```

Partner-facing reports are projections of that partner's Investment Lifecycle only. They never show the full Property Lifecycle view — and they never show JJ's acquisition economics.

---

## Business Event Classification

Every lifecycle record declares its nature. One real-world action may create linked records across layers — but the layers remain conceptually separate.

| Nature | Definition | Examples |
|---|---|---|
| `business_event` | A legal or commercial reality. Exists outside the system. | Acquisition, Partner Entry, Sale |
| `accounting_event` | A financial movement. Recorded in the accounting ledger. | Bank transfer, Payment, BPO |
| `reporting_event` | A computed output. Derived from business + accounting events. | Monthly statement, Settlement report |

**Rule:** Business events are facts. Accounting events are records of cash flow. Reporting events are derived views. No reporting event should ever modify a business or accounting event.

---

## Entity Definitions

### `property_acquisition` — one per property, immutable, confidential

```typescript
interface PropertyAcquisition extends LifecycleEventBase {
  eventType: 'original_acquisition'
  eventNature: 'business_event'
  acquisitionDate: string        // DATE — from notary deed
  purchasePrice: number          // What JJ paid — NEVER shown to partners
  closingCosts: number           // Legal, taxes, notary fees
  readonly totalJJCost: number   // computed: purchasePrice + closingCosts
  fundingNotes?: string          // "JJ cash" / "Yossi personal capital" / "mixed"
  documentRef?: string           // Link to purchase agreement / notary deed
}
```

### `partner_entry` — many per property, each independent

```typescript
interface PartnerEntry extends LifecycleEventBase {
  eventType: 'partner_entry'
  eventNature: 'business_event'
  partnerName: string
  entryDate: string                     // Legal effective date — NOT payment date
  agreedEntryValuation: number          // Agreed property value at entry
                                        // Has NO relationship to purchasePrice
  entryOwnershipPct: number             // Percentage agreed with this partner
  readonly requiredEntryCapital: number // agreedEntryValuation × pct / 100
  profitParticipationStartDate: string  // May differ from entryDate
  agreementRef?: string
}
```

### `capital_event` — immutable ledger entries

```typescript
interface CapitalEvent extends LifecycleEventBase {
  amountEur: number
  direction: 'in' | 'out'
  counterparty: string
  linkedEventId?: string    // Link to the partnerEntry or acquisition this relates to
  readonly isVoided: boolean
  voidedAt?: string
  voidedBy?: string
}
```

### `ownership_period` — derived from events, never edited directly

```typescript
interface OwnershipPeriod {
  entityId: string
  partnerName: string
  ownershipPct: number
  effectiveFrom: string
  effectiveTo?: string       // null = currently active
  sourceEventType: CapitalEventType
  sourceEventId: string      // Which event created this period
  status: BusinessFactStatus
}
```

### `property_disposition` — one per exit, triggers final settlement

```typescript
interface PropertyDisposition extends LifecycleEventBase {
  eventType: 'disposition'
  eventNature: 'business_event'
  dispositionDate: string
  dispositionType: 'sale' | 'partial_sale' | 'transfer'
  salePrice: number
  sellingCosts: number
  readonly netProceeds: number   // salePrice - sellingCosts
  buyerName?: string
  documentRef?: string
}
```

---

## Void-and-Replace Correction Model

```
Event recorded incorrectly:
  capital_event { id: 'A', amountEur: 5000, status: 'confirmed' }

Correction sequence:
  1. VOID:    UPDATE capital_event SET voided = true, void_reason = 'Amount incorrect. Correct: €50,000', voided_by = 'Yossi', voided_at = now() WHERE id = 'A'
  2. REPLACE: INSERT capital_event { id: 'B', amountEur: 50000, supersedesEventId: 'A', status: 'confirmed', businessSource: { ... } }

Result:
  Event A: voided = true  → excluded from v_capital_events_active
  Event B: voided = false → included in v_capital_events_active, links to A for audit
```

The audit trail is complete. An auditor can always answer: "why was this amount changed, by whom, and when?"

---

## Billable Events, ClientCharge and JJ Margin

### Definitions

A **Billable Event** is any property expense (renovation work, maintenance, management service, etc.) charged to an external investor at a rate that may differ from JJ's actual cost.

| Field | Source | Meaning |
|---|---|---|
| `amount_eur` | `transactions.amount_eur` | What JJ actually paid (ActualCost) |
| `client_charge` | `transactions.client_charge` | What JJ bills the investor (ClientCharge) |
| JJ Margin (computed) | Reporting time only | (ClientCharge − ActualCost) × OwnershipPct |

### Formula

```
JJ Margin from Investor (per event) = (ClientCharge − ActualCost) × OwnershipPct
```

### Per-investor breakdown for a single billable event

| Field | Formula | Description |
|---|---|---|
| `investorShare_clientCharge` | `ClientCharge × OwnershipPct` | What the investor is billed |
| `investorShare_actualCost` | `ActualCost × OwnershipPct` | JJ's real cost for investor's share |
| `jjMarginFromInvestor` | `(ClientCharge − ActualCost) × OwnershipPct` | JJ gross margin from this investor on this event |

### Confirmed example — Renovation with two investors (confirmed 2026-07-13)

| | Avi (50%) | Oren (35%) |
|---|---|---|
| ActualCost (total project) | €100 | €100 |
| ClientCharge (total project) | €130 | €130 |
| `investorShare_clientCharge` | **€65.00** | **€45.50** |
| `investorShare_actualCost` | €50.00 | €35.00 |
| `jjMarginFromInvestor` | **€15.00** | **€10.50** |

### Two distinct JJ margin types

| Margin type | When | Source | Confidential? |
|---|---|---|---|
| **Entry margin** | Once at partner entry | `(requiredEntryCapital) − (totalJJCost × ownershipPct)` | ✅ Never shown |
| **Operational margin** | Per billable event | `(ClientCharge − ActualCost) × ownershipPct` | ✅ Never shown |

**Villa Mazotos / Avi entry margin (confirmed 2026-07-13):** €250,000 − (€400,000 × 50%) = **€50,000** (JJ internal only).

### Invariants

1. `amount_eur` and `client_charge` are independent fields. Never derive one from the other.
2. `client_charge = NULL` means the investor bears the actual cost at their ownership percentage (no markup).
3. JJ Margin is **computed at reporting time only** — it is never stored as a separate ledger entry.
4. `amount_eur` always reflects what JJ paid. `client_charge` always reflects what the investor pays. These must never be swapped or conflated.
5. Neither margin type is exposed in any partner-facing output (UI, PDF, API, WhatsApp, email).

---

## Visibility Rules

| Field | Partner-facing report | JJ internal report |
|---|---|---|
| `agreedEntryValuation` | ✅ Agreed Property Valuation | ✅ |
| `entryOwnershipPct` | ✅ Your Ownership | ✅ |
| `requiredEntryCapital` | ✅ Your Investment Amount | ✅ |
| `capitalPaid` | ✅ Amount Paid | ✅ |
| `capitalRemaining` | ✅ Remaining Balance | ✅ |
| `profitParticipationStartDate` | ✅ | ✅ |
| `investorShare_clientCharge` | ✅ Your Charged Amount | ✅ |
| `purchasePrice` | ❌ Never | ✅ |
| `closingCosts` | ❌ Never | ✅ |
| `totalJJCost` | ❌ Never | ✅ |
| `investorShare_actualCost` | ❌ Never | ✅ |
| `jjMarginFromInvestor` | ❌ Never | ✅ |
| Entry margin from partner entry | ❌ Never | ✅ |

**Rule:** The system must never expose JJ's acquisition cost, entry margin, or operational margin to any partner-facing output — in any delivery channel (UI, PDF, API, WhatsApp, email).

---

## What the Existing Engines Do Not Change

M8 adds new entities above the existing engines. The engines themselves are unchanged.

| Existing engine | What it reads | Change required |
|---|---|---|
| Ownership Engine | `partnership_ownership` (= `ownership_period` by shape) | ❌ None |
| Settlement Engine | `RC3PropertyReport` + `PropertyOwnershipRecord` | ❌ None |
| Portfolio Engine | `PropertySettlementDTO[]` | ❌ None |
| Reporting Engine | `OwnerPortfolioSettlementDTO` | ❌ None |
| classifyTx() | `transactions` table | ❌ None |

New outputs from M8 (additive only):
- `InvestmentLifecycleSummary` — per partner, per property
- `CapitalWaterfallDTO` — JJ-internal full capital timeline
- `DispositionAllocation[]` — final settlement at property exit

---

## Implementation Phases

### M8-0 — ADR Finalization (this document)
**Status:** Complete ✅

Produce the definitive ADR. All principles locked. All entity definitions specified.
No code or schema changes. Superseded ADRs marked.

**Gate to M8-A:** This ADR must be reviewed and acknowledged by Yossi.

---

### M8-A — Pure Domain Layer (TypeScript only)
**Status:** Starting

Create `src/lib/lifecycle/` as an isolated TypeScript module.
- Pure types and pure functions only
- Zero imports from existing accounting modules
- Zero database calls
- Zero side effects
- All "Never Infer" invariants enforced in validation functions

**Files:**

| File | Contents |
|---|---|
| `types.ts` | All core types and union types |
| `lifecycleEvent.ts` | Base event factory functions and type guards |
| `acquisition.ts` | PropertyAcquisition type + pure functions |
| `partnerEntry.ts` | PartnerEntry type + "Never Infer" guards |
| `capitalEvent.ts` | CapitalEvent + void-and-replace mechanics |
| `ownershipPeriod.ts` | OwnershipPeriod + derivation from events |
| `disposition.ts` | PropertyDisposition + allocation computations |
| `provenance.ts` | BusinessSource factory + audit |
| `validation.ts` | All 6 "Never Infer" invariant validators |
| `projections.ts` | InvestmentLifecycleSummary + report builders |
| `index.ts` | Clean public API re-exports |

**Gate to M8-B:** All files pass TypeScript compilation. Unit tests pass for all validators and pure functions. No existing tests break.

---

### M8-B — Database Schema (SQL)
**Status:** Future — requires M7 close + Business Decision Worksheet complete

Create the Supabase schema for the lifecycle entities. Only after:
- M7 Business Validation closed
- Business Decision Worksheet filled with ✅ CONFIRMED values for all blocking fields
- Yossi has provided actual acquisition dates, purchase prices, entry valuations for pilot properties

SQL migration: `m8_001_lifecycle_schema.sql`

**Gate to M8-C:** Migration applied. Row-level security verified. Existing `transactions` table unchanged (2,127 rows).

---

### M8-C — API Layer
**Status:** Future — requires M8-B

Server-side API routes for reading and writing lifecycle data.

**Gate to M8-D:** API routes pass integration tests. No existing API routes modified.

---

### M8-D — UI / Reporting Integration
**Status:** Future — requires M8-C

- Partner-facing Investment Summary section in reports
- JJ Internal Capital Economics view
- Void-and-replace UI for corrections
- Investment Lifecycle Timeline component

---

## Migration Gates

| Gate | Required before |
|---|---|
| M7 Business Validation CLOSED | M8-B (schema) |
| Business Decision Worksheet ✅ CONFIRMED for both pilot properties | M8-B (schema) |
| Yossi provides: acquisition dates, purchase prices, entry valuations for Villa Mazotos + Villa Mazotos 2 | M8-B (schema) |
| M8-A TypeScript compiles, tests pass | M8-B |
| M8-B schema applied, RLS verified | M8-C |
| M8-C API routes tested | M8-D |

---

## Open Business Decisions

These must be answered by Yossi before M8-B (schema phase):

**OBD-1 — Villa Mazotos / Avi — PARTIALLY RESOLVED ✅ (2026-07-13)**

Confirmed by Yossi 2026-07-13:
- Agreed entry valuation: **€500,000** ✅
- Required entry capital: **€250,000** (= €500,000 × 50%) ✅
- Capital paid: **€250,000** total — €200,000 direct to seller (2024-10-10) + €50,000 to Yossi (2024-06-16, partner-entry capital, NOT JJ operating income) ✅
- Capital remaining: **€0** (fully paid) ✅
- Internal JJ entry margin: **€50,000** (= €250,000 − €400,000 × 50%) — confidential ✅

Still open (evidence-collection only — not architecture blockers):
- Entry effective date — exact calendar date from signed purchase contract (business rule confirmed: from inception)
- JJ acquisition closing costs (approximation available; exact pending)

See `M8_BUSINESS_DECISION_WORKSHEET.md` for full field-by-field status.

**OBD-2 — Villa Mazotos 2 / Oren — PARTIALLY RESOLVED ✅ (2026-07-13):**

Confirmed by Yossi 2026-07-13:
- Purchase price: **€400,000** ✅
- Agreed entry valuation: **€520,000** ✅
- Ownership: **35%** ✅
- Required entry capital: **€182,000** (= €520,000 × 35%) ✅
- JJ cost basis for Oren's 35%: **€140,000** (= €400,000 × 35%) — internal only ✅
- JJ entry margin from Oren: **€42,000** (= €182,000 − €140,000) — **NEVER shown to Oren** ✅
- Inception participation: **from acquisition start** — Oren participates in all lifecycle economics from joint purchase inception ✅
- Acquisition status: **In progress** ✅

Still open (evidence-collection only — not architecture blockers):
- Exact contract date for Oren's entry (pending signed purchase contract)
- Oren capital paid to date (do not infer; must be confirmed by Yossi)
- JJ acquisition closing costs for VM2 (approximation available)

**ClientCharge at Oren 35%:** Owner Charge = CC × 35%; Owner Cost Share = Cost × 35%; JJ Margin = (CC − Cost) × 35%

**OBD-3 — Acquisition records:** Are notary deeds available for both properties? Are JJ purchase prices reconstructable from bank records?

**OBD-4 — Profit Participation Start:** Is it standard JJ policy that profit participation begins on the legal effective date of ownership? Or are there properties where a different date was contractually agreed?

**OBD-5 — Partner exit mechanics:** When a partner exits, does JJ buy out the exiting partner, or does an incoming partner pay the exiting partner directly (outside JJ's books)?

**OBD-6 — `partnership_ownership` migration:** When M8-B is implemented, do existing `partnership_ownership` rows get retroactively linked to lifecycle events, or do we run both systems in parallel for pre-M8 properties?

---

## Superseded ADRs

| File | Superseded reason |
|---|---|
| `ADR_ACQUISITION_LAYER.md` | Proposed FK from partner_entry → property_acquisition. Incorrect: the two entities are independent. |
| `ADR_PROPERTY_LIFECYCLE.md` | Correct direction but pre-M8. Lacked: event classification, Business Reality First, implementation phases, M8 scope. |

Both files are retained. Both are marked SUPERSEDED with links to this document.

---

*This ADR is the constitutional document for M8. All implementation decisions must be traceable to its principles.*
*Version: M8 Definitive · Updated 2026-07-13 (Round 1) — Added: Billable Events/ClientCharge/JJ Margin section; OBD-1 partially resolved with confirmed Avi facts; Visibility Rules table extended*
*Updated 2026-07-13 (Round 3) — OBD-1 further updated: Avi inception participation confirmed. OBD-2 PARTIALLY RESOLVED: Oren €520K valuation, €182K required capital, €42K JJ margin (internal), inception model — all confirmed. Evidence-only gaps remain (exact dates, Oren capital paid).*
*Updated 2026-07-13 (Round 4 — Pre-SQL Gate) — Added Principles 7 (Ownership → Investment Events, never directly to accounting rows) and 8 (Capital Event is distinct from Expense/Income/ClientCharge). See M8_EVENT_TYPE_AUDIT.md for full Event Type Audit constitutional map.*
*Updated 2026-07-13 (Round 5 — B7 PASS) — Added Principle 9 (One economic movement → one canonical event → many read-only projections). Gate B7 PASSED. SQL proceeds. OQ-1 through OQ-6 all resolved; 7 economic primitives locked; P9 one-canonical-event rule locked.*
