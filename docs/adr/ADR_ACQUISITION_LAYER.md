# ~~ADR — Acquisition Layer & Dual-Valuation Model~~

## ⚠️ SUPERSEDED — 2026-07-13

**Superseded by:** [`ADR_PROPERTY_LIFECYCLE.md`](ADR_PROPERTY_LIFECYCLE.md)

**Retained for:** Decision audit trail only. Do not use as basis for any implementation.

**Why superseded:** This ADR proposed a FK from `property_partner_entries` → `property_acquisitions`, implying that Partner Entry derives from Acquisition. That relationship is architecturally incorrect. Acquisition and Partner Entry are independent events with unrelated valuations, unrelated dates, and no implied arithmetic relationship between them. The new ADR eliminates this FK and treats both as independent lifecycle events under the same `entity_id`.

---

**JJ Property 10 Platform · Architecture Decision Record**
**Status:** ~~Approved~~ **SUPERSEDED** · Original date: 2026-07-13

---

## Context

The current system models ownership as a percentage (`partnership_ownership.ownership_pct`) and applies it to all post-entry financial flows (Renovation, Management, Airbnb). This is correct for the operations phase.

What is missing is the **acquisition phase** — the financial event that created the ownership stake in the first place.

This ADR defines:
1. The dual-valuation model (JJ internal cost vs. partner entry valuation)
2. The required data schema
3. Visibility rules (what partners see vs. JJ internal)
4. How the Acquisition layer connects to the existing Ownership and Settlement engines

---

## The Core Business Rule

JJ buys a property at one price. A partner enters the deal at a different (typically higher) valuation. The difference is JJ's deal-structuring margin — a legitimate business return on JJ's capital risk, network, and execution.

**Example:**

| Item | Amount |
|---|---|
| JJ actual acquisition cost | €180,000 |
| Closing costs (legal, taxes, fees) | €7,000 |
| **Total JJ cost** | **€187,000** |
| Partner entry valuation (agreed) | €220,000 |
| Partner ownership % | 50% |
| Partner entry amount | €110,000 |
| JJ acquisition margin from this deal | €110,000 − (€187,000 × 50%) = **€16,500** |

**What the partner's report shows:**

```
Agreed Property Valuation:   €220,000
Your Ownership:               50%
Your Acquisition Investment: €110,000
Amount Paid to Date:         €85,000
Remaining Entry Balance:     €25,000
```

**What the partner's report does NOT show:**

```
Original JJ Purchase Cost:   €180,000   ← internal, confidential
JJ Closing Costs:             €7,000    ← internal, confidential
JJ Acquisition Margin:        €16,500   ← internal, confidential
```

---

## Why This Cannot Be Derived from Existing Data

`partnership_ownership` stores:
- `partner_name`
- `ownership_pct`
- `effective_from` / `effective_to`
- `confirmation_status`

It does NOT store:
- The entry valuation agreed with the partner
- The entry amount the partner owes
- How much the partner has actually paid
- The remaining entry balance
- The JJ internal acquisition cost

Without this, the system cannot:
- Display the partner's acquisition investment in their report
- Calculate JJ's deal-structuring margin
- Track whether the partner has fully paid their entry amount
- Distinguish "partner owes entry balance" from "partner owes from operations"

---

## Required Data Model

### Table: `property_acquisitions`
Stores JJ's internal acquisition data. **Confidential — never exposed to partners.**

```sql
CREATE TABLE property_acquisitions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               UUID NOT NULL REFERENCES entity_registry(id),
  acquisition_date        DATE NOT NULL,
  actual_acquisition_cost NUMERIC(12,2) NOT NULL,  -- what JJ paid
  closing_costs           NUMERIC(12,2) DEFAULT 0, -- legal, taxes, etc.
  total_jj_cost           NUMERIC(12,2) GENERATED ALWAYS AS
                            (actual_acquisition_cost + closing_costs) STORED,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);
```

### Table: `property_partner_entries`
Stores the commercial terms agreed with each partner. **Partner-visible subset defined by view.**

