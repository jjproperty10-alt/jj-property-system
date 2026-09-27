-- Slice 3.2: fail-closed write guard for property-child company assignment.
-- Columns stay nullable. Existing rows are not updated.

BEGIN;

DO $pre$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  audit_hash text;
  policy_hash text;
  rls_hash text;
  fp_before text;
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL
     OR to_regclass('registry.companies') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: child schema';
  END IF;

  LOCK TABLE lifecycle.management_fee_configs IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.property_acquisition IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE lifecycle.service_engagements IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE pms.property_mappings IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.ownership IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_name_aliases IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_owners IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_ownership IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.property_reporting_map IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE registry.companies IN SHARE ROW EXCLUSIVE MODE;

  IF to_regprocedure('registry.resolve_child_operating_company(uuid,uuid,boolean)') IS NOT NULL
     OR to_regprocedure('registry.enforce_child_operating_company()') IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       WHERE NOT trigger_row.tgisinternal
         AND trigger_row.tgname IN (
           'trg_property_owners_operating_company',
           'trg_property_ownership_operating_company',
           'trg_ownership_operating_company',
           'trg_property_name_aliases_operating_company',
           'trg_property_reporting_map_operating_company',
           'trg_property_acquisition_operating_company',
           'trg_service_engagements_operating_company',
           'trg_management_fee_configs_operating_company',
           'trg_property_mappings_operating_company'
         )
     ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: enforcement present';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.atttypid = 'uuid'::regtype
      AND NOT attribute.attnotnull
      AND NOT attribute.atthasdef
      AND attribute.attgenerated = ''
      AND (namespace.nspname, relation.relname) IN (
        ('public', 'property_owners'),
        ('public', 'property_ownership'),
        ('public', 'ownership'),
        ('public', 'property_name_aliases'),
        ('public', 'property_reporting_map'),
        ('lifecycle', 'property_acquisition'),
        ('lifecycle', 'service_engagements'),
        ('lifecycle', 'management_fee_configs'),
        ('pms', 'property_mappings')
      )
  ) <> 9
  OR (
    SELECT count(*)
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
    WHERE company_fk.contype = 'f'
      AND company_fk.convalidated = true
      AND company_fk.confdeltype = 'r'
      AND company_fk.condeferrable = false
      AND company_fk.condeferred = false
      AND cardinality(company_fk.conkey) = 1
      AND cardinality(company_fk.confkey) = 1
      AND local_column.attname = 'operating_company_id'
      AND referenced_namespace.nspname = 'registry'
      AND referenced.relname = 'companies'
      AND referenced_column.attname = 'company_id'
      AND (owning_namespace.nspname, owning.relname, company_fk.conname) IN (
        ('public', 'property_owners', 'property_owners_operating_company_fk'),
        ('public', 'property_ownership', 'property_ownership_operating_company_fk'),
        ('public', 'ownership', 'ownership_operating_company_fk'),
        ('public', 'property_name_aliases', 'property_name_aliases_operating_company_fk'),
        ('public', 'property_reporting_map', 'property_reporting_map_operating_company_fk'),
        ('lifecycle', 'property_acquisition', 'property_acquisition_operating_company_fk'),
        ('lifecycle', 'service_engagements', 'service_engagements_operating_company_fk'),
        ('lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_fk'),
        ('pms', 'property_mappings', 'property_mappings_operating_company_fk')
      )
  ) <> 9
  OR (
    SELECT count(*)
    FROM pg_index AS index_row
    JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_class AS table_relation ON table_relation.oid = index_row.indrelid
    JOIN pg_namespace AS table_namespace ON table_namespace.oid = table_relation.relnamespace
    JOIN pg_attribute AS indexed_column
      ON indexed_column.attrelid = table_relation.oid
     AND indexed_column.attnum = index_row.indkey[0]
    WHERE indexed_column.attname = 'operating_company_id'
      AND index_row.indisvalid = true
      AND index_row.indisready = true
      AND index_row.indisunique = false
      AND index_row.indexprs IS NULL
      AND index_row.indpred IS NULL
      AND index_row.indnkeyatts = 1
      AND index_row.indnatts = 1
      AND (index_namespace.nspname, table_namespace.nspname, table_relation.relname, index_relation.relname) IN (
        ('public', 'public', 'property_owners', 'property_owners_operating_company_id_idx'),
        ('public', 'public', 'property_ownership', 'property_ownership_operating_company_id_idx'),
        ('public', 'public', 'ownership', 'ownership_operating_company_id_idx'),
        ('public', 'public', 'property_name_aliases', 'property_name_aliases_operating_company_id_idx'),
        ('public', 'public', 'property_reporting_map', 'property_reporting_map_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'property_acquisition', 'property_acquisition_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'service_engagements', 'service_engagements_operating_company_id_idx'),
        ('lifecycle', 'lifecycle', 'management_fee_configs', 'management_fee_configs_operating_company_id_idx'),
        ('pms', 'pms', 'property_mappings', 'property_mappings_operating_company_id_idx')
      )
  ) <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: child schema';
  END IF;

  SELECT md5(pg_get_triggerdef(trigger_row.oid))
    INTO audit_hash
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'lifecycle'
    AND relation.relname = 'service_engagements'
    AND trigger_row.tgname = 'trg_ira_audit_se'
    AND trigger_row.tgenabled = 'O'
    AND NOT trigger_row.tgisinternal;
  IF audit_hash IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: audit trigger';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260925140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926120000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926140000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926160000') <> 1
     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_HISTORY';
  END IF;

  IF (SELECT count(*) FROM registry.companies) <> 1
     OR (SELECT count(*) FROM registry.companies WHERE company_id = jj_company AND status = 'active') <> 1
     OR (SELECT count(*) FROM access.company_memberships) <> 1
     OR (
       SELECT count(*) FROM access.company_memberships
       WHERE company_id = jj_company AND membership_role = 'company_admin' AND is_active
     ) <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;

  IF (SELECT count(*) FROM public.properties) <> 40
     OR (SELECT count(*) FROM public.properties WHERE operating_company_id = jj_company) <> 40
     OR (SELECT count(*) FROM public.property_definitions) <> 45
     OR (SELECT count(*) FROM public.property_definitions WHERE operating_company_id = jj_company) <> 45 THEN
    RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
  END IF;

  IF (SELECT count(*) FROM public.property_owners) <> 92
     OR (SELECT count(*) FROM public.property_ownership) <> 73
     OR (SELECT count(*) FROM public.ownership) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases) <> 54
     OR (SELECT count(*) FROM public.property_reporting_map) <> 9
     OR (SELECT count(*) FROM lifecycle.property_acquisition) <> 2
     OR (SELECT count(*) FROM lifecycle.service_engagements) <> 24
     OR (SELECT count(*) FROM lifecycle.management_fee_configs) <> 0
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = jj_company) <> 73
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = jj_company) <> 54
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = jj_company) <> 9
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = jj_company) <> 2
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = jj_company) <> 24
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) <> 8
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_ownership WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.ownership WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: assignment';
  END IF;

  IF (SELECT count(*) FROM public.v_certified_ledger_transactions) <> 2254
     OR (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) <> 12549078.54
     OR (
       SELECT count(*)
       FROM pg_class AS view_relation
       JOIN pg_namespace AS view_namespace ON view_namespace.oid = view_relation.relnamespace
       WHERE view_namespace.nspname = 'public'
         AND (
           (view_relation.relname = 'v_certified_ledger_transactions' AND md5(pg_get_viewdef(view_relation.oid)) = 'ca7ceb8841f66d974dc72b972be902c3')
           OR (view_relation.relname = 'v_rc3_classified' AND md5(pg_get_viewdef(view_relation.oid)) = '1b014d4d7f0fa074f6ad3f50a7181e34')
           OR (view_relation.relname = 'v_cashbox_audit' AND md5(pg_get_viewdef(view_relation.oid)) = 'fbf261e717ed8a67f26e9ae35e344c54')
           OR (view_relation.relname = 'v_jj_company_pl' AND md5(pg_get_viewdef(view_relation.oid)) = '39c35feee3d904605b3606f32e1d3f45')
         )
     ) <> 4
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'registry'
         AND relation.relname = 'companies'
         AND trigger_row.tgname = 'companies_uuid_guard'
         AND trigger_row.tgenabled = 'O'
         AND md5(pg_get_triggerdef(trigger_row.oid)) = '1e4cd7f35cfd5df00a734d7b7b9d020c'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public'
         AND relation.relname = 'transactions'
         AND trigger_row.tgname = 'trg_transactions_append_only'
         AND trigger_row.tgenabled = 'O'
     )
     OR (SELECT count(*) FROM pms.connections) <> 1
     OR (SELECT count(*) FROM pms.property_mappings) <> 8 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: global pin';
  END IF;

  PERFORM set_config('jj.p32_audit_hash', audit_hash, true);
  SELECT coalesce(md5(string_agg(
    namespace.nspname || '.' || relation.relname || ':' || relation.relrowsecurity::text || ':' || relation.relforcerowsecurity::text,
    ',' ORDER BY namespace.nspname, relation.relname
  )), 'none')
    INTO rls_hash
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE (namespace.nspname, relation.relname) IN (
    ('public', 'property_owners'),
    ('public', 'property_ownership'),
    ('public', 'ownership'),
    ('public', 'property_name_aliases'),
    ('public', 'property_reporting_map'),
    ('lifecycle', 'property_acquisition'),
    ('lifecycle', 'service_engagements'),
    ('lifecycle', 'management_fee_configs'),
    ('pms', 'property_mappings')
  );
  SELECT coalesce(md5(string_agg(
    namespace.nspname || '.' || relation.relname || '.' || policy.polname || ':' || policy.polcmd::text,
    ',' ORDER BY namespace.nspname, relation.relname, policy.polname
  )), 'none')
    INTO policy_hash
  FROM pg_policy AS policy
  JOIN pg_class AS relation ON relation.oid = policy.polrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE (namespace.nspname, relation.relname) IN (
    ('public', 'property_owners'),
    ('public', 'property_ownership'),
    ('public', 'ownership'),
    ('public', 'property_name_aliases'),
    ('public', 'property_reporting_map'),
    ('lifecycle', 'property_acquisition'),
    ('lifecycle', 'service_engagements'),
    ('lifecycle', 'management_fee_configs'),
    ('pms', 'property_mappings')
  );
  SELECT md5(concat_ws('|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  )) INTO fp_before;
  PERFORM set_config('jj.p32_policy_hash', policy_hash, true);
  PERFORM set_config('jj.p32_rls_hash', rls_hash, true);
  PERFORM set_config('jj.p32_fp', fp_before, true);
END
$pre$;

CREATE FUNCTION registry.resolve_child_operating_company(
  p_supplied uuid,
  p_parent uuid,
  p_require_parent boolean
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $resolve$
DECLARE
  active_count integer;
  sole_company uuid;
BEGIN
  IF p_require_parent THEN
    IF p_parent IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM registry.companies
         WHERE company_id = p_parent
           AND status = 'active'
       ) THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    IF p_supplied IS NOT NULL AND p_supplied IS DISTINCT FROM p_parent THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    RETURN p_parent;
  END IF;

  SELECT count(*)
    INTO active_count
  FROM registry.companies
  WHERE status = 'active';
  IF active_count <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  SELECT company_id
    INTO sole_company
  FROM registry.companies
  WHERE status = 'active';
  IF p_supplied IS NOT NULL AND p_supplied IS DISTINCT FROM sole_company THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_CONTEXT';
  END IF;
  RETURN sole_company;
END
$resolve$;

CREATE FUNCTION registry.enforce_child_operating_company()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce$
DECLARE
  parent_company uuid;
  property_company uuid;
  engagement_company uuid;
  require_parent boolean := false;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.operating_company_id IS DISTINCT FROM OLD.operating_company_id THEN
    RAISE EXCEPTION 'BLOCKED_BY_COMPANY_REASSIGNMENT';
  END IF;

  IF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'property_owners' THEN
    require_parent := true;
    SELECT definition.operating_company_id
      INTO parent_company
    FROM public.property_definitions AS definition
    WHERE definition.property_name = NEW.property_name;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME = 'ownership' THEN
    require_parent := true;
    SELECT property.operating_company_id
      INTO parent_company
    FROM public.properties AS property
    WHERE property.id = NEW.property_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'lifecycle' AND TG_TABLE_NAME = 'service_engagements' THEN
    require_parent := true;
    SELECT definition.operating_company_id
      INTO parent_company
    FROM public.property_definitions AS definition
    WHERE definition.property_id = NEW.property_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'lifecycle' AND TG_TABLE_NAME = 'management_fee_configs' THEN
    require_parent := true;
    SELECT definition.operating_company_id, engagement.operating_company_id
      INTO property_company, engagement_company
    FROM public.property_definitions AS definition
    JOIN lifecycle.service_engagements AS engagement
      ON engagement.id = NEW.service_engagement_id
    WHERE definition.property_id = NEW.property_id;
    IF NOT FOUND OR property_company IS DISTINCT FROM engagement_company THEN
      RAISE EXCEPTION 'BLOCKED_BY_PARENT_COMPANY';
    END IF;
    parent_company := property_company;
  ELSIF NOT (
    (TG_TABLE_SCHEMA = 'public' AND TG_TABLE_NAME IN (
      'property_ownership', 'property_name_aliases', 'property_reporting_map'
    ))
    OR (TG_TABLE_SCHEMA = 'lifecycle' AND TG_TABLE_NAME = 'property_acquisition')
    OR (TG_TABLE_SCHEMA = 'pms' AND TG_TABLE_NAME = 'property_mappings')
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT require_parent THEN
    RETURN NEW;
  END IF;

  NEW.operating_company_id := registry.resolve_child_operating_company(
    NEW.operating_company_id,
    parent_company,
    require_parent
  );
  RETURN NEW;
END
$enforce$;

REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION registry.enforce_child_operating_company() FROM PUBLIC;
REVOKE ALL ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) FROM anon, authenticated, service_role;
REVOKE ALL ON FUNCTION registry.enforce_child_operating_company() FROM anon, authenticated, service_role;

CREATE TRIGGER trg_property_owners_operating_company
  BEFORE INSERT OR UPDATE ON public.property_owners
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_property_ownership_operating_company
  BEFORE INSERT OR UPDATE ON public.property_ownership
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_ownership_operating_company
  BEFORE INSERT OR UPDATE ON public.ownership
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_property_name_aliases_operating_company
  BEFORE INSERT OR UPDATE ON public.property_name_aliases
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_property_reporting_map_operating_company
  BEFORE INSERT OR UPDATE ON public.property_reporting_map
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_property_acquisition_operating_company
  BEFORE INSERT OR UPDATE ON lifecycle.property_acquisition
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_service_engagements_operating_company
  BEFORE INSERT OR UPDATE ON lifecycle.service_engagements
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_management_fee_configs_operating_company
  BEFORE INSERT OR UPDATE ON lifecycle.management_fee_configs
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

CREATE TRIGGER trg_property_mappings_operating_company
  BEFORE INSERT OR UPDATE ON pms.property_mappings
  FOR EACH ROW
  EXECUTE FUNCTION registry.enforce_child_operating_company();

DO $post$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  fp_after text;
  rls_after text;
  policy_after text;
BEGIN
  IF (
    SELECT count(*)
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_proc AS fn ON fn.oid = trigger_row.tgfoid
    JOIN pg_namespace AS fn_namespace ON fn_namespace.oid = fn.pronamespace
    WHERE NOT trigger_row.tgisinternal
      AND trigger_row.tgenabled = 'O'
      AND fn_namespace.nspname = 'registry'
      AND fn.proname = 'enforce_child_operating_company'
      AND trigger_row.tgname IN (
        'trg_property_owners_operating_company',
        'trg_property_ownership_operating_company',
        'trg_ownership_operating_company',
        'trg_property_name_aliases_operating_company',
        'trg_property_reporting_map_operating_company',
        'trg_property_acquisition_operating_company',
        'trg_service_engagements_operating_company',
        'trg_management_fee_configs_operating_company',
        'trg_property_mappings_operating_company'
      )
  ) <> 9
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    WHERE namespace.nspname = 'registry'
      AND fn.proname = 'resolve_child_operating_company'
      AND fn.prosecdef
      AND fn.proconfig @> ARRAY['search_path=pg_catalog']
      AND fn.prosrc LIKE '%p_supplied IS DISTINCT FROM sole_company%'
      AND fn.prosrc NOT LIKE '%RETURN p_supplied%'
  )
  OR NOT EXISTS (
    SELECT 1
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    WHERE namespace.nspname = 'registry'
      AND fn.proname = 'enforce_child_operating_company'
      AND fn.prosecdef
      AND fn.proconfig @> ARRAY['search_path=pg_catalog']
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: enforcement result';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    CROSS JOIN LATERAL aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner))) AS acl
    WHERE namespace.nspname = 'registry'
      AND fn.proname IN ('resolve_child_operating_company', 'enforce_child_operating_company')
      AND acl.privilege_type = 'EXECUTE'
      AND (
        acl.grantee = 0
        OR acl.grantee IN (
          SELECT role_row.oid
          FROM pg_roles AS role_row
          WHERE role_row.rolname IN ('anon', 'authenticated', 'service_role')
        )
      )
  )
  OR (
    SELECT count(*)
    FROM pg_proc AS fn
    JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
    WHERE namespace.nspname = 'registry'
      AND fn.proname IN ('resolve_child_operating_company', 'enforce_child_operating_company')
      AND fn.proacl IS NOT NULL
      AND fn.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
  ) <> 2 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: function acl';
  END IF;

  SELECT md5(concat_ws('|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  )) INTO fp_after;
  IF fp_after IS DISTINCT FROM current_setting('jj.p32_fp') THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: fingerprint';
  END IF;

  SELECT coalesce(md5(string_agg(
    namespace.nspname || '.' || relation.relname || ':' || relation.relrowsecurity::text || ':' || relation.relforcerowsecurity::text,
    ',' ORDER BY namespace.nspname, relation.relname
  )), 'none')
    INTO rls_after
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE (namespace.nspname, relation.relname) IN (
    ('public', 'property_owners'),
    ('public', 'property_ownership'),
    ('public', 'ownership'),
    ('public', 'property_name_aliases'),
    ('public', 'property_reporting_map'),
    ('lifecycle', 'property_acquisition'),
    ('lifecycle', 'service_engagements'),
    ('lifecycle', 'management_fee_configs'),
    ('pms', 'property_mappings')
  );
  SELECT coalesce(md5(string_agg(
    namespace.nspname || '.' || relation.relname || '.' || policy.polname || ':' || policy.polcmd::text,
    ',' ORDER BY namespace.nspname, relation.relname, policy.polname
  )), 'none')
    INTO policy_after
  FROM pg_policy AS policy
  JOIN pg_class AS relation ON relation.oid = policy.polrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE (namespace.nspname, relation.relname) IN (
    ('public', 'property_owners'),
    ('public', 'property_ownership'),
    ('public', 'ownership'),
    ('public', 'property_name_aliases'),
    ('public', 'property_reporting_map'),
    ('lifecycle', 'property_acquisition'),
    ('lifecycle', 'service_engagements'),
    ('lifecycle', 'management_fee_configs'),
    ('pms', 'property_mappings')
  );
  IF rls_after IS DISTINCT FROM current_setting('jj.p32_rls_hash')
     OR policy_after IS DISTINCT FROM current_setting('jj.p32_policy_hash')
     OR (
       SELECT md5(pg_get_triggerdef(trigger_row.oid))
       FROM pg_trigger AS trigger_row
       JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
       JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'lifecycle'
         AND relation.relname = 'service_engagements'
         AND trigger_row.tgname = 'trg_ira_audit_se'
         AND trigger_row.tgenabled = 'O'
     ) IS DISTINCT FROM current_setting('jj.p32_audit_hash')
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = jj_company) <> 8
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_SCHEMA_DRIFT: enforcement result';
  END IF;
END
$post$;

COMMIT;
