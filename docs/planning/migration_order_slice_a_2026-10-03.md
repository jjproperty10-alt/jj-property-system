# Migration order around Slice A — 2026-10-03

Draft note for the owner. This file does not choose an order. Two options are written out with their risks. Slice A itself is unchanged.

## Slice A files in this branch (byte-identical)

SHA256 of the copies placed here, matched to the owner's read-only files:

| Path | SHA256 |
|---|---|
| `supabase/migrations/20260930220000_client_entity_company_isolation.sql` | `7ce4fe3a26aca2fcef5f3c977cfbc81435b06f35aec5f379f8ea44e3456dd7f0` |
| `supabase/rollbacks/20260930220000_client_entity_company_isolation_rollback.sql` | `16ad1d31bdab731729e3420cceef7d394e2b3fee55c6018e26b9d6aa6ae7964b` |
| `supabase/tests/20260930220000_client_entity_company_isolation_matrix.sql` | `2b4b9c3f841b5485aa5527403e4fc19c7664a095a75a43f1fd26efb844366007` |
| `src/__tests__/security/clientEntityCompanyIsolation.test.ts` | `92e3c9756928773fb88b5d9ddac0091e5fb4300c938ee4f052238c13cd75dd3a` |
| `scripts/run-client-entity-company-isolation-matrix.cjs` | `b226097c0c2bc39d08604908886b7d37972fcffdd661021d1ba451f726cfb7fb` |

`scripts/run-client-entity-company-isolation-matrix.cjs` targets Production (`supabase db query --linked --project-ref vsiiprzjrstjcmjpwcrd`). Do not run it. The local retarget is `scripts/run-client-entity-company-isolation-matrix.local.cjs`.

## What the Slice A guard seals

`20260930220000` refuses with `BLOCKED_BY_HISTORY` unless `supabase_migrations.schema_migrations` has **exactly 193** rows, `20260930200000` is present once, `20260930220000` is absent, versions are unique, there is one company and one membership, and the name `Yossi Properties` is absent. It then requires 27 `entity_identity` rows, 33 `management_relationship` rows, and 24 `registry.parties` rows, all parties in that sole company.

`20260930200000` itself required a count of 192 before it ran. After it is recorded, the history table has 193 rows. Slice A is written to be the next migration.

Any of the drafts below, applied first, inserts another history row. Slice A's count check then fails with `BLOCKED_BY_HISTORY`.

## Pending drafts

Bodies for the settlement, contact, canonical-name, and security drafts are **not in this clone**. Dependencies below are from the task statement plus what Slice A and `20261003130000` say in this branch.

| Version | Draft | Depends on | If it is applied before Slice A |
|---|---|---|---|
| `20260930220000` | Slice A. Adds `operating_company_id` on `lifecycle.entity_identity` and `lifecycle.management_relationship`, FK NO ACTION, `lifecycle.enforce_client_entity_company()`, triggers on those two tables and `registry.parties`, and RESTRICTIVE `company_member_read` policies. | `20260930200000` recorded and history count exactly 193. One company. The 27/33/24 row counts. | This is the gate. |
| `20261002150000` | Certified settlement reader. | No object dependency is visible in this clone. It does not have to change client tables to break Slice A. | Adds a history row. Slice A raises `BLOCKED_BY_HISTORY`. |
| `20261003120000` | Contact settlement view. This version is not `create_owner_draft` (that draft moved to `20261003130000`). | No object dependency is visible in this clone. | Same history-count failure. |
| `20261003130000` | `lifecycle.create_owner_draft` writes a verified `operating_company_id`. | **Requires Slice A.** Its guard demands `20260930220000` present, and `entity_identity.operating_company_id` uuid NOT NULL with an FK to `registry.companies`. It does not depend on the settlement or contact drafts. | Slice A raises `BLOCKED_BY_HISTORY`. This draft's own guard also raises `BLOCKED_BY_HISTORY` until Slice A is recorded. |
| `20261003140000` | Canonical name per company. | Slice A's header says `entity_identity_canonical_name_uq` on `lower(canonical_name)` stays global and is a hard blocker before a second company. This draft is the named follow-up and needs Slice A's company column. Body not in this clone. | Same history-count failure. Applying it first also leaves the global unique index in place while Slice A is still blocked. |
| `20261003150000`–`20261003150400` | Security drafts. | Bodies not in this clone, so no per-file dependency is stated here. | Each recorded version increments the count. Slice A raises `BLOCKED_BY_HISTORY`. |

## Option A — apply Slice A first

Order, with Slice A first:

1. `20260930220000` Slice A, while the history count is still 193.
2. `20261002150000` certified settlement reader. No client-table dependency is known; it follows Slice A only so the count guard can pass.
3. `20261003120000` contact settlement view. Same reason.
4. `20261003130000` `create_owner_draft`, after Slice A's column, FK, and trigger exist.
5. `20261003140000` canonical name per company, after Slice A, and before a second company is activated. Slice A says the global name unique index blocks that activation.
6. `20261003150000` through `20261003150400` security drafts, after Slice A. Their order relative to each other is not in this clone.

Known gap inside option A: even after Slice A and `20261003130000`, a second active company cannot be written by `create_owner_draft`. Slice A's trigger always calls `resolve_verified_operating_company(NULL, false)` and raises `BLOCKED_BY_COMPANY_CONTEXT` when more than one company is active. The armed permit is ignored. A separate, unaccepted proposal for that is `supabase/drafts/PROPOSAL_20261003160000_enforce_client_entity_company_honor_permit.sql`. It is not part of this order.

Risk of option A: every later draft waits until Slice A is accepted and applied. If Slice A stays a draft, the settlement reader, the contact view, the owner draft, the name draft, and the security drafts cannot be applied without hitting `BLOCKED_BY_HISTORY`.

## Option B — loosen Slice A's history guard

Separate draft copy, not a replacement of the real file:

`supabase/drafts/PROPOSAL_20260930220000_guard_at_least_193.sql`

The copy keeps Slice A's body and changes the opening history check to:

- at least 193 history rows, instead of exactly 193
- `20260930200000` present once
- `20260930220000` absent
- no duplicate versions
- none of the Slice A objects yet (`enforce_client_entity_company()` and the three triggers absent; the column check `BLOCKED_BY_REAPPLY` is unchanged)
- the existing single-company, membership, name, and 27/33/24 row checks unchanged

Risk of option B: the exact count was the seal that nothing landed after `20260930200000`. A count of "at least 193" allows those later drafts to be recorded first. The row-count checks still refuse if a draft inserts or deletes clients, relationships, or parties. `BLOCKED_BY_REAPPLY` still refuses if `operating_company_id` already exists. They do **not** refuse a new trigger, a new policy, a changed `resolve_verified_operating_company`, or any other function Slice A's trigger calls. Reviewing each migration between 193 and Slice A becomes the owner's check, which the exact count was doing automatically.

## Not chosen

Option A and option B are both drafts. This note does not pick one.
