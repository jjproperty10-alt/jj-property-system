# Production RLS lockdown — recorded after the manual apply

Date: 2026-09-23

Project: `vsiiprzjrstjcmjpwcrd` (production). Staging is a different project and is not this record.

## What was applied manually

Stage A and Stage B were executed in the production SQL editor on 2026-09-23, before a migration file existed. A count of `supabase_migrations.schema_migrations` versions matching `20260923%` was 0 at that time.

The same statements are now recorded, in idempotent form, at `supabase/migrations/20260923120000_record_applied_staff_lockdown.sql`. Re-running that file converges to the live privileges. It does not grant anon or PUBLIC access, does not create `public.is_active_jj_staff`, and does not force RLS.

The staging file `20260923_001_rls_advisor_public_tables.sql` is still not the production record. It must not be added under `supabase/migrations/`.

This file has not been executed again as part of the contract-screen work. CI does not run `supabase db push`.

## Rental contracts

`supabase/migrations/20260923130000_rental_contracts_staff_only.sql` is the prepared staff-only policy for `public.rental_contracts`. It is not applied until the contract screens have been checked on Preview. It revokes anon access and replaces `auth_all_contracts`. It does not grant a new privilege. `lifecycle.rental_contracts` is a different table and is not part of this policy.
