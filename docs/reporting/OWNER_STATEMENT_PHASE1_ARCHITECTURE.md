# Owner Statement / Client Report — Phase 1 Architecture Audit

Status: **Phase 1 (read-only analysis)** — no implementation, no financial writes.
Reference model: 4 `OWNER_MINIMAL_V1` PDFs (TelMar TM01 "Sea View", TM05 "Sky View", "TelMar Central Avenue Stay").
Authority rule: **the PDFs are the business/visual reference, not financial authority. JJ canonical data (`transactions` + RC3/FPE) remains authoritative. Hostaway is evidence only.**

---

## A. Canonical Owner Statement schema (from the 4 PDFs)

**Header (identity):** company `JJ PROPERTY 10 LTD`, address `Archiepiskopou Kyprianou, 4`, email `jjproperty10@gmail.com`. (Owner/recipient identity is implied by the property/listing, not a separate printed block in these samples.)

**Statement meta:** `Statement period` (start-end), `Issued date`.

**METRICS (summary):** `Gross Rental Revenue`, `Net Owner Payout`, `Property Management Revenue`.

**RENTAL ACTIVITY (per-reservation table):** columns `Check-in date`, `Guest`, `Listing`, `Gross Rental Revenue`, `Platform Fees`, `Cleaning`, `Management Fee`, `Total taxes`, `Net Owner Payout`, plus a `Totals` row.

**EXPENSES & EXTRAS (ledger table, optional):** columns `Name`, `Date`, `Categories`, `Listing`, `Reservation`, `Amount` (signed: negative = charge to owner, positive = credit), plus `Totals`. Observed rows: `Monthly management fee` (-40 EUR, recurring), `Platform Income` (+70 EUR manual adjustment).

**Closing block:** `Owner Payout` (= sum of Net Owner Payout from activity), `Expenses and extras` (= sum of extras), `Statement total` (= Owner Payout + extras).

**Note:** a fixed "Revenue Calculation Overview" (5 numbered definitions).

**Differences across the 4 PDFs:** Cleaning is per-listing (50 vs 60 EUR); Taxes are 0 for TM01/TM05 but 122.11 EUR for Central Avenue; Expenses & Extras present (TM01, TM05) or absent (Central Avenue); the multi-month PDF (2025-12 to 2026-07) is identical in structure but aggregates ~53 reservations over several pages into one Totals row with multiple recurring extras. **No structural field varies - only presence/values.** One canonical schema covers all four.

---

## B. Field -> JJ authority mapping

| Statement field | Meaning | Authoritative JJ source | Hostaway role | Confidence |
|---|---|---|---|---|
| Statement period | reporting window | request param | - | VERIFIED |
| Issued date | generation date | system clock | - | VERIFIED |
| Owner / Property / Listing | who/what | `lifecycle.entity_identity` + `property_definitions.property_id` (+ `pms.property_mappings` for listing label) | evidence for listing name | VERIFIED |
| Guest | guest name | - | `pms.canonical_reservations` (evidence, masked per G3-19) | PARTIAL (evidence-only) |
| Check-in / Check-out | stay dates | - | `pms.canonical_reservations` | VERIFIED (evidence) |
| Channel | Airbnb/Booking/... | - | `pms.canonical_reservations` | VERIFIED (evidence) |
| Gross Rental Revenue | guest total | not recorded per-reservation in JJ | Hostaway `totalPrice` (evidence) | PARTIAL |
| Platform Fees | platform commission | not recorded per-reservation | Hostaway fee fields (evidence) | PARTIAL |
| Cleaning | cleaning allocation | `transactions` (Airbnb/Management `Cleaning`) | Hostaway per-reservation cleaning (evidence) | PARTIAL (two sources) |
| Management Fee | JJ commission | `transactions` (`Management Fee`) and/or JJ 20% rule | computed on Hostaway evidence | DECISION |
| Taxes | guest taxes | no tax subcategory in `transactions` | Hostaway `taxAmount` (evidence) | MISSING (authority) |
| Net Owner Payout | owner economics | derived (see C) | - | PARTIAL |
| Platform Income / Owner Payout (financial) | income owed to owner | **`transactions` Airbnb `Platform Income`** (canonical) | Hostaway payout = reconcile evidence only | VERIFIED where posted |
| Expenses & Extras | ledger items | **`transactions`** (Airbnb expenses, `Software/Hostaway`, manual `Platform Income` adj.) | - | VERIFIED |
| Statement Total | final owed | RC3 engine (`computeBalance`/`executiveSummary`) | - | VERIFIED (given inputs) |

