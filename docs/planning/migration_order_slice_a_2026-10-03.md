# Migration order around Slice A — 2026-10-03

Decided order: **Slice A first**. The exact-193 history check stays. No check in Slice A is weakened. The at-least-193 draft copy is not the order.

This note covers five artifacts only: Slice A (`20260930220000`), Slice B (the service-read column map), `PROPOSAL_20261003160000`, the `20261003170000` public `is_company_member` wrapper, and `20261003130000` `create_owner_draft`. An edge is listed only where a migration, function, trigger, or table reference cites it, or where the other order failed on local Postgres 17.

## Decision

Apply `20260930220000` while `supabase_migrations.schema_migrations` still has exactly 193 rows, then the dependents below. No proven dependency requires the history guard to become "at least 193".

`supabase/drafts/PROPOSAL_20260930220000_guard_at_least_193.sql` stays unapplied. It is a separate copy. It does not replace `supabase/migrations/20260930220000_client_entity_company_isolation.sql`.

## Left out of this order

- `20261002150000` (certified settlement reader) is unapproved. It is not a step.
- The 17 entities are not assigned to a company by this order. They stay in review pending Yossi's ID-by-ID approval. This order adds no backfill and no blanket company update for them.
- `20261003140000` (canonical name per company) is not a step. On `origin/cursor/isolation-canonical-name-per-company-c` at `42e5b6f`, its header says `20260930220000` is not required. Its backfill is a data write gated by `BLOCKED_BY_EVIDENCE` and by Yossi's approval. It is not an assignment of the 17 entities.

Recording any other version row before Slice A, including a draft whose body is not in this clone, still makes Slice A's count check raise `BLOCKED_BY_HISTORY`. That is the history seal. It is not an object dependency, and those drafts are not sequenced here.

## Slice A files in this branch (byte-identical)

| Path | SHA256 |
|---|---|
| `supabase/migrations/20260930220000_client_entity_company_isolation.sql` | `7ce4fe3a26aca2fcef5f3c977cfbc81435b06f35aec5f379f8ea44e3456dd7f0` |
| `supabase/rollbacks/20260930220000_client_entity_company_isolation_rollback.sql` | `16ad1d31bdab731729e3420cceef7d394e2b3fee55c6018e26b9d6aa6ae7964b` |
| `supabase/tests/20260930220000_client_entity_company_isolation_matrix.sql` | `2b4b9c3f841b5485aa5527403e4fc19c7664a095a75a43f1fd26efb844366007` |
| `src/__tests__/security/clientEntityCompanyIsolation.test.ts` | `92e3c9756928773fb88b5d9ddac0091e5fb4300c938ee4f052238c13cd75dd3a` |
| `scripts/run-client-entity-company-isolation-matrix.cjs` | `b226097c0c2bc39d08604908886b7d37972fcffdd661021d1ba451f726cfb7fb` |

`scripts/run-client-entity-company-isolation-matrix.cjs` targets Production. Do not run it.

## Dependency graph

```text
20260930200000 (already the predecessor of the exact-193 seal)
        |
        v
20260930220000  Slice A
        |
        +----> 20261003130000 create_owner_draft
        |        needs Slice A's history row and
        |        entity_identity.operating_company_id uuid NOT NULL FK
        |
        +----> PROPOSAL_20261003160000
        |        needs lifecycle.enforce_client_entity_company()
        |        still unaccepted; not required for one company
        |
        +----> 20261003170000 public.is_company_member
        |        object dependency is access.is_company_member(uuid)
        |        (20260924210000), which already exists
        |        follows Slice A so its version row does not move the count
        |
        +----> Slice B service-read column map (app code, b49809f)
                 entity_identity / management_relationship / parties
                 columns exist after Slice A is applied
```

No proven edge runs between `create_owner_draft`, the wrapper, Slice B, and the permit proposal. Any order of those four is valid once Slice A has been applied and, for the wrapper, once Slice A's version row is recorded. The permit proposal does not have to follow `create_owner_draft`. `create_owner_draft` does not have to follow the proposal.

