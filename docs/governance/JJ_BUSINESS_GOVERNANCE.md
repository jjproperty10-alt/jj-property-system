# JJ Business Governance (D2–D11)

> **Git-backed promotion — faithful, 2026-08-11.**
> **Source (provenance):** `JJ_BUSINESS_GOVERNANCE_V1.md` v1.2 (OneDrive), APPROVED by Yossi 2026-07-28.
> This document is the Git-backed home of the approved D2–D11 business-governance decisions. It replaces the OneDrive-only file as the current authority pointer target.
> **Faithful promotion:** the D2–D11 content below is reproduced without change — no rule added, removed, or reworded.
> **D4 — Company Settlement Boundary:** the current constitutional authority for D4 is **`docs/governance/JJ_LEDGER_CONSTITUTION.md`** (D4 — JJ Entity Settlement Model). This document does **not** restate or compete with that authority; the D4 section below is a reference summary only, exactly as in the source.
> **In-body `CLAUDE.md` §-references** (e.g. §4, §13.13, §13.17) are historical provenance from the original. Current Git authorities: ledger/settlement → `JJ_LEDGER_CONSTITUTION.md`; accounting/business rules → `JJ_ACCOUNTING_RULES.md` + `JJ_BUSINESS_RULE_BOOK.md`; live state → `docs/canonical/JJ_CURRENT_STATE.md`.
> **Status:** APPROVED (v1.2). Documentation only — authorizes no code or DB change.

---

# JJ Business Governance v1.0
## The Business Contract for JJ Financial Engine Development

**Status:** ✅ APPROVED — Implementation authorized (pending CLAUDE.md registration)  
**Version:** v1.2 (D11 closed, D2/D3 final corrections 2026-07-28)  
**Created:** 2026-07-28  
**Author:** JJ Governance Session (2026-07-27)  
**Authorized by:** Yossi (pending final QA review)  
**Document type:** Business Governance — Documentation Only

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-07-28 | Initial document |
| v1.1 | 2026-07-28 | QA corrections: D2 (property positions), D3 (income separation), D6 (snapshot as checkpoint), D7 (funding-source logic), D8 (multi-leg events), D9 (bidirectional custody), D10 (execution route + settlement run scope), D11 added as OPEN |
| v1.2 | 2026-07-28 | D2: "Opening Balance" → Verified Historical Baseline. D3: constitutional separation rule added. D11: CLOSED — Economic entitlement does not automatically create settlement obligation. Status: APPROVED |

---

## Purpose

This document captures the approved business decisions that govern the JJ financial engine.

It is not a summary of accounting cases. It is not a technical specification. It is the business contract that all future financial development must honor.

**Reading order:**
Before reading this document, ensure familiarity with the constitutional chain:
- `JJ_NORTH_STAR.md` — Why JJ exists
- `M8_CONSTITUTIONAL_PRINCIPLES.md` — Product constitution (P-ARCH-1…9)
- `CLAUDE.md` Section 13.17 — Ledger & Settlement Constitutional Principles (P-LEDGER-1…3, P-EVIDENCE-1)
- `CLAUDE.md` Section 4 — Business rules and D4 (JJ Settlement Boundary)

This document sits one layer below the constitution. It answers: **"How does the business work?"**

---

---

## Design Note — JJ Is Built Around Business Questions

> **JJ is not built around dashboards.**
> **JJ is built around business questions.**
> **Dashboards are user interfaces that answer one business question each.**

This distinction matters because it determines how the system is designed.

A dashboard-centric approach asks: "What should this screen show?" That question produces inconsistent systems — every dashboard becomes its own mini-engine.

A business-question-centric approach asks: "What is the user trying to know?" That question produces a coherent engine — one engine, many views.

**Architectural consequence (design note only — not a constitutional principle):**
Every UI component, every report, and every dashboard in JJ must be traceable to one specific business question. If a component cannot state its business question, it should not be built.

Examples:
- "How much did each property generate this year?" → Property-level analytical breakdown
- "How much did each category contribute?" → Category-level breakdown
- "What is each partner's share?" → Partner attribution view
- "Who owes whom, right now?" → Net Partner Balance view
- "Is the partnership in equilibrium?" → Settlement Optimization Engine output

This observation will guide UI design but does not alter the financial engine architecture.

---