Hostaway classification: **(a) evidence only** for money, **(b) operational source** for dates/guest/channel/reservation identity, **(c) never financial authority**.

---

## C. Formula chain (proven from the PDFs; verified arithmetically on all 4)

Per reservation (Hostaway evidence + JJ policy):
```
Total Payout            = Gross Rental Revenue - Platform Fees
Management Fee          = 20% x (Total Payout - Cleaning - Taxes)      # JJ STR policy: 20% after platform fees
Net Owner Payout        = Total Payout - Cleaning - Management Fee - Taxes
Property Management Revenue (metric) = Management Fee + Cleaning       # taxes are NOT PM revenue
```
Statement:
```
Owner Payout (activity) = sum of Net Owner Payout (reservations in period)
Statement Total         = Owner Payout + sum(Expenses & Extras, signed)
```
Worked checks (VERIFIED): TM01 Jul `894.18*0.20=178.84`, Total `3341.11-554.62-527.30-150.00=2109.19`, Statement `2109.19-40=2069.19`. Central Avenue (taxes present) `(1727.71-370.98-60-122.11)*0.20=234.92`, Net `=939.70`. Multi-month `9443.48 + (-50) = 9393.48`.

**Formula conflicts / decision points (NOT resolved here):**
1. **Granularity:** JJ records `Platform Income` as *multi-month aggregates* (e.g. Tamir Dekelia PI = 3 rows dated 2025-06-17 / 2025-12-31 / 2026-04-30), not per-reservation/per-month. The PDF is per-reservation.
2. **Management Fee source:** computed 20% (from Hostaway evidence) vs recorded `transactions` Management Fee - which is authoritative on the printed statement?
3. **Taxes:** no tax subcategory in `transactions`; only Hostaway `taxAmount` exists. Authority MISSING - evidence-only unless JJ decides otherwise.
4. **Cleaning:** per-reservation flat (50/60 EUR, Hostaway/PM) vs `transactions` Cleaning rows - reconcile or choose authority.

---

## D. Existing reusable JJ components (do NOT build a parallel engine)

- **RC3 report engine** - `src/lib/report/*` (`fetchReport`, `types.ts` -> `RC3PropertyReport`/`RC3AccountSection`/`RC3AccountRow`, `account_type` incl. `airbnb`+`rental`, `display_group` incl. `info` for platform tracking, `computeBalance`, `expenseGroups`, `executiveSummary.computeNetOwnerBalance`, `labels`, `ReportType='full'|'periodic'`). **`transactions`-authoritative.**
- **PDF engine** - `src/lib/pdf/OwnerSettlementPdfV3.tsx` (+ `OwnerSettlementPdf.tsx`, `generate.ts`, `formatters.ts`, `rtlHelpers.ts`) on `@react-pdf/renderer`, Hebrew RTL, consumes `RC3PropertyReport`. Routes: `src/app/client-report-rc3`, `src/app/client-report`.
- **Statements infrastructure** - `statements` schema (P1-1: series/drafts/draft_lines/sent snapshots + immutable event ledger) + `src/lib/statements/statementBuilderService.ts` for draft/sent versioning.
- **Hostaway evidence** - `PropertyAuditService` + `strReconciliation`/`StrReconciliationDTO` (per-reservation activity + Hostaway-vs-JJ reconciliation, read-only, already in production).

