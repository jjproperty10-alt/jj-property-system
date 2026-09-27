-- Slice 3.3 transaction matrix. The runner supplies the exact migration and rollback bodies.
-- Every probe row and the second company are removed before the closing read.

CREATE TEMP TABLE phase33_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

CREATE TEMP TABLE phase33_fp AS
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
)) AS fp;

DO $writes$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  def_name text;
  def_id uuid;
  prop_id uuid;
  entity_id uuid;
  probe uuid;
  company uuid;
  second_company uuid;
  engagement_id uuid;
  notnull_count integer;
BEGIN
  SELECT count(*) INTO notnull_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnotnull
    AND NOT attribute.atthasdef
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
    );
  INSERT INTO phase33_matrix VALUES ('columns_not_null', notnull_count = 9, notnull_count::text);

  SELECT property_name, property_id INTO def_name, def_id
  FROM public.property_definitions
  WHERE operating_company_id = jj_company
  ORDER BY property_name
  LIMIT 1;
  SELECT id INTO prop_id FROM public.properties WHERE operating_company_id = jj_company ORDER BY id LIMIT 1;
  SELECT id INTO entity_id FROM lifecycle.entity_identity ORDER BY id LIMIT 1;

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'phase33-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('omit_property_owners', company = jj_company, company::text);
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_property_owners', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('phase33-own', 'phase33-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('omit_property_ownership', company = jj_company, company::text);
    BEGIN
      UPDATE public.property_ownership
      SET operating_company_id = '00000000-0000-0000-0000-0000000000aa'
      WHERE id = probe;
      INSERT INTO phase33_matrix VALUES ('reassignment', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO phase33_matrix VALUES ('reassignment', SQLERRM LIKE 'BLOCKED_BY_COMPANY_REASSIGNMENT%', SQLERRM);
    END;
    BEGIN
      UPDATE public.property_ownership SET operating_company_id = NULL WHERE id = probe;
      INSERT INTO phase33_matrix VALUES ('null_update', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO phase33_matrix VALUES ('null_update', SQLERRM LIKE 'BLOCKED_BY_COMPANY_REASSIGNMENT%', SQLERRM);
    END;
    DELETE FROM public.property_ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_property_ownership', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('phase33-null', 'phase33-probe', 1, NULL)
    RETURNING operating_company_id INTO company;
    INSERT INTO phase33_matrix VALUES ('null_insert', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.property_ownership WHERE property_name = 'phase33-null';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('null_insert', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.ownership (property_id, owner_name, percentage)
    VALUES (prop_id, 'phase33-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('omit_ownership', company = jj_company, company::text);
    DELETE FROM public.ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_ownership', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('phase33-alias', 'phase33-canonical')
    RETURNING operating_company_id INTO company;
    INSERT INTO phase33_matrix VALUES ('omit_aliases', company = jj_company, company::text);
    DELETE FROM public.property_name_aliases WHERE raw_name = 'phase33-alias';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_aliases', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('phase33-upsert', 'phase33-canonical');
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('phase33-upsert', 'phase33-canonical-2')
    ON CONFLICT (raw_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
    RETURNING operating_company_id INTO company;
    INSERT INTO phase33_matrix VALUES ('upsert_aliases', company = jj_company, company::text);
    DELETE FROM public.property_name_aliases WHERE raw_name = 'phase33-upsert';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('upsert_aliases', false, SQLERRM);
    DELETE FROM public.property_name_aliases WHERE raw_name = 'phase33-upsert';
  END;

  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
    VALUES ('phase33-alias-jj', 'phase33-canonical', jj_company)
    RETURNING operating_company_id INTO company;
    INSERT INTO phase33_matrix VALUES ('explicit_aliases', company = jj_company, company::text);
    DELETE FROM public.property_name_aliases WHERE raw_name = 'phase33-alias-jj';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('explicit_aliases', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_reporting_map (raw_name, canonical_name)
    VALUES ('phase33-report', 'phase33-canonical')
    RETURNING operating_company_id INTO company;
    INSERT INTO phase33_matrix VALUES ('omit_reporting_map', company = jj_company, company::text);
    DELETE FROM public.property_reporting_map WHERE raw_name = 'phase33-report';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_reporting_map', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO lifecycle.property_acquisition (property_name)
    VALUES ('phase33-acq')
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('omit_acquisition', company = jj_company, company::text);
    DELETE FROM lifecycle.property_acquisition WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_acquisition', false, SQLERRM);
  END;

  BEGIN
    probe := lifecycle.create_service_engagement(
      entity_id, def_id, 'airbnb_str', 'draft', NULL, NULL, NULL, gen_random_uuid()
    );
    SELECT operating_company_id INTO company FROM lifecycle.service_engagements WHERE id = probe;
    INSERT INTO phase33_matrix VALUES ('rpc_service_engagement', company = jj_company, company::text);
    INSERT INTO lifecycle.management_fee_configs (
      service_engagement_id, property_id, fee_type, fee_value, cycle_anchor_date, effective_from
    ) VALUES (probe, def_id, 'fixed_amount', 1, CURRENT_DATE, CURRENT_DATE)
    RETURNING id, operating_company_id INTO engagement_id, company;
    INSERT INTO phase33_matrix VALUES ('omit_management_fee', company = jj_company, company::text);
    DELETE FROM lifecycle.management_fee_configs WHERE id = engagement_id;
    DELETE FROM lifecycle.service_engagements WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('rpc_service_engagement', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name)
    VALUES ('phase33', 'phase33-map', 'phase33-probe')
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('omit_mappings', company = jj_company, company::text);
    DELETE FROM pms.property_mappings WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('omit_mappings', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id)
    VALUES ('phase33', 'phase33-wrong', 'phase33-probe', '00000000-0000-0000-0000-0000000000aa');
    INSERT INTO phase33_matrix VALUES ('wrong_company', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES (
      'wrong_company',
      SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%' AND SQLERRM NOT LIKE '%null value%',
      SQLERRM
    );
  END;
  DELETE FROM pms.property_mappings WHERE external_id = 'phase33-wrong';

  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (gen_random_uuid(), 'phase33-second', 'active')
  RETURNING company_id INTO second_company;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('phase33-two-own', 'phase33-probe', 1);
    INSERT INTO phase33_matrix VALUES ('two_omit_ownership', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_omit_ownership', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
    VALUES ('phase33-two-alias', 'phase33-canonical', jj_company);
    INSERT INTO phase33_matrix VALUES ('two_explicit_aliases', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_explicit_aliases', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id)
    VALUES ('phase33-two-report', 'phase33-canonical', second_company);
    INSERT INTO phase33_matrix VALUES ('two_explicit_reporting', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_explicit_reporting', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO lifecycle.property_acquisition (property_name)
    VALUES ('phase33-two-acq');
    INSERT INTO phase33_matrix VALUES ('two_omit_acquisition', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_omit_acquisition', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id)
    VALUES ('phase33', 'phase33-two-map', 'phase33-probe', second_company);
    INSERT INTO phase33_matrix VALUES ('two_explicit_mappings', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_explicit_mappings', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('phase33-two-alias-omit', 'phase33-canonical');
    INSERT INTO phase33_matrix VALUES ('two_omit_aliases', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_omit_aliases', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO public.property_reporting_map (raw_name, canonical_name)
    VALUES ('phase33-two-report-omit', 'phase33-canonical');
    INSERT INTO phase33_matrix VALUES ('two_omit_reporting', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_omit_reporting', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name)
    VALUES ('phase33', 'phase33-two-map-omit', 'phase33-probe');
    INSERT INTO phase33_matrix VALUES ('two_omit_mappings', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_omit_mappings', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('phase33-two-own-jj', 'phase33-probe', 1, jj_company);
    INSERT INTO phase33_matrix VALUES ('two_explicit_ownership', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_explicit_ownership', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;
  BEGIN
    INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id)
    VALUES ('phase33-two-acq-jj', jj_company);
    INSERT INTO phase33_matrix VALUES ('two_explicit_acquisition', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_explicit_acquisition', SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'phase33-parent', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase33_matrix VALUES ('two_parent_inherit', company = jj_company, company::text);
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('two_parent_inherit', false, SQLERRM);
  END;

  DELETE FROM public.property_ownership WHERE property_name LIKE 'phase33-%';
  DELETE FROM public.property_name_aliases WHERE raw_name LIKE 'phase33-%';
  DELETE FROM public.property_reporting_map WHERE raw_name LIKE 'phase33-%';
  DELETE FROM lifecycle.property_acquisition WHERE property_name LIKE 'phase33-%';
  DELETE FROM pms.property_mappings WHERE provider = 'phase33';
  DELETE FROM registry.companies WHERE company_id = second_company;

  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('phase33-service', 'phase33-probe', 1)
    RETURNING id INTO probe;
    RESET ROLE;
    SELECT operating_company_id INTO company
    FROM public.property_ownership
    WHERE id = probe;
    INSERT INTO phase33_matrix VALUES ('service_role_insert', company = jj_company, company::text);
    DELETE FROM public.property_ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase33_matrix VALUES (
      'service_role_insert',
      SQLERRM NOT LIKE '%null value%' AND SQLERRM NOT LIKE '%permission denied for function%',
      SQLERRM
    );
    DELETE FROM public.property_ownership WHERE property_name = 'phase33-service';
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM registry.resolve_child_operating_company(NULL, NULL, false);
    INSERT INTO phase33_matrix VALUES ('direct_resolve_authenticated', false, 'executed');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase33_matrix VALUES ('direct_resolve_authenticated', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM registry.enforce_child_operating_company();
    INSERT INTO phase33_matrix VALUES ('direct_enforce_service', false, 'executed');
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase33_matrix VALUES ('direct_enforce_service', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;
END
$writes$;

DO $reapply$
BEGIN
  EXECUTE $phase33_run$
@@MIGRATION@@
  $phase33_run$;
  INSERT INTO phase33_matrix VALUES ('reapply', false, 'applied');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('reapply', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
END
$reapply$;

ALTER TABLE public.property_owners ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE public.property_ownership ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE public.ownership ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE public.property_name_aliases ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE public.property_reporting_map ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE lifecycle.property_acquisition ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE lifecycle.service_engagements ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE lifecycle.management_fee_configs ALTER COLUMN operating_company_id DROP NOT NULL;
ALTER TABLE pms.property_mappings ALTER COLUMN operating_company_id DROP NOT NULL;

DO $column_drift$
BEGIN
  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id SET DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('column_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('column_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  ALTER TABLE public.property_owners ALTER COLUMN operating_company_id DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('column_drift', false, SQLERRM);
END
$column_drift$;

DO $fk_drift$
BEGIN
  ALTER TABLE public.property_ownership DROP CONSTRAINT property_ownership_operating_company_fk;
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('fk_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('fk_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  ALTER TABLE public.property_ownership
    ADD CONSTRAINT property_ownership_operating_company_fk
    FOREIGN KEY (operating_company_id) REFERENCES registry.companies (company_id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('fk_drift', false, SQLERRM);
END
$fk_drift$;

DO $index_drift$
BEGIN
  DROP INDEX public.ownership_operating_company_id_idx;
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('index_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('index_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  CREATE INDEX ownership_operating_company_id_idx ON public.ownership (operating_company_id);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('index_drift', false, SQLERRM);
END
$index_drift$;

DO $trigger_drift$
BEGIN
  DROP TRIGGER trg_property_mappings_operating_company ON pms.property_mappings;
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('trigger_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('trigger_drift', SQLERRM LIKE 'BLOCKED_BY_ENFORCEMENT%', SQLERRM);
  END;
  CREATE TRIGGER trg_property_mappings_operating_company
    BEFORE INSERT OR UPDATE ON pms.property_mappings
    FOR EACH ROW EXECUTE FUNCTION registry.enforce_child_operating_company();
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('trigger_drift', false, SQLERRM);
END
$trigger_drift$;

DO $function_drift$
BEGIN
  ALTER FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) SET search_path = public;
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('function_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('function_drift', SQLERRM LIKE 'BLOCKED_BY_ENFORCEMENT%', SQLERRM);
  END;
  ALTER FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) SET search_path = pg_catalog;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('function_drift', false, SQLERRM);
END
$function_drift$;

DO $acl_drift$
BEGIN
  GRANT EXECUTE ON FUNCTION registry.enforce_child_operating_company() TO authenticated;
  BEGIN
    EXECUTE $phase33_run$
@@MIGRATION@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('acl_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('acl_drift', SQLERRM LIKE 'BLOCKED_BY_ENFORCEMENT%', SQLERRM);
  END;
  REVOKE EXECUTE ON FUNCTION registry.enforce_child_operating_company() FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('acl_drift', false, SQLERRM);
END
$acl_drift$;

DO $reapply_clean$
BEGIN
  EXECUTE $phase33_run$
@@MIGRATION@@
  $phase33_run$;
  INSERT INTO phase33_matrix VALUES ('reapply_clean', true, 'applied');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('reapply_clean', false, SQLERRM);
END
$reapply_clean$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260926200000', 'property_children_operating_company_not_null');

DO $rollback_drift$
DECLARE
  still_notnull integer;
BEGIN
  ALTER TABLE public.property_owners ALTER COLUMN operating_company_id DROP NOT NULL;
  BEGIN
    EXECUTE $phase33_run$
@@ROLLBACK@@
    $phase33_run$;
    INSERT INTO phase33_matrix VALUES ('rollback_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase33_matrix VALUES ('rollback_drift', SQLERRM LIKE 'BLOCKED_BY_ROLLBACK: column state%', SQLERRM);
  END;
  SELECT count(*) INTO still_notnull
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
    AND attribute.attnotnull
    AND (namespace.nspname, relation.relname) IN (
      ('public', 'property_ownership'),
      ('public', 'ownership'),
      ('public', 'property_name_aliases'),
      ('public', 'property_reporting_map'),
      ('lifecycle', 'property_acquisition'),
      ('lifecycle', 'service_engagements'),
      ('lifecycle', 'management_fee_configs'),
      ('pms', 'property_mappings')
    );
  INSERT INTO phase33_matrix VALUES ('rollback_drift_untouched', still_notnull = 8, still_notnull::text);
  ALTER TABLE public.property_owners ALTER COLUMN operating_company_id SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('rollback_drift', false, SQLERRM);
END
$rollback_drift$;

DO $clean_rollback$
DECLARE
  nullable_count integer;
BEGIN
  EXECUTE $phase33_run$
@@ROLLBACK@@
  $phase33_run$;
  SELECT count(*) INTO nullable_count
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE attribute.attname = 'operating_company_id'
    AND NOT attribute.attnotnull
    AND NOT attribute.atthasdef
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
    );
  INSERT INTO phase33_matrix VALUES (
    'clean_rollback',
    nullable_count = 9
      AND to_regprocedure('registry.enforce_child_operating_company()') IS NOT NULL
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%') = 9
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 92,
    nullable_count::text
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase33_matrix VALUES ('clean_rollback', false, SQLERRM);
END
$clean_rollback$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926200000';

SELECT json_build_object(
  'failed', (SELECT count(*) FROM phase33_matrix WHERE NOT ok),
  'steps', (SELECT count(*) FROM phase33_matrix),
  'results', (SELECT json_agg(json_build_object('step', step, 'ok', ok, 'detail', detail) ORDER BY step) FROM phase33_matrix),
  'history', (SELECT count(*) FROM supabase_migrations.schema_migrations),
  'version_absent', (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260926200000') = 0,
  'nullable', (
    SELECT count(*)
    FROM pg_attribute AS attribute
    JOIN pg_class AS relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE attribute.attname = 'operating_company_id' AND NOT attribute.attnotnull
      AND (namespace.nspname, relation.relname) IN (
        ('public', 'property_owners'), ('public', 'property_ownership'), ('public', 'ownership'),
        ('public', 'property_name_aliases'), ('public', 'property_reporting_map'),
        ('lifecycle', 'property_acquisition'), ('lifecycle', 'service_engagements'),
        ('lifecycle', 'management_fee_configs'), ('pms', 'property_mappings')
      )
  ),
  'jj', (
    (SELECT count(*) FROM public.property_owners WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM public.property_ownership WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM public.ownership WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM public.property_name_aliases WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM public.property_reporting_map WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM lifecycle.property_acquisition WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM lifecycle.service_engagements WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM lifecycle.management_fee_configs WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
    + (SELECT count(*) FROM pms.property_mappings WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f')
  ),
  'functions', (SELECT count(*) FROM pg_proc WHERE proname IN ('enforce_child_operating_company', 'resolve_child_operating_company')),
  'triggers', (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE '%operating_company%'),
  'fingerprint_unchanged', (
    SELECT fp = md5(concat_ws('|',
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
      coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
    )) FROM phase33_fp
  )
) AS phase33_report;