```sql
CREATE TABLE property_partner_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_id       UUID NOT NULL REFERENCES property_acquisitions(id),
  entity_id            UUID NOT NULL REFERENCES entity_registry(id),
  partner_name         TEXT NOT NULL,
  entry_date           DATE NOT NULL,           -- = ownership effective_from
  entry_valuation      NUMERIC(12,2) NOT NULL,  -- agreed property value at entry
  entry_ownership_pct  NUMERIC(5,2) NOT NULL,   -- % agreed with this partner
  entry_amount         NUMERIC(12,2) GENERATED ALWAYS AS
                         (entry_valuation * entry_ownership_pct / 100) STORED,
  amount_paid          NUMERIC(12,2) DEFAULT 0, -- actual payments received
  currency             TEXT DEFAULT 'EUR',
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- Derived (computed, not stored):
-- remaining_entry_balance = entry_amount - amount_paid
-- jj_margin_from_entry    = entry_amount - (total_jj_cost × entry_ownership_pct / 100)
```

---

## Visibility Rules

| Field | Partner-facing report | JJ internal report |
|---|---|---|
| `entry_valuation` | ✅ Agreed Property Valuation | ✅ |
| `entry_ownership_pct` | ✅ Your Ownership | ✅ |
| `entry_amount` | ✅ Your Acquisition Investment | ✅ |
| `amount_paid` | ✅ Amount Paid to Date | ✅ |
| `remaining_entry_balance` | ✅ Remaining Entry Balance | ✅ |
| `actual_acquisition_cost` | ❌ Never shown | ✅ |
| `closing_costs` | ❌ Never shown | ✅ |
| `total_jj_cost` | ❌ Never shown | ✅ |
| `jj_margin_from_entry` | ❌ Never shown | ✅ |

**Rule:** The system must never expose JJ's acquisition cost or margin to any partner-facing output (UI, PDF, email, API, WhatsApp). This is both a business confidentiality requirement and potentially a legal one.

---

## The Full Acquisition Chain

```
1. JJ acquires property
   property_acquisitions: actual_acquisition_cost, closing_costs, acquisition_date

2. Partner enters the deal
   property_partner_entries: entry_valuation, entry_ownership_pct, entry_amount, entry_date

3. Ownership becomes effective
   partnership_ownership: partner_name, ownership_pct, effective_from = entry_date
   (entry_date and effective_from must be consistent — enforced at write time)

4. Partner pays entry installments
   transactions: category=Purchase, subcategory=Purchase Payment, payer=Partner
   property_partner_entries.amount_paid updated

5. Operations begin (post-entry)
   transactions: Renovation, Management, Airbnb — all split by ownership_pct

6. Settlement
   PropertySettlementDTO: shows operations balance only
   AcquisitionSettlementDTO (new): shows entry amount, amount paid, remaining balance

7. Partner full balance
   = remaining_entry_balance + ownerAdjustedBalance (from operations)
```

---

## How This Connects to the Existing Ownership Engine

The existing Settlement Engine computes:

```
ownerAdjustedBalance = projectBalance100 × ownershipPct / 100
```

This is **operations-only**. It answers: "Based on what happened AFTER the partner entered, what does JJ owe the partner (or vice versa)?"

The Acquisition layer answers: "Has the partner fully paid for their stake?"

**Partner's full financial position:**

```
Total Partner Position =
  Entry Amount (agreed investment)
  − Amount Paid (what they've paid so far)
  ± Operations Balance (ownerAdjustedBalance from Settlement Engine)
  = Net Position
```

These two components MUST remain separate in the data model and in reports. Mixing them would produce misleading balances — for example, a partner who is behind on entry payments would appear to have a different operations balance than they actually do.

---

## What Changes in Existing Code

**Nothing changes in the existing engines.** The Acquisition layer sits above the Ownership Engine, not inside it.

| Layer | Change required |
|---|---|
| `partnership_ownership` | No change — still stores ownership % |
| Ownership Engine | No change — still resolves % from partnership_ownership |
| Settlement Engine | No change — still applies % to operations flows |
| Portfolio Engine | No change — still nets multiple property balances |
| Reporting Engine | **Extension**: add `acquisitionSummary` to ReportingOutput for partner-facing reports |

