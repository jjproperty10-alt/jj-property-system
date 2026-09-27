-- Slice 3.2 transaction probes. The runner has already applied the forward migration.
-- History row 20260926180000 is temporary and is removed before the final read.

CREATE TEMP TABLE phase32_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT ALL ON TABLE phase32_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.phase32_parentless_ok(p_step text, p_sql text, p_cleanup text)
LANGUAGE plpgsql
AS $proc$
DECLARE
  assigned uuid;
BEGIN
  EXECUTE p_sql INTO assigned;
  EXECUTE p_cleanup;
  INSERT INTO phase32_matrix VALUES (
    p_step,
    assigned = '10f6e9b3-c5b9-4d95-a318-48f20f89477f',
    coalesce(assigned::text, 'null')
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES (p_step, false, SQLERRM);
END;
$proc$;

CREATE PROCEDURE pg_temp.phase32_parentless_denied(
  p_step text,
  p_sql text,
  p_count_sql text,
  p_expected integer,
  p_cleanup text
)
LANGUAGE plpgsql
AS $proc$
DECLARE
  found_count integer;
BEGIN
  EXECUTE p_sql;
  EXECUTE p_cleanup;
  INSERT INTO phase32_matrix VALUES (p_step, false, 'accepted');
EXCEPTION WHEN OTHERS THEN
  EXECUTE p_count_sql INTO found_count;
  INSERT INTO phase32_matrix VALUES (
    p_step,
    SQLERRM LIKE 'BLOCKED_BY_COMPANY_CONTEXT%' AND found_count = p_expected,
    SQLERRM
  );
END;
$proc$;

DO $writes$
DECLARE
  jj_company uuid := '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  def_name text;
  def_id uuid;
  prop_id uuid;
  entity_id uuid;
  probe uuid;
  company uuid;
  foreign_company uuid;
  inactive_company uuid;
  engagement_id uuid;
BEGIN
  SELECT property_name, property_id
    INTO def_name, def_id
  FROM public.property_definitions
  WHERE operating_company_id = jj_company
  ORDER BY property_name
  LIMIT 1;
  SELECT id INTO prop_id
  FROM public.properties
  WHERE operating_company_id = jj_company
  ORDER BY id
  LIMIT 1;
  SELECT id INTO entity_id
  FROM lifecycle.entity_identity
  ORDER BY id
  LIMIT 1;

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'phase32-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('omit_property_owners', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_property_owners', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('phase32-probe', 'phase32-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('omit_property_ownership', company = jj_company, coalesce(company::text, 'null'));
    BEGIN
      UPDATE public.property_ownership SET operating_company_id = NULL WHERE id = probe;
      INSERT INTO phase32_matrix VALUES ('null_update', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO phase32_matrix VALUES ('null_update', SQLERRM LIKE 'BLOCKED_BY_COMPANY_REASSIGNMENT%', SQLERRM);
    END;
    DELETE FROM public.property_ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_property_ownership', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.ownership (property_id, owner_name, percentage)
    VALUES (prop_id, 'phase32-probe', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('omit_ownership', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_ownership', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('phase32-probe', 'phase32-canonical')
    RETURNING operating_company_id INTO company;
    INSERT INTO phase32_matrix VALUES ('omit_aliases', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.property_name_aliases WHERE raw_name = 'phase32-probe';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_aliases', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_reporting_map (raw_name, canonical_name)
    VALUES ('phase32-probe', 'phase32-canonical')
    RETURNING operating_company_id INTO company;
    INSERT INTO phase32_matrix VALUES ('omit_reporting_map', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.property_reporting_map WHERE raw_name = 'phase32-probe';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_reporting_map', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO lifecycle.property_acquisition (property_name)
    VALUES ('phase32-probe')
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('omit_acquisition', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM lifecycle.property_acquisition WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_acquisition', false, SQLERRM);
  END;

  BEGIN
    probe := lifecycle.create_service_engagement(
      entity_id, def_id, 'airbnb_str', 'draft', NULL, NULL, NULL, gen_random_uuid()
    );
    SELECT operating_company_id INTO company
    FROM lifecycle.service_engagements
    WHERE id = probe;
    INSERT INTO phase32_matrix VALUES ('rpc_service_engagement', company = jj_company, coalesce(company::text, 'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('rpc_service_engagement', false, SQLERRM);
    probe := NULL;
  END;

  IF probe IS NOT NULL THEN
    BEGIN
      INSERT INTO lifecycle.management_fee_configs (
        service_engagement_id, property_id, fee_type, fee_value, cycle_anchor_date, effective_from
      ) VALUES (
        probe, def_id, 'fixed_amount', 1, CURRENT_DATE, CURRENT_DATE
      )
      RETURNING id, operating_company_id INTO engagement_id, company;
      INSERT INTO phase32_matrix VALUES ('omit_management_fee', company = jj_company, coalesce(company::text, 'null'));
      DELETE FROM lifecycle.management_fee_configs WHERE id = engagement_id;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO phase32_matrix VALUES ('omit_management_fee', false, SQLERRM);
    END;
    DELETE FROM lifecycle.service_engagements WHERE id = probe;
  END IF;

  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name)
    VALUES ('phase32', 'phase32-probe', 'phase32-probe')
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('omit_mappings', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM pms.property_mappings WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('omit_mappings', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (gen_random_uuid(), 'phase32-inactive', 'inactive')
    RETURNING company_id INTO inactive_company;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('inactive_company_insert', false, SQLERRM);
    inactive_company := NULL;
  END;

  CALL pg_temp.phase32_parentless_ok(
    'ownership_one_explicit_jj',
    format('INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id) VALUES (''phase32-own-jj'', ''phase32-probe'', 1, %L) RETURNING operating_company_id', jj_company),
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-jj'''
  );
  CALL pg_temp.phase32_parentless_ok(
    'aliases_one_explicit_jj',
    format('INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES (''phase32-alias-jj'', ''phase32-canonical'', %L) RETURNING operating_company_id', jj_company),
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-jj'''
  );
  CALL pg_temp.phase32_parentless_ok(
    'reporting_one_explicit_jj',
    format('INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id) VALUES (''phase32-report-jj'', ''phase32-canonical'', %L) RETURNING operating_company_id', jj_company),
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-jj'''
  );
  CALL pg_temp.phase32_parentless_ok(
    'acquisition_one_explicit_jj',
    format('INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id) VALUES (''phase32-acq-jj'', %L) RETURNING operating_company_id', jj_company),
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-jj'''
  );
  CALL pg_temp.phase32_parentless_ok(
    'mappings_one_explicit_jj',
    format('INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id) VALUES (''phase32'', ''phase32-map-jj'', ''phase32-probe'', %L) RETURNING operating_company_id', jj_company),
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-jj'''
  );

  IF inactive_company IS NOT NULL THEN
  CALL pg_temp.phase32_parentless_denied(
    'ownership_one_explicit_inactive',
    format('INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id) VALUES (''phase32-own-off'', ''phase32-probe'', 1, %L)', inactive_company),
    'SELECT count(*) FROM public.property_ownership',
    73,
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-off'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'aliases_one_explicit_inactive',
    format('INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES (''phase32-alias-off'', ''phase32-canonical'', %L)', inactive_company),
    'SELECT count(*) FROM public.property_name_aliases',
    54,
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-off'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'reporting_one_explicit_inactive',
    format('INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id) VALUES (''phase32-report-off'', ''phase32-canonical'', %L)', inactive_company),
    'SELECT count(*) FROM public.property_reporting_map',
    9,
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-off'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'acquisition_one_explicit_inactive',
    format('INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id) VALUES (''phase32-acq-off'', %L)', inactive_company),
    'SELECT count(*) FROM lifecycle.property_acquisition',
    2,
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-off'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'mappings_one_explicit_inactive',
    format('INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id) VALUES (''phase32'', ''phase32-map-off'', ''phase32-probe'', %L)', inactive_company),
    'SELECT count(*) FROM pms.property_mappings',
    8,
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-off'''
  );
  END IF;

  CALL pg_temp.phase32_parentless_denied(
    'ownership_one_explicit_missing',
    'INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id) VALUES (''phase32-own-missing'', ''phase32-probe'', 1, ''00000000-0000-0000-0000-0000000000aa'')',
    'SELECT count(*) FROM public.property_ownership',
    73,
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-missing'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'aliases_one_explicit_missing',
    'INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES (''phase32-alias-missing'', ''phase32-canonical'', ''00000000-0000-0000-0000-0000000000aa'')',
    'SELECT count(*) FROM public.property_name_aliases',
    54,
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-missing'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'reporting_one_explicit_missing',
    'INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id) VALUES (''phase32-report-missing'', ''phase32-canonical'', ''00000000-0000-0000-0000-0000000000aa'')',
    'SELECT count(*) FROM public.property_reporting_map',
    9,
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-missing'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'acquisition_one_explicit_missing',
    'INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id) VALUES (''phase32-acq-missing'', ''00000000-0000-0000-0000-0000000000aa'')',
    'SELECT count(*) FROM lifecycle.property_acquisition',
    2,
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-missing'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'mappings_one_explicit_missing',
    'INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id) VALUES (''phase32'', ''phase32-map-missing'', ''phase32-probe'', ''00000000-0000-0000-0000-0000000000aa'')',
    'SELECT count(*) FROM pms.property_mappings',
    8,
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-missing'''
  );

  IF inactive_company IS NOT NULL THEN
    DELETE FROM registry.companies WHERE company_id = inactive_company;
  END IF;

  BEGIN
    INSERT INTO registry.companies (company_id, canonical_name, status)
    VALUES (gen_random_uuid(), 'phase32-second', 'active')
    RETURNING company_id INTO foreign_company;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('second_company_insert', false, SQLERRM);
    foreign_company := NULL;
  END;

  IF foreign_company IS NULL THEN
    RETURN;
  END IF;

  CALL pg_temp.phase32_parentless_denied(
    'ownership_two_omit',
    'INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct) VALUES (''phase32-own-two'', ''phase32-probe'', 1)',
    'SELECT count(*) FROM public.property_ownership',
    73,
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-two'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'aliases_two_omit',
    'INSERT INTO public.property_name_aliases (raw_name, canonical_name) VALUES (''phase32-alias-two'', ''phase32-canonical'')',
    'SELECT count(*) FROM public.property_name_aliases',
    54,
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-two'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'reporting_two_omit',
    'INSERT INTO public.property_reporting_map (raw_name, canonical_name) VALUES (''phase32-report-two'', ''phase32-canonical'')',
    'SELECT count(*) FROM public.property_reporting_map',
    9,
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-two'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'acquisition_two_omit',
    'INSERT INTO lifecycle.property_acquisition (property_name) VALUES (''phase32-acq-two'')',
    'SELECT count(*) FROM lifecycle.property_acquisition',
    2,
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-two'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'mappings_two_omit',
    'INSERT INTO pms.property_mappings (provider, external_id, jj_property_name) VALUES (''phase32'', ''phase32-map-two'', ''phase32-probe'')',
    'SELECT count(*) FROM pms.property_mappings',
    8,
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-two'''
  );

  CALL pg_temp.phase32_parentless_denied(
    'ownership_two_explicit_jj',
    format('INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id) VALUES (''phase32-own-two-jj'', ''phase32-probe'', 1, %L)', jj_company),
    'SELECT count(*) FROM public.property_ownership',
    73,
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-two-jj'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'aliases_two_explicit_jj',
    format('INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES (''phase32-alias-two-jj'', ''phase32-canonical'', %L)', jj_company),
    'SELECT count(*) FROM public.property_name_aliases',
    54,
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-two-jj'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'reporting_two_explicit_jj',
    format('INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id) VALUES (''phase32-report-two-jj'', ''phase32-canonical'', %L)', jj_company),
    'SELECT count(*) FROM public.property_reporting_map',
    9,
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-two-jj'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'acquisition_two_explicit_jj',
    format('INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id) VALUES (''phase32-acq-two-jj'', %L)', jj_company),
    'SELECT count(*) FROM lifecycle.property_acquisition',
    2,
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-two-jj'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'mappings_two_explicit_jj',
    format('INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id) VALUES (''phase32'', ''phase32-map-two-jj'', ''phase32-probe'', %L)', jj_company),
    'SELECT count(*) FROM pms.property_mappings',
    8,
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-two-jj'''
  );

  CALL pg_temp.phase32_parentless_denied(
    'ownership_two_explicit_second',
    format('INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id) VALUES (''phase32-own-two-b'', ''phase32-probe'', 1, %L)', foreign_company),
    'SELECT count(*) FROM public.property_ownership',
    73,
    'DELETE FROM public.property_ownership WHERE property_name = ''phase32-own-two-b'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'aliases_two_explicit_second',
    format('INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id) VALUES (''phase32-alias-two-b'', ''phase32-canonical'', %L)', foreign_company),
    'SELECT count(*) FROM public.property_name_aliases',
    54,
    'DELETE FROM public.property_name_aliases WHERE raw_name = ''phase32-alias-two-b'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'reporting_two_explicit_second',
    format('INSERT INTO public.property_reporting_map (raw_name, canonical_name, operating_company_id) VALUES (''phase32-report-two-b'', ''phase32-canonical'', %L)', foreign_company),
    'SELECT count(*) FROM public.property_reporting_map',
    9,
    'DELETE FROM public.property_reporting_map WHERE raw_name = ''phase32-report-two-b'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'acquisition_two_explicit_second',
    format('INSERT INTO lifecycle.property_acquisition (property_name, operating_company_id) VALUES (''phase32-acq-two-b'', %L)', foreign_company),
    'SELECT count(*) FROM lifecycle.property_acquisition',
    2,
    'DELETE FROM lifecycle.property_acquisition WHERE property_name = ''phase32-acq-two-b'''
  );
  CALL pg_temp.phase32_parentless_denied(
    'mappings_two_explicit_second',
    format('INSERT INTO pms.property_mappings (provider, external_id, jj_property_name, operating_company_id) VALUES (''phase32'', ''phase32-map-two-b'', ''phase32-probe'', %L)', foreign_company),
    'SELECT count(*) FROM pms.property_mappings',
    8,
    'DELETE FROM pms.property_mappings WHERE provider = ''phase32'' AND external_id = ''phase32-map-two-b'''
  );

  INSERT INTO phase32_matrix VALUES (
    'second_company_fallback',
    (SELECT ok FROM phase32_matrix WHERE step = 'ownership_two_omit'),
    'ownership omit'
  );
  INSERT INTO phase32_matrix VALUES (
    'explicit_second_company',
    (SELECT ok FROM phase32_matrix WHERE step = 'ownership_two_explicit_second'),
    'ownership explicit second'
  );

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES (def_name, 'phase32-wrong', 1, foreign_company);
    INSERT INTO phase32_matrix VALUES ('wrong_parent_company', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('wrong_parent_company', SQLERRM LIKE 'BLOCKED_BY_PARENT_COMPANY%', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'phase32-inherit', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('second_company_parent_inherit', company = jj_company, coalesce(company::text, 'null'));
    BEGIN
      UPDATE public.property_owners
      SET operating_company_id = foreign_company
      WHERE id = probe;
      INSERT INTO phase32_matrix VALUES ('reassignment', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO phase32_matrix VALUES ('reassignment', SQLERRM LIKE 'BLOCKED_BY_COMPANY_REASSIGNMENT%', SQLERRM);
    END;
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('second_company_parent_inherit', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.ownership (property_id, owner_name, percentage)
    VALUES (prop_id, 'phase32-parent-two', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO phase32_matrix VALUES ('ownership_parent_two_inherit', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM public.ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('ownership_parent_two_inherit', false, SQLERRM);
  END;

  BEGIN
    probe := lifecycle.create_service_engagement(
      entity_id, def_id, 'airbnb_str', 'draft', NULL, NULL, NULL, gen_random_uuid()
    );
    SELECT operating_company_id INTO company
    FROM lifecycle.service_engagements
    WHERE id = probe;
    INSERT INTO phase32_matrix VALUES ('engagement_parent_two_inherit', company = jj_company, coalesce(company::text, 'null'));
    DELETE FROM lifecycle.service_engagements WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('engagement_parent_two_inherit', false, SQLERRM);
  END;

  DELETE FROM registry.companies WHERE company_id = foreign_company;
END
$writes$;

DO $acl$
BEGIN
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
          SELECT role_row.oid FROM pg_roles AS role_row
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
    INSERT INTO phase32_matrix VALUES ('function_acl', false, 'widened');
  ELSE
    INSERT INTO phase32_matrix VALUES ('function_acl', true, 'owner execute only');
  END IF;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM registry.resolve_child_operating_company(NULL, NULL, false);
    RESET ROLE;
    INSERT INTO phase32_matrix VALUES ('direct_execute_authenticated', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase32_matrix VALUES (
      'direct_execute_authenticated',
      SQLERRM LIKE '%permission denied for function%'
        OR SQLERRM LIKE '%permission denied for schema registry%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM registry.resolve_child_operating_company(NULL, NULL, false);
    RESET ROLE;
    INSERT INTO phase32_matrix VALUES ('direct_execute_service_role', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO phase32_matrix VALUES (
      'direct_execute_service_role',
      SQLERRM LIKE '%permission denied for function%'
        OR SQLERRM LIKE '%permission denied for schema registry%',
      SQLERRM
    );
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('phase32-auth-fire', 'phase32-probe', 1);
    RESET ROLE;
    DELETE FROM public.property_ownership WHERE property_name = 'phase32-auth-fire';
    INSERT INTO phase32_matrix VALUES ('authenticated_trigger_fires', true, 'assigned');
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    DELETE FROM public.property_ownership WHERE property_name = 'phase32-auth-fire';
    INSERT INTO phase32_matrix VALUES (
      'authenticated_trigger_fires',
      SQLERRM NOT LIKE '%permission denied for function%'
        AND (
          SQLERRM LIKE '%row-level security%'
          OR SQLERRM LIKE '%permission denied for table%'
        ),
      SQLERRM
    );
  END;
END
$acl$;

DO $reapply$
BEGIN
  EXECUTE $phase32_run$
@@MIGRATION@@
  $phase32_run$;
  INSERT INTO phase32_matrix VALUES ('reapply', false, 'applied');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('reapply', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: enforcement present%', SQLERRM);
END
$reapply$;

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

DO $column_drift$
BEGIN
  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id SET DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f';
  BEGIN
    EXECUTE $phase32_run$
@@MIGRATION@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('column_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('column_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  ALTER TABLE public.property_owners
    ALTER COLUMN operating_company_id DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('column_drift', false, SQLERRM);
END
$column_drift$;

DO $fk_drift$
BEGIN
  ALTER TABLE public.property_owners DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id) REFERENCES registry.companies (company_id) ON DELETE CASCADE;
  BEGIN
    EXECUTE $phase32_run$
@@MIGRATION@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('fk_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('fk_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  ALTER TABLE public.property_owners DROP CONSTRAINT property_owners_operating_company_fk;
  ALTER TABLE public.property_owners
    ADD CONSTRAINT property_owners_operating_company_fk
    FOREIGN KEY (operating_company_id) REFERENCES registry.companies (company_id) ON DELETE RESTRICT;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('fk_drift', false, SQLERRM);
END
$fk_drift$;

DO $index_drift$
BEGIN
  DROP INDEX public.property_owners_operating_company_id_idx;
  BEGIN
    EXECUTE $phase32_run$
@@MIGRATION@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('index_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('index_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: child schema%', SQLERRM);
  END;
  CREATE INDEX property_owners_operating_company_id_idx
    ON public.property_owners (operating_company_id);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('index_drift', false, SQLERRM);
END
$index_drift$;

DO $audit_drift$
BEGIN
  ALTER TABLE lifecycle.service_engagements DISABLE TRIGGER trg_ira_audit_se;
  BEGIN
    EXECUTE $phase32_run$
@@MIGRATION@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('audit_trigger_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('audit_trigger_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: audit trigger%', SQLERRM);
  END;
  ALTER TABLE lifecycle.service_engagements ENABLE TRIGGER trg_ira_audit_se;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('audit_trigger_drift', false, SQLERRM);
END
$audit_drift$;

DO $guard_drift$
BEGIN
  CREATE FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean)
  RETURNS uuid
  LANGUAGE sql
  SET search_path = pg_catalog
  AS 'SELECT NULL::uuid';
  BEGIN
    EXECUTE $phase32_run$
@@MIGRATION@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('guard_function_drift', false, 'applied');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('guard_function_drift', SQLERRM LIKE 'BLOCKED_BY_SCHEMA_DRIFT: enforcement present%', SQLERRM);
  END;
  DROP FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('guard_function_drift', false, SQLERRM);
END
$guard_drift$;

DO $reinstall$
BEGIN
  EXECUTE $phase32_run$
@@MIGRATION@@
  $phase32_run$;
  INSERT INTO phase32_matrix VALUES (
    'reinstall',
    to_regprocedure('registry.enforce_child_operating_company()') IS NOT NULL,
    'installed'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('reinstall', false, SQLERRM);
END
$reinstall$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260926180000', 'property_children_operating_company_write_guard');

DO $rollback_drift$
DECLARE
  trigger_def text;
BEGIN
  SELECT pg_get_triggerdef(trigger_row.oid)
    INTO trigger_def
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'property_owners'
    AND trigger_row.tgname = 'trg_property_owners_operating_company';
  DROP TRIGGER trg_property_owners_operating_company ON public.property_owners;
  BEGIN
    EXECUTE $phase32_run$
@@ROLLBACK@@
    $phase32_run$;
    INSERT INTO phase32_matrix VALUES ('rollback_drift', false, 'rolled back');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase32_matrix VALUES ('rollback_drift', SQLERRM LIKE 'BLOCKED_BY_ROLLBACK: trigger%', SQLERRM);
  END;
  EXECUTE trigger_def;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('rollback_drift', false, SQLERRM);
END
$rollback_drift$;

DO $clean_rollback$
BEGIN
  EXECUTE $phase32_run$
@@ROLLBACK@@
  $phase32_run$;
  INSERT INTO phase32_matrix VALUES (
    'clean_rollback',
    to_regprocedure('registry.enforce_child_operating_company()') IS NULL
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id = '10f6e9b3-c5b9-4d95-a318-48f20f89477f') = 92
      AND (SELECT count(*) FROM public.property_owners WHERE operating_company_id IS NULL) = 0
      AND (SELECT count(*) FROM pms.property_mappings) = 8
      AND (SELECT count(*) FROM lifecycle.service_engagements) = 24,
    'removed'
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('clean_rollback', false, SQLERRM);
END
$clean_rollback$;

DO $unenforced$
DECLARE
  probe uuid;
  company uuid;
BEGIN
  INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
  VALUES ('phase32-after-rollback', 'phase32-probe', 1)
  RETURNING id, operating_company_id INTO probe, company;
  INSERT INTO phase32_matrix VALUES ('after_rollback_omit_is_null', company IS NULL, coalesce(company::text, 'null'));
  DELETE FROM public.property_ownership WHERE id = probe;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO phase32_matrix VALUES ('after_rollback_omit_is_null', false, SQLERRM);
END
$unenforced$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260926180000';

INSERT INTO phase32_matrix VALUES (
  'fingerprints_unchanged',
  (SELECT md5(concat_ws('|',
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_owners AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.property_ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM public.ownership AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_name_aliases AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.raw_name)) FROM public.property_reporting_map AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.property_acquisition AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.service_engagements AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM lifecycle.management_fee_configs AS row_alias), 'empty'),
    coalesce((SELECT md5(string_agg((to_jsonb(row_alias) - 'operating_company_id')::text, ',' ORDER BY row_alias.id)) FROM pms.property_mappings AS row_alias), 'empty')
  ))) = (SELECT children_fp FROM phase32_fp)
    AND (SELECT count(*) FROM public.property_owners) = 92
    AND (SELECT count(*) FROM public.property_ownership) = 73
    AND (SELECT count(*) FROM public.ownership) = 0
    AND (SELECT count(*) FROM public.property_name_aliases) = 54
    AND (SELECT count(*) FROM public.property_reporting_map) = 9
    AND (SELECT count(*) FROM lifecycle.property_acquisition) = 2
    AND (SELECT count(*) FROM lifecycle.service_engagements) = 24
    AND (SELECT count(*) FROM lifecycle.management_fee_configs) = 0
    AND (SELECT count(*) FROM pms.property_mappings) = 8
    AND (SELECT count(*) FROM registry.companies) = 1,
  'restored'
);
