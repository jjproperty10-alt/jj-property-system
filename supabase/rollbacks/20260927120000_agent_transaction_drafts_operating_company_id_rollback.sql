-- Rollback for 20260927120000_agent_transaction_drafts_operating_company_id.
-- Drops the index, the foreign key, and the column only while every value is null.
-- Does not delete a draft row.

BEGIN;

DO $rollback$
DECLARE
  column_count integer;
  foreign_key_count integer;
  index_count integer;
  unexpected_dependency_count integer;
  reviewed_dependency_count integer;
  security_hash text;
BEGIN
  LOCK TABLE finance.agent_transaction_drafts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF to_regclass('finance.agent_transaction_drafts') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  SELECT count(*) INTO column_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts'
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.atttypid = 'uuid'::regtype
    AND attribute.attnotnull = false
    AND attribute.atthasdef = false
    AND attribute.attgenerated = '';

  SELECT count(*) INTO foreign_key_count
  FROM pg_constraint AS company_fk
  JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
  JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
  JOIN pg_attribute AS local_column
    ON local_column.attrelid = owning.oid
   AND local_column.attnum = company_fk.conkey[1]
  JOIN pg_class AS referenced ON referenced.oid = company_fk.confrelid
  JOIN pg_namespace AS referenced_namespace ON referenced_namespace.oid = referenced.relnamespace
  JOIN pg_attribute AS referenced_column
    ON referenced_column.attrelid = referenced.oid
   AND referenced_column.attnum = company_fk.confkey[1]
  WHERE owning_namespace.nspname = 'finance'
    AND owning.relname = 'agent_transaction_drafts'
    AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
    AND company_fk.contype = 'f'
    AND company_fk.convalidated = true
    AND company_fk.confdeltype = 'r'
    AND company_fk.condeferrable = false
    AND company_fk.condeferred = false
    AND cardinality(company_fk.conkey) = 1
    AND cardinality(company_fk.confkey) = 1
    AND local_column.attname = 'operating_company_id'
    AND referenced_namespace.nspname = 'registry'
    AND referenced.relname = 'companies'
    AND referenced_column.attname = 'company_id';

  SELECT count(*) INTO index_count
  FROM pg_index AS index_row
  JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
  JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
  JOIN pg_attribute AS indexed_column
    ON indexed_column.attrelid = table_relation.oid
   AND indexed_column.attnum = index_row.indkey[0]
  WHERE index_namespace.nspname = 'finance'
    AND table_namespace.nspname = 'finance'
    AND table_relation.relname = 'agent_transaction_drafts'
    AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
    AND indexed_column.attname = 'operating_company_id'
    AND index_row.indisvalid = true
    AND index_row.indisready = true
    AND index_row.indisunique = false
    AND index_row.indexprs IS NULL
    AND index_row.indpred IS NULL
    AND index_row.indnkeyatts = 1
    AND index_row.indnatts = 1;

  IF column_count <> 1 OR foreign_key_count <> 1 OR index_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR EXISTS (
       SELECT 1 FROM finance.agent_transaction_drafts WHERE operating_company_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: assigned value';
  END IF;

  SELECT count(*) INTO unexpected_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts'
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND (
      dependency.classid IN (
        'pg_policy'::regclass,
        'pg_rewrite'::regclass,
        'pg_trigger'::regclass,
        'pg_proc'::regclass,
        'pg_attrdef'::regclass
      )
      OR NOT (
        (
          dependency.classid = 'pg_constraint'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_constraint AS company_fk
            WHERE company_fk.oid = dependency.objid
              AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
          )
        )
        OR (
          dependency.classid = 'pg_class'::regclass
          AND EXISTS (
            SELECT 1
            FROM pg_class AS index_relation
            JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
            WHERE index_relation.oid = dependency.objid
              AND index_namespace.nspname = 'finance'
              AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
          )
        )
      )
    );

  SELECT count(DISTINCT dependency.objid) INTO reviewed_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE dependency.refclassid = 'pg_class'::regclass
    AND namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts'
    AND attribute.attname = 'operating_company_id'
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND (
      (
        dependency.classid = 'pg_constraint'::regclass
        AND EXISTS (
          SELECT 1 FROM pg_constraint AS company_fk
          WHERE company_fk.oid = dependency.objid
            AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
        )
      )
      OR (
        dependency.classid = 'pg_class'::regclass
        AND EXISTS (
          SELECT 1
          FROM pg_class AS index_relation
          JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
          WHERE index_relation.oid = dependency.objid
            AND index_namespace.nspname = 'finance'
            AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
        )
      )
    );

  IF unexpected_dependency_count <> 0 OR reviewed_dependency_count <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_publication_rel AS publication_rel ON publication_rel.prrelid = relation.oid
    WHERE namespace.nspname = 'finance'
      AND relation.relname = 'agent_transaction_drafts'
      AND attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND publication_rel.prattrs IS NOT NULL
      AND attribute.attnum = ANY (publication_rel.prattrs::smallint[])
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

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
    INTO security_hash
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'finance'
    AND relation.relname = 'agent_transaction_drafts';

  IF security_hash IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND (
           (proc.proname = 'create_agent_transaction_draft'
             AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a'
             AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51'
             AND md5(pg_get_function_result(proc.oid)) = '79e5b914ba6ac4010adcafc63648c4e9')
           OR (proc.proname = 'list_agent_transaction_drafts'
             AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b'
             AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa'
             AND md5(pg_get_function_result(proc.oid)) = '61fdf727bfee7ed885e9e9502ca12ad0')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;
END
$rollback$;

DROP INDEX finance.agent_transaction_drafts_operating_company_id_idx;

ALTER TABLE finance.agent_transaction_drafts
  DROP CONSTRAINT agent_transaction_drafts_operating_company_fk;

ALTER TABLE finance.agent_transaction_drafts
  DROP COLUMN operating_company_id;

DO $rollback_after$
BEGIN
  IF EXISTS (
       SELECT 1
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND attribute.attnum > 0
         AND NOT attribute.attisdropped
     )
     OR (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: requirement remains';
  END IF;
END
$rollback_after$;

COMMIT;