## Approved Decisions

---

### D2 — Running Partner Ledger

**Business Question:**
Do partner balances close per property, or do they accumulate across the entire partnership? And what happens to the property-level detail?

**Approved Decision:**
Partner settlements are continuous across the entire partnership. Individual properties maintain attributable positions and analytical breakdowns. Property positions do not require separate cash settlement. All property positions roll into the global partner ledger, which is the authoritative settlement position.

**Business Rule:**
> Each property maintains an attributable position and analytical breakdown.
>
> Property positions do not require separate cash settlement.
>
> All property positions roll into the global partner ledger,
> which is the authoritative settlement position.
>
> Balances are never forced to close per property.

**What this means in practice:**
- The system tracks: how much was generated per property, per category, per partner.
- These breakdowns are analytical truth — they explain *why* the global balance is what it is.
- The authoritative settlement position is the global partner ledger, not any individual property sub-ledger.
- Closing a property does not automatically close a partner's balance. The balance continues until an explicit settlement event is recorded.
- The system must support querying "partner balance as of date X" — not just the current state.

**Architectural Consequence:**
- Property-level positions exist and are preserved for analytical, audit, and explanatory purposes.
- No per-property settlement event is required to close an individual property position.
- The global partner ledger aggregates all property positions into one running net balance per partner.
- Any report must be able to answer, at the appropriate level: property → category → partner → global net.

**Examples:**
- Yossi paid €10,000 for Villa Mazotos renovation. Jacob paid €8,000 for a different property. Both amounts are visible in property-level breakdowns. Both roll into the global partner ledger.
- A JJ income event of €5,000 allocated 50/50 reduces both partners' running balances simultaneously — regardless of which property generated it. The property-level contribution is tracked; the settlement is global.
- A fully sold property has a zero property-level position. The partner ledger retains the history of every event that property contributed.

**Future Notes:**
- The running ledger requires a Verified Historical Baseline (a Verified Balance Snapshot per D6) before it can produce trusted running totals from a known checkpoint. The full history always remains the authoritative source.
- Cross-property settlement between the same client on different properties remains RC2 scope (see CLAUDE.md Section 13 RC1/RC2 split).

---

### D3 — JJ Income Allocation

**Business Question:**
When income is generated by a JJ-managed property, who owns it — the property owners, or JJ? And does the person who received the cash own it?

**Approved Decision:**
Income type determines ownership. Property income belongs to the property owners according to the property agreement. JJ management fees, brokerage, markup, and service income belong to JJ and are allocated according to the JJ partnership agreement. Cash receiver does not determine ownership. Cash custody is independent from economic ownership.

**Business Rule — Two income categories must never be mixed:**

> **Category A — Property Income:**
> Rental proceeds, Airbnb payouts, and all income generated by the property's operations.
> Belongs to the property owners according to the property ownership agreement.
> Allocated per `property_owners` table — not per JJ default 50/50.
>
> **Category B — JJ Service Income:**
> Management fees, brokerage commissions, markup, handling fees, and any income JJ earns for services rendered.
> Belongs to JJ.
> Allocated per the JJ partnership agreement (default: Yossi 50%, Jacob 50%).
>
> **Custody rule (applies to both categories):**
> The entity that physically received the cash is the custodian — not the economic owner.
> Custodianship never transfers ownership.

**Architectural Consequence:**
- Every income event must be classified as Category A (property income) or Category B (JJ service income) before attribution.
- Category A income is attributed to property owners via `property_owners`. Category B income is attributed via the JJ partnership agreement.
- Reports must never aggregate these two categories without labeling them separately.
- The financial engine must distinguish `received_by` (custodian) from `owned_by` (economic owner).

**Examples:**
- Villa Mazotos Airbnb rental proceeds (€1,500 per month): Category A. Belongs to property owners: Avi 50% / Yossi 25% / Jacob 25%. The €1,500 is split accordingly — regardless of who collected it.
- JJ management fee charged to Villa Mazotos owner (€300/month): Category B. Belongs to JJ. Split Yossi 50% / Jacob 50%.
- Anastasia collects €1,000 rent for a JJ-owned property: Category A. JJ owns it (per JJ partnership agreement). Anastasia is the custodian.
- Jacob directly receives a €500 cleaning fee from a client: Category B (if it is a JJ service fee). JJ owns it. Jacob is the custodian temporarily.

