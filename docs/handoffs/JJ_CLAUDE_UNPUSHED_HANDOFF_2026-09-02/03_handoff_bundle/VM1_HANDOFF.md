# Villa Mazotos 1 — Partner Settlement Handoff (BI\JJ)

**Generated:** 2026-09-02 · **Mode:** READ-ONLY (no DB write, deploy, merge, or push — no production data changed)
**Source DB:** Supabase `vsiiprzjrstjcmjpwcrd`, table `transactions`
**Engine:** generic, config-driven — no hard-coded names/amounts/percentages except in Golden Tests.

---

## 1. Scope — exact transaction set

| | count | Σ amount_eur |
|---|---|---|
| **Active (included)** | **202** | 1,254,006.81 |
| Deleted (excluded) | 4 | 1,102.88 |
| **Total in table** | **206** | — |

**Inclusion filter (verbatim):**
```sql
property_name = 'Villa Mazotos' AND is_deleted = false
```
Scoping is by **exact** `property_name` match — never a `%mazotos%` substring (that pulled the sister
property "Villa Mazotos 2 / Ilan & Ilana" and inflated earlier drafts). `transactions.property_id` is
NULL for this data, so `property_name` is the only valid key.

The prior draft ran a **contaminated 267-row** scope. Against the clean 202-row scope it over-stated
`purchase_expenses` by **€8,349.60** and `renovation` by **€818.50** — that over-inclusion, not rounding,
is the source of every stray residual in earlier iterations (see §4).

---

## 2. Certified anchors (all reconcile from the 202 rows)

| Layer | Authoritative total | Reconciliation |
|---|---|---|
| Purchase price | **400,000.00** | partner→Owner payments (self-artifact contract row excluded) |
| Deal / purchase expenses | **14,300.00** | 6 rows |
| **Renovation** | **72,214.14** | 96 rows; German worker 16/01/2025 counted **ONCE** (f807dbf2) |
| Airbnb — cost | **12,641.74** | actual property_expense |
| Airbnb — charge | **13,155.74** | = cost 12,641.74 + service profit **514.00** |
| ↳ Airbnb service profit 514 | | utility/other markup **270.00** + pool-service net **244.00** (1,320 billed − 1,076 cost) |
| Management | **691.79** | 480.00 (Anastasia) + 30.00 + 181.79 |
| Platform income | **1,360.00** | 960 (Yossi) + 400 (Anastasia) |
| Premium (Avi buy-in) | 50,000.00 | Avi → Yossi |

### €650 German-worker decision (FINAL — Yossi, 2026-09-02)
The 16/01/2025 payment to the German worker is **one** row: **f807dbf2** (active, real). **ca1448db** is a
**deleted duplicate — NOT counted, NOT restored.** The €650 "controlled correction" is **RETIRED** from every
fixture, golden test, report, and funding reconciliation.
Consequently: Renovation = **72,214.14**; Avi renovation obligation = 36,107.07; Avi total obligation =
**300,180.84**; Avi paid = 280,600.00; Avi platform-income credit = 680.00.

### Avi — CERTIFIED
```
Avi net = paid 280,600.00 + credits 680.00 − obligation 300,180.84 = −18,900.84  (to_pay)
```
**Avi final payable = €18,900.84.** This is the only partner line that is print-final.

---

## 3. The real zero-sum — cash conservation = €0.00 (no plug)

Double-entry over every active cash movement (received − paid per entity; self-artifact contracts and the
€200,000 Owner→Owner mirror excluded; cc-only billing rows excluded) sums to **exactly €0.00**:

| Entity | net (€) | | Entity | net (€) |
|---|---:|---|---|---:|
| AVI | −250,000.00 | | Photographer | +980.50 |
| Yossi | −135,584.65 | | German | +3,600.00 |
| Jacob | −82,310.08 | | Yanis | +10,900.00 |
| Client | −31,560.00 | | JJ (box) | +18,148.64 |
| Anastasia (box) | −17,929.79 | | company (vendor) | +83,393.45 |
| Tenant | −400.00 | | Owner (seller) | +400,000.00 |
| jumbo / decoration | +111.93 | | **Σ** | **0.00** |

Every euro is attributed to a named counterparty. There is **no unexplained residual** at the cash level.

---

## 4. The €271.80 residual — found and eliminated

The €271.80 was **not** rounding and **not** a real cash residual — it was an artifact of the contaminated
267-row scope (Contractors mislabeled as `self_artifact` + wrong-property rows). Proof:

* Clean-scope cash conservation = **€0.00** exactly (§3) — nothing left to bridge.
* No subset of the custody/income transactions sums to €271.80 (exhaustive search, signed combinations).
* The contaminated scope inflated `purchase_expenses` +€8,349.60 and `renovation` +€818.50; the exact
  filter `property_name='Villa Mazotos' AND is_deleted=false` removes it.

