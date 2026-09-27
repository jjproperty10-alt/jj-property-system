-- Transaction matrix for 20260927120000. The runner supplies the migration and rollback.
-- Probe rows stay inside subtransactions. No second company is created.

CREATE TEMP TABLE phase4_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

DO $checks$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  probe_user uuid := gen_random_uuid();
  company uuid;
  object_count integer;
BEGIN
  SELECT
    (SELECT count(*) FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'finance' AND relation.relname = 'agent_transaction_drafts'
        AND attribute.attname = 'operating_company_id' AND NOT attribute.attisdropped)
    + (SELECT count(*) FROM pg_constraint WHERE conname = 'agent_transaction_drafts_operating_company_fk')
    + (SELECT count(*) FROM pg_class AS index_relation
        JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
        WHERE index_namespace.nspname = 'finance'
          AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx')
    INTO object_count;
  INSERT INTO phase4_matrix VALUES (
    'objects_created',
    object_count = 3,
    object_count::text
  );
  INSERT INTO phase4_matrix VALUES (
    'rows_null',
    (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) = 2,
    (SELECT count(*) FROM finance.agent_transaction_drafts)::text
  );
  INSERT INTO phase4_matrix VALUES (
    'fingerprint',
    coalesce((
      SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id))
      FROM finance.agent_transaction_drafts AS row_alias
    ), 'empty') = 'ca713ec102eb2bda0bdfe72fe53a4847',
    'pinned'
  );
  INSERT INTO phase4_matrix VALUES (
    'rpc_rls',
    (
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
      WHERE namespace.nspname = 'finance' AND relation.relname = 'agent_transaction_drafts'
    ) = '68b7d11d856c6c9065984bdbeb85daad'
    AND (
      SELECT count(*)
      FROM pg_proc AS proc
      JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
      WHERE namespace.nspname = 'public'
        AND (
          (proc.proname = 'create_agent_transaction_draft' AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a' AND md5(pg_get_function_result(proc.oid)) = '79e5b914ba6ac4010adcafc63648c4e9' AND position('operating_company_id' in proc.prosrc) = 0)
          OR (proc.proname = 'list_agent_transaction_drafts' AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b' AND md5(pg_get_function_result(proc.oid)) = '61fdf727bfee7ed885e9e9502ca12ad0' AND position('operating_company_id' in pg_get_function_result(proc.oid)) = 0)
        )
    ) = 2,
    'pinned'
  );

  PERFORM set_config('request.jwt.claim.sub', probe_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', probe_user)::text, true);

  BEGIN
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, payer_input, payee_input, amount_eur,
      client_charge, description, notes, source_type, schema_version, idempotency_key
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase4', 'probe', NULL, NULL, NULL,
      NULL, NULL, NULL, 'manual_form', 1, 'phase4-omit'
    ) RETURNING operating_company_id INTO company;
    IF company IS NOT NULL OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 3 THEN
      RAISE EXCEPTION 'omit insert assigned a company';
    END IF;
    RAISE EXCEPTION 'phase4_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('omit_insert', SQLERRM = 'phase4_probe_done', SQLERRM);
  END;

  BEGIN
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, payer_input, payee_input, amount_eur,
      client_charge, description, notes, source_type, schema_version, idempotency_key,
      operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase4', 'probe', NULL, NULL, NULL,
      NULL, NULL, NULL, 'manual_form', 1, 'phase4-explicit',
      jj_company
    ) RETURNING operating_company_id INTO company;
    IF company IS DISTINCT FROM jj_company THEN
      RAISE EXCEPTION 'explicit company mismatch';
    END IF;
    RAISE EXCEPTION 'phase4_probe_done';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('explicit_company', SQLERRM = 'phase4_probe_done', SQLERRM);
  END;

  BEGIN
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, property_id, property_name_input,
      category, subcategory, payer_input, payee_input, amount_eur,
      client_charge, description, notes, source_type, schema_version, idempotency_key,
      operating_company_id
    ) VALUES (
      probe_user, 'needs_review', DATE '2026-09-27', NULL, '',
      'phase4', 'probe', NULL, NULL, NULL,
      NULL, NULL, NULL, 'manual_form', 1, 'phase4-unknown',
      '00000000-0000-0000-0000-0000000000aa'
    );
    INSERT INTO phase4_matrix VALUES ('unknown_company', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('unknown_company', SQLSTATE = '23503', SQLSTATE);
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  BEGIN
    PERFORM * FROM public.create_agent_transaction_draft(
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );
    INSERT INTO phase4_matrix VALUES ('create_rpc', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('create_rpc', SQLERRM = 'not authenticated', SQLERRM);
  END;

  BEGIN
    PERFORM * FROM public.list_agent_transaction_drafts();
    INSERT INTO phase4_matrix VALUES ('list_rpc', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('list_rpc', SQLERRM = 'not authenticated', SQLERRM);
  END;

  BEGIN
    EXECUTE $phase4_run$
@@MIGRATION@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('reapply', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('reapply', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT%', SQLERRM);
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    ALTER TABLE finance.agent_transaction_drafts
      DROP COLUMN operating_company_id;
    ALTER TABLE finance.agent_transaction_drafts
      ADD COLUMN operating_company_id text;
    EXECUTE $phase4_run$
@@MIGRATION@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('column_drift', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('column_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT%', SQLERRM);
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    ALTER TABLE finance.agent_transaction_drafts
      ADD CONSTRAINT agent_transaction_drafts_operating_company_fk
      FOREIGN KEY (operating_company_id)
      REFERENCES registry.companies (company_id)
      ON DELETE CASCADE;
    EXECUTE $phase4_run$
@@MIGRATION@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('fk_drift', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('fk_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT%', SQLERRM);
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    CREATE UNIQUE INDEX agent_transaction_drafts_operating_company_id_idx
      ON finance.agent_transaction_drafts (operating_company_id);
    EXECUTE $phase4_run$
@@MIGRATION@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('index_drift', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES ('index_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT%', SQLERRM);
  END;

  INSERT INTO phase4_matrix VALUES (
    'drift_restored',
    (
      SELECT count(*)
      FROM pg_attribute AS attribute
      JOIN pg_class AS relation ON relation.oid = attribute.attrelid
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'finance'
        AND relation.relname = 'agent_transaction_drafts'
        AND attribute.attname = 'operating_company_id'
        AND attribute.atttypid = 'uuid'::regtype
        AND attribute.attnotnull = false
        AND attribute.atthasdef = false
    ) = 1
    AND (
      SELECT company_fk.confdeltype = 'r' AND index_row.indisunique = false
      FROM pg_constraint AS company_fk
      JOIN pg_class AS index_relation ON index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
      JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
      WHERE company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
    ),
    'restored'
  );

  INSERT INTO supabase_migrations.schema_migrations (version, name)
  VALUES ('20260927120000', 'agent_transaction_drafts_operating_company_id');

  BEGIN
    UPDATE finance.agent_transaction_drafts
    SET operating_company_id = jj_company
    WHERE id = (SELECT id FROM finance.agent_transaction_drafts ORDER BY id LIMIT 1);
    EXECUTE $phase4_run$
@@ROLLBACK@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('rollback_assigned', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES (
      'rollback_assigned',
      SQLERRM = 'BLOCKED_BY_ROLLBACK: assigned value',
      SQLERRM
    );
  END;

  BEGIN
    ALTER TABLE finance.agent_transaction_drafts
      DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;
    EXECUTE $phase4_run$
@@ROLLBACK@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('rollback_missing_fk', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES (
      'rollback_missing_fk',
      SQLERRM = 'BLOCKED_BY_ROLLBACK',
      SQLERRM
    );
  END;

  BEGIN
    DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;
    EXECUTE $phase4_run$
@@ROLLBACK@@
$phase4_run$;
    INSERT INTO phase4_matrix VALUES ('rollback_missing_index', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase4_matrix VALUES (
      'rollback_missing_index',
      SQLERRM = 'BLOCKED_BY_ROLLBACK',
      SQLERRM
    );
  END;

  INSERT INTO phase4_matrix VALUES (
    'failed_rollback_kept_objects',
    (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NOT NULL) = 0
      AND (SELECT count(*) FROM pg_constraint WHERE conname = 'agent_transaction_drafts_operating_company_fk') = 1
      AND (SELECT count(*) FROM pg_class WHERE relname = 'agent_transaction_drafts_operating_company_id_idx') = 1
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2,
    'kept'
  );
END
$checks$;

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927120000';

INSERT INTO phase4_matrix VALUES (
  'clean_rollback',
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
      AND attribute.attname = 'operating_company_id'
      AND NOT attribute.attisdropped
  )
  AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_transaction_drafts_operating_company_fk')
  AND NOT EXISTS (
    SELECT 1 FROM pg_class AS index_relation
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    WHERE index_namespace.nspname = 'finance'
      AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
  )
  AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
  AND coalesce((
    SELECT md5(string_agg(to_jsonb(row_alias)::text, ',' ORDER BY row_alias.id))
    FROM finance.agent_transaction_drafts AS row_alias
  ), 'empty') = 'ca713ec102eb2bda0bdfe72fe53a4847',
  'removed'
);

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase4_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase4_matrix),
  'rows', (SELECT count(*) FROM finance.agent_transaction_drafts),
  'column_absent', NOT EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
      AND attribute.attname = 'operating_company_id'
      AND NOT attribute.attisdropped
  ),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') = 0,
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'detail', (
    SELECT coalesce(json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step), '[]'::json)
    FROM phase4_matrix
  )
) AS matrix;
