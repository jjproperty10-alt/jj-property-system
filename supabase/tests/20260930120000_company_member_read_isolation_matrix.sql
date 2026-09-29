-- Transaction matrix for 20260930120000. The runner supplies the migration and rollback.
-- Synthetic rows exist only until the outer ROLLBACK.

CREATE TEMP TABLE readiso_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON TABLE readiso_matrix TO anon, authenticated, service_role;

CREATE PROCEDURE pg_temp.readiso_actor(p_role text, p_user uuid)
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
    VALUES ('20260930120000', 'company_member_read_isolation');
    EXECUTE $readiso_run$
@@MIGRATION@@
$readiso_run$;
    RAISE EXCEPTION 'readiso_probe_accepted';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('history_drift', SQLERRM = 'BLOCKED_BY_HISTORY', SQLERRM);
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260930120000';
  END;
END
$drift$;

@@MIGRATION@@

DO $behavior$
DECLARE
  sole uuid;
  jj_user uuid;
  relationship text;
  company_b uuid;
  prop_b uuid;
  visible integer;
  outsider uuid := gen_random_uuid();
BEGIN
  SELECT company_id INTO sole FROM registry.companies WHERE status = 'active';
  SELECT user_id INTO jj_user
  FROM access.company_memberships
  WHERE is_active AND membership_role = 'company_admin';
  SELECT relationship_type INTO relationship FROM public.property_definitions LIMIT 1;

  CALL pg_temp.readiso_actor('authenticated', jj_user);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible
    FROM public.properties
    WHERE operating_company_id = sole;
    INSERT INTO readiso_matrix VALUES ('one_member_sees_own_properties', visible > 0, 'visible');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('one_member_sees_own_properties', false, SQLERRM);
  END;
  RESET ROLE;

  CALL pg_temp.readiso_actor('anon', NULL);
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO visible FROM public.properties;
    INSERT INTO readiso_matrix VALUES ('one_anon_sees_no_properties', visible = 0, 'hidden');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES (
      'one_anon_sees_no_properties',
      SQLERRM LIKE '%permission denied%',
      SQLERRM
    );
  END;
  RESET ROLE;

  CALL pg_temp.readiso_actor('authenticated', outsider);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.properties;
    INSERT INTO readiso_matrix VALUES ('one_nonmember_sees_no_properties', visible = 0, 'hidden');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('one_nonmember_sees_no_properties', false, SQLERRM);
  END;
  RESET ROLE;

  INSERT INTO registry.companies (canonical_name, status)
  VALUES ('readiso-probe-company', 'active')
  RETURNING company_id INTO company_b;
  INSERT INTO public.properties (name, operating_company_id)
  VALUES ('readiso-prop-b', company_b)
  RETURNING id INTO prop_b;
  INSERT INTO public.property_definitions (
    property_name, relationship_type, canonical_name, operating_company_id, property_id
  ) VALUES (
    'readiso-def-b', relationship, 'readiso-def-b', company_b, gen_random_uuid()
  );

  CALL pg_temp.readiso_actor('authenticated', jj_user);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.properties WHERE id = prop_b;
    INSERT INTO readiso_matrix VALUES ('two_member_does_not_see_other_property', visible = 0, 'hidden');
    SELECT count(*) INTO visible FROM public.property_definitions WHERE property_name = 'readiso-def-b';
    INSERT INTO readiso_matrix VALUES ('two_member_does_not_see_other_definition', visible = 0, 'hidden');
    SELECT count(*) INTO visible FROM public.properties WHERE operating_company_id = sole;
    INSERT INTO readiso_matrix VALUES ('two_member_still_sees_own_properties', visible > 0, 'visible');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('two_member_does_not_see_other_property', false, SQLERRM);
  END;
  RESET ROLE;

  CALL pg_temp.readiso_actor('authenticated', outsider);
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible FROM public.properties;
    INSERT INTO readiso_matrix VALUES ('two_nonmember_sees_no_properties', visible = 0, 'hidden');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('two_nonmember_sees_no_properties', false, SQLERRM);
  END;
  RESET ROLE;

  CALL pg_temp.readiso_actor('service_role', NULL);
  BEGIN
    SET LOCAL ROLE service_role;
    SELECT count(*) INTO visible FROM public.properties WHERE id = prop_b;
    INSERT INTO readiso_matrix VALUES ('two_service_role_bypasses_rls', visible = 1, 'bypass');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('two_service_role_bypasses_rls', false, SQLERRM);
  END;
  RESET ROLE;

  ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_company;
  CALL pg_temp.readiso_actor('authenticated', jj_user);
  INSERT INTO finance.agent_transaction_drafts (
    created_by, status, date, property_id, property_name_input,
    category, subcategory, source_type, schema_version,
    idempotency_key, operating_company_id
  ) VALUES (
    jj_user, 'draft', CURRENT_DATE, prop_b, 'readiso-b',
    'JJ', 'Other', 'manual_form', 1,
    'readiso-cross-key', company_b
  );
  ALTER TABLE finance.agent_transaction_drafts ENABLE TRIGGER trg_agent_tx_drafts_company;

  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO visible
    FROM finance.agent_transaction_drafts
    WHERE idempotency_key = 'readiso-cross-key';
    INSERT INTO readiso_matrix VALUES ('two_member_does_not_see_other_draft', visible = 0, 'hidden');
    SELECT count(*) INTO visible
    FROM finance.agent_transaction_drafts
    WHERE operating_company_id = sole;
    INSERT INTO readiso_matrix VALUES ('two_member_still_sees_own_drafts', visible = 2, 'visible');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('two_member_does_not_see_other_draft', false, SQLERRM);
  END;
  RESET ROLE;

  ALTER TABLE finance.agent_transaction_drafts DISABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM finance.agent_transaction_drafts WHERE idempotency_key = 'readiso-cross-key';
  ALTER TABLE finance.agent_transaction_drafts ENABLE TRIGGER trg_agent_tx_drafts_guard;
  DELETE FROM public.properties WHERE id = prop_b;
  DELETE FROM public.property_definitions WHERE property_name = 'readiso-def-b';
  DELETE FROM registry.companies WHERE company_id = company_b;

  INSERT INTO readiso_matrix VALUES (
    'fixture_cleaned',
    (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM public.properties WHERE name = 'readiso-prop-b') = 0
      AND (SELECT count(*) FROM finance.agent_transaction_drafts WHERE idempotency_key = 'readiso-cross-key') = 0,
    'cleaned'
  );
END
$behavior$;

DO $reapply$
BEGIN
  BEGIN
    EXECUTE $readiso_run$
@@MIGRATION@@
$readiso_run$;
    INSERT INTO readiso_matrix VALUES ('reapply', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO readiso_matrix VALUES ('reapply', SQLERRM = 'BLOCKED_BY_REAPPLY', SQLERRM);
  END;
END
$reapply$;

@@ROLLBACK@@

DO $pins$
BEGIN
  INSERT INTO readiso_matrix VALUES (
    'production_pins',
    (SELECT count(*) FROM supabase_migrations.schema_migrations) = 191
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260930120000') = 0
      AND (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929200000') = 1
      AND (
        SELECT count(*) FROM pg_policy AS policy WHERE policy.polname = 'company_member_read'
      ) = 0
      AND (SELECT count(*) FROM registry.companies) = 1
      AND (SELECT count(*) FROM registry.companies WHERE canonical_name = 'Yossi Properties') = 0
      AND (SELECT count(*) FROM access.company_memberships) = 1
      AND (SELECT count(*) FROM auth.users) = 1,
    'pins'
  );
END
$pins$;

SELECT jsonb_object_agg(step, ok ORDER BY step) AS matrix
FROM readiso_matrix;
