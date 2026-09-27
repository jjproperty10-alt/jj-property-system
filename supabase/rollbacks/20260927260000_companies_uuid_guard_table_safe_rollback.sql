-- Restore the reviewed registry.forbid_uuid_change body.
-- Does not change triggers, rows, keys, RLS, policies, or migration history.

BEGIN;

DO $guard$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  guard_proc oid;
BEGIN
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.parties IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 188
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927220000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') <> 1
     OR (
       SELECT count(*) FROM (
         SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*) > 1
       ) AS duplicated
     ) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  SELECT proc.oid INTO guard_proc
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change';

  IF (SELECT count(*) FROM pg_proc WHERE proname = 'forbid_uuid_change') <> 1
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
       JOIN pg_language AS lang ON lang.oid = proc.prolang
       WHERE proc.oid = guard_proc
         AND owner_role.rolname = 'postgres'
         AND proc.prosecdef = false
         AND proc.provolatile = 'v'
         AND lang.lanname = 'plpgsql'
         AND proc.proconfig IS NULL
         AND proc.proacl::text = '{postgres=X/postgres}'
     ) <> 1
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM 'fe964c798154886e8dacc8edebef908a'
     OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM 'f9bbc41924fe3b312eab24540090df3a'
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal AND trigger_row.tgfoid = guard_proc
         AND (
           (trigger_row.tgname = 'companies_uuid_guard' AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c')
           OR (trigger_row.tgname = 'parties_uuid_guard' AND trigger_row.tgenabled = 'O' AND trigger_row.tgtype = 19
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '495f8ad6dcc449e20c4ded2e8aaab021')
         )
     ) <> 2
     OR (
       SELECT count(*) FROM pg_depend AS depend
       WHERE depend.refobjid = guard_proc AND depend.classid = 'pg_trigger'::regclass AND depend.deptype = 'n'
     ) <> 2
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = pinned_company AND status = 'active') <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24
     OR (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias) IS DISTINCT FROM '69abde521c603f79ad8514cfb08a1658'
     OR (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME='companies' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'UUIDs are immutable (companies)'; END IF;
  IF TG_TABLE_NAME='parties' AND NEW.party_id <> OLD.party_id THEN RAISE EXCEPTION 'UUIDs are immutable (parties)'; END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $function$;

DO $post$
DECLARE
  guard_proc oid;
BEGIN
  SELECT proc.oid INTO guard_proc
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change';

  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM '1a56112bb0b16e14ea9407cef27bd7b5'
     OR (SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE oid = guard_proc) IS DISTINCT FROM '5181844513754066b432e1a529ad84e3'
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN ('companies_uuid_guard', 'parties_uuid_guard')
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgfoid = guard_proc
     ) <> 2
     OR (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.parties) <> 24 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$post$;

COMMIT;
