-- Transaction matrix for 20260927160000. The runner supplies the migration and rollback.
-- Drift and write probes roll back with the exception. The outer ROLLBACK restores Production.

CREATE TEMP TABLE phase6_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE phase6_matrix TO anon, authenticated, service_role;

CREATE TEMP TABLE phase6_before AS
SELECT
  id,
  updated_at,
  operating_company_id,
  to_jsonb(row_alias) - 'operating_company_id' - 'updated_at' AS business
FROM finance.agent_transaction_drafts AS row_alias;

DO $probes$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_user uuid := gen_random_uuid();
  foreign_company uuid;
  definition text;
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260927160000', 'agent_transaction_drafts_operating_company_write_guard');
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('history_present', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, payer_input, payee_input, amount_eur,
      client_charge, description, notes, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', NULL, NULL, NULL,
      NULL, NULL, NULL, 'manual_form', 1, 'phase6-extra-count'
    );
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('row_count', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: row count', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = NULL
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('null_assignment', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: null', SQLERRM);
  END;

  BEGIN
    foreign_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (foreign_company, 'phase6-foreign', 'inactive');
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = foreign_company
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('other_company', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: other company', SQLERRM);
  END;

  BEGIN
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (gen_random_uuid(), 'phase6-second', 'active');
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('second_company', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: company registry', SQLERRM);
  END;

  BEGIN
    ALTER TABLE registry.companies DISABLE TRIGGER companies_uuid_guard;
    UPDATE registry.companies SET status = 'inactive' WHERE status = 'active';
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('zero_active_registry', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: company registry', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET schema_version = schema_version
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('fingerprint', SQLERRM = 'BLOCKED_BY_ASSIGNMENT: fingerprint', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DROP COLUMN operating_company_id;
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('column_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    ALTER TABLE finance.agent_transaction_drafts
      ADD CONSTRAINT agent_transaction_drafts_operating_company_fk
      FOREIGN KEY (operating_company_id)
      REFERENCES registry.companies (company_id)
      ON DELETE CASCADE;
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('fk_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    CREATE UNIQUE INDEX agent_transaction_drafts_operating_company_id_idx
      ON finance.agent_transaction_drafts (id);
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('index_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    SELECT pg_get_functiondef(proc.oid)
      INTO definition
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname = 'list_agent_transaction_drafts';
    definition := replace(definition, 'IF auth.uid() IS NULL THEN', 'IF auth.uid() IS NULL THEN /*phase6*/');
    IF position('/*phase6*/' in definition) = 0 THEN
      RAISE EXCEPTION 'phase6_rpc_replace_missed';
    END IF;
    EXECUTE definition;
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('rpc_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;

  BEGIN
    CREATE POLICY phase6_drift_policy
      ON finance.agent_transaction_drafts
      FOR SELECT
      TO authenticated
      USING (false);
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('rls_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('trigger_disabled', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    DROP TRIGGER trg_agent_tx_drafts_guard ON finance.agent_transaction_drafts;
    CREATE TRIGGER trg_agent_tx_drafts_guard
      AFTER UPDATE ON finance.agent_transaction_drafts
      FOR EACH ROW EXECUTE FUNCTION finance.trg_agent_tx_drafts_guard();
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('trigger_drift', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;
END
$probes$;

INSERT INTO phase6_matrix VALUES (
  'probes_restored',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 0
    AND (SELECT count(*) FROM registry.companies WHERE status = 'active') = 1
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations) = 184
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') = 0
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = 'd7d613bf138b734626f9a82df3ac7075'
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc AS proc
      JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = 'finance' AND proc.proname = 'enforce_agent_transaction_draft_company'
    ),
  'original'
);

@@MIGRATION@@

DO $writes$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  sole_company uuid;
  staff_user uuid;
  probe_user uuid;
  assigned uuid;
  new_updated timestamptz;
  old_updated timestamptz;
  inactive_company uuid;
  second_company uuid;
BEGIN
  SELECT company_id INTO sole_company FROM registry.companies WHERE status = 'active';
  SELECT user_id INTO staff_user FROM public.jj_staff_config WHERE is_active;

  INSERT INTO phase6_matrix VALUES (
    'enforcement_installed',
    sole_company = pinned_company
      AND (SELECT count(*) FROM pg_proc AS proc
           JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
           WHERE namespace.nspname = 'finance'
             AND proc.proname = 'enforce_agent_transaction_draft_company'
             AND proc.prosecdef
             AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5') = 1
      AND (SELECT count(*) FROM pg_trigger AS trigger_row
           WHERE NOT trigger_row.tgisinternal
             AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
             AND trigger_row.tgenabled = 'O'
             AND trigger_row.tgtype = 23
             AND md5(pg_get_triggerdef(trigger_row.oid)) = '7dcd0c77d19854e707bbaa59bbf752cd') = 1
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
      AND coalesce((
        SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
        FROM finance.agent_transaction_drafts AS row_alias
      ), 'empty') = 'd7d613bf138b734626f9a82df3ac7075',
    'installed'
  );

  BEGIN
    IF (SELECT count(*) FROM public.jj_staff_config WHERE is_active) <> 1 THEN
      RAISE EXCEPTION 'staff count';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', staff_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user)::text, true);
    PERFORM public.create_agent_transaction_draft(
      DATE '2026-09-27', NULL, '', 'phase6', 'probe',
      NULL, NULL, NULL, NULL, NULL, NULL,
      'needs_review', 'phase6-rpc-' || gen_random_uuid()::text, 'manual_form', 1
    );
    SELECT operating_company_id INTO assigned
    FROM finance.agent_transaction_drafts
    WHERE idempotency_key LIKE 'phase6-rpc-%';
    IF assigned IS DISTINCT FROM sole_company OR assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'rpc assignment missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('rpc_omitted', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-direct-omit'
    ) RETURNING operating_company_id INTO assigned;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'direct assignment missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('direct_omitted', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-explicit-null', NULL
    ) RETURNING operating_company_id INTO assigned;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'null assignment missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('explicit_null', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-explicit-canonical', sole_company
    ) RETURNING operating_company_id INTO assigned;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'canonical assignment missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('explicit_canonical', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-unknown', gen_random_uuid()
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('unknown_company', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    inactive_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (inactive_company, 'phase6-inactive', 'inactive');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-inactive', inactive_company
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('inactive_company', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE registry.companies DISABLE TRIGGER companies_uuid_guard;
    UPDATE registry.companies SET status = 'inactive' WHERE status = 'active';
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-zero-omit'
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('zero_omitted', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE registry.companies DISABLE TRIGGER companies_uuid_guard;
    UPDATE registry.companies SET status = 'inactive' WHERE status = 'active';
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-zero-explicit', pinned_company
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('zero_explicit', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase6-two', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-two-omit'
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('two_omitted', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase6-two-b', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-two-canonical', pinned_company
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('two_explicit_canonical', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase6-two-c', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-two-other', second_company
    );
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('two_explicit_other', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    GRANT SELECT, INSERT ON TABLE finance.agent_transaction_drafts TO service_role;
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    SET LOCAL ROLE service_role;
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-service-omit'
    ) RETURNING operating_company_id INTO assigned;
    RESET ROLE;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'service assignment missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES ('service_role_assigns', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    GRANT SELECT, INSERT ON TABLE finance.agent_transaction_drafts TO service_role;
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    SET LOCAL ROLE service_role;
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase6', 'probe', 'manual_form', 1, 'phase6-service-wrong', gen_random_uuid()
    );
    RESET ROLE;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES ('service_role_rejects', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = gen_random_uuid()
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('update_reassign', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = NULL
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('update_null', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
  END;

  BEGIN
    SELECT updated_at INTO old_updated
    FROM phase6_before
    ORDER BY id
    LIMIT 1;
    UPDATE finance.agent_transaction_drafts
    SET notes = notes
    WHERE id = (SELECT id FROM phase6_before ORDER BY id LIMIT 1)
    RETURNING updated_at INTO new_updated;
    IF new_updated IS DISTINCT FROM transaction_timestamp()
       OR new_updated IS NOT DISTINCT FROM old_updated THEN
      RAISE EXCEPTION 'updated_at guard missed';
    END IF;
    RAISE EXCEPTION 'phase6_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('ordinary_update', SQLERRM = 'phase6_probe_done', SQLERRM);
  END;

  BEGIN
    DELETE FROM finance.agent_transaction_drafts
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES (
      'guard_delete',
      SQLERRM = 'agent_transaction_drafts forbids physical DELETE',
      SQLERRM
    );
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET created_by = gen_random_uuid()
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES (
      'guard_identity',
      SQLERRM = 'agent_transaction_drafts identity columns are immutable',
      SQLERRM
    );
  END;

  BEGIN
    EXECUTE $phase6_run$
@@MIGRATION@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$writes$;

DO $acl$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       CROSS JOIN LATERAL aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) AS acl
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
         AND acl.privilege_type = 'EXECUTE'
         AND (
           acl.grantee = 0
           OR acl.grantee IN (
             SELECT role_row.oid FROM pg_roles AS role_row
             WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role')
           )
         )
     )
     OR (
       SELECT proc.proacl::text
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'finance'
         AND proc.proname = 'enforce_agent_transaction_draft_company'
     ) IS DISTINCT FROM '{postgres=X/postgres}' THEN
    INSERT INTO phase6_matrix VALUES ('function_acl', false, 'widened');
  ELSE
    INSERT INTO phase6_matrix VALUES ('function_acl', true, 'owner execute only');
  END IF;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES ('direct_execute_anon', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES (
      'direct_execute_anon',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES ('direct_execute_authenticated', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES (
      'direct_execute_authenticated',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES ('direct_execute_service_role', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase6_matrix VALUES (
      'direct_execute_service_role',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;
END
$acl$;

INSERT INTO phase6_matrix VALUES (
  'writes_restored',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM registry.companies) = 1
    AND (SELECT count(*) FROM registry.companies WHERE status = 'active') = 1
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = 'd7d613bf138b734626f9a82df3ac7075'
    AND NOT EXISTS (
      SELECT 1
      FROM finance.agent_transaction_drafts AS live
      JOIN phase6_before AS before_row ON before_row.id = live.id
      WHERE live.updated_at IS DISTINCT FROM before_row.updated_at
         OR live.operating_company_id IS DISTINCT FROM before_row.operating_company_id
         OR (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
    )
    AND (
      SELECT count(*) FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
    ) = 1,
  'held'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260927160000', 'agent_transaction_drafts_operating_company_write_guard');

DO $rollback_probes$
BEGIN
  BEGIN
    DROP TRIGGER trg_agent_tx_drafts_company ON finance.agent_transaction_drafts;
    EXECUTE $phase6_run$
@@ROLLBACK@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('rollback_missing_trigger', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    CREATE OR REPLACE FUNCTION finance.enforce_agent_transaction_draft_company()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $drift$
    BEGIN
      RETURN NEW;
    END
    $drift$;
    EXECUTE $phase6_run$
@@ROLLBACK@@
$phase6_run$;
    RAISE EXCEPTION 'phase6_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase6_matrix VALUES ('rollback_drifted_function', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;
END
$rollback_probes$;

INSERT INTO phase6_matrix VALUES (
  'rollback_kept_enforcement',
  (SELECT count(*) FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'finance'
      AND proc.proname = 'enforce_agent_transaction_draft_company'
      AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5') = 1
    AND (SELECT count(*) FROM pg_trigger AS trigger_row
         WHERE NOT trigger_row.tgisinternal
           AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
           AND md5(pg_get_triggerdef(trigger_row.oid)) = '7dcd0c77d19854e707bbaa59bbf752cd') = 1
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 2,
  'held'
);

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260927160000';

INSERT INTO phase6_matrix VALUES (
  'clean_rollback',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 0
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = 'd7d613bf138b734626f9a82df3ac7075'
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = '6c97411f192611b3070d9df7369435d8'
    AND NOT EXISTS (
      SELECT 1
      FROM finance.agent_transaction_drafts AS live
      JOIN phase6_before AS before_row ON before_row.id = live.id
      WHERE live.updated_at IS DISTINCT FROM before_row.updated_at
         OR (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc AS proc
      JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = 'finance' AND proc.proname = 'enforce_agent_transaction_draft_company'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
    )
    AND (
      SELECT count(*) FROM pg_trigger AS trigger_row
      JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgtype = 31
        AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
        AND md5(proc.prosrc) = 'e85ac033cf3a30443ecbbe777e1c81ff'
    ) = 1
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations) = 184
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') = 0
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') = 1,
  'removed'
);

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase6_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase6_matrix),
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') = 0,
  'fn_src', (
    SELECT md5(proc.prosrc)
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'finance' AND proc.proname = 'enforce_agent_transaction_draft_company'
  ),
  'detail', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase6_matrix
    WHERE NOT ok
  )
) AS matrix;