**Future Notes:**
- For properties with non-standard ownership (Villa Mazotos 2: Oren 35% / Yossi 32.5% / Jacob 32.5%), Category A must always use the property-specific `property_owners` record.
- The line between Category A and Category B may not always be clear in the raw `transactions` data. The `classifyTx()` engine (RC1) must resolve this via the subcategory chain.
- **Constitutional separation rule:** Category A and Category B may coexist within the same business event (for example: a single Airbnb booking that generates rental income, a management fee, a cleaning fee, and a markup). They must never be merged into one economic allocation. Each component must be classified and attributed independently.

---

### D4 — Company Settlement Boundary

**Approved Decision:**
Already documented. See `CLAUDE.md` Section 4 (⚠️ JJ Settlement Architecture — D4 APPROVED) and Section 13.17 (D4 — JJ Entity Settlement Model).

**Summary for reference (do not duplicate):**
JJ is the operational settlement boundary. All external parties settle against JJ. All partners settle against JJ. Partners never settle directly against employees, suppliers, or customers.

> Partners do not settle with employees. Partners settle with the company. The company settles with the world.

For full detail, architectural consequence, and Dashboard A / Dashboard B architecture targets: see `CLAUDE.md` Section 13.17.

**Note on D10 interaction:**
D4 governs the *economic* settlement boundary. D10 defines how execution may be optimized within that boundary. See D10 for the distinction between Settlement Counterparty and Execution Route.

---

### D5 — Net Partner Balance

**Business Question:**
How does the system present what a partner is owed or owes — and when does it net opposing balances?

**Approved Decision:**
The system always presents one net balance per partner. Opposing balances are netted whenever legally and economically appropriate. The system must be able to answer: "Who owes whom, right now?"

**Business Rule:**
> Each partner has one net balance against JJ at any point in time.
> Positive balance: JJ owes the partner.
> Negative balance: the partner owes JJ.
> The net balance is the authoritative number.
> Sub-components (by property, by category) are analytical breakdowns — they do not replace the net.
> Netting is performed at the partnership level, governed by D4 (settlement counterparty is always JJ).

**Architectural Consequence:**
- No system component should present a partner's balance as a collection of per-property debits and credits without also presenting the net.
- The "Net Partner Balance" is the primary output of the partner ledger. All other views are derived.
- Netting is automatic within the partnership scope (Yossi ↔ JJ nets all events).
- The system must support: "What is Yossi's net balance as of 2026-07-01?" — and produce a verified, auditable answer.

**Examples:**
- Yossi has paid €50,000 for JJ expenses (JJ owes Yossi €50,000) and received €30,000 in JJ income distributions (Yossi owes JJ €30,000). Net: JJ owes Yossi €20,000.
- Jacob has an open receivable of €10,000 from a property transaction and has received €15,000 in personal withdrawals from JJ. Net: Jacob owes JJ €5,000.

**Future Notes:**
- The Settlement Optimization Engine (D10) uses the net balance as its input — not the gross components.
- Partner balances in the Partner Report must use the net figure, with the breakdown available as a supporting detail view.

---

### D6 — Historical Ledger and Verified Snapshots

**Business Question:**
How is historical partner data preserved, and how do we certify that a historical balance is correct?

**Approved Decision:**
Historical partner ledgers are permanent. History is never replaced. History is never truncated. Verified Balance Snapshots are audit checkpoints — they certify history but never replace it. The authoritative balance always remains reproducible from the complete historical ledger.

**Business Rule:**
> The historical ledger is append-only.
> Every financial event, once recorded and verified, is permanent.
>
> A Verified Balance Snapshot is an audit checkpoint.
> It states: "As of date X, partner P's net balance was €Y — and this has been verified against primary sources."
>
> A snapshot may accelerate reporting and comparison,
> but the authoritative balance remains reproducible from the complete historical ledger.
>
> A snapshot never becomes an opaque replacement for the transactions that produced it.
> History before a snapshot remains fully accessible and auditable.
> The system must always be able to recalculate from the first recorded event.

