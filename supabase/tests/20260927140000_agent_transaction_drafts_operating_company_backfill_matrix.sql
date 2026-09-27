-- Transaction matrix for 20260927140000. The runner supplies the migration and rollback.
-- Drift probes roll back with the exception. The outer ROLLBACK restores Production.

CREATE TEMP TABLE phase5_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

CREATE TEMP TABLE phase5_before AS
SELECT
  id,
  updated_at,
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
    VALUES ('20260927140000', 'agent_transaction_drafts_operating_company_jj_backfill');
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('history_present', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
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
      'phase5', 'probe', NULL, NULL, NULL,
      NULL, NULL, NULL, 'manual_form', 1, 'phase5-extra'
    );
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('row_count', SQLERRM = 'BLOCKED_BY_BACKFILL: row count', SQLERRM);
  END;

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = pinned_company
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES (
      'preexisting_canonical',
      SQLERRM = 'BLOCKED_BY_BACKFILL: preexisting assignment',
      SQLERRM
    );
  END;

  BEGIN
    foreign_company := gen_random_uuid();
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (foreign_company, 'phase5-foreign', 'active');
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = foreign_company
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('other_company', SQLERRM = 'BLOCKED_BY_BACKFILL: other company', SQLERRM);
  END;

  BEGIN
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (gen_random_uuid(), 'phase5-second', 'active');
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('second_company', SQLERRM = 'BLOCKED_BY_BACKFILL: company registry', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DROP COLUMN operating_company_id;
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('column_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    ALTER TABLE finance.agent_transaction_drafts
      ADD CONSTRAINT agent_transaction_drafts_operating_company_fk
      FOREIGN KEY (operating_company_id)
      REFERENCES registry.companies (company_id)
      ON DELETE CASCADE;
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('fk_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    CREATE UNIQUE INDEX agent_transaction_drafts_operating_company_id_idx
      ON finance.agent_transaction_drafts (operating_company_id);
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('index_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT', SQLERRM);
  END;

  BEGIN
    SELECT pg_get_functiondef(proc.oid)
      INTO definition
    FROM pg_proc AS proc
    JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname = 'list_agent_transaction_drafts';
    definition := replace(definition, 'IF auth.uid() IS NULL THEN', 'IF auth.uid() IS NULL THEN /*phase5*/');
    IF position('/*phase5*/' in definition) = 0 THEN
      RAISE EXCEPTION 'phase5_rpc_replace_missed';
    END IF;
    EXECUTE definition;
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('rpc_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;

  BEGIN
    CREATE POLICY phase5_drift_policy
      ON finance.agent_transaction_drafts
      FOR SELECT
      TO authenticated
      USING (false);
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('rls_drift', SQLERRM = 'BLOCKED_BY_SCHEMA_DRIFT: draft contract', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('trigger_disabled', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    DROP TRIGGER trg_agent_tx_drafts_guard ON finance.agent_transaction_drafts;
    CREATE TRIGGER trg_agent_tx_drafts_guard
      AFTER UPDATE ON finance.agent_transaction_drafts
      FOR EACH ROW EXECUTE FUNCTION finance.trg_agent_tx_drafts_guard();
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES ('trigger_drift', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;
END
$probes$;

INSERT INTO phase5_matrix VALUES (
  'probes_restored',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 2
    AND (SELECT count(*) FROM registry.companies) = 1
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') = 0
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = 'ca713ec102eb2bda0bdfe72fe53a4847'
    AND NOT EXISTS (
      SELECT 1
      FROM finance.agent_transaction_drafts AS live
      JOIN phase5_before AS before_row ON before_row.id = live.id
      WHERE (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
         OR live.updated_at IS DISTINCT FROM before_row.updated_at
    )
    AND EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgtype = 31
        AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
    ),
  'original'
);

@@MIGRATION@@

DO $after_forward$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
BEGIN
  INSERT INTO phase5_matrix VALUES (
    'forward_assigned',
    (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = pinned_company) = 2
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS DISTINCT FROM pinned_company) = 0,
    '2'
  );
  INSERT INTO phase5_matrix VALUES (
    'business_fingerprint',
    coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = '6c97411f192611b3070d9df7369435d8',
    'pinned'
  );
  INSERT INTO phase5_matrix VALUES (
    'audit_timestamp',
    (
      SELECT count(*)
      FROM finance.agent_transaction_drafts AS live
      JOIN phase5_before AS before_row ON before_row.id = live.id
      WHERE live.updated_at = transaction_timestamp()
        AND live.updated_at IS DISTINCT FROM before_row.updated_at
    ) = 2,
    'trigger'
  );
  INSERT INTO phase5_matrix VALUES (
    'other_fields_unchanged',
    NOT EXISTS (
      SELECT 1
      FROM finance.agent_transaction_drafts AS live
      JOIN phase5_before AS before_row ON before_row.id = live.id
      WHERE (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS DISTINCT FROM before_row.business
    ),
    'business'
  );
  INSERT INTO phase5_matrix VALUES (
    'trigger_unchanged',
    (
      SELECT count(*)
      FROM pg_trigger AS trigger_row
      JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgtype = 31
        AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
        AND md5(proc.prosrc) = 'e85ac033cf3a30443ecbbe777e1c81ff'
        AND position('NEW.updated_at := now();' in proc.prosrc) > 0
    ) = 1,
    'enabled'
  );
  INSERT INTO phase5_matrix VALUES (
    'history_untouched',
    (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') = 0
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations) = 183,
    '183'
  );

  BEGIN
    EXECUTE $phase5_run$
@@MIGRATION@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES (
      'reapply',
      SQLERRM = 'BLOCKED_BY_BACKFILL: preexisting assignment',
      SQLERRM
    );
  END;
END
$after_forward$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260927140000', 'agent_transaction_drafts_operating_company_jj_backfill');

DO $rollback_probes$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  foreign_company uuid := gen_random_uuid();
BEGIN
  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = NULL
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase5_run$
@@ROLLBACK@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES (
      'rollback_one_null',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: null assignment',
      SQLERRM
    );
  END;

  BEGIN
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (foreign_company, 'phase5-mixed', 'active');
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = foreign_company
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase5_run$
@@ROLLBACK@@
$phase5_run$;
    RAISE EXCEPTION 'phase5_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase5_matrix VALUES (
      'rollback_mixed',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: mixed company',
      SQLERRM
    );
  END;
END
$rollback_probes$;

INSERT INTO phase5_matrix VALUES (
  'rollback_kept_assignment',
  (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 2
    AND (SELECT count(*) FROM registry.companies) = 1,
  'held'
);

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260927140000';

INSERT INTO phase5_matrix VALUES (
  'clean_rollback',
  (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 2
    AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NOT NULL) = 0
    AND coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = '6c97411f192611b3070d9df7369435d8'
    AND (
      SELECT count(*)
      FROM finance.agent_transaction_drafts AS live
      JOIN phase5_before AS before_row ON before_row.id = live.id
      WHERE live.updated_at = transaction_timestamp()
        AND live.updated_at IS DISTINCT FROM before_row.updated_at
        AND (to_jsonb(live) - 'operating_company_id' - 'updated_at') IS NOT DISTINCT FROM before_row.business
    ) = 2
    AND (
      SELECT count(*)
      FROM pg_trigger AS trigger_row
      WHERE NOT trigger_row.tgisinternal
        AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
        AND trigger_row.tgenabled = 'O'
        AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
    ) = 1
    AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') = 0,
  'null'
);

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase5_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase5_matrix),
  'null_rows', (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL),
  'business_fp', (
    SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
    FROM finance.agent_transaction_drafts AS row_alias
  ),
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') = 0,
  'detail', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase5_matrix
    WHERE NOT ok
  )
) AS matrix;