## Edges and evidence

### Slice A is first

`supabase/migrations/20260930220000_client_entity_company_isolation.sql` lines 17–29 refuse with `BLOCKED_BY_HISTORY` unless the history count is exactly 193, `20260930200000` is present once, `20260930220000` is absent, versions are unique, there is one company and one membership, and `Yossi Properties` is absent. Lines 53–58 then require 27 `entity_identity` rows, 33 `management_relationship` rows, and 24 `registry.parties` rows in that sole company. Lines 82–92 set `operating_company_id` on those existing client and relationship rows to that sole company. That fill is Slice A's own statement. It is not an assignment of the 17 entities.

`20260930200000` required a count of 192 before it ran. After it is recorded, the history table has 193 rows. Slice A is written to be the next recorded migration.

### `create_owner_draft` depends on Slice A

`supabase/migrations/20261003130000_create_owner_draft_operating_company.sql` lines 31–39 raise `BLOCKED_BY_HISTORY` unless `20260930220000` is present once. Lines 42–61 require `lifecycle.entity_identity.operating_company_id` to be `uuid NOT NULL` with a foreign key to `registry.companies`. Slice A adds that column at lines 62–70 and sets it NOT NULL at lines 113–114. The function body arms with `access.arm_internal_operating_company` (line 194) and writes `operating_company_id` (line 200).

The same guard also requires `public.property_definitions.operating_company_id` (lines 62–69). That column is not added by Slice A. On the throwaway run it comes from `supabase/tests/fixtures/20261003130000_create_owner_draft_fixture.sql`.

Matrix step `02_guard_requires_slice_a_history` deletes the Slice A history row and expects `BLOCKED_BY_HISTORY` (`supabase/tests/20261003130000_create_owner_draft_operating_company_matrix.sql` lines 46–55).

### `PROPOSAL_20261003160000` depends on Slice A's trigger function

`supabase/drafts/PROPOSAL_20261003160000_enforce_client_entity_company_honor_permit.sql` lines 31–44 raise `BLOCKED_BY_PROPOSAL` unless `lifecycle.enforce_client_entity_company()` already exists and its body still contains `access.resolve_verified_operating_company(NULL, false)` at least twice. Slice A creates that function at lines 119–155. The three NULL calls are lines 132, 146, and 149. The proposal file is not under `supabase/migrations` and has no version row.

One active company does not need this proposal. Slice A's trigger fills a null company from `resolve_verified_operating_company(NULL, false)` (lines 145–147). The owner-draft matrix passes the one-company steps against the unmodified Slice A function. The proposal exists so an armed write for a second active company can pass the trigger. With two active companies, Slice A's line 149 calls `resolve_verified_operating_company(NULL, false)` and line 151 raises `BLOCKED_BY_COMPANY_CONTEXT`. The permit is never read.

### `20261003170000` follows Slice A because of the count seal

The wrapper is `supabase/migrations/20261003170000_public_is_company_member_wrapper.sql` on `cursor/isolation-direct-service-clients-a` at `c0d9b292`. It is not a file in this working tree. The body is:

```sql
SELECT access.is_company_member(p_company_id);
```

`SECURITY INVOKER`, `search_path` empty. It grants `EXECUTE` to `authenticated` only. Its header cites `supabase/migrations/20260924210000_access_company_memberships.sql`, where `access.is_company_member(uuid)` is created at lines 70–84 and `EXECUTE` is granted to `authenticated` at line 143. The wrapper does not reference Slice A's columns, `lifecycle.enforce_client_entity_company`, or `create_owner_draft`.

The function itself applies on a database that has not run Slice A. Recording version `20261003170000` before Slice A makes the history count 194, and Slice A raises `BLOCKED_BY_HISTORY`. Under the unchanged exact-193 check, the wrapper migration is applied after Slice A.

### Slice B depends on Slice A's columns