**Architectural Consequence:**
- No `DELETE` on financial records. Only `review_status` changes (see CLAUDE.md Section 3 and Section 13).
- Verified Balance Snapshots are stored as separate records — they reference the ledger events they certify, without replacing them.
- A Snapshot is a verification artifact, not a compression artifact. It does not replace the need to retain underlying transactions.
- The `statements` schema (P1-1, Production Certified ✅) implements this model. See CLAUDE.md Section 13.13.
- Recalculation from full history must always produce the same result as reading the snapshot. If they diverge, the history is authoritative.

**Examples:**
- All Villa Mazotos purchase transactions (2023–2024) are verified through AV-005. A Verified Balance Snapshot can certify "as of 2024-12-31, Yossi's contribution to Villa Mazotos purchase capital was €120,000."
- That snapshot does not remove the individual transaction rows. It adds a certified checkpoint on top of them.
- Future transactions (2025+) accumulate on top of the full history — not on top of the snapshot alone.
- If a discrepancy is found: the snapshot is flagged for review; the history is never discarded.

**Future Notes:**
- The first Verified Balance Snapshots require M9-B Historical Data Entry to be complete.
- JHKA is the evidence engine that supports snapshot verification — it provides the source chain required to certify each snapshot's accuracy.
- Opening Balances for RC1 client reports are a category of Verified Balance Snapshot applied to client/property relationships. They are checkpoints, not history replacements.

---

### D7 — Personal Funding Rule

**Business Question:**
When a payment is made for a JJ obligation, what determines whether JJ owes the payer — the name in the `payer` field, or the actual source of the funds?

**Approved Decision:**
Funding source determines liability — not the identity of the person who initiated or processed the payment. Personal funds used for JJ create a JJ liability to the person. JJ funds used for any payment create a company expense only, even if Yossi or Jacob physically initiated the transaction.

**Business Rule:**
> Personal funding source → JJ liability to the person.
>
> JJ funding source → company expense only,
> even if Yossi or Jacob physically initiated the payment.
>
> The person initiating the payment does not determine liability.
> The source of the funds determines liability.

**Why `payer` alone is not sufficient:**
A single payment event has multiple attributes that must be distinguished:

| Attribute | Question it answers |
|-----------|---------------------|
| `initiated_by` | Who authorized or processed the payment? |
| `cash_payer` | Whose name appeared on the bank transfer or card? |
| `funding_source_owner` | Whose economic resources funded the payment? |
| `payment_account` | Which account was debited? |
| `economic_principal` | Who bears the economic obligation being paid? |

The `payer` field in the current DB captures a mix of these attributes. The financial engine must not assume that `payer = Yossi` always means personal funds were used.

**Architectural Consequence:**
- The financial engine must not infer JJ liability to a partner based solely on the `payer` field.
- Every personal-funding event requires explicit classification — either at the time of entry or during the review process.
- Where funding source is ambiguous, the event must be flagged for review, not auto-classified.
- Future import pipelines and data entry interfaces should capture `funding_source_owner` as a distinct field.

**Examples:**
- Yossi pays €500 for office supplies from his personal bank account. Funding source: Yossi personal. → JJ owes Yossi €500.
- Yossi uses the JJ company card to pay €500 for office supplies. Funding source: JJ. → Pure JJ expense. No personal liability created, even though `payer` might read "Yossi."
- Jacob pays a property deposit of €10,000 from his personal account. Funding source: Jacob personal. → JJ owes Jacob €10,000.
- JJ bank account pays the same deposit. Funding source: JJ. → JJ expense only.

**Future Notes:**
- Clarifying the funding source for historical transactions is part of JHKA's reconciliation work. Until clarified, ambiguous entries must not be auto-classified as personal liability.
- Advance payments by partners may be reclassified as capital contributions rather than receivables — this requires an explicit business decision per event.

---

### D8 — Settlement Classification

**Business Question:**
What determines whether a financial transaction is a settlement — and can a single business event contain both an expense leg and a settlement leg?

**Approved Decision:**
Settlement behavior is determined by business classification, not by payment patterns. A single ledger leg has one authoritative classification. A business event may generate multiple linked ledger legs — including an expense leg, a cash movement leg, and a settlement leg — all sharing one business event identifier and never double-counted.

**Business Rule:**
> A single ledger leg has one authoritative classification.
>
> A business event may produce multiple linked ledger legs,
> including an operational payment leg and a settlement leg.
>
> Those legs must share one `business_event_id`
> and must never be double-counted.
>
> Settlement transactions reduce partner balances.
> Expense transactions increase partner receivables (if personally funded) or reduce JJ cash (if company funded).
> Classification is a business decision — not a pattern match on amount, description, or date.

