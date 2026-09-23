# Production RLS lockdown — applied outside the migration runner

Date: 2026-09-23

Project: `vsiiprzjrstjcmjpwcrd` (production). Staging is a different project and is not this record.

## What is already true in the database

Stage A and Stage B were executed in the production SQL editor on 2026-09-23. They are not rows in `supabase_migrations.schema_migrations`. A count of versions matching `20260923%` returned 0.

Do not replay those statements. Stage A is not idempotent, and the staging file `20260923_001_rls_advisor_public_tables.sql` would replace the live staff policy with the staging variant. That file must not be added under `supabase/migrations/`.

The screen fix on this branch is application code only. CI runs tests, typecheck, and lint. It does not run `supabase db push`.

## What this branch must not contain

- `supabase/migrations/20260923_001_rls_advisor_public_tables.sql`
- any Stage A or Stage B script placed where the migration runner will execute it

Local review copies, if they exist on a workstation, are not part of the deploy.
