-- Isolated UUID-bridge bind matrix. Disposable database only.
-- Property UUID pairs are fixtures. No Production writes.

CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void LANGUAGE sql SET search_path TO '' AS $$
  INSERT INTO pg_temp.matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid, p_role text)
RETURNS void LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::text, ''), false);
  PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', COALESCE(p_uid::text, ''), 'role', COALESCE(p_role, ''))::text,
    false
  );
END;
$$;

CREATE SCHEMA IF NOT EXISTS registry;

CREATE TABLE IF NOT EXISTS public.property_definitions (
  property_id uuid PRIMARY KEY,
  property_name text
);

CREATE TABLE IF NOT EXISTS registry.property_external_identities (
  mapping_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT '10f6e9b3-c5b9-4d95-a318-48f20f89477f',
  source_system text NOT NULL,
  external_entity_type text NOT NULL,
  external_id text NOT NULL,
  canonical_property_id uuid REFERENCES public.property_definitions(property_id),
  canonical_name text,
  mapping_status text NOT NULL DEFAULT 'approved',
  confidence numeric NOT NULL DEFAULT 1.0,
  match_method text,
  audit jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_ext_ident_unique UNIQUE (source_system, external_id),
  CONSTRAINT property_ext_ident_approved_has_canonical
    CHECK (mapping_status <> 'approved' OR canonical_property_id IS NOT NULL)
);

ALTER TABLE registry.property_external_identities ENABLE ROW LEVEL SECURITY;