**Why this matters (lesson from AV-005 E2):**
In the E2 resolution, three separate transaction rows (Yossi €1,000, Jacob €1,400, Anastasia €2,400) represented one business event. Two were confirmed duplicates; one was the canonical record. Multiple legs — one event. This pattern recurs in internal settlements, cross-property offsets, and approved advance repayments.

**Architectural Consequence:**
- The `classifyTx()` engine must classify at the ledger-leg level, not the business-event level.
- A `business_event_id` field (or equivalent linking mechanism) is required to associate multiple legs with one event.
- The system must detect and reject double-counting when multiple legs reference the same business event.
- Cross-property settlements (where the same partner has opposing balances on different properties with the same client) remain RC2 scope.

**Examples:**
- Simple settlement: JJ transfers €5,000 to Yossi to repay an advance. Single leg, one classification: settlement.
- Multi-leg event: JJ pays a contractor €3,000 for work on a client property. Leg 1: cash payment (expense). The client is then billed €3,000. Leg 2: client charge (receivable). One business event, two legs, two different classifications.
- Approved offset: JJ owes Yossi €1,000. A client owes JJ €1,000. With explicit approval, the client pays Yossi directly. Leg 1: client → Yossi (cash movement). Leg 2: settlement of JJ's liability to Yossi. Leg 3: settlement of client's liability to JJ. One business event, three legs. All linked by `business_event_id`. No double-counting.

**Future Notes:**
- The `business_event_id` linking mechanism is required before the Settlement Optimization Engine (D10) can safely process multi-leg events.
- Automatic settlement detection (matching opposing pairs) is RC2 scope.

---

### D9 — Cash Ownership vs Cash Custody

**Business Question:**
When cash is physically held by one entity but economically belongs to another, how does the system account for it — in both directions?

**Approved Decision:**
Cash ownership determines company liquidity. Cash custody determines operational responsibility. Custody never changes ownership. Total company cash equals all cash owned by JJ regardless of who holds it. The custodian relationship is bidirectional: the custodian may hold JJ cash (positive custody), or JJ may owe the custodian after they have disbursed more than they held (negative working-fund position).

**Business Rule:**
> Cash ownership: the economic right to the funds, governed by the applicable agreement.
> Cash custody: the operational responsibility to manage and transmit the funds.
>
> These two concepts are independent.
>
> **Three custody states:**
>
> Positive custody:
>   Custodian holds JJ cash.
>   Custodian owes JJ the amount held.
>
> Negative working-fund position:
>   Custodian has disbursed more than they held.
>   JJ owes the custodian the deficit.
>
> Zero (cleared):
>   All cash held has been transmitted.
>   No open obligation in either direction.
>
> Company liquidity = sum of all cash owned by JJ, regardless of current holder.

**Architectural Consequence:**
- `v_anastasia_clearing` must model all three states: `anastasia_owes_jj` (positive), `jj_owes_anastasia` (negative), and cleared (zero).
- The custody view is not a simple receivable — it is a bilateral clearing account.
- Cash custody reporting and cash ownership reporting are separate views. They must not be merged.
- A Cashbox view (such as `v_cashbox_audit`) reflects ownership. It does not reflect who physically holds the cash today.

**Examples:**
- Anastasia collects €3,000 in rent. JJ owns €3,000. Anastasia holds €3,000 as custodian. → Anastasia owes JJ €3,000. Positive custody.
- Anastasia advances €500 from personal funds to cover a property emergency (with JJ approval). She has now disbursed €500 more than she held. → JJ owes Anastasia €500. Negative working-fund position.
- Anastasia transmits €3,000 to JJ and is reimbursed €500. → Cleared. Zero balance.
- A partner personally receives a client payment: they are custodians. JJ (or the property owner) economically owns the funds. Open custody until transmitted or formally offset.

**Future Notes:**
- Multi-custodian scenarios (Anastasia + a property manager + a partner all holding JJ cash simultaneously) require a consolidated custody ledger. This is a future operational feature.
- Custody defaults to JJ when no explicit custodian is recorded. The engine should flag events where custody is ambiguous.