New additions only:
- `property_acquisitions` table
- `property_partner_entries` table
- `AcquisitionSettlementDTO` type
- `buildAcquisitionSettlement()` pure function
- Partner report section: "Your Investment" (entry amount, paid, remaining)
- JJ internal section: "Acquisition Economics" (actual cost, margin)

---

## What This Changes in M7 (Business Validation)

Track 1 of M7 (Real-Data Golden Cases) currently cannot answer:

> "Avi invested in Villa Mazotos. His total position today is X."

After Acquisition layer: it can. The full partner position becomes:

```
Avi / Villa Mazotos
  Entry Investment:       €110,000  (agreed at entry)
  Amount Paid:            €110,000  (fully paid)
  Remaining Entry:        €0        (no outstanding entry balance)
  Operations Balance:     +€2,500   (JJ owes Avi from operations)
  ─────────────────────────────────
  Net Position:           +€2,500   (JJ pays Avi €2,500)
```

Without Acquisition layer, M7 Track 1 can only verify the €2,500 operations figure. With it, it can verify the complete investment picture.

---

## Connection to Purchase Capital Rule (CLAUDE.md Section 4)

The existing rule states:

> "Purchase Payment and Deposit in the Purchase category are Purchase Capital — advances paid by JJ on account of the agreed purchase price."

With the Acquisition layer, this becomes more precise:

- If **JJ buys for its own account**: Purchase Payments feed `actual_acquisition_cost`. No partner report.
- If **partner enters**: The partner's Purchase Payments feed `amount_paid` in `property_partner_entries`. Partner sees these as "Amount Paid toward Your Acquisition Investment."
- The `entry_date` is the boundary: payments before `entry_date` are JJ capital. Payments on/after are partner entry installments.

This resolves the ambiguity flagged in SA-016: "Deposit treatment depends on transaction lifecycle." The lifecycle is now explicit in the data model.

---

## Open Questions (for Yossi to decide before implementation)

**Q1 — Entry valuation source:** Is the entry valuation always a single agreed number, or can it change (e.g., if the partner renegotiates)? If it can change, `property_partner_entries` needs an effective-date structure similar to `partnership_ownership`.

**Q2 — Existing data:** For current properties (Villa Mazotos, Villa Mazotos 2), do we have the entry valuation on record? If not, M7 Track 1 cannot be completed until this is established.

**Q3 — JJ-owned properties:** For properties where JJ owns 100% with no external partner (e.g., JJ Ground Floor Dekeleia), there is no `property_partner_entries` record. The acquisition record is JJ-internal only. The report shows no "Your Investment" section — only operations.

**Q4 — Historical backdating:** For properties acquired years ago where entry valuations were never formally recorded, how should the system handle the gap? Options: (a) estimate from existing transaction data, (b) treat as unknown and exclude from acquisition reports, (c) Yossi provides the number and it is entered as a manual record.

---

## Summary

| Concept | Where it lives |
|---|---|
| JJ's actual cost | `property_acquisitions.actual_acquisition_cost` (internal) |
| Partner's agreed entry valuation | `property_partner_entries.entry_valuation` (partner-visible) |
| Partner's entry amount | `property_partner_entries.entry_amount` (computed, partner-visible) |
| Partner's payments toward entry | `property_partner_entries.amount_paid` (partner-visible) |
| Partner's remaining entry balance | computed: `entry_amount − amount_paid` (partner-visible) |
| JJ's margin on this deal | computed: `entry_amount − (total_jj_cost × ownership_pct / 100)` (internal) |
| Operations balance | `PropertySettlementDTO.ownerAdjustedBalance` (existing, unchanged) |
| Partner full position | `entry_amount − amount_paid + ownerAdjustedBalance` (new combined view) |

The partner never sees JJ's cost or margin. The system stores both. The reports are segmented by audience.

---

*This ADR supersedes any earlier discussion of Acquisition as "just a Purchase category filter." Acquisition is a first-class business entity with its own data model, its own settlement computation, and its own visibility rules.*
