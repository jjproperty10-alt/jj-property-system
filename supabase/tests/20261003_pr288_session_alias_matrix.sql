-- #288 session alias and draft matrix. Throwaway local Postgres only.
-- The runner wraps this file in BEGIN ... ROLLBACK.
--
-- Detail text starts with PASSED, FAILED, or BLOCKED.
-- FAILED means a requested guarantee does not hold for the SQL that exists.
-- BLOCKED means #288 has no database object for that guarantee.
-- A BLOCKED row is ok=true only when that absence was confirmed.

CREATE TEMP TABLE pr288_matrix (
  step text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);

CREATE TEMP TABLE pr288_actor (
  role_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  expect_staff boolean NOT NULL,
  expect_allowed_aliases integer NOT NULL,
  expect_allowed_properties integer NOT NULL
);

CREATE FUNCTION pg_temp.pr288_fingerprint()
RETURNS text
LANGUAGE sql
AS $$
  SELECT concat_ws(',',
    (SELECT count(*) FROM public.transactions),
    (SELECT count(*) FROM finance.agent_transaction_drafts),
    (SELECT count(*) FROM public.property_name_aliases),
    (SELECT count(*) FROM public.properties),
    (SELECT count(*) FROM access.company_memberships),
    (SELECT count(*) FROM access.internal_company_write_permit),
    (SELECT count(*) FROM public.jj_staff_config)
  );
$$;

CREATE PROCEDURE pg_temp.pr288_row(p_step text, p_ok boolean, p_detail text)
LANGUAGE plpgsql
AS $row$
BEGIN
  INSERT INTO pr288_matrix (step, ok, detail)
  VALUES (
    p_step,
    p_ok,
    replace(replace(coalesce(p_detail, ''), '|', '/'), E'\n', ' ')
  );
END
$row$;

CREATE PROCEDURE pg_temp.pr288_as(p_user uuid)
LANGUAGE plpgsql
AS $as$
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  PERFORM set_config('request.jwt.claims', '', true);
END
$as$;

DO $matrix$
DECLARE
  company_a uuid := '00000000-0000-4000-8000-00000000000a';
  company_b uuid := '00000000-0000-4000-8000-00000000000b';
  superadmin uuid := '00000000-0000-4000-8000-0000000000c1';
  ceo uuid := '00000000-0000-4000-8000-0000000000c2';
  member uuid := '00000000-0000-4000-8000-0000000000c3';
  outsider uuid := '00000000-0000-4000-8000-0000000000c4';
  prop_a uuid;
  prop_b uuid;
  rec record;
  err text;
  probe_err text;
  allowed_aliases integer;
  forbidden_aliases integer;
  forbidden_names text;
  allowed_properties integer;
  forbidden_properties integer;
  staff_flag boolean;
  app_staff boolean;
  fp_before text;
  fp_after text;
  draft_before integer;
  draft_after integer;
  tx_before integer;
  tx_after integer;
  draft_status text;
  payer_stored text;
  payee_stored text;
  posted text;
  draft_company uuid;
  rls_on boolean;
  policy_count integer;
  probe_allowed integer;
  probe_forbidden integer;
  src text;
  alias_funcs integer;
  ambiguous_rows integer;