There is no Slice B SQL migration in this clone. The artifact is `src/lib/auth/serviceRoleCompanyGate.ts` at commit `b49809f` on `origin/cursor/isolation-a-plus-slice-b-merge-draft` (`158c9dd` is that branch tip; `b49809f` is the commit that records the column map).

Lines 5–7 say `entity_identity` and `management_relationship` filter on `operating_company_id`, `parties` filters on `company_id`, and those columns are present only after Slice A's migration. The map is lines 9–16: `entity_identity` and `management_relationship` use `operating_company_id`; `parties` uses `company_id`. Line 42: a missing column on a filtered relation is refused and is not passed through.

Slice A adds `operating_company_id` on the two lifecycle tables (lines 62–66). `registry.parties.company_id` already exists; Slice A's header line 2 says that column is checked, not rewritten, and the parties trigger is lines 128–136. Slice B does not insert a history row. It does not require the at-least-193 guard. The column filter is usable once Slice A has been applied.

On `c0d9b292`, the same file's notes (lines 17–28 of that revision) still describe Slice B as an unseen local edit of the filtered path. `b49809f` is the revision that contains the column map cited above.

## Resulting order

1. `20260930220000` Slice A, while the history count is 193. Every existing check stays: exact count, `20260930200000` present, own version absent, unique versions, one company, one membership, no `Yossi Properties`, and the 27/33/24 row checks.
2. `20261003130000` `create_owner_draft`, after Slice A's history row, column, and foreign key exist.
3. `20261003170000` public `is_company_member` wrapper, after Slice A is recorded. Its function depends on `access.is_company_member(uuid)` from `20260924210000`.
4. Slice B's service-read column map, in the app, after Slice A has added the columns it filters. This is not a migration version.
5. `PROPOSAL_20261003160000` only after Slice A's trigger function exists, and only if a verified second company must be writable. It is still a proposal. The one-company path does not include it.

Steps 2–5 have no proven order among themselves. The list above is one sequence that respects every proven edge. `20261002150000` is not in it.

## If the order is violated

Measured on disposable local Postgres 17 (`host=/tmp`, port 55432). Fixtures: `throwaway_company_base.sql` then `throwaway_slice_a_preconditions.sql` (history count 193, Slice A objects absent). Each database was dropped after the run. No Supabase connection.

| Case | What ran | Result |
|---|---|---|
| W1 | `20261003130000` before Slice A | `BLOCKED_BY_HISTORY` (guard lines 31–39; psql reports the end of that `DO` at line 133) |
| W2 | Permit proposal before `enforce_client_entity_company()` exists | `BLOCKED_BY_PROPOSAL` (lines 31–44) |
| W3 | Wrapper function before Slice A, no history row inserted | Function created. History count stayed 193. `public.is_company_member(uuid)` registered |
| W4 | Insert history version `20261003170000`, then Slice A | `BLOCKED_BY_HISTORY` (Slice A lines 17–29) |
| W5 | Insert a fake `20260930220000` row and a `property_definitions` table, leave `entity_identity.operating_company_id` absent, then `20261003130000` | `BLOCKED_BY_SCHEMA_DRIFT` (lines 42–82) |
| A1 | Slice A at count 193 | Applied. 27 `entity_identity` rows had `operating_company_id` |
| A2 | Slice A, then the owner-draft fixture, then `20261003130000` | Applied |
| A3 | Permit proposal after Slice A's function existed | Applied |

Slice B was not executed here. It is TypeScript on another commit. The cited comment says a filtered read whose column is missing is refused.

## Why the at-least-193 copy is not the order

The copy would change line 17 from `count(*) <> 193` to a lower bound and add an object-absence check. That accepts a history table that already contains later version rows. Nothing in Slice B, the wrapper, the permit proposal, or `create_owner_draft` requires that. Each of those either depends on an object Slice A creates, or applies cleanly after Slice A. The wrapper's only clash with Slice A is the extra history row, which is avoided by recording Slice A first.
