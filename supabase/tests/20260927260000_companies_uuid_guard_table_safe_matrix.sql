-- Transaction matrix for 20260927260000. The runner supplies the migration and rollback.
-- Drift probes roll back with the exception. The outer ROLLBACK restores Production.

CREATE TEMP TABLE phase8_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE phase8_matrix TO anon, authenticated, service_role;

DO $baseline$
DECLARE
  company_id_value uuid;
  party_id_value uuid;
  company_update text;
  party_update text;
BEGIN
  INSERT INTO registry.companies (canonical_name) VALUES ('uuid-guard-probe') RETURNING company_id INTO company_id_value;
  BEGIN
    UPDATE registry.companies SET canonical_name = canonical_name WHERE company_id = company_id_value;
    company_update := 'success';
  EXCEPTION WHEN OTHERS THEN
    company_update := SQLERRM;
  END;
  INSERT INTO registry.parties (company_id, canonical_name, party_type)
  VALUES (company_id_value, 'uuid-guard-probe', 'other')
  RETURNING party_id INTO party_id_value;
  BEGIN
    UPDATE registry.parties SET canonical_name = canonical_name WHERE party_id = party_id_value;
    party_update := 'success';
  EXCEPTION WHEN OTHERS THEN
    party_update := SQLERRM;
  END;
  DELETE FROM registry.parties WHERE party_id = party_id_value;
  DELETE FROM registry.companies WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES (
    'baseline_bug',
    company_update = 'record "new" has no field "party_id"' AND party_update = 'success',
    company_update || '|' || party_update
  );
END
$baseline$;