---

### D10 — Settlement Optimization Engine

**Business Question:**
What is the minimum set of financial actions needed to satisfy all obligations in a defined settlement run — and how should execution be optimized without violating D4?

**Approved Decision:**
The Settlement Optimization Engine generates the minimum set of financial actions required to satisfy all approved obligations within a defined Settlement Run. The Settlement Counterparty is always JJ (per D4). The Execution Route may be optimized — including direct partner-to-partner bank transfers — provided the ledger records the two JJ-facing settlement legs and links them to the single execution transfer. Equilibrium is not global zero; it is full satisfaction (or explicit carry-forward) of all obligations approved for that run.

**Two principles that must never be confused:**

| Concept | Rule |
|---------|------|
| **Settlement Counterparty** | Always JJ. Per D4. Never changes. |
| **Execution Route** | May be direct (partner → partner) if it reduces total bank transfers, provided it is approved and both JJ-facing legs are recorded. |

**Settlement Counterparty — unchanged:**
Economic settlement always routes through JJ. JJ owes Yossi; Jacob owes JJ. The ledger records these as two separate JJ-facing obligations. This never changes.

**Execution Route — may be optimized:**
When two JJ-facing obligations can be satisfied by one direct bank transfer, the engine may propose that route. The ledger must still record:
- Leg 1: Jacob → JJ settlement (€20,000 liability reduced)
- Leg 2: JJ → Yossi settlement (€20,000 liability reduced)
- Execution reference: one direct bank transfer Jacob → Yossi

Example:
```
Economic settlement:
  Jacob owes JJ €20,000
  JJ owes Yossi €20,000

Optimized execution:
  Jacob transfers €20,000 directly to Yossi

Ledger representation:
  Jacob → JJ settlement: €20,000
  JJ → Yossi settlement: €20,000
  Execution reference: one direct bank transfer
```

D4 is preserved. Only two bank movements instead of three.

**Settlement Run Scope:**
A Settlement Run is a defined, bounded operation. It is not a continuous process.

Each run must specify:

| Parameter | Purpose |
|-----------|---------|
| `cutoff_date` | All obligations up to this date are included |
| `included_entities` | Which partners, custodians, and counterparties are in scope |
| `included_modules` | Which properties, categories, or departments are in scope |
| `approved_distributions` | Which income allocations have been approved for distribution |
| `liquidity_constraints` | Known cash limitations that affect the settlement plan |
| `target_residuals` | Balances intentionally left open (carried forward) |

**Business Rule:**
> A Settlement Run succeeds when all approved obligations within its scope
> are either fully settled or explicitly carried forward with a documented reason.
>
> Success is not defined as global zero.
>
> Residual balances may remain open intentionally.
> They must be documented as carried forward — not silently dropped.

