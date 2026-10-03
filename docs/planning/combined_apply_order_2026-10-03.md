# Combined apply order — 2026-10-03

Draft record only. Nothing in this list was applied. No Supabase project was contacted. `supabase db push` from this branch would run every file under `supabase/migrations`, including the seven security drafts. Do not push.

This order interleaves those seven drafts with Slice A, `create_owner_draft`, the public membership wrapper, and the Slice B app map. A step is placed before another only where a guard or a passed local proof requires it. Timestamp order is used where no such dependency was found.

## Order

1. Slice A `20260930220000` (`client_entity_company_isolation`). Its guard raises `BLOCKED_BY_HISTORY` unless `supabase_migrations.schema_migrations` has exactly 193 rows, version `20260930200000` is present once, version `20260930220000` is absent, and there is one company. Every later file in this list inserts a migration row or, for the Slice B map, is app code that reads columns Slice A adds. Slice A is first. The SQL is reference only. It is not under `supabase/migrations` on this branch.

2. `create_owner_draft` `20261003130000`. This is not `lifecycle.create_owner_draft` in `supabase/migrations/20260810_001_pr4_wizard_foundation.sql`. The `20261003130000` file is not on this branch. It has to follow Slice A because Slice A's count guard cannot follow a new migration row. No security draft references it, and its SQL is not here, so no dependency on the seven was proven. Its timestamp is before the seven.

3. The seven security drafts, in the order the local compose and the direct-database matrix applied and then passed (`supabase/tests/20261003_security_hardening_drafts/RESULTS.txt`: `compose after_behaviors=pass`, `direct_db_matrix=pass`). Each file's own guard checks objects that already exist on the attested catalog (`finance.is_active_jj_staff`, `finance.is_active_jj_admin`, or a named policy). None of the seven reads a column Slice A adds. They do not have to precede Slice A, and Slice A's count guard means they cannot.
   1. `supabase/migrations/20261003150000_user_roles_self_escalation_lock.sql`
   2. `supabase/migrations/20261003150100_contacts_staff_only_rls.sql`
   3. `supabase/migrations/20261003150200_capital_balances_audit_staff_rls.sql`
   4. `supabase/migrations/20261003150300_pms_rpc_revoke_authenticated.sql`
   5. `supabase/migrations/20261003150400_anon_grant_hardening.sql`
   6. `supabase/migrations/20261003150500_require_jj_staff.sql`
   7. `supabase/migrations/20261003150600_property_name_aliases_staff_gate.sql`

4. Slice B app column map in `src/lib/auth/serviceRoleCompanyGate.ts`. Code only. `entity_identity` and `management_relationship` filter on `operating_company_id`, and `parties` filters on `company_id`, only after Slice A. The map does not depend on the seven: those drafts change RLS, and the service connection bypasses RLS. The map does not apply SQL.

5. `PROPOSAL_20261003160000` only when a second company must be writable. The file is not on this branch. Slice A's sole-company guard means this proposal cannot precede Slice A. Its timestamp is after the seven and before the wrapper. No draft in this list calls it.

6. `supabase/migrations/20261003170000_public_is_company_member_wrapper.sql`. The body calls `access.is_company_member`, which is already in `20260924210000`. The wrapper's own note places the timestamp after `20261003150400`. It does not call `require_jj_staff`. Not applied.

## What was not a dependency

- `20261003150500` says `public.require_jj_staff(text[])` is called from later migrations. `20261003150600` does not call it. It calls `finance.is_active_jj_staff()` and keeps the existing `company_member_read` policy (`access.is_company_member`). The wrapper does not call `require_jj_staff` either. The app factory does. Where that function already exists and its body has the `jj_staff_config` predicate, `20261003150500` leaves the body unchanged.
- `20261003150600` requires `auth_all_property_name_aliases` and `company_member_read` to already be on `property_name_aliases`. Those are earlier than this set. It does not require Slice A's new columns.
- `20261003150100` does not add a company column. It says a company column and a backfill are later, separately approved steps. Contacts stay verify-only in the app map until that column exists.
- Rolling `20261003150000` back after `20261003150400` has been applied re-grants `user_roles` writes that the anon-grant draft removes. That is a rollback hazard, not a reason to reorder the apply. The matrix proof rolled the seven back in reverse timestamp order and restored the before state.

## App gate on this branch

`restrictedStaffActions.ts` awaits `createServiceClient()`. The factory requires active staff and company membership before it returns a client. Capital upsert still requires an active ceo, an active superadmin staff role, or an active `user_roles` superadmin read from the caller's own session row. `user_roles` stays refused on the service client. Contacts, contact links, opening balances, partnership capital, entity aliases, accounting rules, and `jj_staff_config` are verify-only: the company resolver must succeed, and no company column is added. A missing company still refuses those reads.
