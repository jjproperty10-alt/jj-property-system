-- Transaction matrix for 20260927240000. The runner supplies the migration and rollback.
-- Drift and write probes roll back with the exception. The outer ROLLBACK restores Production.

CREATE TEMP TABLE phase7_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE phase7_matrix TO anon, authenticated, service_role;

CREATE TEMP TABLE phase7_before AS
SELECT
  id,
  updated_at,
  operating_company_id,
  to_jsonb(row_alias) - 'operating_company_id' - 'updated_at' AS business
FROM finance.agent_transaction_drafts AS row_alias;

DO $probes$
DECLARE
  definition text;
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260927240000', 'agent_transaction_drafts_operating_company_not_null');
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('history_present', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DROP COLUMN operating_company_id;
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('column_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    ALTER TABLE finance.agent_transaction_drafts
      ADD CONSTRAINT agent_transaction_drafts_operating_company_fk
      FOREIGN KEY (operating_company_id)
      REFERENCES registry.companies (company_id)
      ON DELETE CASCADE;
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('fk_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    CREATE UNIQUE INDEX agent_transaction_drafts_operating_company_id_idx
      ON finance.agent_transaction_drafts (id);
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('index_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('original_guard_disabled', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_company;
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('company_trigger_disabled', SQLERRM = 'BLOCKED_BY_TRIGGER: company', SQLERRM);
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
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('company_function_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: company function', SQLERRM);
  END;

  BEGIN
    SELECT pg_get_functiondef(proc.oid)
      INTO definition
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname = 'list_agent_transaction_drafts';
    definition := replace(definition, 'IF auth.uid() IS NULL THEN', 'IF auth.uid() IS NULL THEN /*phase7*/');
    IF position('/*phase7*/' in definition) = 0 THEN
      RAISE EXCEPTION 'phase7_rpc_replace_missed';
    END IF;
    EXECUTE definition;
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('rpc_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;

  BEGIN
    CREATE POLICY phase7_drift_policy
      ON finance.agent_transaction_drafts
      FOR SELECT
      TO authenticated
      USING (false);
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('rls_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;
END
$probes$;

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

  INSERT INTO phase7_matrix VALUES (
    'not_null_installed',
    sole_company = pinned_company
      AND (
        SELECT attribute.attnotnull
          AND NOT attribute.atthasdef
          AND attribute.attgenerated = ''
          AND attribute.atttypid = 'uuid'::regtype
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'finance'
          AND relation.relname = 'agent_transaction_drafts'
          AND attribute.attname = 'operating_company_id'
          AND NOT attribute.attisdropped
      )
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
      AND coalesce((
        SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
        FROM finance.agent_transaction_drafts AS row_alias
      ), 'empty') = 'd7d613bf138b734626f9a82df3ac7075'
      AND coalesce((
        SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
        FROM finance.agent_transaction_drafts AS row_alias
      ), 'empty') = '6c97411f192611b3070d9df7369435d8',
    'installed'
  );

  BEGIN
    IF (SELECT count(*) FROM public.jj_staff_config WHERE is_active) <> 1 THEN
      RAISE EXCEPTION 'staff count';
    END IF;
    SELECT user_id INTO staff_user FROM public.jj_staff_config WHERE is_active;
    PERFORM set_config('request.jwt.claim.sub', staff_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user)::text, true);
    PERFORM public.create_agent_transaction_draft(
      DATE '2026-09-27', NULL, '', 'phase7', 'probe',
      NULL, NULL, NULL, NULL, NULL, NULL,
      'needs_review', 'phase7-rpc-' || gen_random_uuid()::text, 'manual_form', 1
    );
    SELECT operating_company_id INTO assigned
    FROM finance.agent_transaction_drafts
    WHERE idempotency_key LIKE 'phase7-rpc-%';
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'rpc assignment missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('rpc_omitted', SQLERRM = 'phase7_probe_done', SQLERRM);
  END;

  BEGIN
    IF (SELECT count(*) FROM public.jj_staff_config WHERE is_active) <> 1 THEN
      RAISE EXCEPTION 'staff count';
    END IF;
    SELECT user_id INTO staff_user FROM public.jj_staff_config WHERE is_active;
    PERFORM set_config('request.jwt.claim.sub', staff_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user)::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      staff_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase7', 'probe', 'manual_form', 1, 'phase7-auth-omit'
    ) RETURNING operating_company_id INTO assigned;
    RESET ROLE;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'authenticated assignment missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('direct_authenticated_omitted', SQLERRM = 'phase7_probe_done', SQLERRM);
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
      'phase7', 'probe', 'manual_form', 1, 'phase7-explicit-null', NULL
    ) RETURNING operating_company_id INTO assigned;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'null assignment missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('explicit_null', SQLERRM = 'phase7_probe_done', SQLERRM);
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
      'phase7', 'probe', 'manual_form', 1, 'phase7-explicit-canonical', sole_company
    ) RETURNING operating_company_id INTO assigned;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'canonical assignment missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('explicit_canonical', SQLERRM = 'phase7_probe_done', SQLERRM);
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
      'phase7', 'probe', 'manual_form', 1, 'phase7-unknown', gen_random_uuid()
    );
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('unknown_company', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    inactive_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (inactive_company, 'phase7-inactive', 'inactive');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase7', 'probe', 'manual_form', 1, 'phase7-inactive', inactive_company
    );
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('inactive_company', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase7-two', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase7', 'probe', 'manual_form', 1, 'phase7-two-omit'
    );
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('two_omitted', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase7-two-b', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase7', 'probe', 'manual_form', 1, 'phase7-two-canonical', pinned_company
    );
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('two_explicit_canonical', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    second_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (second_company, 'phase7-two-c', 'active');
    probe_user := gen_random_uuid();
    PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, source_type, schema_version, idempotency_key, operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase7', 'probe', 'manual_form', 1, 'phase7-two-other', second_company
    );
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('two_explicit_other', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
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
      'phase7', 'probe', 'manual_form', 1, 'phase7-service-omit'
    ) RETURNING operating_company_id INTO assigned;
    RESET ROLE;
    IF assigned IS DISTINCT FROM pinned_company THEN
      RAISE EXCEPTION 'service assignment missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('service_role_assigns', SQLERRM = 'phase7_probe_done', SQLERRM);
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
      'phase7', 'probe', 'manual_form', 1, 'phase7-service-wrong', gen_random_uuid()
    );
    RESET ROLE;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('service_role_rejects', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = gen_random_uuid()
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('update_reassign', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = NULL
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('update_null', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
  END;

  BEGIN
    SELECT updated_at INTO old_updated
    FROM phase7_before
    ORDER BY id
    LIMIT 1;
    UPDATE finance.agent_transaction_drafts
    SET schema_version = schema_version
    WHERE id = (SELECT id FROM phase7_before ORDER BY id LIMIT 1)
    RETURNING updated_at INTO new_updated;
    IF new_updated IS DISTINCT FROM transaction_timestamp()
       OR new_updated IS NOT DISTINCT FROM old_updated THEN
      RAISE EXCEPTION 'updated_at guard missed';
    END IF;
    RAISE EXCEPTION 'phase7_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('ordinary_update', SQLERRM = 'phase7_probe_done', SQLERRM);
  END;

  BEGIN
    EXECUTE $phase7_run$
@@MIGRATION@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$writes$;

DO $acl$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('direct_execute_anon', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES (
      'direct_execute_anon',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('direct_execute_authenticated', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES (
      'direct_execute_authenticated',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM finance.enforce_agent_transaction_draft_company();
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES ('direct_execute_service_role', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase7_matrix VALUES (
      'direct_execute_service_role',
      SQLERRM LIKE '%permission denied%' AND SQLERRM NOT LIKE '%can only be called as triggers%',
      SQLERRM
    );
  END;
END
$acl$;

INSERT INTO phase7_matrix VALUES (
  'rows_unchanged',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM registry.companies) = 1
    AND NOT EXISTS (
      SELECT 1
      FROM finance.agent_transaction_drafts AS live
      JOIN phase7_before AS before_row ON before_row.id = live.id
      WHERE live.updated_at IS DISTINCT FROM before_row.updated_at
         OR live.operating_company_id IS DISTINCT FROM before_row.operating_company_id
         OR (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
    )
    AND (
      SELECT attribute.attnotnull
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'finance'
        AND relation.relname = 'agent_transaction_drafts'
        AND attribute.attname = 'operating_company_id'
        AND NOT attribute.attisdropped
    ),
  'held'
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260927240000', 'agent_transaction_drafts_operating_company_not_null');

DO $rollback_probes$
BEGIN
  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      ALTER COLUMN operating_company_id DROP NOT NULL;
    EXECUTE $phase7_run$
@@ROLLBACK@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('rollback_column_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
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
    EXECUTE $phase7_run$
@@ROLLBACK@@
$phase7_run$;
    RAISE EXCEPTION 'phase7_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase7_matrix VALUES ('rollback_drifted_function', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;
END
$rollback_probes$;

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260927240000';

INSERT INTO phase7_matrix VALUES (
  'clean_rollback',
  (
    SELECT attribute.attnotnull = false
       AND attribute.atthasdef = false
       AND attribute.attgenerated = ''
       AND attribute.atttypid = 'uuid'::regtype
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
      AND attribute.attname = 'operating_company_id'
      AND NOT attribute.attisdropped
  )
  AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
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
    JOIN phase7_before AS before_row ON before_row.id = live.id
    WHERE live.updated_at IS DISTINCT FROM before_row.updated_at
       OR live.operating_company_id IS DISTINCT FROM before_row.operating_company_id
       OR (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
  )
  AND (
    SELECT count(*)
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'finance'
      AND proc.proname = 'enforce_agent_transaction_draft_company'
      AND md5(proc.prosrc) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
      AND md5(pg_get_functiondef(proc.oid)) = '73fd015810eeb121646bdfecf4fef0f8'
  ) = 1
  AND (
    SELECT count(*) FROM pg_trigger AS trigger_row
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgname = 'trg_agent_tx_drafts_company'
      AND trigger_row.tgenabled = 'O'
      AND trigger_row.tgtype = 23
      AND md5(pg_get_triggerdef(trigger_row.oid)) = '7dcd0c77d19854e707bbaa59bbf752cd'
  ) = 1
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
  AND (
    SELECT count(*)
    FROM pg_constraint AS company_fk
    WHERE company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
      AND company_fk.convalidated
      AND company_fk.confdeltype = 'r'
  ) = 1
  AND (
    SELECT count(*)
    FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'finance'
      AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
  ) = 1
  AND (
    SELECT md5(
      relation.relrowsecurity::text || '|' || relation.relforcerowsecurity::text || '|' ||
      coalesce(relation.relacl::text, '') || '|' ||
      coalesce((
        SELECT string_agg(
          policy.polname || ':' || policy.polcmd::text || ':' ||
          coalesce(pg_get_expr(policy.polqual, policy.polrelid), '') || ':' ||
          coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '') || ':' ||
          coalesce(policy.polroles::text, ''),
          ',' ORDER BY policy.polname
        ) FROM pg_policy AS policy WHERE policy.polrelid = relation.oid
      ), '')
    )
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
  ) = '68b7d11d856c6c9065984bdbeb85daad'
  AND (SELECT count(*) FROM supabase_migrations.schema_migrations) = 186
  AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') = 0
  AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927220000') = 1
  AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927160000') = 1,
  'nullable'
);

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase7_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase7_matrix),
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927240000') = 0,
  'nullable', (
    SELECT attribute.attnotnull = false
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
      AND attribute.attname = 'operating_company_id'
      AND NOT attribute.attisdropped
  ),
  'detail', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase7_matrix
    WHERE NOT ok
  )
) AS matrix;
