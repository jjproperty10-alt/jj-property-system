# ADR-001: Client Display Field Whitelist

**Status:** Accepted  
**Date:** 2026-07-10  
**Deciders:** Yossi Azizi, Claude (Anthropic), ChatGPT (OpenAI)  
**Applies to:** All client-facing report output — UI (`page.tsx`), PDF (`OwnerSettlementPdfV3.tsx`), and any future report renderer

---

## Context

The JJ Property 10 transaction database contains fields that serve two distinct purposes:

1. **JJ-internal operational fields** — written by staff, contain pricing logic, partner identifiers, internal instructions, and notes that are never intended for clients. Examples: `description`, `notes`, `k_note`.

2. **Client-facing display fields** — computed by the accounting engine or explicitly authored for client visibility. Examples: `display_label` (computed by `computeBalance.ts`), and `client_description` (future column, not yet in schema).

The risk is that a future developer, finding an empty or generic `display_label`, might fall back to `description` or `notes` to produce a "useful" label for the client. This would silently expose confidential operational data.

A blacklist approach (listing forbidden fields) is insufficient: new internal fields added to the schema in the future would be exposed by default unless someone remembered to add them to the list.

---

## Decision

**Client-facing report output may render only fields that are explicitly declared and approved for client visibility.**

All other transaction fields are non-client-facing by default. Absence from the permitted list means forbidden — not "unspecified".

### Permitted fields (whitelist, complete)

| Field | Type | Source | Status |
|-------|------|--------|--------|
| `display_label` | `string` | Computed by `computeBalance.ts → enrichRows()` | Active |
| `client_description` | `string \| null` | Future DB column, explicitly named for client visibility | Deferred — not yet in schema |

No other field from `RC3Row` or `RC3AccountRow` may appear in client output.

### Explicitly forbidden (non-exhaustive examples)

These fields must never reach client-facing rendering, regardless of how they are accessed:

- `description` — JJ internal operational note
- `notes` — internal annotation
- `k_note` — internal key note
- `memo` — if added in future
- `internal_notes`, `supplier_notes`, `staff_notes` — any field not on the whitelist above

The forbidden list is provided for clarity, not as the basis of the rule. The whitelist is the authoritative basis.

---

## Enforcement — Staged Plan

### Stage 1 — ADR + Gateway Function (M0, complete)

`clientDisplayText(row, clientDescription?)` in `src/lib/report/clientDisplay.ts` is the **mandatory gateway** for all client-facing text. It implements the priority chain:

```
clientDescription (future)
  ↓ if null/empty
display_label (computed by accounting engine)
  ↓ if null/empty
'' (safe empty string — never null, never a fallback field)
```

The function must never be extended with additional fallback parameters without a reviewed ADR amendment.

### Stage 2 — Field Audit (M0 review, complete)

Manual audit of `page.tsx` and `OwnerSettlementPdfV3.tsx` confirmed zero reads of `description`, `notes`, or `k_note` in the client display path.

### Stage 3 — Unit Tests (M0, complete)

`src/__tests__/report/clientDisplay.test.ts` (to be added in M0.1 or first M1 sub-task) will assert that `clientDisplayText()` never returns the value of `row.description` or `row.notes` under any input combination.

### Stage 4 — Structural Enforcement (M0.1 or dedicated security milestone)

Two options under evaluation. One will be selected before pilot:

**Option A: ESLint AST rule**  
Custom rule that rejects direct reads of forbidden fields (`row.description`, `row.notes`, `row.k_note`) outside of `computeBalance.ts` and `fetchReport.ts`. Limitation: can be bypassed by destructuring (`const { description } = row`) or string indexing (`row['description']`).

**Option B: Client-Safe DTO (preferred for long-term)**  
Report renderer components receive a sanitized `ClientDisplayFields` object, not the full `RC3AccountRow`. Forbidden fields are structurally unavailable — not just stylistically discouraged.

```typescript
// Proposed interface — not yet implemented
interface ClientDisplayFields {
  displayLabel: string
  clientDescription?: string | null
  // Deliberately: no description, no notes, no k_note
}
```

This approach makes violations a compile-time error rather than a code review catch. It is the preferred long-term direction.

**Decision on Stage 4 timing:** to be made in M0.1 planning. ADR will be amended when a mechanism is selected.

---

## Consequences

**Positive:**
- Confidential JJ operational data cannot reach client reports by accident.
- The rule is schema-agnostic: new internal fields added to the DB schema are automatically forbidden until explicitly approved.
- `clientDisplayText()` is a single auditable point — all client display text flows through it.

**Negative / constraints:**
- Developers must always use `clientDisplayText()` at render time — cannot inline field reads directly. This is intentional friction.
- When `display_label` is empty or generic, the correct fix is to improve the accounting engine's label assignment (in `computeBalance.ts`) or add a `client_description` value to the transaction — NOT to fall back to an internal field.
- The Client-Safe DTO (Stage 4B) requires refactoring renderer components to accept the narrowed type. This is worth doing but has a non-trivial migration cost.

---

## Relationship to Other Decisions

- **`computeBalance.ts`** is the accounting engine that computes `display_label` for every transaction row. It is the upstream source of permitted display content.
- **`clientDisplay.ts`** is the presentation gateway. It is downstream of the accounting engine and upstream of all renderers.
- **ADR-002 (planned): Approved Extras Registry Wiring** — when `isApprovedExtra()` is wired into `computeBalance.ts` in M3, a related ADR will document that decision.

---

## Amendment History

| Date | Change |
|------|--------|
| 2026-07-10 | Initial acceptance — whitelist approach, staged enforcement plan |
