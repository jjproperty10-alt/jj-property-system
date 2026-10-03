# Planning notes

These notes are not authority. Current rules stay in `docs/canonical/` and `docs/governance/`.

## Security drafts, 2026-10-03 — not approved

The files below are drafts. They are not approved for apply. Do not merge them and do not run them against a Supabase project.

`supabase db push` applies every file in `supabase/migrations` in timestamp order. A push from this branch would run these drafts. Do not push.

There is no migration in this repository named Slice A. The company-read isolation step is `supabase/migrations/20260930120000_company_member_read_isolation.sql`. Apply that only as part of the isolation chain, after `20260924210000_access_company_memberships.sql` and `20260929200000_internal_operating_company_path.sql`. The security drafts are later and each one still needs its own approval:

1. `supabase/migrations/20261003150000_user_roles_self_escalation_lock.sql`
2. `supabase/migrations/20261003150100_contacts_staff_only_rls.sql`
3. `supabase/migrations/20261003150200_capital_balances_audit_staff_rls.sql`
4. `supabase/migrations/20261003150300_pms_rpc_revoke_authenticated.sql`
5. `supabase/migrations/20261003150400_anon_grant_hardening.sql`
6. `supabase/migrations/20261003150500_require_jj_staff.sql`
7. `supabase/migrations/20261003150600_property_name_aliases_staff_gate.sql`

The local proof of direct PostgREST-shaped access is `security_direct_db_matrix_2026-10-03.md`.

Do not apply `20260904_002` or `20260922230000`.

Rolling one of these drafts back after a later draft has been applied is not a full undo of the later draft. The `user_roles` rollback re-grants write privileges that the anon-grant draft removes.
