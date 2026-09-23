# Production RLS lockdown — recorded after the manual apply

Date: 2026-09-23

Project: `vsiiprzjrstjcmjpwcrd` (production). Staging is a different project and is not this record.

## What was applied manually

Stage A and Stage B were executed in the production SQL editor on 2026-09-23, before a migration file existed. A count of `supabase_migrations.schema_migrations` versions matching `20260923%` was 0 at that time.

The same statements are recorded at `supabase/migrations/20260923120000_record_applied_staff_lockdown.sql`. If the live staff-read policy and the revoked client privileges are already present, the file returns before any privilege statement. It does not grant anon or PUBLIC access, does not create a public staff function, and does not force row level security.

The staging file `20260923_001_rls_advisor_public_tables.sql` is still not the production record. It must not be added under `supabase/migrations/`.

CI (`.github/workflows/test.yml`) runs tests, typecheck, lint, and the client-display whitelist. It does not run `supabase db push`. A Vercel deploy does not execute files under `supabase/migrations/`.

## Rental contracts

`supabase/migrations/20260923130000_rental_contracts_staff_only.sql` records the staff-only policy for `public.rental_contracts`. That policy was applied in the production SQL editor after the Preview screens passed. If `staff_all_contracts` is already the only contract policy and anon has no select or insert, the file returns before any privilege statement. It does not grant a new privilege. The lifecycle rental table is a different table and is not part of this policy.