**Architectural Consequence:**
- The Settlement Optimization Engine is a read-only calculation layer. It reads balances; it does not write transactions.
- Settlement proposals generated by the engine must be reviewed and approved before they become real transactions.
- Every proposal must link to the evidence chain that justifies it (Finance Knowledge Graph, PR #70).
- The engine input chain: `v_cashbox_audit` (ownership) + `v_anastasia_clearing` (custody) + classified settlement events (D8) → net positions → optimization → proposal list.
- Each optimized execution route must record both JJ-facing settlement legs plus the execution transfer reference.

**Future Notes:**
- The Settlement Optimization Engine is post-RC1. RC1 delivers the accounting engine. RC2 delivers the settlement engine.
- Integration with the Investment Lifecycle (M8/M9) is required to correctly account for partner capital events that affect net balances.
- The `business_event_id` linking mechanism (D8) is a prerequisite for multi-leg settlement proposals.

---

### D11 — Retained Profit vs Approved Distribution

**Status: ✅ APPROVED (2026-07-28)**

**Business Question:**
Does JJ profit affect partner settlement immediately — as soon as it is recognized — or only after an explicit distribution approval?

**Approved Decision:**
Economic entitlement does not automatically create a settlement obligation.

**Business Rule:**
> Company profit creates economic attribution.
> Economic attribution does not create a settlement obligation.
> A settlement obligation is created only by an explicit distribution decision.

**The pipeline:**
```
Company Profit
    ↓
Economic Attribution
(partner sees their share in company P&L view)
    ↓
Distribution Decision
(explicit approval by Yossi)
    ↓
Settlement Obligation
(enters partner ledger)
    ↓
Cash Transfer
```

**What this means in practice:**
1. JJ earns €10,000 in management fees.
2. The company P&L shows €10,000 profit.
3. Each partner's economic attribution is €5,000 (visible in company reporting).
4. Partner Balance does not change.
5. Only when a distribution is formally approved does a Settlement Obligation appear in the partner ledger.

**Why this is the correct rule:**
If profit automatically created settlement obligations, JJ could be in a position where it legally owes partners €500,000 while all cash has been reinvested in a new property. The cash does not exist. The obligation would be real but unsatisfiable. This is not how the business operates.

Economic entitlement (knowing your share of the profit) and settlement eligibility (being owed cash) are two different states. JJ tracks both — but they must not be conflated.

**Architectural Consequence:**
- `v_jj_company_pl` and equivalent P&L views show economic attribution — not settlement obligations.
- Partner Balance views (D5) do not include undistributed profit until a distribution decision is recorded.
- The Settlement Optimization Engine (D10) only includes obligations that have been through the full pipeline: Economic Attribution → Distribution Decision → Settlement Obligation.
- The Partner Report must clearly distinguish between "your economic share of company profit" and "what JJ owes you today."

**Examples:**
- JJ earns €50,000 profit in Q1. No distribution decision. → Partner P&L shows €25,000 each. Partner Balances: unchanged.
- Yossi and Jacob approve a €20,000 distribution (€10,000 each). → Settlement Obligation created. Partner Balances updated. Settlement Optimization Engine can now include this in a run.
- JJ reinvests all profit into a new property. → Partner Balances: unchanged. Economic attribution is visible in reporting but no cash is owed.

---

## Summary Table

| Decision | Rule in One Sentence | Status |
|----------|---------------------|--------|
| D2 — Running Partner Ledger | Properties maintain attributable positions; global ledger is the authoritative settlement position. | ✅ Approved |
| D3 — JJ Income Allocation | Property income follows the property agreement. JJ service income follows the JJ partnership agreement. | ✅ Approved |
| D4 — Company Settlement Boundary | JJ is the settlement boundary for all parties. See CLAUDE.md. | ✅ Approved & Documented |
| D5 — Net Partner Balance | One net balance per partner. Netting is automatic at partnership level. | ✅ Approved |
| D6 — Historical Ledger | History is permanent. Snapshots are audit checkpoints — they never replace history. | ✅ Approved |
| D7 — Personal Funding Rule | Funding source determines liability. Personal funds → JJ owes payer. JJ funds → expense only. | ✅ Approved |
| D8 — Settlement Classification | One ledger leg = one classification. One business event may produce multiple linked legs. | ✅ Approved |
| D9 — Cash Ownership vs Custody | Custody is bidirectional: custodian may owe JJ or JJ may owe custodian. | ✅ Approved |
| D10 — Settlement Optimization Engine | Minimum actions within a defined Settlement Run. Execution may be direct; ledger records both JJ legs. | ✅ Approved |
| D11 — Retained Profit vs Distribution | Profit creates attribution; only an explicit distribution decision creates a settlement obligation. | ✅ Approved |

---

## What This Document Is Not

This document is not a technical specification.

It is not a schema definition.

It is not an implementation plan.

It does not authorize any code changes.

**This document is approved. Implementation may begin.**

The next step is to register this document in CLAUDE.md as a constitutional reference, and then use it as the input contract for the Settlement Engine implementation.

---

## Constitutional Chain

This document sits within the JJ constitutional hierarchy:

```
North Star (Why JJ exists)
    ↓
Product Constitution (P-ARCH-1…9)
    ↓
Ledger Constitution (P-LEDGER-1…3, P-EVIDENCE-1)
    ↓
Business Governance v1.0 (this document — D2…D10, D11 OPEN)
    ↓
Implementation Contract (future — after QA and approval)
    ↓
Production Code
```

Every implementation decision must be traceable upward through this chain.

If a line of code cannot be traced to a business rule in this document, it should not exist.

---

*JJ Business Governance v1.0 — v1.2 approved 2026-07-28. QA by Yossi. All decisions D2–D11 approved. Status: ✅ APPROVED. Implementation authorized.*
