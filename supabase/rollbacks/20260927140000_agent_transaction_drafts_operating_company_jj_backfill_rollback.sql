-- Clear the two draft company keys assigned to the single active JJ company.
-- Aborts before the UPDATE when a precondition fails.
-- Does not drop the column, foreign key, index, or guard trigger.
-- The guard trigger updates updated_at. That audit change is expected.

BEGIN;

DO $rollback$
DECLARE
  pinned_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  canonical uuid;
  cleared_rows integer;
BEGIN
  LOCK TABLE finance.agent_transaction_drafts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927120000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       JOIN pg_proc AS proc ON proc.oid = trigger_row.tgfoid
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 31
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
         AND md5(proc.prosrc) = 'e85ac033cf3a30443ecbbe777e1c81ff'
         AND md5(pg_get_functiondef(proc.oid)) = 'cdd89382a64e4236e2a3a855f6161c89'
         AND position('NEW.updated_at := now();' in proc.prosrc) > 0
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
       SELECT count(*)
       FROM pg_attribute AS attribute
       JOIN pg_class AS relation ON relation.oid = attribute.attrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND attribute.attname = 'operating_company_id'
         AND NOT attribute.attisdropped
         AND attribute.atttypid = 'uuid'::regtype
         AND attribute.attnotnull = false
         AND attribute.atthasdef = false
         AND attribute.attgenerated = ''
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_constraint AS company_fk
       JOIN pg_class AS owning ON owning.oid = company_fk.conrelid
       JOIN pg_namespace AS owning_namespace ON owning_namespace.oid = owning.relnamespace
       WHERE owning_namespace.nspname = 'finance'
         AND owning.relname = 'agent_transaction_drafts'
         AND company_fk.conname = 'agent_transaction_drafts_operating_company_fk'
         AND company_fk.contype = 'f'
         AND company_fk.convalidated = true
         AND company_fk.confdeltype = 'r'
         AND company_fk.condeferrable = false
     ) <> 1
     OR (
       SELECT count(*)
       FROM pg_class AS index_relation
       JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
       JOIN pg_index AS index_row ON index_row.indexrelid = index_relation.oid
       WHERE index_namespace.nspname = 'finance'
         AND index_relation.relname = 'agent_transaction_drafts_operating_company_id_idx'
         AND index_row.indisvalid
         AND index_row.indisready
         AND NOT index_row.indisunique
         AND index_row.indnkeyatts = 1
         AND index_row.indnatts = 1
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (
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
     ) IS DISTINCT FROM '68b7d11d856c6c9065984bdbeb85daad'
     OR (
       SELECT count(*)
       FROM pg_proc AS proc
       JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
       WHERE namespace.nspname = 'public'
         AND (
           (proc.proname = 'create_agent_transaction_draft'
             AND md5(proc.prosrc) = 'b21dc8fe041869cd7f790aca90e9372a'
             AND md5(pg_get_functiondef(proc.oid)) = 'a1ac6fe08d58ea0ee6865c77a628fa51')
           OR (proc.proname = 'list_agent_transaction_drafts'
             AND md5(proc.prosrc) = '7b18675c896d811d4795dd1f8ab2707b'
             AND md5(pg_get_functiondef(proc.oid)) = 'b519afd0a0b39d57c28d9ffa8a35ebfa')
         )
     ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NOT NULL AND operating_company_id IS DISTINCT FROM pinned_company) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: mixed company';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = pinned_company) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: null assignment';
  END IF;

  IF coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM '6c97411f192611b3070d9df7369435d8' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE status = 'active') <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = pinned_company AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  SELECT company_id
    INTO canonical
  FROM registry.companies
  WHERE status = 'active';

  IF canonical IS DISTINCT FROM pinned_company THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK';
  END IF;

  UPDATE finance.agent_transaction_drafts
  SET operating_company_id = NULL
  WHERE operating_company_id = canonical;
  GET DIAGNOSTICS cleared_rows = ROW_COUNT;

  IF cleared_rows <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: update count';
  END IF;

  IF (SELECT count(*) FROM finance.agent_transaction_drafts) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NULL) <> 2
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id = canonical) <> 0
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE operating_company_id IS NOT NULL) <> 0
     OR coalesce((
       SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id' - 'updated_at')::text, ',' ORDER BY row_alias.id))
       FROM finance.agent_transaction_drafts AS row_alias
     ), 'empty') IS DISTINCT FROM '6c97411f192611b3070d9df7369435d8'
     OR (SELECT count(*) FROM finance.agent_transaction_drafts WHERE updated_at = transaction_timestamp()) <> 2
     OR (
       SELECT count(*)
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE NOT trigger_row.tgisinternal
         AND namespace.nspname = 'finance'
         AND relation.relname = 'agent_transaction_drafts'
         AND trigger_row.tgname = 'trg_agent_tx_drafts_guard'
         AND trigger_row.tgenabled = 'O'
         AND trigger_row.tgtype = 31
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '58e808d265aa0589a021c7dd15bdfcf6'
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: requirement remains';
  END IF;
END
$rollback$;

COMMIT;