**Verdict:** the owner statement should be an **extension of RC3 + OwnerSettlementPdfV3 + statements**, adding a clearly-labeled "STR activity (Hostaway evidence)" section - not a new engine.

---

## E. Gaps / missing authoritative data

- Per-reservation revenue/platform-fee/tax figures do **not** exist in `transactions` (aggregate-only) -> statement's per-reservation numbers can only be **Hostaway evidence**.
- No **tax** authority in `transactions`.
- `Platform Income` posted only through ~Apr 2026 and as aggregates -> recent months (May-Aug 2026) have Hostaway reservations but **no posted JJ income** -> owner-payout is **Unknown/pending**, never fabricated.
- Owner/recipient contact block (name/address) not modeled in the samples - needs a source decision if required on the printed statement.

---

## F. Business decisions required from Yossi

1. Activity table = Hostaway evidence (recommended) vs require per-reservation JJ posting.
2. Authoritative Management Fee: computed-20% vs recorded `transactions`.
3. Tax authority (evidence-only vs JJ-recorded).
4. Cleaning authority (Hostaway per-reservation vs `transactions`).
5. Behaviour when JJ has no `Platform Income` for the period (Orit/Miranta/recent Tamir): show evidence + "pending JJ ledger" (recommended) vs suppress.
6. Recurring monthly items (`Monthly management fee` -40, `Software/Hostaway`) -> confirm they map to `transactions` `Software/Hostaway`.

---

## G. Recommended Phase 2 implementation path (not authorized yet)

1. Reuse RC3 for the **authoritative financial spine** (owner balance, expenses & extras, statement total) - `transactions` only.
2. Add an optional **STR Activity section** to the report DTO, populated by `PropertyAuditService` reservations, **explicitly labeled "Hostaway evidence"**, with the existing reconciliation surfacing Hostaway-vs-JJ deltas.
3. Extend `OwnerSettlementPdfV3` with the per-reservation activity table + metrics block (visual parity with `OWNER_MINIMAL_V1`).
4. Issue/version via the `statements` schema (draft -> sent snapshot).
5. Per-owner "completeness" gate: COMPLETE only when authoritative `Platform Income` covers the period; else PARTIAL with evidence + Unknown payout.

---

## H. Non-goals / authority boundaries (binding)

- Do **not** create `transactions` from Hostaway; do **not** auto-post missing Platform Income; do **not** invent platform fees, taxes, cleaning, or management fees.
- Hostaway is evidence/operational only - **never** financial authority.
- `transactions`, RC3, FPE, Settlement, JHKA authorities remain canonical and unchanged.
- STR reconciliation logic (just shipped) is **not** modified by this work.
- Unknown is an acceptable, honest result.

---

## Real-owner completeness test (single month)

| Owner / property | JJ authoritative income | Verdict | Missing evidence |
|---|---|---|---|
| **Tamir Dekelia** | Platform Income 9,686 EUR (3 aggregate rows) + Mgmt Fee + Cleaning + Software/Hostaway + expenses (through ~Apr 2026) | **PARTIAL** | PI is multi-month aggregate, not per-month; May-Aug 2026 unposted |
| **Tamir Radisson** | Platform Income 7,034 EUR + Mgmt Fee + Cleaning + expenses | **PARTIAL** | same aggregate-granularity gap |
| **Orit Rob Pingodes** | no Platform Income (setup expenses + client payments only) | **NOT POSSIBLE YET** | no JJ Platform Income for any month |
| **Miranta Radisson** | 90 EUR Photography only | **NOT POSSIBLE YET** | no JJ income at all |

Hostaway per-reservation **evidence** is available for all four (verified via `PropertyAuditService`); only the **authoritative monthly financial** side is incomplete.
