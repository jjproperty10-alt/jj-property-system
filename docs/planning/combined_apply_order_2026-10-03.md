# Combined apply order — 2026-10-03

Draft record only. Nothing in this list was applied. No Supabase project was contacted. `supabase db push` from this branch would run every file under `supabase/migrations`, including the seven security drafts and the wrapper. Do not push.

Database migrations and the app deploy are separate. Finish the migrations the app calls, then deploy the app. Do not deploy the app in the middle of the list.

`createServiceClient()` awaits staff and company membership, and the membership check is `rpc('is_company_member')` in `public`. If that app code is deployed before `public.is_company_member` exists, every staff request fails closed.

## Why the wrapper is not after the app

Nothing in the wrapper, the seven drafts, or the tests requires `20261003170000` to follow the seven or `PROPOSAL_20261003160000`.

- `supabase/migrations/20261003170000_public_is_company_member_wrapper.sql` lines 25–27 are `SELECT access.is_company_member(p_company_id);`. That function is created in `supabase/migrations/20260924210000_access_company_memberships.sql`.
- Line 15 of the wrapper says the timestamp is after `20261003150400`. That avoids a version collision. The body does not call `20261003150400`.
- The wrapper does not call `require_jj_staff`. `20261003150600` does not call the wrapper. No draft calls `PROPOSAL_20261003160000`. That proposal file is not in this repo.

Throwaway Postgres only (`host=/var/run/postgresql port=5432 user=ubuntu`). Databases `jj_order_wrapper_first` and `jj_order_seven_first` were created from `supabase/tests/20261003_security_hardening_drafts/00_fixture.sql` and dropped at the end. They were not a Supabase project.

- Wrapper before the seven: `public.is_company_member` applied while `pg_proc` still had zero `require_jj_staff` functions. `prosecdef` was false. As `authenticated`, a real membership returned `true` and a different company id returned `false`. The seven files then applied on that same database, in the order below.
- Seven, then wrapper: the same seven files applied first, then the wrapper. The same membership call returned `true` / `false`.

Both orders are valid SQL. Filename order (`supabase db push`) runs the seven before the wrapper because `20261003150600` sorts before `20261003170000`. That is safe. It is not a reason to deploy the app before the wrapper.

## Database migrations

1. Slice A `20260930220000` (`client_entity_company_isolation`). Its guard raises `BLOCKED_BY_HISTORY` unless `supabase_migrations.schema_migrations` has exactly 193 rows, version `20260930200000` is present once, version `20260930220000` is absent, and there is one company. Every later migration inserts a migration row. Slice A is first. The SQL is reference only. It is not under `supabase/migrations` on this branch.

2. `create_owner_draft` `20261003130000`. This is not `lifecycle.create_owner_draft` in `supabase/migrations/20260810_001_pr4_wizard_foundation.sql`. The `20261003130000` file is not on this branch. It follows Slice A because Slice A's count guard cannot follow a new migration row. No security draft references it. Its timestamp is before the seven.

3. The seven security drafts, in the order the local compose and the direct-database matrix applied and then passed (`supabase/tests/20261003_security_hardening_drafts/RESULTS.txt`: `compose after_behaviors=pass`, `direct_db_matrix=pass`). Each file's own guard checks objects that already exist on the attested catalog (`finance.is_active_jj_staff`, `finance.is_active_jj_admin`, or a named policy). None of the seven reads a column Slice A adds. They do not have to precede Slice A, and Slice A's count guard means they cannot. They also do not have to precede the wrapper. On the throwaway database above they applied both before it and after it.
   1. `supabase/migrations/20261003150000_user_roles_self_escalation_lock.sql`
   2. `supabase/migrations/20261003150100_contacts_staff_only_rls.sql`
   3. `supabase/migrations/20261003150200_capital_balances_audit_staff_rls.sql`
   4. `supabase/migrations/20261003150300_pms_rpc_revoke_authenticated.sql`
   5. `supabase/migrations/20261003150400_anon_grant_hardening.sql`
   6. `supabase/migrations/20261003150500_require_jj_staff.sql`
   7. `supabase/migrations/20261003150600_property_name_aliases_staff_gate.sql`

4. `supabase/migrations/20261003170000_public_is_company_member_wrapper.sql`. Apply it before the app deploy. It needs `access.is_company_member` from `20260924210000`, which is already in history, and it has to follow Slice A only because of the count guard. It does not need the seven or the proposal. Not applied.

5. `PROPOSAL_20261003160000` only when a second company must be writable. The file is not on this branch. Slice A's sole-company guard means this proposal cannot precede Slice A. Its timestamp sits between `20261003150600` and `20261003170000`, so a filename-ordered push would run it before the wrapper. No draft in this list calls it. The one-company factory does not need it.

## App deploy

Deploy the app only after every migration that deployed code calls has been applied:

- Slice A, because the Slice B column map filters `entity_identity` and `management_relationship` on `operating_company_id` and `parties` on `company_id`.
- The wrapper, because the factory calls `public.is_company_member`.
- The seven security drafts, because the moved staff actions rely on them (staff-only contacts, capital and audit RLS, the `require_jj_staff` gate, the `user_roles` lock, and the grant and alias drafts in that set).

The Slice B map in `src/lib/auth/serviceRoleCompanyGate.ts` is code, not a migration. It does not depend on the seven: those drafts change RLS, and the service connection bypasses RLS. It does depend on Slice A's columns. The same release calls `createServiceClient()`, so the map must not ship before the wrapper.

## What was not a dependency

- `20261003150500` says `public.require_jj_staff(text[])` is called from later migrations. `20261003150600` does not call it. It calls `finance.is_active_jj_staff()` and keeps the existing `company_member_read` policy (`access.is_company_member`). The wrapper does not call `require_jj_staff` either. The app factory does. Where that function already exists and its body has the `jj_staff_config` predicate, `20261003150500` leaves the body unchanged.
- `20261003150600` requires `auth_all_property_name_aliases` and `company_member_read` to already be on `property_name_aliases`. Those are earlier than this set. It does not require Slice A's new columns.
- `20261003150100` does not add a company column. It says a company column and a backfill are later, separately approved steps. Contacts stay verify-only in the app map until that column exists.
- Rolling `20261003150000` back after `20261003150400` has been applied re-grants `user_roles` writes that the anon-grant draft removes. That is a rollback hazard, not a reason to reorder the apply. The matrix proof rolled the seven back in reverse timestamp order and restored the before state.

## App gate on this branch

`restrictedStaffActions.ts` awaits `createServiceClient()`. The factory requires active staff and company membership before it returns a client. Capital upsert still requires an active ceo, an active superadmin staff role, or an active `user_roles` superadmin read from the caller's own session row. `user_roles` stays refused on the service client. Contacts, contact links, opening balances, partnership capital, entity aliases, accounting rules, and `jj_staff_config` are verify-only: the company resolver must succeed, and no company column is added. A missing company still refuses those reads.