INSERT INTO lifecycle.entity_identity (id, canonical_name, entity_type, status)
VALUES ('91919191-9191-4919-8919-919191919191', 'Fixture Client', 'external', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.property_definitions (property_id) VALUES
  ('47f53dde-9882-4f7c-ba49-3effeb937848'),
  ('20d9571e-6bf7-4307-ba4b-59ae5eb21241'),
  ('c1b87151-a4db-4b63-92e5-6c2c92b29682'),
  ('6549d995-cb14-4247-ae35-2ec97dad8cc9'),
  ('7c714522-421f-46b2-bde6-bc8c2f27049a'),
  ('12121212-1212-4212-8212-121212121212'),
  ('13131313-1313-4313-8313-131313131313'),
  ('14141414-1414-4414-8414-141414141414')
ON CONFLICT DO NOTHING;

INSERT INTO public.properties (id, name) VALUES
  ('b30d3f8f-906d-4223-b741-7db6f968f685', 'fixture'),
  ('7dc5e8ee-7d70-4a67-84e2-9223f6c9f4d8', 'fixture'),
  ('18503f91-0293-4cb1-9fcf-b7d0d09c0ef1', 'fixture'),
  ('b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', 'fixture'),
  ('4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a', 'fixture'),
  ('15151515-1515-4515-8515-151515151515', 'fixture'),
  ('16161616-1616-4616-8616-161616161616', 'fixture'),
  ('17171717-1717-4717-8717-171717171717', 'fixture'),
  ('18181818-1818-4818-8818-181818181818', 'fixture')
ON CONFLICT DO NOTHING;

INSERT INTO registry.property_external_identities
  (source_system, external_entity_type, external_id, canonical_property_id, mapping_status, match_method)
VALUES
  ('app.properties', 'property', 'b30d3f8f-906d-4223-b741-7db6f968f685', '47f53dde-9882-4f7c-ba49-3effeb937848', 'approved', 'uuid'),
  ('app.properties', 'property', '7dc5e8ee-7d70-4a67-84e2-9223f6c9f4d8', '20d9571e-6bf7-4307-ba4b-59ae5eb21241', 'approved', 'uuid'),
  ('app.properties', 'property', '18503f91-0293-4cb1-9fcf-b7d0d09c0ef1', 'c1b87151-a4db-4b63-92e5-6c2c92b29682', 'approved', 'uuid'),
  ('app.properties', 'property', 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', '6549d995-cb14-4247-ae35-2ec97dad8cc9', 'approved', 'uuid'),
  ('app.properties', 'property', '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a', '7c714522-421f-46b2-bde6-bc8c2f27049a', 'approved', 'uuid'),
  ('app.properties', 'property', '17171717-1717-4717-8717-171717171717', '12121212-1212-4212-8212-121212121212', 'approved', 'uuid'),
  ('app.properties', 'property', '18181818-1818-4818-8818-181818181818', '13131313-1313-4313-8313-131313131313', 'approved', 'uuid'),
  ('app.properties', 'property', '16161616-1616-4616-8616-161616161616', '14141414-1414-4414-8414-141414141414', 'approved', 'uuid'),
  ('app.entity_registry', 'property', '16161616-1616-4616-8616-161616161616', '12121212-1212-4212-8212-121212121212', 'approved', 'uuid');

INSERT INTO lifecycle.entity_property_associations (entity_id, property_id, association_source, status) VALUES
  ('91919191-9191-4919-8919-919191919191', '47f53dde-9882-4f7c-ba49-3effeb937848', 'wizard', 'active'),
  ('91919191-9191-4919-8919-919191919191', '20d9571e-6bf7-4307-ba4b-59ae5eb21241', 'wizard', 'active'),
  ('91919191-9191-4919-8919-919191919191', 'c1b87151-a4db-4b63-92e5-6c2c92b29682', 'wizard', 'active'),
  ('91919191-9191-4919-8919-919191919191', '6549d995-cb14-4247-ae35-2ec97dad8cc9', 'wizard', 'active'),
  ('91919191-9191-4919-8919-919191919191', '7c714522-421f-46b2-bde6-bc8c2f27049a', 'wizard', 'active'),
  ('91919191-9191-4919-8919-919191919191', '12121212-1212-4212-8212-121212121212', 'wizard', 'inactive'),
  ('91919191-9191-4919-8919-919191919191', '13131313-1313-4313-8313-131313131313', 'wizard', 'draft');

CREATE TEMP TABLE bridge_pair (
  ord integer PRIMARY KEY,
  public_id uuid NOT NULL,
  epa_id uuid NOT NULL
);
INSERT INTO bridge_pair VALUES
  (1, 'b30d3f8f-906d-4223-b741-7db6f968f685', '47f53dde-9882-4f7c-ba49-3effeb937848'),
  (2, '7dc5e8ee-7d70-4a67-84e2-9223f6c9f4d8', '20d9571e-6bf7-4307-ba4b-59ae5eb21241'),
  (3, '18503f91-0293-4cb1-9fcf-b7d0d09c0ef1', 'c1b87151-a4db-4b63-92e5-6c2c92b29682'),
  (4, 'b54e015f-05f9-4f75-a3e7-9362c6e2e0ae', '6549d995-cb14-4247-ae35-2ec97dad8cc9'),
  (5, '4dc5c26c-ce0c-49ec-8f44-a525f68f0b8a', '7c714522-421f-46b2-bde6-bc8c2f27049a');

DO $m$
DECLARE
  v_client uuid := '91919191-9191-4919-8919-919191919191';
  v_other uuid := '22222222-2222-4222-8222-222222222222';
  v_ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_cert jsonb;
  v_cert_id uuid;
  v_other_cert jsonb;
  v_other_cert_id uuid;
  v_line uuid;
  v_bind jsonb;
  v_first uuid;
  v_epa_before integer;
  v_props_before integer;
  v_defs_before integer;
  v_tx_before integer;
  v_rc3 text;
  v_ledger text;
  v_pair record;
  v_lines jsonb := '[]'::jsonb;
  v_ord integer := 0;
  v_key text;
BEGIN
  SELECT count(*) INTO v_epa_before FROM lifecycle.entity_property_associations;
  SELECT count(*) INTO v_props_before FROM public.properties;
  SELECT count(*) INTO v_defs_before FROM public.property_definitions;
  SELECT count(*) INTO v_tx_before FROM public.transactions;
  v_rc3 := md5(pg_get_viewdef('public.v_rc3_classified'::regclass, true));
  v_ledger := md5(pg_get_viewdef('public.v_certified_ledger_transactions'::regclass, true));

  FOR v_pair IN SELECT * FROM bridge_pair ORDER BY ord LOOP
    v_ord := v_ord + 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'line_order', v_ord,
      'property_key', v_pair.public_id::text,
      'property_name', 'fixture',
      'component_code', 'bridge_' || v_ord::text,
      'amount_due_to_jj', -1.00,
      'reason', 'fixture line',
      'evidence_ref', 'ev-' || v_ord::text
    ));
  END LOOP;
  v_lines := v_lines || jsonb_build_array(
    jsonb_build_object('line_order', 6, 'property_key', '15151515-1515-4515-8515-151515151515', 'property_name', 'fixture', 'component_code', 'missing_map', 'amount_due_to_jj', -1.00, 'reason', 'fixture line', 'evidence_ref', 'ev-missing'),
    jsonb_build_object('line_order', 7, 'property_key', '16161616-1616-4616-8616-161616161616', 'property_name', 'fixture', 'component_code', 'multi_map', 'amount_due_to_jj', -1.00, 'reason', 'fixture line', 'evidence_ref', 'ev-multi'),
    jsonb_build_object('line_order', 8, 'property_key', '17171717-1717-4717-8717-171717171717', 'property_name', 'fixture', 'component_code', 'inactive_epa', 'amount_due_to_jj', -1.00, 'reason', 'fixture line', 'evidence_ref', 'ev-inactive'),
    jsonb_build_object('line_order', 9, 'property_key', '18181818-1818-4818-8818-181818181818', 'property_name', 'fixture', 'component_code', 'draft_epa', 'amount_due_to_jj', -1.00, 'reason', 'fixture line', 'evidence_ref', 'ev-draft')
  );

  PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
  EXECUTE 'SET ROLE authenticated';
  v_cert := public.apply_client_settlement_opening_certification(
    v_client, '2026-08-31', 'fixture close', 'evidence:fixture',
    'cert-bridge-fixture-v1', 1, NULL, -9.00, v_lines
  );
  EXECUTE 'RESET ROLE';
  v_cert_id := (v_cert->>'id')::uuid;

  FOR v_pair IN SELECT * FROM bridge_pair ORDER BY ord LOOP
    SELECT l.id INTO v_line
    FROM finance.client_settlement_certification_lines l
    WHERE l.certification_id = v_cert_id AND l.property_key = v_pair.public_id::text;
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    v_bind := public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, v_pair.public_id, 1,
      'bind fixture', 'ev-bind', 'bind-bridge-' || v_pair.ord::text, NULL
    );
    EXECUTE 'RESET ROLE';
    IF v_pair.ord = 1 THEN
      v_first := (v_bind->>'id')::uuid;
    END IF;
    PERFORM pg_temp.record(
      'map_' || v_pair.ord::text,
      (v_bind->>'inserted_count')::int = 1
        AND EXISTS (
          SELECT 1 FROM finance.client_obligation_property_bindings b
          WHERE b.id = (v_bind->>'id')::uuid
            AND b.property_id = v_pair.public_id
            AND b.entity_id = v_client
            AND b.status = 'active'
        ),
      v_pair.public_id::text || ' -> stored public id, epa ' || v_pair.epa_id::text
    );
  END LOOP;

  SELECT l.id INTO v_line
  FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_id AND l.line_order = 1;
  PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
  EXECUTE 'SET ROLE authenticated';
  v_bind := public.bind_client_obligation_property(
    v_cert_id, v_line, v_client, 'b30d3f8f-906d-4223-b741-7db6f968f685', 1,
    'bind fixture', 'ev-bind', 'bind-bridge-1', NULL
  );
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.record(
    'replay_same_binding',
    (v_bind->>'replay')::boolean = true AND (v_bind->>'id')::uuid = v_first,
    v_bind::text
  );

  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, '7dc5e8ee-7d70-4a67-84e2-9223f6c9f4d8', 1,
      'bind fixture', 'ev-bind', 'bind-bridge-1', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('conflicting_replay_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('conflicting_replay_rejected', SQLERRM ILIKE '%different payload%', SQLERRM);
  END;

  SELECT l.id INTO v_line FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_id AND l.line_order = 6;
  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, '15151515-1515-4515-8515-151515151515', 1,
      'bind fixture', 'ev-missing', 'bind-missing', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('missing_mapping_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('missing_mapping_rejected', SQLERRM ILIKE '%no approved UUID bridge%', SQLERRM);
  END;

  SELECT l.id INTO v_line FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_id AND l.line_order = 7;
  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, '16161616-1616-4616-8616-161616161616', 1,
      'bind fixture', 'ev-multi', 'bind-multi', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('multiple_mapping_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('multiple_mapping_rejected', SQLERRM ILIKE '%multiple approved UUID bridges%', SQLERRM);
  END;

  SELECT l.id INTO v_line FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_id AND l.line_order = 8;
  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, '17171717-1717-4717-8717-171717171717', 1,
      'bind fixture', 'ev-inactive', 'bind-inactive', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('inactive_rejected', SQLERRM ILIKE '%no active entity_property_associations%', SQLERRM);
  END;

  SELECT l.id INTO v_line FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_cert_id AND l.line_order = 9;
  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, '18181818-1818-4818-8818-181818181818', 1,
      'bind fixture', 'ev-draft', 'bind-draft', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('draft_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('draft_rejected', SQLERRM ILIKE '%no active entity_property_associations%', SQLERRM);
  END;

  PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
  EXECUTE 'SET ROLE authenticated';
  v_other_cert := public.apply_client_settlement_opening_certification(
    v_other, '2026-08-31', 'other entity', 'evidence:other',
    'cert-bridge-other-v1', 1, NULL, -1.00,
    jsonb_build_array(jsonb_build_object(
      'line_order', 1, 'property_key', 'b30d3f8f-906d-4223-b741-7db6f968f685',
      'property_name', 'fixture', 'component_code', 'wrong_entity',
      'amount_due_to_jj', -1.00, 'reason', 'fixture line', 'evidence_ref', 'ev-other'
    ))
  );
  EXECUTE 'RESET ROLE';
  v_other_cert_id := (v_other_cert->>'id')::uuid;
  SELECT l.id INTO v_line FROM finance.client_settlement_certification_lines l
  WHERE l.certification_id = v_other_cert_id;
  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    PERFORM public.bind_client_obligation_property(
      v_other_cert_id, v_line, v_other, 'b30d3f8f-906d-4223-b741-7db6f968f685', 1,
      'bind fixture', 'ev-other', 'bind-wrong-entity', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('wrong_entity_rejected', false, 'accepted');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record(
      'wrong_entity_rejected',
      SQLERRM ILIKE '%no active entity_property_associations%'
        OR SQLERRM ILIKE '%different entity%',
      SQLERRM
    );
  END;

  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE authenticated';
    INSERT INTO finance.client_obligation_property_bindings (
      certification_id, certification_line_id, entity_id, property_id,
      certification_version, property_key, status, reason, evidence_ref,
      idempotency_key, created_by
    ) VALUES (
      v_cert_id, v_line, v_client, 'b30d3f8f-906d-4223-b741-7db6f968f685',
      1, 'x', 'active', 'no', 'no', 'direct-insert', v_ceo
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('direct_write_denied', false, 'insert succeeded');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('direct_write_denied', true, SQLERRM);
  END;

  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE service_role';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, 'b30d3f8f-906d-4223-b741-7db6f968f685', 1,
      'bind fixture', 'ev-bind', 'bind-service', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_execute_denied', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('service_role_execute_denied', SQLERRM ILIKE '%permission denied%', SQLERRM);
  END;

  BEGIN
    PERFORM pg_temp.set_jwt(v_ceo, 'ceo');
    EXECUTE 'SET ROLE anon';
    PERFORM public.bind_client_obligation_property(
      v_cert_id, v_line, v_client, 'b30d3f8f-906d-4223-b741-7db6f968f685', 1,
      'bind fixture', 'ev-bind', 'bind-anon', NULL
    );
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_execute_denied', false, 'executed');
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    PERFORM pg_temp.record('anon_execute_denied', SQLERRM ILIKE '%permission denied%', SQLERRM);
  END;

  PERFORM pg_temp.record(
    'no_epa_or_property_writes',
    (SELECT count(*) FROM lifecycle.entity_property_associations) = v_epa_before
      AND (SELECT count(*) FROM public.properties) = v_props_before
      AND (SELECT count(*) FROM public.property_definitions) = v_defs_before
      AND (SELECT count(*) FROM public.transactions) = v_tx_before,
    'epa/properties/definitions/transactions counts unchanged by the RPC'
  );
  PERFORM pg_temp.record(
    'views_unchanged',
    md5(pg_get_viewdef('public.v_rc3_classified'::regclass, true)) = v_rc3
      AND md5(pg_get_viewdef('public.v_certified_ledger_transactions'::regclass, true)) = v_ledger,
    'rc3 and certified ledger'
  );
  PERFORM pg_temp.record(
    'bindings_store_public_id',
    (SELECT count(*) FROM finance.client_obligation_property_bindings b
      JOIN bridge_pair p ON p.public_id = b.property_id
      WHERE b.status = 'active') = 5
      AND NOT EXISTS (
        SELECT 1 FROM finance.client_obligation_property_bindings b
        JOIN bridge_pair p ON p.epa_id = b.property_id
        WHERE b.status = 'active' AND p.epa_id IS DISTINCT FROM p.public_id
      ),
    'five active bindings use public.properties.id'
  );
END;
$m$;

SELECT test_name, passed, detail FROM matrix_result ORDER BY test_name;
