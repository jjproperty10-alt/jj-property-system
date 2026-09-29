-- Transaction matrix for 20260929200000. The runner supplies the migration and rollback.
-- Synthetic rows exist only until the outer ROLLBACK.

CREATE TEMP TABLE slice2_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE slice2_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.slice2_actor(p_role text, p_user uuid)
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
    VALUES ('20260929200000', 'internal_operating_company_path');
    EXECUTE $slice2_run$
@@MIGRATION@@
$slice2_run$;
    RAISE EXCEPTION 'slice2_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929200000';
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  sole uuid;
  jj_user uuid;
  entity_id uuid;
  relationship text;
  company_b uuid;
  prop_id uuid;
  prop_company uuid;
  prop_b uuid;
  def_id uuid;
  def_b uuid;
  engagement uuid;
  company uuid;
  draft_id uuid;
BEGIN
  SELECT company_id INTO sole FROM registry.companies WHERE status = 'active';
  SELECT user_id INTO jj_user
  FROM access.company_memberships
  WHERE is_active AND membership_role = 'company_admin';
  SELECT id, operating_company_id INTO prop_id, prop_company
  FROM public.properties
  WHERE operating_company_id = sole
  ORDER BY id
  LIMIT 1;
  SELECT property_id INTO def_id
  FROM public.property_definitions
  WHERE operating_company_id = sole
    AND property_id IS NOT NULL
  ORDER BY property_name
  LIMIT 1;
  SELECT id INTO entity_id FROM lifecycle.entity_identity ORDER BY id LIMIT 1;
  SELECT relationship_type INTO relationship FROM public.property_definitions LIMIT 1;

  CALL pg_temp.slice2_actor('', NULL);
  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice2-own-omit', 'slice2', 1)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice2_matrix VALUES ('one_omit_still_works', company = sole, 'assigned');
    DELETE FROM public.property_ownership WHERE property_name = 'slice2-own-omit';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('one_omit_still_works', false, SQLERRM);
  END;

  CALL pg_temp.slice2_actor('service_role', NULL);
  BEGIN
    engagement := lifecycle.create_service_engagement(
      entity_id, def_id, 'management_ltr', 'draft', NULL, NULL, 'slice2', jj_user
    );
    SELECT operating_company_id INTO company
    FROM lifecycle.service_engagements
    WHERE id = engagement;
    INSERT INTO slice2_matrix VALUES (
      'one_engagement_internal',
      company = sole AND (SELECT count(*) FROM access.internal_company_write_permit) = 0,
      'assigned'
    );
    DELETE FROM lifecycle.service_engagements WHERE id = engagement;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('one_engagement_internal', false, SQLERRM);
  END;

  CALL pg_temp.slice2_actor('authenticated', jj_user);
  BEGIN
    SELECT result.id INTO draft_id
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE, prop_id, 'slice2', 'JJ', 'Other',
      NULL, NULL, NULL, NULL, NULL, 'slice2', 'draft',
      'slice2-draft-prop', 'manual_form', 1
    ) AS result;
    SELECT operating_company_id INTO company
    FROM finance.agent_transaction_drafts
    WHERE id = draft_id;
    INSERT INTO slice2_matrix VALUES ('one_draft_property', company = prop_company, 'assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('one_draft_property', false, SQLERRM);
  END;

  BEGIN
    SELECT result.id INTO draft_id
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE, NULL, '', 'JJ', 'Other',
      NULL, NULL, NULL, NULL, NULL, 'slice2', 'needs_review',
      'slice2-draft-null', 'manual_form', 1
    ) AS result;
    SELECT operating_company_id INTO company
    FROM finance.agent_transaction_drafts
    WHERE id = draft_id;
    INSERT INTO slice2_matrix VALUES ('one_draft_omit', company = sole, 'assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('one_draft_omit', false, SQLERRM);
  END;
  CALL pg_temp.slice2_actor('', NULL);

  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('slice2-probe-company', 'active')
  RETURNING company_id INTO company_b;

  CALL pg_temp.slice2_actor('service_role', NULL);
  BEGIN
    INSERT INTO lifecycle.service_engagements (
      entity_id, property_id, service_type, status, created_by, notes
    ) VALUES (
      entity_id, def_id, 'management_ltr', 'draft', jj_user, 'slice2-direct'
    );
    INSERT INTO slice2_matrix VALUES ('two_direct_engagement_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_direct_engagement_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    PERFORM set_config('jj.internal_operating_company', sole::text, true);
    INSERT INTO lifecycle.service_engagements (
      entity_id, property_id, service_type, status, created_by, notes
    ) VALUES (
      entity_id, def_id, 'management_ltr', 'draft', jj_user, 'slice2-guc'
    );
    INSERT INTO slice2_matrix VALUES ('two_guc_does_not_authorize', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_guc_does_not_authorize', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  PERFORM set_config('jj.internal_operating_company', '', true);

  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM access.arm_internal_operating_company(sole);
    INSERT INTO slice2_matrix VALUES ('two_service_role_cannot_arm', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_service_role_cannot_arm', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;

  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO access.internal_company_write_permit (txid, company_id)
    VALUES (pg_catalog.txid_current(), sole);
    INSERT INTO slice2_matrix VALUES ('two_service_role_cannot_insert_permit', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_service_role_cannot_insert_permit', SQLERRM LIKE '%permission denied%', SQLERRM);
  END;

  INSERT INTO public.property_definitions (
    property_name, relationship_type, canonical_name, operating_company_id, property_id
  ) VALUES (
    'slice2-def-b', relationship, 'slice2-def-b', company_b, gen_random_uuid()
  )
  RETURNING property_id INTO def_b;

  CALL pg_temp.slice2_actor('service_role', NULL);
  BEGIN
    engagement := lifecycle.create_service_engagement(
      entity_id, def_b, 'airbnb_str', 'draft', NULL, NULL, 'slice2', jj_user
    );
    SELECT operating_company_id INTO company
    FROM lifecycle.service_engagements
    WHERE id = engagement;
    INSERT INTO slice2_matrix VALUES (
      'two_engagement_inherits_parent',
      company = company_b AND (SELECT count(*) FROM access.internal_company_write_permit) = 0,
      'assigned'
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_engagement_inherits_parent', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice2-own-leak', 'slice2', 1);
    INSERT INTO slice2_matrix VALUES ('two_permit_does_not_leak', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_permit_does_not_leak', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct, operating_company_id)
    VALUES ('slice2-own-explicit', 'slice2', 1, company_b);
    INSERT INTO slice2_matrix VALUES ('two_explicit_uuid_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_explicit_uuid_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  CALL pg_temp.slice2_actor('authenticated', jj_user);
  BEGIN
    SELECT result.id INTO draft_id
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE, prop_id, 'slice2', 'JJ', 'Other',
      NULL, NULL, NULL, NULL, NULL, 'slice2', 'draft',
      'slice2-draft-prop-two', 'manual_form', 1
    ) AS result;
    SELECT operating_company_id INTO company
    FROM finance.agent_transaction_drafts
    WHERE id = draft_id;
    INSERT INTO slice2_matrix VALUES ('two_draft_property_still_member', company = prop_company, 'assigned');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_draft_property_still_member', false, SQLERRM);
  END;

  INSERT INTO public.properties (name, operating_company_id)
  VALUES ('slice2-prop-b', company_b)
  RETURNING id INTO prop_b;
  BEGIN
    SELECT result.id INTO draft_id
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE, prop_b, 'slice2-b', 'JJ', 'Other',
      NULL, NULL, NULL, NULL, NULL, 'slice2', 'draft',
      'slice2-draft-b', 'manual_form', 1
    ) AS result;
    INSERT INTO slice2_matrix VALUES ('two_draft_other_company_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_draft_other_company_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;

  BEGIN
    SELECT result.id INTO draft_id
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE, NULL, '', 'JJ', 'Other',
      NULL, NULL, NULL, NULL, NULL, 'slice2', 'needs_review',
      'slice2-draft-null-two', 'manual_form', 1
    ) AS result;
    INSERT INTO slice2_matrix VALUES ('two_draft_omit_blocked', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('two_draft_omit_blocked', SQLERRM = 'BLOCKED_BY_COMPANY_CONTEXT', SQLERRM);
  END;
  CALL pg_temp.slice2_actor('', NULL);

  ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM finance.agent_transaction_drafts WHERE idempotency_key LIKE 'slice2-%';
  ALTER TABLE finance.agent_transaction_drafts ENABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM lifecycle.service_engagements WHERE notes = 'slice2';
  DELETE FROM public.properties WHERE name = 'slice2-prop-b';
  DELETE FROM public.property_definitions WHERE property_name = 'slice2-def-b';
  DELETE FROM registry.companies WHERE company_id = company_b;

  INSERT INTO slice2_matrix VALUES (
    'fixture_cleaned',
    (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE idempotency_key LIKE 'slice2-%') = 0
      AND (SELECT count(*) FROM access.internal_company_write_permit) = 0,
    'cleaned'
  );
END
$behavior$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $slice2_run$
@@MIGRATION@@
$slice2_run$;
    RAISE EXCEPTION 'slice2_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260929200000', 'internal_operating_company_path');

DO $rollback_probe$
BEGIN
  BEGIN
    DROP TABLE access.internal_company_write_permit;
    EXECUTE $slice2_run$
@@ROLLBACK@@
$slice2_run$;
    RAISE EXCEPTION 'slice2_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('rollback_permit_drift', SQLERRM = 'BLOCKED_BY_ROLLBACK', SQLERRM);
  END;
END
$rollback_probe$;

@@ROLLBACK@@

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260929200000';

DO $restored$
DECLARE
  company uuid;
BEGIN
  CALL pg_temp.slice2_actor('', NULL);
  BEGIN
    INSERT INTO public.property_ownership (property_name, owner_name, ownership_pct)
    VALUES ('slice2-own-restored', 'slice2', 1)
    RETURNING operating_company_id INTO company;
    INSERT INTO slice2_matrix VALUES (
      'rollback_legacy_omit',
      company = (SELECT company_id FROM registry.companies WHERE status = 'active'),
      'assigned'
    );
    DELETE FROM public.property_ownership WHERE property_name = 'slice2-own-restored';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO slice2_matrix VALUES ('rollback_legacy_omit', false, SQLERRM);
  END;

  INSERT INTO slice2_matrix VALUES (
    'production_pins',
    (SELECT count(*) FROM supabase_migrations.schema_migrations) = 190
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') = 0
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929120000') = 1
      AND to_regclass('access.internal_company_write_permit') IS NULL
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'access'
          AND proc.proname = 'resolve_verified_operating_company'
      ) = 'a121404d82f0a9d9c1cbe174165b01d1'
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'public'
          AND proc.proname = 'create_agent_transaction_draft'
      ) = 'b21dc8fe041869cd7f790aca90e9372a'
      AND (
        SELECT md5(proc.prosrc)
        FROM pg_proc AS proc
        JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'lifecycle'
          AND proc.proname = 'create_service_engagement'
      ) = '9f99e4749d6345398ae272c2355ca315'
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1,
    'pins'
  );
END
$restored$;

SELECT jsonb_object_agg(step, ok ORDER BY step) AS matrix
FROM slice2_matrix;