The custody/income items the residual was mistakenly attributed to are all individually accounted for and
sit **inside** the box positions of §3 (none are lost):

| Item | txn IDs | € | Where it sits |
|---|---|---:|---|
| Airbnb markup | 4c40f610 (+200), eb6b2423 (+70) | 270.00 | JJ service profit (of the 514) |
| Pool-service net | 1,320 billed − 1,076 cost | 244.00 | JJ service profit (of the 514) |
| Management held in JJ box | 71d5f307 (181.79), 049dc8af (30) | 211.79 | JJ box (+18,148.64) |
| Platform income in custody | cc0ab3a1 Yossi (960), 01a920d1 Anastasia (400) | 1,360.00 | Yossi hold + Anastasia box |

---

## 5. Clearing plug — REMOVED

The old **CASHBOX_CLEARING −€11,385.27** was a fixture balancing plug. It is **removed entirely** — no Golden
Test balances through it, and no result depends on it:

* `partnerSettlementEngine.test.ts` — the `expect(clearing.net).toBe(-11385.27)` / `partnersNet` plug
  assertions are gone; the clearing is asserted only as `basis === 'fixture_balancing'`,
  `status === 'provisional'`, and is explicitly **not** an evidence figure. Avi still resolves to −18,900.84.
* `cashboxResolver.test.ts` — rewritten: the −11,385.27 constant and the rejected Avi −19,225.84 are gone;
  the 50/50 split and cross-partner payment instructions are no longer asserted as certified. Absent
  `custody_positions` provenance the resolver output is `certifiable === false` (provisional simulation only).

The **real** zero-sum is the €0.00 cash conservation of §3, not the plug.

---

## 6. Four ledgers — kept separate (never mixed)

1. **Economic obligation** — by ownership Avi 50 / Yossi 25 / Jacob 25 over the charge layers + premium.
2. **Funding source** — who supplied the money (Avi conduit through Jacob/JJ folded to source: b71e4098 €5,600
   + c51df847 €5,000 + 3afd3b3f €20,000 are Avi funding routed via Jacob/JJ).
3. **Cash held in boxes** — Anastasia box −17,929.79; JJ box +18,148.64.
4. **Income held for owners** — platform €1,360 (Yossi 960 / Anastasia 400); rental; JJ service profit €514.

The €10,600 Avi conduit through Jacob (5,600 + 5,000) is **settled** — Jacob personal funding = **€82,310.08**.
Not to be re-questioned.

---

## 7. Partner status

| Partner | net (€) | confidence | print-final? |
|---|---:|---|---|
| **Avi** | **−18,900.84** (to pay) | **approved / certified** | **YES** |
| Yossi | +36,869.43 (fixture) | simulation | **NO — PROVISIONAL** |
| Jacob | −6,583.32 (fixture) | simulation | **NO — PROVISIONAL** |

Yossi/Jacob stay **PROVISIONAL** until `custody_positions` deposit provenance is connected (currently EMPTY).
**No payment instruction between Yossi and Jacob** is issued. Their fixture nets carry a premium offset of
Yossi→Jacob €25,000 (internal) but are simulation, not settlement. **Routing: PENDING.**

---

## 8. File manifest (this folder = `BI\JJ\VM1_HANDOFF\`)

**Engine / composer (source of truth — copied, not rebuilt):**
`bottomUpSettlement.ts`, `partnerReportComposer.ts`, `partnerSettlementEngine.ts`,
`propertySettlementConfigs.ts` (VM1 fixture: renovation 72,214.14, Avi 18,900.84),
`cashboxResolver.ts`, `categoryReconciliation.ts`, `economicCoverage.ts`, `fundingClassification.ts`,
`propertyScope.ts`, `purchaseEqualization.ts`.

**Tests** (`tests/`): `partnerSettlementEngine.test.ts` (Golden — Avi −18,900.84, clearing plug removed),
`cashboxResolver.test.ts` (retired-plug guard), `bottomUpSettlement.test.ts`, `categoryReconciliation.test.ts`,
`economicCoverage.test.ts`, `fundingClassification.test.ts`, `propertyScope.test.ts`,
`purchaseEqualization.test.ts`.

**Data:** `VM1_transaction_classification.csv` — 202 rows, columns
`txn_id,date,category,subcategory,funding_source,custodian_conduit,payer,payee,amount_eur,client_charge,treatment,layer`.

_(`_to_delete_raw.csv` is an obsolete stub — the device link has no delete permission; safe to delete manually.)_

---

## 9. Constraints honored
Read-only throughout. No DB write, no deploy, no branch merge, no push. No production data was changed —
all edits are to local source/test files and this handoff folder.