DO $drift$
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260927260000', 'companies_uuid_guard_table_safe');
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;

  BEGIN
    ALTER TABLE registry.companies DISABLE TRIGGER companies_uuid_guard;
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('trigger_disabled', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    DROP TRIGGER companies_uuid_guard ON registry.companies;
    CREATE TRIGGER companies_uuid_guard
      BEFORE UPDATE ON registry.companies
      FOR EACH ROW
      WHEN (false)
      EXECUTE FUNCTION registry.forbid_uuid_change();
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('trigger_definition_drift', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $drifted$
    BEGIN
      RETURN NEW;
    END
    $drifted$;
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('function_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    ALTER FUNCTION registry.forbid_uuid_change() SET search_path = pg_catalog;
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('search_path_drift', SQLERRM = 'BLOCKED_BY_SECURITY', SQLERRM);
  END;

  BEGIN
    GRANT EXECUTE ON FUNCTION registry.forbid_uuid_change() TO anon;
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('acl_drift', SQLERRM = 'BLOCKED_BY_SECURITY', SQLERRM);
  END;

  BEGIN
    CREATE TEMP TABLE uuid_guard_dep_probe (id integer);
    CREATE TRIGGER uuid_guard_dep_probe
      BEFORE UPDATE ON uuid_guard_dep_probe
      FOR EACH ROW
      EXECUTE FUNCTION registry.forbid_uuid_change();
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('dependency_drift', SQLERRM = 'BLOCKED_BY_DEPENDENCY', SQLERRM);
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  company_id_value uuid;
  party_id_value uuid;
  before_company jsonb;
  after_company jsonb;
  before_party jsonb;
  company_uuid_error text;
  party_uuid_error text;
  party_name text;
BEGIN
  INSERT INTO phase8_matrix VALUES (
    'forward_installed',
    (SELECT md5(prosrc) FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
      WHERE nspname = 'registry' AND proname = 'forbid_uuid_change') = 'fe964c798154886e8dacc8edebef908a'
    AND (SELECT md5(pg_get_functiondef(proc.oid)) FROM pg_proc AS proc JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change') = 'f9bbc41924fe3b312eab24540090df3a'
    AND (
      SELECT count(*) FROM pg_proc AS proc
      JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      JOIN pg_roles AS owner_role ON owner_role.oid = proc.proowner
      JOIN pg_language AS lang ON lang.oid = proc.prolang
      WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change'
        AND owner_role.rolname = 'postgres' AND proc.prosecdef = false AND proc.provolatile = 'v'
        AND lang.lanname = 'plpgsql' AND proc.proconfig IS NULL
        AND proc.proacl::text = '{postgres=X/postgres}'
    ) = 1
    AND (
      SELECT count(*) FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal AND trigger_row.tgenabled = 'O'
        AND (
          (trigger_row.tgname = 'companies_uuid_guard' AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c')
          OR (trigger_row.tgname = 'parties_uuid_guard' AND md5(pg_get_triggerdef(trigger_row.oid)) = '495f8ad6dcc449e20c4ded2e8aaab021')
        )
    ) = 2,
    'installed'
  );

  INSERT INTO registry.companies (canonical_name) VALUES ('uuid-guard-probe') RETURNING company_id INTO company_id_value;
  UPDATE registry.companies SET canonical_name = 'uuid-guard-probe-renamed' WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES (
    'company_update_ok',
    (SELECT canonical_name = 'uuid-guard-probe-renamed' AND company_id = company_id_value FROM registry.companies WHERE company_id = company_id_value),
    'renamed'
  );

  SELECT to_jsonb(row_alias) INTO before_company FROM registry.companies AS row_alias WHERE company_id = company_id_value;
  BEGIN
    UPDATE registry.companies SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id = company_id_value;
    company_uuid_error := 'success';
  EXCEPTION WHEN OTHERS THEN
    company_uuid_error := SQLERRM;
  END;
  SELECT to_jsonb(row_alias) INTO after_company FROM registry.companies AS row_alias WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES ('company_uuid_rejected', company_uuid_error = 'UUIDs are immutable (companies)', company_uuid_error);
  INSERT INTO phase8_matrix VALUES ('company_uuid_unchanged', before_company = after_company, 'row');
  DELETE FROM registry.companies WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES (
    'company_insert_delete',
    NOT EXISTS (SELECT 1 FROM registry.companies WHERE canonical_name LIKE 'uuid-guard-probe%')
      AND (SELECT count(*) FROM registry.companies) = 1,
    'removed'
  );

  INSERT INTO registry.companies (canonical_name) VALUES ('uuid-guard-probe') RETURNING company_id INTO company_id_value;
  INSERT INTO registry.parties (company_id, canonical_name, party_type)
  VALUES (company_id_value, 'uuid-guard-probe', 'other')
  RETURNING party_id INTO party_id_value;
  UPDATE registry.parties SET canonical_name = 'uuid-guard-probe-renamed' WHERE party_id = party_id_value;
  SELECT canonical_name INTO party_name FROM registry.parties WHERE party_id = party_id_value;
  INSERT INTO phase8_matrix VALUES ('party_update_ok', party_name = 'uuid-guard-probe-renamed', party_name);
  SELECT to_jsonb(row_alias) INTO before_party FROM registry.parties AS row_alias WHERE party_id = party_id_value;
  BEGIN
    UPDATE registry.parties SET party_id = '00000000-0000-0000-0000-000000000002' WHERE party_id = party_id_value;
    party_uuid_error := 'success';
  EXCEPTION WHEN OTHERS THEN
    party_uuid_error := SQLERRM;
  END;
  INSERT INTO phase8_matrix VALUES (
    'party_uuid_rejected',
    party_uuid_error = 'UUIDs are immutable (parties)'
      AND (SELECT to_jsonb(row_alias) FROM registry.parties AS row_alias WHERE party_id = party_id_value) = before_party,
    party_uuid_error
  );
  DELETE FROM registry.parties WHERE party_id = party_id_value;
  DELETE FROM registry.companies WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES (
    'party_insert_delete',
    (SELECT count(*) FROM registry.parties) = 24 AND (SELECT count(*) FROM registry.companies) = 1,
    'removed'
  );

  INSERT INTO phase8_matrix VALUES (
    'execute_privileges',
    NOT has_function_privilege('anon', 'registry.forbid_uuid_change()', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'registry.forbid_uuid_change()', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'registry.forbid_uuid_change()', 'EXECUTE')
      AND (
        SELECT proacl::text FROM pg_proc
        JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE nspname = 'registry' AND proname = 'forbid_uuid_change'
      ) = '{postgres=X/postgres}',
    'acl'
  );
END
$behavior$;

DO $unexpected$
DECLARE
  unexpected_error text;
BEGIN
  CREATE TEMP TABLE uuid_guard_other (id integer, updated_at timestamptz);
  CREATE TRIGGER uuid_guard_other_trg
    BEFORE UPDATE ON uuid_guard_other
    FOR EACH ROW
    EXECUTE FUNCTION registry.forbid_uuid_change();
  INSERT INTO uuid_guard_other VALUES (1, now());
  BEGIN
    UPDATE uuid_guard_other SET id = 2 WHERE id = 1;
    unexpected_error := 'success';
  EXCEPTION WHEN OTHERS THEN
    unexpected_error := SQLERRM;
  END;
  DROP TRIGGER uuid_guard_other_trg ON uuid_guard_other;
  DROP TABLE uuid_guard_other;
  INSERT INTO phase8_matrix VALUES ('unexpected_table', unexpected_error = 'BLOCKED_BY_UUID_GUARD_TABLE', unexpected_error);
END
$unexpected$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $phase8_run$
@@MIGRATION@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260927260000', 'companies_uuid_guard_table_safe');

DO $rollback_probes$
BEGIN
  BEGIN
    DROP TRIGGER companies_uuid_guard ON registry.companies;
    EXECUTE $phase8_run$
@@ROLLBACK@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('rollback_missing_trigger', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    CREATE OR REPLACE FUNCTION registry.forbid_uuid_change()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $drifted$
    BEGIN
      RETURN NEW;
    END
    $drifted$;
    EXECUTE $phase8_run$
@@ROLLBACK@@
$phase8_run$;
    RAISE EXCEPTION 'phase8_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase8_matrix VALUES ('rollback_function_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;
END
$rollback_probes$;

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927260000';

DO $restored$
DECLARE
  company_id_value uuid;
  company_update text;
BEGIN
  INSERT INTO registry.companies (canonical_name) VALUES ('uuid-guard-probe') RETURNING company_id INTO company_id_value;
  BEGIN
    UPDATE registry.companies SET canonical_name = canonical_name WHERE company_id = company_id_value;
    company_update := 'success';
  EXCEPTION WHEN OTHERS THEN
    company_update := SQLERRM;
  END;
  DELETE FROM registry.companies WHERE company_id = company_id_value;
  INSERT INTO phase8_matrix VALUES (
    'defect_restored',
    company_update = 'record "new" has no field "party_id"'
      AND (SELECT md5(prosrc) FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
        WHERE nspname = 'registry' AND proname = 'forbid_uuid_change') = '1a56112bb0b16e14ea9407cef27bd7b5',
    company_update
  );
END
$restored$;

INSERT INTO phase8_matrix VALUES (
  'clean_rollback',
  (SELECT count(*) FROM supabase_migrations.schema_migrations) = 187
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') = 0
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') = 1
    AND (SELECT count(*) FROM registry.companies) = 1
    AND (SELECT count(*) FROM registry.companies WHERE company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f' AND status = 'active') = 1
    AND (SELECT count(*) FROM access.company_memberships) = 1
    AND (SELECT count(*) FROM registry.parties) = 24
    AND (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias) = '69abde521c603f79ad8514cfb08a1658'
    AND (SELECT md5(coalesce(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.party_id), '')) FROM registry.parties AS row_alias) = 'a37321b5dd81cdfb674386c97c82101c'
    AND (SELECT md5(prosrc) FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace WHERE nspname = 'registry' AND proname = 'forbid_uuid_change') = '1a56112bb0b16e14ea9407cef27bd7b5'
    AND (SELECT md5(pg_get_functiondef(proc.oid)) FROM pg_proc AS proc JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change') = '5181844513754066b432e1a529ad84e3'
    AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'companies_uuid_guard' AND tgenabled = 'O' AND md5(pg_get_triggerdef(oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c') = 1
    AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'parties_uuid_guard' AND tgenabled = 'O' AND md5(pg_get_triggerdef(oid)) = '495f8ad6dcc449e20c4ded2e8aaab021') = 1
    AND (SELECT count(*) FROM public.v_certified_ledger_transactions) = 2254
    AND (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) = 12549078.54
    AND (SELECT count(*) FROM pms.connections) = 1
    AND (SELECT count(*) FROM pms.property_mappings) = 8,
  'restored'
);

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase8_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase8_matrix),
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') = 0,
  'company_fp', (SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.company_id)) FROM registry.companies AS row_alias),
  'src', (SELECT md5(prosrc) FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace WHERE nspname = 'registry' AND proname = 'forbid_uuid_change'),
  'detail', (SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json) FROM phase8_matrix WHERE NOT ok)
) AS matrix;
