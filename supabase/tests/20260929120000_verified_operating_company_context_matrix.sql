-- Transaction matrix for 20260929120000. The runner supplies the migration and rollback.
-- Synthetic companies and users exist only until the outer ROLLBACK.

CREATE TEMP TABLE slice1_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE slice1_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.slice1_actor(p_role text, p_user uuid)
LANGUAGE plpgsql
AS $actor$
BEGIN
  PERFORM set_config('request.jwt.claim.role', coalesce(p_role, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$actor$;

DO $drift$
BEGIN
  BEGIN
    INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('20260929120000', 'verified_operating_company_context');
    EXECUTE $slice1_run$
@@MIGRATION@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
  END;

  BEGIN
    GRANT EXECUTE ON FUNCTION registry.resolve_child_operating_company(uuid, uuid, boolean) TO authenticated;
    EXECUTE $slice1_run$
@@MIGRATION@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('acl_drift', SQLERRM = 'BLOCKED_BY_SECURITY', SQLERRM);
  END;

  BEGIN
    CREATE TRIGGER slice1_extra_child
      BEFORE INSERT ON public.property_ownership
      FOR EACH ROW
      EXECUTE FUNCTION registry.enforce_child_operating_company();
    EXECUTE $slice1_run$
@@MIGRATION@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('trigger_drift', SQLERRM = 'BLOCKED_BY_TRIGGER', SQLERRM);
  END;

  BEGIN
    CREATE POLICY slice1_rls_probe ON public.property_ownership
      FOR SELECT TO postgres USING (true);
    EXECUTE $slice1_run$
@@MIGRATION@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rls_drift', SQLERRM = 'BLOCKED_BY_RLS', SQLERRM);
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  jj_company uuid;
  jj_user uuid;
  user_b uuid;
  user_none uuid;
  company_b uuid;
  inactive_company uuid;
  def_name text;
  def_id uuid;
  prop_id uuid;
  entity_id uuid;
  relationship text;
  probe uuid;
  company uuid;
  draft_id uuid;
  engagement_id uuid;
BEGIN
  SELECT company_id INTO jj_company FROM registry.companies WHERE status = 'active';
  SELECT user_id INTO jj_user
  FROM access.company_memberships
  WHERE is_active AND membership_role = 'company_admin';
  SELECT property_name, property_id INTO def_name, def_id
  FROM public.property_definitions
  WHERE operating_company_id = jj_company
  ORDER BY property_name
  LIMIT 1;
  SELECT id INTO prop_id FROM public.properties WHERE operating_company_id = jj_company ORDER BY id LIMIT 1;
  SELECT id INTO entity_id FROM lifecycle.entity_identity ORDER BY id LIMIT 1;
  SELECT relationship_type INTO relationship FROM public.property_definitions LIMIT 1;

  CALL pg_temp.slice1_actor('', NULL);

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-own', 'slice1', 1)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_omit_ownership', company = jj_company, 'assigned');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-own';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_ownership', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_name_aliases (raw_name, canonical_name)
    VALUES ('slice1-alias', 'slice1')
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_omit_alias', company = jj_company, 'assigned');
    DELETE FROM public.property_name_aliases WHERE raw_name = 'slice1-alias';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_alias', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_reporting_map (raw_name, canonical_name)
    VALUES ('slice1-report', 'slice1')
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_omit_reporting', company = jj_company, 'assigned');
    DELETE FROM public.property_reporting_map WHERE raw_name = 'slice1-report';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_reporting', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO lifecycle.property_acquisition (property_name)
    VALUES ('slice1-acq')
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_omit_acquisition', company = jj_company, 'assigned');
    DELETE FROM lifecycle.property_acquisition WHERE property_name = 'slice1-acq';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_acquisition', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO pms.property_mappings (provider, external_id, jj_property_name)
    VALUES ('slice1', 'slice1-map', 'slice1')
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_omit_mapping', company = jj_company, 'assigned');
    DELETE FROM pms.property_mappings WHERE provider = 'slice1' AND external_id = 'slice1-map';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_mapping', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'slice1', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO slice1_matrix VALUES ('one_omit_parent_owners', company = jj_company, 'assigned');
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_parent_owners', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.ownership (property_id, owner_name, percentage)
    VALUES (prop_id, 'slice1', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO slice1_matrix VALUES ('one_omit_parent_ownership', company = jj_company, 'assigned');
    DELETE FROM public.ownership WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_parent_ownership', false, SQLERRM);
  END;

  BEGIN
    probe := lifecycle.create_service_engagement(
      entity_id, def_id, 'airbnb_str', 'draft', NULL, NULL, NULL, gen_random_uuid()
    );
    SELECT operating_company_id INTO company FROM lifecycle.service_engagements WHERE id = probe;
    INSERT INTO slice1_matrix VALUES ('one_omit_service_engagement', company = jj_company, 'assigned');
    INSERT INTO lifecycle.management_fee_configs (
      service_engagement_id, property_id, fee_type, fee_value, cycle_anchor_date, effective_from
    ) VALUES (
      probe, def_id, 'fixed_amount', 1, CURRENT_DATE, CURRENT_DATE
    )
    RETURNING id, operating_company_id INTO engagement_id, company;
    INSERT INTO slice1_matrix VALUES ('one_omit_management_fee', company = jj_company, 'assigned');
    DELETE FROM lifecycle.management_fee_configs WHERE id = engagement_id;
    DELETE FROM lifecycle.service_engagements WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_omit_service_engagement', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, category, subcategory, idempotency_key
    ) VALUES (
      jj_user, 'needs_review', CURRENT_DATE, 'JJ', 'Other', 'slice1-draft-omit'
    )
    RETURNING id, operating_company_id INTO draft_id, company;
    INSERT INTO slice1_matrix VALUES ('one_member_omit_draft', company = jj_company, 'assigned');
    BEGIN
      UPDATE finance.agent_transaction_drafts
      SET operating_company_id = gen_random_uuid()
      WHERE id = draft_id;
      INSERT INTO slice1_matrix VALUES ('draft_reassignment', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO slice1_matrix VALUES ('draft_reassignment', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
    END;
    CALL pg_temp.slice1_actor('', NULL);
  EXCEPTION WHEN OTHERS THEN
    CALL pg_temp.slice1_actor('', NULL);
    INSERT INTO slice1_matrix VALUES ('one_member_omit_draft', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-own-explicit', 'slice1', 1, jj_company)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('one_member_explicit_jj', company = jj_company, 'assigned');
    BEGIN
      UPDATE public.property_ownership
      SET operating_company_id = gen_random_uuid()
      WHERE property_name = 'slice1-own-explicit';
      INSERT INTO slice1_matrix VALUES ('reassignment', false, 'accepted');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO slice1_matrix VALUES ('reassignment', SQLERRM = 'BLOCKED_BY_COMPANY_REASSIGNMENT', SQLERRM);
    END;
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-own-explicit';
    CALL pg_temp.slice1_actor('', NULL);
  EXCEPTION WHEN OTHERS THEN
    CALL pg_temp.slice1_actor('', NULL);
    INSERT INTO slice1_matrix VALUES ('one_member_explicit_jj', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('service_role', NULL);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-own-service', 'slice1', 1, jj_company);
    INSERT INTO slice1_matrix VALUES ('one_service_explicit', false, 'accepted');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-own-service';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_service_explicit', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  CALL pg_temp.slice1_actor('', NULL);

  BEGIN
    CALL pg_temp.slice1_actor('anon', NULL);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-own-anon', 'slice1', 1);
    INSERT INTO slice1_matrix VALUES ('one_anon_omit', false, 'accepted');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-own-anon';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_anon_omit', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  CALL pg_temp.slice1_actor('', NULL);

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-own-missing', 'slice1', 1, '00000000-0000-0000-0000-0000000000aa');
    INSERT INTO slice1_matrix VALUES ('one_unknown_uuid', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_unknown_uuid', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('slice1-inactive', 'inactive')
  RETURNING company_id INTO inactive_company;
  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-own-off', 'slice1', 1, inactive_company);
    INSERT INTO slice1_matrix VALUES ('one_inactive_uuid', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_inactive_uuid', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  CALL pg_temp.slice1_actor('', NULL);
  DELETE FROM registry.companies WHERE company_id = inactive_company;

  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO user_none;
  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_none);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-own-none', 'slice1', 1);
    INSERT INTO slice1_matrix VALUES ('one_nonmember_omit', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('one_nonmember_omit', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  CALL pg_temp.slice1_actor('', NULL);

  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('slice1-probe-company', 'active')
  RETURNING company_id INTO company_b;
  INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id INTO user_b;
  INSERT INTO access.company_memberships (company_id, user_id, membership_role)
  VALUES (company_b, user_b, 'company_admin');

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-two-jj', 'slice1', 1, jj_company)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('two_jj_member_writes_jj', company = jj_company, 'assigned');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-two-jj';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_jj_member_writes_jj', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_b);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-two-b', 'slice1', 1, company_b)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('two_b_member_writes_b', company = company_b, 'assigned');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-two-b';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_b_member_writes_b', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-two-cross', 'slice1', 1, company_b);
    INSERT INTO slice1_matrix VALUES ('two_jj_member_blocked_from_b', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_jj_member_blocked_from_b', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_none);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-two-none', 'slice1', 1, jj_company);
    INSERT INTO slice1_matrix VALUES ('two_nonmember_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_nonmember_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-two-omit', 'slice1', 1);
    INSERT INTO slice1_matrix VALUES ('two_omission_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_omission_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('service_role', NULL);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice1-two-service', 'slice1', 1, jj_company);
    INSERT INTO slice1_matrix VALUES ('two_service_explicit_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_service_explicit_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('service_role', NULL);
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-two-service-omit', 'slice1', 1);
    INSERT INTO slice1_matrix VALUES ('two_service_omit_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_service_omit_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'slice1-two', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO slice1_matrix VALUES ('two_parent_inherits_jj', company = jj_company, 'assigned');
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_parent_inherits_jj', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_b);
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES (def_name, 'slice1-two-b', 1);
    INSERT INTO slice1_matrix VALUES ('two_parent_other_member_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_parent_other_member_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES (def_name, 'slice1-wrong', 1, company_b);
    INSERT INTO slice1_matrix VALUES ('two_wrong_parent_company', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_wrong_parent_company', SQLERRM = 'BLOCKED_BY_PARENT_COMPANY', SQLERRM);
  END;

  INSERT INTO public.property_definitions (
    property_name, relationship_type, canonical_name, operating_company_id
  ) VALUES (
    'slice1-def-b', relationship, 'slice1-def-b', company_b
  );
  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_b);
    INSERT INTO public.property_owners (property_name, owner_name, ownership_pct)
    VALUES ('slice1-def-b', 'slice1', 1)
    RETURNING id, operating_company_id INTO probe, company;
    INSERT INTO slice1_matrix VALUES ('two_parent_b_inherits_b', company = company_b, 'assigned');
    DELETE FROM public.property_owners WHERE id = probe;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_parent_b_inherits_b', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', user_b);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, category, subcategory, idempotency_key, operating_company_id
    ) VALUES (
      user_b, 'needs_review', CURRENT_DATE, 'JJ', 'Other', 'slice1-draft-b', company_b
    )
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('two_draft_verified_b', company = company_b, 'assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_draft_verified_b', false, SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('authenticated', jj_user);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, category, subcategory, idempotency_key
    ) VALUES (
      jj_user, 'needs_review', CURRENT_DATE, 'JJ', 'Other', 'slice1-draft-omit-two'
    );
    INSERT INTO slice1_matrix VALUES ('two_draft_omit_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_draft_omit_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    CALL pg_temp.slice1_actor('service_role', NULL);
    INSERT INTO finance.agent_transaction_drafts (
      created_by, status, date, category, subcategory, idempotency_key, operating_company_id
    ) VALUES (
      jj_user, 'needs_review', CURRENT_DATE, 'JJ', 'Other', 'slice1-draft-service', jj_company
    );
    INSERT INTO slice1_matrix VALUES ('two_draft_service_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('two_draft_service_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  DELETE FROM public.property_owners WHERE owner_name LIKE 'slice1%';
  DELETE FROM public.property_ownership WHERE property_name LIKE 'slice1%';
  DELETE FROM public.property_definitions WHERE property_name = 'slice1-def-b';
  ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM finance.agent_transaction_drafts WHERE idempotency_key LIKE 'slice1-%';
  ALTER TABLE finance.agent_transaction_drafts ENABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM access.company_memberships WHERE user_id IN (user_b, user_none);
  DELETE FROM auth.users WHERE id IN (user_b, user_none);
  DELETE FROM registry.companies WHERE company_id = company_b;
  CALL pg_temp.slice1_actor('', NULL);

  BEGIN
    PERFORM set_config('request.jwt.claim.role', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
    BEGIN
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
      RAISE EXCEPTION 'slice1_context_rollback';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-leak', 'slice1', 1)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES (
      'context_does_not_leak',
      company = jj_company AND auth.uid() IS NULL,
      'cleared'
    );
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-leak';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('context_does_not_leak', false, SQLERRM);
  END;

  INSERT INTO slice1_matrix VALUES (
    'fixture_cleaned',
    (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM auth.users) = 1
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2,
    'cleaned'
  );
END
$behavior$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $slice1_run$
@@MIGRATION@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260929120000', 'verified_operating_company_context');

DO $rollback_probes$
BEGIN
  BEGIN
    CREATE OR REPLACE FUNCTION access.resolve_verified_operating_company(p_requested uuid, p_inherited boolean)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $drifted$
    BEGIN
      RETURN p_requested;
    END
    $drifted$;
    EXECUTE $slice1_run$
@@ROLLBACK@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_helper_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    CREATE OR REPLACE FUNCTION registry.resolve_child_operating_company(p_supplied uuid, p_parent uuid, p_require_parent boolean)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog
    AS $drifted$
    BEGIN
      RETURN p_supplied;
    END
    $drifted$;
    EXECUTE $slice1_run$
@@ROLLBACK@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_caller_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    GRANT EXECUTE ON FUNCTION access.resolve_verified_operating_company(uuid, boolean) TO authenticated;
    EXECUTE $slice1_run$
@@ROLLBACK@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_acl_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    ALTER TABLE public.property_ownership DISABLE TRIGGER USER;
    EXECUTE $slice1_run$
@@ROLLBACK@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_trigger_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;

  BEGIN
    CREATE POLICY slice1_rls_probe ON public.property_ownership
      FOR SELECT TO postgres USING (true);
    EXECUTE $slice1_run$
@@ROLLBACK@@
$slice1_run$;
    RAISE EXCEPTION 'slice1_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_rls_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;
END
$rollback_probes$;

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929120000';

DO $restored$
DECLARE
  jj_company uuid;
  company uuid;
BEGIN
  SELECT company_id INTO jj_company FROM registry.companies WHERE status = 'active';
  INSERT INTO slice1_matrix VALUES (
    'rollback_helper_absent',
    to_regprocedure('access.resolve_verified_operating_company(uuid,boolean)') IS NULL
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'registry' AND proc.proname = 'resolve_child_operating_company'
      ) = 'eacbfd7957ced1264a3b9c3339c37b01'
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'finance' AND proc.proname = 'enforce_agent_transaction_draft_company'
      ) = 'dfcbb8a5bf1cd56e62b2cb9870870eb5'
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'registry' AND proc.proname = 'forbid_uuid_change'
      ) = 'fe964c798154886e8dacc8edebef908a',
    'restored'
  );
  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice1-restored', 'slice1', 1)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice1_matrix VALUES ('rollback_legacy_omit', company = jj_company, 'assigned');
    DELETE FROM public.property_ownership WHERE property_name = 'slice1-restored';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice1_matrix VALUES ('rollback_legacy_omit', false, SQLERRM);
  END;
  INSERT INTO slice1_matrix VALUES (
    'production_pins',
    (SELECT count(*) FROM supabase_migrations.schema_migrations) = 189
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') = 0
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260928190000') = 1
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927260000') = 1
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE status = 'active') = 1
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM auth.users) = 1
      AND (SELECT count(*) FROM finance.agent_transaction_drafts) = 2
      AND (SELECT count(*) FROM public.v_certified_ledger_transactions) = 2254
      AND (SELECT sum(amount_eur) FROM public.v_certified_ledger_transactions) = 12549078.54
      AND (SELECT count(*) FROM pms.connections) = 1
      AND (SELECT count(*) FROM pms.property_mappings) = 8,
    'pinned'
  );
END
$restored$;

SELECT coalesce(jsonb_object_agg(step, ok), '{}'::jsonb) AS matrix
FROM slice1_matrix;
