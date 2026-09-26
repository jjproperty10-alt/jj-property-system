-- Slice 3.2 rollback. Removes only the write-guard functions and triggers.
-- Does not clear company assignments or drop Slice 3 columns.

BEGIN;

DO $rollback$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  enforce_src text;
  resolve_src text;
BEGIN
  IF to_regclass('public.property_owners') IS NULL
     OR to_regclass('public.property_ownership') IS NULL
     OR to_regclass('public.ownership') IS NULL
     OR to_regclass('public.property_name_aliases') IS NULL
     OR to_regclass('public.property_reporting_map') IS NULL
     OR to_regclass('lifecycle.property_acquisition') IS NULL
     OR to_regclass('lifecycle.service_engagements') IS NULL
     OR to_regclass('lifecycle.management_fee_configs') IS NULL
     OR to_regclass('pms.property_mappings') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: child schema';
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

  IF (
    SELECT count(*)
    FROM pg_trigger AS trigger_row
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
  ) <> 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: trigger';
  END IF;

  SELECT fn.prosrc
    INTO enforce_src
  FROM pg_proc AS fn
  JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
  WHERE namespace.nspname = 'registry'
    AND fn.proname = 'enforce_child_operating_company'
    AND fn.prosecdef
    AND fn.proconfig @> ARRAY['search_path=pg_catalog'];
  SELECT fn.prosrc
    INTO resolve_src
  FROM pg_proc AS fn
  JOIN pg_namespace AS namespace ON namespace.oid = fn.pronamespace
  WHERE namespace.nspname = 'registry'
    AND fn.proname = 'resolve_child_operating_company'
    AND fn.prosecdef
    AND fn.proconfig @> ARRAY['search_path=pg_catalog'];

  IF enforce_src IS NULL
     OR resolve_src IS NULL
     OR enforce_src NOT LIKE '%BLOCKED_BY_COMPANY_REASSIGNMENT%'
     OR enforce_src NOT LIKE '%BLOCKED_BY_PARENT_COMPANY%'
     OR enforce_src NOT LIKE '%property_owners%'
     OR enforce_src NOT LIKE '%property_ownership%'
     OR enforce_src NOT LIKE '%property_name_aliases%'
     OR enforce_src NOT LIKE '%property_reporting_map%'
     OR enforce_src NOT LIKE '%property_acquisition%'
     OR enforce_src NOT LIKE '%service_engagements%'
     OR enforce_src NOT LIKE '%management_fee_configs%'
     OR enforce_src NOT LIKE '%property_mappings%'
     OR position('ownership' in enforce_src) = 0
     OR resolve_src NOT LIKE '%BLOCKED_BY_COMPANY_CONTEXT%'
     OR resolve_src NOT LIKE '%BLOCKED_BY_PARENT_COMPANY%'
     OR resolve_src NOT LIKE '%active_count <> 1%'
     OR resolve_src NOT LIKE '%status = ''active''%'
     OR resolve_src NOT LIKE '%p_supplied IS DISTINCT FROM sole_company%'
     OR resolve_src LIKE '%RETURN p_supplied%' THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: function';
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
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: function acl';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_depend AS dependency
    WHERE dependency.refobjid = 'registry.enforce_child_operating_company()'::regprocedure
      AND dependency.classid = 'pg_trigger'::regclass
      AND dependency.deptype = 'n'
  ) <> 9
  OR EXISTS (
    SELECT 1
    FROM pg_depend AS dependency
    WHERE dependency.refobjid = 'registry.enforce_child_operating_company()'::regprocedure
      AND dependency.deptype = 'n'
      AND dependency.classid IN ('pg_rewrite'::regclass, 'pg_policy'::regclass, 'pg_proc'::regclass, 'pg_attrdef'::regclass)
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: dependency';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id'
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
  OR (SELECT count(*) FROM pg_constraint WHERE conname LIKE '%operating_company_fk') < 9
  OR (SELECT count(*) FROM pg_class WHERE relname LIKE '%operating_company_id_idx' AND relkind = 'i') < 9 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: child schema';
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
     OR (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id IS DISTINCT FROM jj_company) <> 0 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: assignment';
  END IF;

  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926180000') <> 1 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: history';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'lifecycle'
      AND relation.relname = 'service_engagements'
      AND trigger_row.tgname = 'trg_ira_audit_se'
      AND trigger_row.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: audit trigger';
  END IF;
END
$rollback$;

DROP TRIGGER trg_property_owners_operating_company ON public.property_owners;
DROP TRIGGER trg_property_ownership_operating_company ON public.property_ownership;
DROP TRIGGER trg_ownership_operating_company ON public.ownership;
DROP TRIGGER trg_property_name_aliases_operating_company ON public.property_name_aliases;
DROP TRIGGER trg_property_reporting_map_operating_company ON public.property_reporting_map;
DROP TRIGGER trg_property_acquisition_operating_company ON lifecycle.property_acquisition;
DROP TRIGGER trg_service_engagements_operating_company ON lifecycle.service_engagements;
DROP TRIGGER trg_management_fee_configs_operating_company ON lifecycle.management_fee_configs;
DROP TRIGGER trg_property_mappings_operating_company ON pms.property_mappings;

DROP FUNCTION registry.enforce_child_operating_company();
DROP FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean);

DO $after$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
BEGIN
  IF to_regprocedure('registry.enforce_child_operating_company()') IS NOT NULL
     OR to_regprocedure('registry.resolve_child_operating_company(uuid,uuid,boolean)') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE NOT tgisinternal
         AND tgname IN (
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
     )
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id = jj_company) <> 92
     OR (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) <> 0
     OR (SELECT count(*) FROM pms.property_mappings) <> 8
     OR (SELECT count(*) FROM lifecycle.service_engagements) <> 24 THEN
    RAISE EXCEPTION 'BLOCKED_BY_ROLLBACK: cleanup';
  END IF;
END
$after$;

COMMIT;