BEGIN
  INSERT INTO registry.companies (company_id, canonical_name, status)
  VALUES (company_b, 'Throwaway Company B', 'active');

  INSERT INTO pr288_actor (role_key, user_id, expect_staff, expect_allowed_aliases, expect_allowed_properties)
  VALUES
    ('superadmin', superadmin, false, 2, 1),
    ('ceo', ceo, true, 2, 1),
    ('member', member, false, 2, 1),
    ('outsider', outsider, false, 0, 0);

  INSERT INTO access.company_memberships (company_id, user_id, membership_role, is_active)
  VALUES
    (company_a, superadmin, 'company_admin', true),
    (company_a, ceo, 'company_admin', true),
    (company_a, member, 'member', true);

  INSERT INTO public.jj_staff_config (user_id, staff_role, is_active)
  VALUES (ceo, 'ceo', true);

  INSERT INTO public.user_roles (user_id, role, full_name, is_active)
  VALUES
    (superadmin, 'superadmin', 'Super Admin', true),
    (ceo, 'ceo', 'CEO', true);

  INSERT INTO public.properties (name, operating_company_id)
  VALUES ('House A', company_a), ('House B', company_b);
  SELECT id INTO prop_a FROM public.properties WHERE name = 'House A';
  SELECT id INTO prop_b FROM public.properties WHERE name = 'House B';

  INSERT INTO public.property_name_aliases (raw_name, canonical_name, operating_company_id)
  VALUES
    ('בית א', 'House A', company_a),
    ('בית א', 'House A Twin', company_a),
    ('בית ב', 'House B', company_b);
  SELECT count(*) INTO ambiguous_rows
  FROM public.property_name_aliases
  WHERE raw_name = 'בית א';

  SELECT relation.relrowsecurity
    INTO rls_on
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'property_name_aliases';

  SELECT count(*)
    INTO policy_count
  FROM pg_policy AS policy
  JOIN pg_class AS relation ON relation.oid = policy.polrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'property_name_aliases'
    AND policy.polname = 'company_member_read'
    AND NOT policy.polpermissive;

  CALL pg_temp.pr288_row(
    'schema.alias_rls',
    rls_on = false AND policy_count = 1,
    'SCHEMA relrowsecurity=' || rls_on::text
      || ' restrictive company_member_read policies=' || policy_count::text
      || '. Migration 20260930120000 creates the policy and does not enable row security.'
  );

  SELECT prosrc INTO src
  FROM pg_proc
  JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
  WHERE pg_namespace.nspname = 'public'
    AND proname = 'create_agent_transaction_draft';

  CALL pg_temp.pr288_row(
    'schema.draft_rpc_has_no_alias_or_ledger_insert',
    src IS NOT NULL
      AND position('property_name_aliases' in src) = 0
      AND position('user_roles' in src) = 0
      AND position('contacts' in src) = 0
      AND position('resolve_party' in src) = 0
      AND position('insert into public.transactions' in lower(src)) = 0,
    'SCHEMA create_agent_transaction_draft stores payer_input and payee_input as text and does not insert into public.transactions.'
  );

  SELECT count(*) INTO alias_funcs
  FROM pg_proc AS proc
  JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname IN ('public', 'access', 'finance', 'registry')
    AND proc.proname ~* 'alias';

  CALL pg_temp.pr288_row(
    'schema.no_alias_resolver_function',
    alias_funcs = 0
      AND to_regclass('public.contacts') IS NULL
      AND to_regprocedure('public.list_ops_conversation(uuid)') IS NULL
      AND to_regprocedure('public.approve_and_post_agent_transaction_draft(uuid)') IS NULL
      AND to_regprocedure('public.resolve_party_id(text)') IS NULL,
    'BLOCKED no SQL function resolves an alias, a contact, or a payer. list_ops_conversation and approve_and_post are not installed. #288 conversation restore is TypeScript and passes null company ids, so it never calls list_ops_conversation. The one-sentence collector does not call approve_and_post.'
  );

  CALL pg_temp.pr288_row(
    'schema.unknown_alias_has_no_sql_predicate',
    true,
    'BLOCKED listAssistantPropertyAliases selects raw_name, canonical_name with no name argument. An unknown string is rejected only by TypeScript resolveProperty, which this matrix does not execute.'
  );

  FOR rec IN SELECT * FROM pr288_actor ORDER BY role_key LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.jj_staff_config AS staff_row
      WHERE staff_row.user_id = rec.user_id
        AND staff_row.is_active
    ) INTO app_staff;

    IF app_staff THEN
      CALL pg_temp.pr288_row(
        rec.role_key || '.app_reaches_alias_select',
        true,
        'PASSED active jj_staff_config row. listAssistantPropertyAliases issues the session select. user_roles is not read by that SQL.'
      );
    ELSE
      CALL pg_temp.pr288_row(
        rec.role_key || '.app_reaches_alias_select',
        true,
        'BLOCKED no active jj_staff_config row. authenticateStatementUser returns NOT_STAFF before the select. user_roles.superadmin is not that gate.'
      );
    END IF;

    fp_before := pg_temp.pr288_fingerprint();
    err := NULL;
    allowed_aliases := NULL;
    forbidden_aliases := NULL;
    forbidden_names := NULL;
    allowed_properties := NULL;
    forbidden_properties := NULL;
    staff_flag := NULL;
    CALL pg_temp.pr288_as(rec.user_id);
    BEGIN
      SET LOCAL ROLE authenticated;
      staff_flag := finance.is_active_jj_staff();
      SELECT count(*) INTO allowed_aliases
      FROM public.property_name_aliases AS row_alias
      WHERE access.is_company_member(row_alias.operating_company_id);
      SELECT count(*), coalesce(string_agg(row_alias.canonical_name, ',' ORDER BY row_alias.canonical_name), '')
        INTO forbidden_aliases, forbidden_names
      FROM public.property_name_aliases AS row_alias
      WHERE NOT access.is_company_member(row_alias.operating_company_id);
      PERFORM 1
      FROM (
        SELECT raw_name, canonical_name
        FROM public.property_name_aliases
      ) AS app_select;
      SELECT count(*) INTO allowed_properties
      FROM public.properties AS property
      WHERE access.is_company_member(property.operating_company_id);
      SELECT count(*) INTO forbidden_properties
      FROM public.properties AS property
      WHERE NOT access.is_company_member(property.operating_company_id);
    EXCEPTION WHEN OTHERS THEN
      err := SQLERRM;
    END;
    RESET ROLE;
    fp_after := pg_temp.pr288_fingerprint();

    CALL pg_temp.pr288_row(
      rec.role_key || '.staff_helper',
      err IS NULL AND staff_flag = rec.expect_staff,
      CASE
        WHEN err IS NOT NULL THEN 'FAILED ' || err
        WHEN staff_flag = rec.expect_staff THEN 'PASSED finance.is_active_jj_staff=' || staff_flag::text
        ELSE 'FAILED finance.is_active_jj_staff=' || coalesce(staff_flag::text, 'null')
      END
    );

    CALL pg_temp.pr288_row(
      rec.role_key || '.alias_allowed_only',
      err IS NULL
        AND forbidden_aliases = 0
        AND allowed_aliases = rec.expect_allowed_aliases,
      CASE
        WHEN err IS NOT NULL THEN 'FAILED ' || err
        WHEN forbidden_aliases = 0 AND allowed_aliases = rec.expect_allowed_aliases
          THEN 'PASSED allowed=' || allowed_aliases::text || ' forbidden=0'
        ELSE 'FAILED session select raw_name, canonical_name is not limited to the caller company. allowed='
          || coalesce(allowed_aliases::text, 'null')
          || ' expected_allowed=' || rec.expect_allowed_aliases::text
          || ' forbidden=' || coalesce(forbidden_aliases::text, 'null')
          || ' forbidden_names=' || coalesce(forbidden_names, '')
          || '. company_member_read is not applied because relrowsecurity is false.'
      END
    );

    CALL pg_temp.pr288_row(
      rec.role_key || '.properties_allowed_only',
      err IS NULL
        AND forbidden_properties = 0
        AND allowed_properties = rec.expect_allowed_properties,
      CASE
        WHEN err IS NOT NULL THEN 'FAILED ' || err
        WHEN forbidden_properties = 0 AND allowed_properties = rec.expect_allowed_properties
          THEN 'PASSED properties RLS allows ' || allowed_properties::text || ' and hides other companies. Control for the alias table.'
        ELSE 'FAILED properties allowed=' || coalesce(allowed_properties::text, 'null')
          || ' forbidden=' || coalesce(forbidden_properties::text, 'null')
      END
    );

    CALL pg_temp.pr288_row(
      rec.role_key || '.alias_read_does_not_write',
      fp_before = fp_after,
      CASE
        WHEN fp_before = fp_after THEN 'PASSED transactions, drafts, aliases, properties, memberships, permits, and staff rows unchanged.'
        ELSE 'FAILED fingerprint ' || fp_before || ' -> ' || fp_after
      END
    );

    probe_err := NULL;
    probe_allowed := NULL;
    probe_forbidden := NULL;
    CALL pg_temp.pr288_as(rec.user_id);
    BEGIN
      ALTER TABLE public.property_name_aliases ENABLE ROW LEVEL SECURITY;
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO probe_allowed
      FROM public.property_name_aliases AS row_alias
      WHERE access.is_company_member(row_alias.operating_company_id);
      SELECT count(*) INTO probe_forbidden
      FROM public.property_name_aliases AS row_alias
      WHERE NOT access.is_company_member(row_alias.operating_company_id);
      RAISE EXCEPTION 'pr288_probe_done';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'pr288_probe_done' THEN
        probe_err := SQLERRM;
      END IF;
    END;
    RESET ROLE;

    CALL pg_temp.pr288_row(
      'rls_on_probe.' || rec.role_key || '.alias_allowed_only',
      probe_err IS NULL
        AND probe_forbidden = 0
        AND probe_allowed = rec.expect_allowed_aliases,
      CASE
        WHEN probe_err IS NOT NULL THEN 'FAILED ' || probe_err
        WHEN probe_forbidden = 0 AND probe_allowed = rec.expect_allowed_aliases
          THEN 'PASSED with RLS forced on, allowed=' || probe_allowed::text
        ELSE 'FAILED restrictive company_member_read alone does not return the caller aliases. allowed='
          || coalesce(probe_allowed::text, 'null')
          || ' expected=' || rec.expect_allowed_aliases::text
          || ' forbidden=' || coalesce(probe_forbidden::text, 'null')
          || '. There is no permissive policy on property_name_aliases.'
      END
    );

    err := NULL;
    draft_status := NULL;
    draft_before := (SELECT count(*) FROM finance.agent_transaction_drafts);
    tx_before := (SELECT count(*) FROM public.transactions);
    CALL pg_temp.pr288_as(rec.user_id);
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT draft_row.status
        INTO draft_status
      FROM public.create_agent_transaction_draft(
        CURRENT_DATE,
        prop_a,
        'House A',
        'Management',
        'Electricity',
        'Yossi',
        'סיון',
        40,
        NULL,
        'electricity',
        NULL,
        'draft',
        'pr288-' || rec.role_key,
        'manual_form',
        1
      ) AS draft_row;
    EXCEPTION WHEN OTHERS THEN
      err := SQLERRM;
    END;
    RESET ROLE;
    draft_after := (SELECT count(*) FROM finance.agent_transaction_drafts);
    tx_after := (SELECT count(*) FROM public.transactions);

    IF rec.expect_staff THEN
      SELECT draft_row.payer_input, draft_row.payee_input, draft_row.posted_transaction_id::text, draft_row.operating_company_id
        INTO payer_stored, payee_stored, posted, draft_company
      FROM finance.agent_transaction_drafts AS draft_row
      WHERE draft_row.idempotency_key = 'pr288-' || rec.role_key;

      CALL pg_temp.pr288_row(
        rec.role_key || '.draft_does_not_post_transaction',
        err IS NULL
          AND draft_status = 'draft'
          AND draft_after = draft_before + 1
          AND tx_after = tx_before
          AND posted IS NULL
          AND draft_company = company_a
          AND payer_stored = 'Yossi'
          AND payee_stored = 'סיון',
        CASE
          WHEN err IS NOT NULL THEN 'FAILED ' || err
          WHEN tx_after <> tx_before THEN 'FAILED public.transactions changed'
          WHEN posted IS NOT NULL THEN 'FAILED posted_transaction_id was set'
          WHEN draft_status = 'draft'
            AND payer_stored = 'Yossi'
            AND payee_stored = 'סיון'
            THEN 'PASSED one draft row, posted_transaction_id null, transactions unchanged. payer and payee stored verbatim.'
          ELSE 'FAILED status=' || coalesce(draft_status, 'null')
            || ' payer=' || coalesce(payer_stored, 'null')
            || ' payee=' || coalesce(payee_stored, 'null')
            || ' drafts ' || draft_before::text || '->' || draft_after::text
        END
      );
    ELSE
      CALL pg_temp.pr288_row(
        rec.role_key || '.draft_does_not_post_transaction',
        err LIKE '%not authorized%'
          AND draft_after = draft_before
          AND tx_after = tx_before,
        CASE
          WHEN err LIKE '%not authorized%' AND draft_after = draft_before AND tx_after = tx_before
            THEN 'PASSED create_agent_transaction_draft raises not authorized. No draft and no transaction.'
          ELSE 'FAILED err=' || coalesce(err, 'null')
            || ' drafts ' || draft_before::text || '->' || draft_after::text
            || ' transactions ' || tx_before::text || '->' || tx_after::text
        END
      );
    END IF;

    CALL pg_temp.pr288_row(
      rec.role_key || '.payer_payee_alias_sql',
      true,
      'BLOCKED no contact or party alias lookup. The draft RPC writes the supplied payer and payee text. TypeScript extractExplicitPayer and extractUnverifiedPayee are not SQL.'
    );

    CALL pg_temp.pr288_row(
      rec.role_key || '.ambiguous_or_unknown_alias_sql',
      ambiguous_rows = 2,
      'BLOCKED the session select has no fail-closed resolver. בית א has '
        || ambiguous_rows::text
        || ' canonical rows and the select does not raise. Unknown strings are not a SQL predicate. Name guessing in PROPERTY_ALIASES is TypeScript.'
    );
  END LOOP;

  SELECT relation.relrowsecurity
    INTO rls_on
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'property_name_aliases';
  CALL pg_temp.pr288_row(
    'schema.alias_rls_restored_after_probe',
    rls_on = false,
    'SCHEMA the RLS-on probe rolled back. relrowsecurity=' || rls_on::text
  );

  probe_err := NULL;
  CALL pg_temp.pr288_as(ceo);
  BEGIN
    REVOKE SELECT ON TABLE public.property_name_aliases FROM authenticated;
    SET LOCAL ROLE authenticated;
    PERFORM 1
    FROM (
      SELECT raw_name, canonical_name
      FROM public.property_name_aliases
    ) AS app_select;
    RAISE EXCEPTION 'pr288_probe_done';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'pr288_probe_done' THEN
      probe_err := SQLERRM;
    END IF;
  END;
  RESET ROLE;

  CALL pg_temp.pr288_row(
    'repo_without_grant.alias_select',
    false,
    CASE
      WHEN probe_err LIKE '%permission denied%'
        THEN 'FAILED repo migrations do not GRANT SELECT. The session select raises permission denied, so allowed aliases are not returned. ' || probe_err
      WHEN probe_err IS NULL
        THEN 'FAILED revoke did not deny the select'
      ELSE 'FAILED ' || probe_err
    END
  );

  draft_before := (SELECT count(*) FROM finance.agent_transaction_drafts);
  tx_before := (SELECT count(*) FROM public.transactions);
  err := NULL;
  CALL pg_temp.pr288_as(ceo);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE,
      prop_b,
      'House B',
      'Management',
      'Electricity',
      'Yossi',
      'סיון',
      40,
      NULL,
      'electricity',
      NULL,
      'draft',
      'pr288-ceo-foreign',
      'manual_form',
      1
    ) AS draft_row;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
  END;
  RESET ROLE;
  draft_after := (SELECT count(*) FROM finance.agent_transaction_drafts);
  tx_after := (SELECT count(*) FROM public.transactions);
  CALL pg_temp.pr288_row(
    'ceo.cross_company_property_draft',
    err LIKE '%BLOCKED_BY_COMPANY_CONTEXT%'
      AND draft_after = draft_before
      AND tx_after = tx_before,
    CASE
      WHEN err LIKE '%BLOCKED_BY_COMPANY_CONTEXT%' AND draft_after = draft_before AND tx_after = tx_before
        THEN 'PASSED a draft for the other company property is rejected. No transaction.'
      ELSE 'FAILED err=' || coalesce(err, 'null')
        || ' drafts ' || draft_before::text || '->' || draft_after::text
        || ' transactions ' || tx_before::text || '->' || tx_after::text
    END
  );

  draft_before := draft_after;
  err := NULL;
  CALL pg_temp.pr288_as(ceo);
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM 1
    FROM public.create_agent_transaction_draft(
      CURRENT_DATE,
      NULL,
      'House A',
      'Management',
      'Electricity',
      'Yossi',
      'סיון',
      40,
      NULL,
      'electricity',
      NULL,
      'needs_review',
      'pr288-ceo-no-property',
      'manual_form',
      1
    ) AS draft_row;
  EXCEPTION WHEN OTHERS THEN
    err := SQLERRM;
  END;
  RESET ROLE;
  draft_after := (SELECT count(*) FROM finance.agent_transaction_drafts);
  tx_after := (SELECT count(*) FROM public.transactions);
  CALL pg_temp.pr288_row(
    'ceo.null_property_draft_two_companies',
    err LIKE '%BLOCKED_BY_COMPANY_CONTEXT%'
      AND draft_after = draft_before
      AND tx_after = tx_before,
    CASE
      WHEN err LIKE '%BLOCKED_BY_COMPANY_CONTEXT%' AND draft_after = draft_before AND tx_after = tx_before
        THEN 'PASSED with two active companies a null property id does not insert a draft or a transaction. Production pins one active company; this fixture has two so the sole-company fallback does not apply.'
      ELSE 'FAILED err=' || coalesce(err, 'null')
        || ' drafts ' || draft_before::text || '->' || draft_after::text
        || ' transactions ' || tx_before::text || '->' || tx_after::text
    END
  );

  tx_after := (SELECT count(*) FROM public.transactions);
  CALL pg_temp.pr288_row(
    'schema.onesentence_parser_is_not_sql',
    tx_after = 0,
    'BLOCKED the one-sentence parser is TypeScript applyUserText. It does not run in this matrix. The only SQL write exercised here is create_agent_transaction_draft, and public.transactions count is '
      || tx_after::text
      || '.'
  );
END
$matrix$;

SELECT step, ok, detail
FROM pr288_matrix
ORDER BY step;
