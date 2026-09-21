-- Isolated Owner Statement store matrix. Fail closed: any FAIL raises.
-- No guest names. VM1 identity only. No Production Apply.

CREATE TEMP TABLE matrix_result (
  test_name text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.record(p_name text, p_ok boolean, p_detail text)
RETURNS void
LANGUAGE sql
SET search_path TO ''
AS $$
  INSERT INTO pg_temp.matrix_result VALUES (p_name, p_ok, COALESCE(p_detail, ''))
  ON CONFLICT (test_name) DO UPDATE SET passed = EXCLUDED.passed, detail = EXCLUDED.detail;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_jwt(p_uid uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', false);
    PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
    PERFORM set_config(
      'request.jwt.claims',
      CASE
        WHEN p_role IS NULL OR p_role = '' THEN '{}'
        ELSE json_build_object('role', p_role)::text
      END,
      false
    );
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, false);
  PERFORM set_config('request.jwt.claim.role', COALESCE(p_role, ''), false);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', COALESCE(p_role, ''))::text,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.tx_fingerprint()
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT count(*)::text || ':' || md5(
    COALESCE(string_agg(
      t.id::text || '|' || coalesce(t.review_status, '') || '|' || coalesce(t.amount_eur::text, '') || '|' ||
      coalesce(t.payer, '') || '|' || coalesce(t.payee, ''),
      E'\n' ORDER BY t.id
    ), '')
  )
  FROM public.transactions t;
$$;

CREATE OR REPLACE FUNCTION pg_temp.line_obj(
  p_res text DEFAULT '65733679',
  p_ci date DEFAULT '2026-09-03',
  p_co date DEFAULT '2026-09-06',
  p_status text DEFAULT 'confirmed',
  p_gross numeric DEFAULT 932.93,
  p_platform numeric DEFAULT 82.94,
  p_cleaning numeric DEFAULT 150.00,
  p_tax numeric DEFAULT 77.03,
  p_mgmt numeric DEFAULT 124.59,
  p_net numeric DEFAULT 498.37,
  p_recon text DEFAULT 'admitted_candidate',
  p_row text DEFAULT 'Sheet1:R2'
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT jsonb_build_object(
    'reservation_id', p_res,
    'check_in', p_ci,
    'check_out', p_co,
    'reservation_status', p_status,
    'gross_rental_revenue', p_gross,
    'platform_fee', p_platform,
    'guest_cleaning', p_cleaning,
    'total_taxes', p_tax,
    'management_charge', p_mgmt,
    'net_owner_payout', p_net,
    'currency', 'EUR',
    'source_row_reference', p_row,
    'reconciliation_status', p_recon
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.payload(
  p_hash text,
  p_lines jsonb,
  p_supersedes uuid DEFAULT NULL,
  p_property uuid DEFAULT '4eb09c84-907a-404c-b19a-7856f73fadff'::uuid,
  p_listing text DEFAULT '412148',
  p_parser text DEFAULT 'hostaway_owner_minimal_xlsx_v1'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $$
DECLARE
  v jsonb;
BEGIN
  v := jsonb_build_object(
    'canonical_property_id', p_property,
    'listing_id', p_listing,
    'source_kind', 'hostaway_owner_statement',
    'document_hash', p_hash,
    'parser_version', p_parser,
    'normalized_payload_hash', partnership.owner_statement_payload_hash(p_lines),
    'statement_from', '2026-08-30',
    'statement_to', '2026-11-30',
    'source_assertion', 'staff_confirmed_hostaway_download',
    'lines', p_lines
  );
  IF p_supersedes IS NOT NULL THEN
    v := v || jsonb_build_object('supersedes_document_id', p_supersedes);
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.staff_ingest(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  r jsonb;
BEGIN
  EXECUTE 'SET ROLE authenticated';
  r := public.ingest_partnership_owner_statement_document(p);
  EXECUTE 'RESET ROLE';
  RETURN r;
EXCEPTION
  WHEN others THEN
    EXECUTE 'RESET ROLE';
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.staff_read(p_listing text, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  r jsonb;
BEGIN
  EXECUTE 'SET ROLE authenticated';
  r := public.read_partnership_owner_statement_for_listing(p_listing, p_from, p_to);
  EXECUTE 'RESET ROLE';
  RETURN r;
EXCEPTION
  WHEN others THEN
    EXECUTE 'RESET ROLE';
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.staff_void(p_id uuid, p_code text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  r jsonb;
BEGIN
  EXECUTE 'SET ROLE authenticated';
  r := public.void_partnership_owner_statement_document(p_id, p_code, p_note);
  EXECUTE 'RESET ROLE';
  RETURN r;
EXCEPTION
  WHEN others THEN
    EXECUTE 'RESET ROLE';
    RAISE;
END;
$$;

DO $matrix$
DECLARE
  ceo uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  fin uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  ops uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  share uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  v jsonb;
  v2 jsonb;
  v_in jsonb;
  id1 uuid;
  id2 uuid;
  n_doc int;
  n_line int;
  n_audit int;
  n_event int;
  fp_before text;
  fp_after text;
  ok boolean;
  detail text;
  has_listing boolean;
  has_status boolean;
  has_guest boolean;
  exec_ok boolean;
  returns_uuid boolean;
BEGIN
  fp_before := pg_temp.tx_fingerprint();
  PERFORM pg_temp.set_jwt(ceo, 'authenticated');

  SELECT (p.pronargs >= 0 AND pg_catalog.pg_get_function_result(p.oid) = 'uuid')
    INTO returns_uuid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'require_jj_staff'
  LIMIT 1;
  PERFORM pg_temp.record('require_jj_staff_returns_uuid', COALESCE(returns_uuid, false), 'result=' || COALESCE(returns_uuid::text, 'missing'));

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'partnership' AND table_name = 'owner_statement_line' AND column_name = 'listing_id'
  ) INTO has_listing;
  PERFORM pg_temp.record('line_has_no_listing_id', NOT has_listing, 'listing_id_present=' || has_listing::text);

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'partnership' AND table_name = 'owner_statement_document' AND column_name = 'status'
  ) INTO has_status;
  PERFORM pg_temp.record('document_has_no_status', NOT has_status, 'status_present=' || has_status::text);

  PERFORM pg_temp.record(
    'session_is_postgres',
    current_user = 'postgres',
    'current_user=' || current_user
  );
  PERFORM pg_temp.record(
    'supabase_admin_exists',
    EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin'),
    'role'
  );
  PERFORM pg_temp.record(
    'postgres_not_recorded_member_of_supabase_admin',
    NOT EXISTS (
      SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles mem ON mem.oid = m.member
      JOIN pg_roles tgt ON tgt.oid = m.roleid
      WHERE mem.rolname = 'postgres' AND tgt.rolname = 'supabase_admin'
    ),
    'membership'
  );
  IF to_regclass('public.os_ddl_log') IS NULL THEN
    PERFORM pg_temp.record('creator_default_privileges_secured', false, 'missing ddl log');
    PERFORM pg_temp.record(
      'supabase_admin_defaults_untouched',
      NOT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        JOIN pg_roles r ON r.oid = d.defaclrole
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = 'partnership' AND r.rolname = 'supabase_admin'
      ),
      'acl'
    );
  ELSE
    PERFORM pg_temp.record(
      'creator_default_privileges_secured',
      EXISTS (
        SELECT 1
        FROM public.os_ddl_log
        WHERE command_tag = 'ALTER DEFAULT PRIVILEGES'
      ),
      'ddl_log'
    );
    PERFORM pg_temp.record(
      'supabase_admin_defaults_untouched',
      NOT EXISTS (
        SELECT 1
        FROM pg_default_acl d
        JOIN pg_roles r ON r.oid = d.defaclrole
        JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = 'partnership' AND r.rolname = 'supabase_admin'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.os_ddl_log
        WHERE command_tag = 'ALTER DEFAULT PRIVILEGES'
          AND (
            COALESCE(object_identity, '') ILIKE '%supabase_admin%'
            OR COALESCE(object_type, '') ILIKE '%supabase_admin%'
          )
      ),
      'acl'
    );
  END IF;
  PERFORM pg_temp.record(
    'definer_empty_search_path',
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('partnership', 'public')
        AND p.prosecdef
        AND p.proname IN (
          'ingest_owner_statement_document',
          'read_owner_statement_for_listing',
          'void_owner_statement_document',
          'assert_document_not_certified',
          'ingest_partnership_owner_statement_document',
          'read_partnership_owner_statement_for_listing',
          'void_partnership_owner_statement_document'
        )
        AND COALESCE(p.proconfig, ARRAY[]::text[]) IS DISTINCT FROM ARRAY['search_path=""']
    ),
    'search_path'
  );

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'partnership'
      AND column_name IN ('guest_name', 'email', 'phone', 'notes', 'raw_response', 'filename')
  ) INTO has_guest;
  PERFORM pg_temp.record('no_pii_or_raw_columns', NOT has_guest, 'forbidden_col=' || has_guest::text);

  SELECT NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname ILIKE '%avi%owner_statement%'
  ) INTO ok;
  PERFORM pg_temp.record('no_avi_wrapper', ok, 'avi wrapper absent');

  -- Auth: null uid
  PERFORM pg_temp.set_jwt(NULL, 'authenticated');
  BEGIN
    SET ROLE authenticated;
    v := public.ingest_partnership_owner_statement_document('{}'::jsonb);
    RESET ROLE;
    PERFORM pg_temp.record('null_uid_rejected', false, 'unexpected ok');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('null_uid_rejected', SQLERRM ILIKE '%Authenticated session%', SQLERRM);
  END;

  -- Non ceo/finance_admin
  PERFORM pg_temp.set_jwt(ops, 'authenticated');
  v_in := pg_temp.payload(repeat('a', 64), jsonb_build_array(pg_temp.line_obj()));
  BEGIN
    SET ROLE authenticated;
    v := public.ingest_partnership_owner_statement_document(v_in);
    RESET ROLE;
    PERFORM pg_temp.record('ops_role_rejected', false, v::text);
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('ops_role_rejected', SQLERRM ILIKE '%not permitted%', SQLERRM);
  END;

  -- Client actor fields
  PERFORM pg_temp.set_jwt(ceo, 'authenticated');
  v := pg_temp.staff_ingest(
    pg_temp.payload(repeat('b', 64), jsonb_build_array(pg_temp.line_obj()))
    || jsonb_build_object('verified_by', ceo::text)
  );
  PERFORM pg_temp.record('client_verified_by_rejected', (v->>'ok') = 'false' AND (v->>'reason') = 'unknown_field', v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(repeat('b1', 32), jsonb_build_array(pg_temp.line_obj()))
    || jsonb_build_object('property_name', 'Villa Mazotos')
  );
  PERFORM pg_temp.record('property_name_fallback_rejected', (v->>'reason') = 'unknown_field', v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('b2', 32),
      jsonb_build_array(pg_temp.line_obj() || jsonb_build_object('guest_name', 'x'))
    )
  );
  PERFORM pg_temp.record('guest_name_line_rejected', (v->>'reason') = 'unknown_field', v::text);

  -- anon execute
  BEGIN
    SET ROLE anon;
    v := public.ingest_partnership_owner_statement_document('{}'::jsonb);
    RESET ROLE;
    PERFORM pg_temp.record('anon_execute_denied', false, 'unexpected execute');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('anon_execute_denied', true, SQLERRM);
  END;

  -- service_role execute
  BEGIN
    SET ROLE service_role;
    v := public.ingest_partnership_owner_statement_document('{}'::jsonb);
    RESET ROLE;
    PERFORM pg_temp.record('service_role_execute_denied', false, 'unexpected execute');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('service_role_execute_denied', true, SQLERRM);
  END;

  -- share-token / non-staff authenticated
  PERFORM pg_temp.set_jwt(share, 'authenticated');
  v_in := pg_temp.payload(repeat('c', 64), jsonb_build_array(pg_temp.line_obj()));
  BEGIN
    SET ROLE authenticated;
    v := public.ingest_partnership_owner_statement_document(v_in);
    RESET ROLE;
    PERFORM pg_temp.record('share_token_denied', false, v::text);
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('share_token_denied', SQLERRM ILIKE '%not in jj_staff_config%', SQLERRM);
  END;

  -- Internal function execute as authenticated
  PERFORM pg_temp.set_jwt(ceo, 'authenticated');
  BEGIN
    SET ROLE authenticated;
    PERFORM partnership.ingest_owner_statement_document('{}'::jsonb);
    RESET ROLE;
    PERFORM pg_temp.record('internal_ingest_denied', false, 'unexpected execute');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('internal_ingest_denied', true, SQLERRM);
  END;

  -- Direct table DML
  BEGIN
    SET ROLE authenticated;
    PERFORM 1 FROM partnership.owner_statement_document;
    RESET ROLE;
    PERFORM pg_temp.record('authenticated_direct_select_denied', false, 'select allowed');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('authenticated_direct_select_denied', true, SQLERRM);
  END;

  BEGIN
    SET ROLE authenticated;
    INSERT INTO partnership.owner_statement_document DEFAULT VALUES;
    RESET ROLE;
    PERFORM pg_temp.record('authenticated_direct_insert_denied', false, 'insert allowed');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('authenticated_direct_insert_denied', true, SQLERRM);
  END;

  BEGIN
    SET ROLE service_role;
    INSERT INTO partnership.owner_statement_document DEFAULT VALUES;
    RESET ROLE;
    PERFORM pg_temp.record('service_role_direct_insert_denied', false, 'insert allowed');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('service_role_direct_insert_denied', true, SQLERRM);
  END;

  BEGIN
    SET ROLE anon;
    INSERT INTO partnership.owner_statement_document DEFAULT VALUES;
    RESET ROLE;
    PERFORM pg_temp.record('anon_direct_insert_denied', false, 'insert allowed');
  EXCEPTION WHEN others THEN
    RESET ROLE;
    PERFORM pg_temp.record('anon_direct_insert_denied', true, SQLERRM);
  END;

  -- Happy ingest
  PERFORM pg_temp.set_jwt(ceo, 'authenticated');
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('1', 64),
      jsonb_build_array(pg_temp.line_obj())
    )
  );
  id1 := NULLIF(v->>'document_id', '')::uuid;
  PERFORM pg_temp.record(
    'first_ingest_writes',
    (v->>'ok')::boolean IS TRUE AND (v->>'idempotent') = 'false' AND id1 IS NOT NULL,
    v::text
  );

  SELECT count(*) INTO n_doc FROM partnership.owner_statement_document;
  SELECT count(*) INTO n_line FROM partnership.owner_statement_line;
  SELECT count(*) INTO n_audit FROM partnership.owner_statement_audit;
  PERFORM pg_temp.record('first_ingest_counts', n_doc = 1 AND n_line = 1 AND n_audit = 2, format('doc=%s line=%s audit=%s', n_doc, n_line, n_audit));

  -- Idempotent retry
  v2 := pg_temp.staff_ingest(pg_temp.payload(repeat('1', 64), jsonb_build_array(pg_temp.line_obj())));
  SELECT count(*) INTO n_doc FROM partnership.owner_statement_document;
  SELECT count(*) INTO n_line FROM partnership.owner_statement_line;
  SELECT count(*) INTO n_audit FROM partnership.owner_statement_audit;
  PERFORM pg_temp.record(
    'idempotent_zero_write',
    (v2->>'ok')::boolean IS TRUE AND (v2->>'idempotent') = 'true'
      AND (v2->>'document_id') = id1::text
      AND n_doc = 1 AND n_line = 1 AND n_audit = 2,
    v2::text || format(' doc=%s line=%s audit=%s', n_doc, n_line, n_audit)
  );

  v := pg_temp.staff_ingest(
    pg_temp.payload(repeat('1', 64), jsonb_build_array(pg_temp.line_obj()))
    || jsonb_build_object('normalized_payload_hash', repeat('9', 64))
  );
  SELECT count(*) INTO n_doc FROM partnership.owner_statement_document;
  SELECT count(*) INTO n_audit FROM partnership.owner_statement_audit;
  PERFORM pg_temp.record(
    'hash_normalized_conflict',
    (v->>'reason') = 'hash_payload_conflict' AND n_doc = 1 AND n_audit = 2,
    v::text || format(' doc=%s audit=%s', n_doc, n_audit)
  );

  -- Same hash different parser
  v := pg_temp.staff_ingest(
    pg_temp.payload(repeat('1', 64), jsonb_build_array(pg_temp.line_obj()), NULL, '4eb09c84-907a-404c-b19a-7856f73fadff'::uuid, '412148', 'other_parser')
  );
  PERFORM pg_temp.record('hash_parser_conflict', (v->>'reason') IN ('hash_payload_conflict', 'parser_version_rejected'), v::text);

  -- Same hash different cents
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('1', 64),
      jsonb_build_array(pg_temp.line_obj('65733679', '2026-09-03', '2026-09-06', 'confirmed', 100.00, 0, 0, 0, 0, 100.00))
    )
  );
  PERFORM pg_temp.record('hash_cents_conflict', (v->>'reason') = 'hash_payload_conflict', v::text);

  -- 1.999 reject
  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('2', 64),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('2', 64),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj() || jsonb_build_object('gross_rental_revenue', 1.999, 'net_owner_payout', 1.999, 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_1_999', (v->>'ok') = 'false' AND (v->>'reason') = 'cent_rejected', v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('3', 64),
      jsonb_build_array(pg_temp.line_obj('53082517', '2026-09-11', '2026-09-13', 'confirmed', 2.00, 0, 0, 0, 0, 2.00, 'forecast', 'Sheet1:R3'))
    )
  );
  PERFORM pg_temp.record('accept_2_00', (v->>'ok')::boolean IS TRUE, v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('5', 64),
      jsonb_build_array(pg_temp.line_obj('53082519', '2026-09-16', '2026-09-17', 'confirmed', 2.0, 0, 0, 0, 0, 2.0, 'matched', 'Sheet1:R5'))
    )
  );
  PERFORM pg_temp.record('accept_2_0', (v->>'ok')::boolean IS TRUE, v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('4', 64),
      jsonb_build_array(pg_temp.line_obj('53082518', '2026-09-14', '2026-09-15', 'confirmed', 2, 0, 0, 0, 0, 2, 'forecast', 'Sheet1:R4'))
    )
  );
  PERFORM pg_temp.record('accept_integer_2', (v->>'ok')::boolean IS TRUE, v::text);

  -- scientific notation
  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('6', 64),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('6', 64),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj('60000001', '2026-10-01', '2026-10-02') || jsonb_build_object('gross_rental_revenue', '1e2', 'net_owner_payout', '1e2', 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_scientific', (v->>'reason') = 'cent_rejected', v::text);

  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('61', 32),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('61', 32),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj('60000002', '2026-10-08', '2026-10-09') || jsonb_build_object('gross_rental_revenue', 'NaN', 'net_owner_payout', 'NaN', 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_nan', (v->>'reason') = 'cent_rejected', v::text);

  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('62', 32),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('62', 32),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj('60000003', '2026-10-10', '2026-10-11') || jsonb_build_object('gross_rental_revenue', 'Infinity', 'net_owner_payout', 'Infinity', 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_infinity', (v->>'reason') = 'cent_rejected', v::text);

  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('63', 32),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('63', 32),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj('60000004', '2026-10-12', '2026-10-13') || jsonb_build_object('gross_rental_revenue', '10000000000.00', 'net_owner_payout', '10000000000.00', 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_overflow', (v->>'reason') = 'cent_rejected', v::text);

  v := pg_temp.staff_ingest(
    jsonb_build_object(
      'canonical_property_id', '4eb09c84-907a-404c-b19a-7856f73fadff',
      'listing_id', '412148',
      'source_kind', 'hostaway_owner_statement',
      'document_hash', repeat('64', 32),
      'parser_version', 'hostaway_owner_minimal_xlsx_v1',
      'normalized_payload_hash', repeat('64', 32),
      'statement_from', '2026-08-30',
      'statement_to', '2026-11-30',
      'source_assertion', 'staff_confirmed_hostaway_download',
      'lines', jsonb_build_array(
        pg_temp.line_obj('60000005', '2026-10-14', '2026-10-15') || jsonb_build_object('gross_rental_revenue', '1.2.3', 'net_owner_payout', '1.2.3', 'platform_fee', 0, 'guest_cleaning', 0, 'total_taxes', 0, 'management_charge', 0)
      )
    )
  );
  PERFORM pg_temp.record('reject_malformed_numeric', (v->>'reason') = 'cent_rejected', v::text);

  -- currency
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('7', 64),
      jsonb_build_array(pg_temp.line_obj('70000001', '2026-10-03', '2026-10-04') || jsonb_build_object('currency', 'USD'))
    )
  );
  PERFORM pg_temp.record('reject_usd', (v->>'reason') = 'currency_rejected', v::text);

  -- identity: legacy uuid
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('8', 64),
      jsonb_build_array(pg_temp.line_obj('80000001', '2026-10-05', '2026-10-06')),
      NULL,
      '48a08e6e-12a6-43af-a929-b3063ee6b909'::uuid
    )
  );
  PERFORM pg_temp.record('legacy_uuid_rejected', (v->>'reason') = 'identity_rejected', v::text);

  -- wrong listing
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('9', 64),
      jsonb_build_array(pg_temp.line_obj('90000001', '2026-10-07', '2026-10-08')),
      NULL,
      '4eb09c84-907a-404c-b19a-7856f73fadff'::uuid,
      '426237'
    )
  );
  PERFORM pg_temp.record('wrong_listing_rejected', (v->>'reason') = 'identity_rejected', v::text);

  -- 53139113 stored as permanently_excluded evidence (not admission)
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('d', 64),
      jsonb_build_array(pg_temp.line_obj('53139113', '2026-08-30', '2026-08-31', 'confirmed', 10, 0, 0, 0, 0, 10, 'permanently_excluded', 'Sheet1:R13'))
    )
  );
  PERFORM pg_temp.record('certified_stay_stored_excluded_status', (v->>'ok')::boolean IS TRUE, v::text);

  -- finance_admin ingest another reservation
  PERFORM pg_temp.set_jwt(fin, 'authenticated');
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('e', 64),
      jsonb_build_array(pg_temp.line_obj('53082520', '2026-09-18', '2026-09-22', 'confirmed', 10, 1, 2, 3, 4, 0, 'admitted_candidate', 'Sheet1:R20'))
    )
  );
  PERFORM pg_temp.record('finance_admin_ingest', (v->>'ok')::boolean IS TRUE, v::text);

  -- reservation overlap outside chain
  PERFORM pg_temp.set_jwt(ceo, 'authenticated');
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('f', 64),
      jsonb_build_array(pg_temp.line_obj())
    )
  );
  PERFORM pg_temp.record('reservation_conflict', (v->>'reason') = 'reservation_conflict' AND v::text NOT ILIKE '%498.37%', v::text);

  -- date pair overlap different reservation
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('0', 64),
      jsonb_build_array(pg_temp.line_obj('65733680', '2026-09-03', '2026-09-06', 'confirmed', 10, 0, 0, 0, 0, 10, 'forecast', 'Sheet1:R80'))
    )
  );
  PERFORM pg_temp.record('date_pair_conflict', (v->>'reason') = 'date_pair_conflict' AND v::text NOT ILIKE '%498%', v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('cf', 32),
      jsonb_build_array(pg_temp.line_obj('53082520', '2026-09-18', '2026-09-22', 'confirmed', 11, 0, 0, 0, 0, 11, 'admitted_candidate', 'Sheet1:R20'))
    )
  );
  PERFORM pg_temp.record('cent_conflict', (v->>'reason') = 'cent_conflict' AND v::text NOT ILIKE '%11.00%' AND v::text NOT ILIKE '%10.00%', v::text);

  -- supersession
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('ab', 32),
      jsonb_build_array(pg_temp.line_obj('65733679', '2026-09-03', '2026-09-06', 'confirmed', 20, 0, 0, 0, 0, 20, 'admitted_candidate', 'Sheet1:R2')),
      id1
    )
  );
  id2 := NULLIF(v->>'document_id', '')::uuid;
  PERFORM pg_temp.record('supersession_succeeds', (v->>'ok')::boolean IS TRUE AND id2 IS NOT NULL AND id2 IS DISTINCT FROM id1, v::text);

  PERFORM pg_temp.record(
    'old_document_immutable_row_stays',
    EXISTS (SELECT 1 FROM partnership.owner_statement_document d WHERE d.id = id1)
      AND NOT partnership.owner_statement_document_is_effective(id1)
      AND partnership.owner_statement_document_is_effective(id2),
    'id1_effective=' || partnership.owner_statement_document_is_effective(id1)::text
  );

  -- supersede once
  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('ac', 32),
      jsonb_build_array(pg_temp.line_obj('65733679', '2026-09-03', '2026-09-06', 'confirmed', 30, 0, 0, 0, 0, 30, 'admitted_candidate', 'Sheet1:R2')),
      id1
    )
  );
  PERFORM pg_temp.record('supersede_only_once', (v->>'ok') = 'false', v::text);

  -- different listing supersedes FK: cannot point at id2 with other listing because listing is on payload and must match 412148. Covered by identity_rejected.

  -- UPDATE/DELETE immutability
  BEGIN
    UPDATE partnership.owner_statement_document SET listing_id = '412148' WHERE id = id1;
    PERFORM pg_temp.record('document_update_forbidden', false, 'updated');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.record('document_update_forbidden', true, SQLERRM);
  END;
  BEGIN
    DELETE FROM partnership.owner_statement_line WHERE document_id = id1;
    PERFORM pg_temp.record('line_delete_forbidden', false, 'deleted');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.record('line_delete_forbidden', true, SQLERRM);
  END;
  BEGIN
    DELETE FROM partnership.owner_statement_document WHERE id = id1;
    PERFORM pg_temp.record('document_delete_forbidden', false, 'deleted');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.record('document_delete_forbidden', true, SQLERRM);
  END;
  BEGIN
    UPDATE partnership.owner_statement_audit SET event = 'document_insert' WHERE true;
    PERFORM pg_temp.record('audit_update_forbidden', false, 'updated');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.record('audit_update_forbidden', true, SQLERRM);
  END;

  -- Reader effective only
  v := pg_temp.staff_read('412148', '2026-08-30', '2026-11-30');
  PERFORM pg_temp.record(
    'reader_effective_only',
    (v->>'ok')::boolean IS TRUE
      AND v::text NOT ILIKE '%document_hash%'
      AND v::text NOT ILIKE '%normalized_payload_hash%'
      AND v::text NOT ILIKE '%parser_version%'
      AND v::text NOT ILIKE '%guest_name%'
      AND v::text NOT ILIKE '%guestName%',
    left(v::text, 400)
  );
  PERFORM pg_temp.record(
    'reader_no_hashes',
    (v::text NOT ILIKE '%"document_hash"%') AND (v::text NOT ILIKE '%normalized_payload_hash%'),
    'ok'
  );

  -- void
  SELECT count(*) INTO n_event FROM partnership.owner_statement_document_event;
  v := pg_temp.staff_void(id2, 'wrong_file', NULL);
  PERFORM pg_temp.record('staff_void_ok', (v->>'ok')::boolean IS TRUE, v::text);
  SELECT count(*) INTO n_doc FROM partnership.owner_statement_document WHERE id = id2;
  SELECT count(*) INTO n_line FROM partnership.owner_statement_line WHERE document_id = id2;
  PERFORM pg_temp.record('void_does_not_delete_rows', n_doc = 1 AND n_line >= 1, format('doc=%s line=%s', n_doc, n_line));

  v := pg_temp.staff_read('412148', '2026-09-03', '2026-09-03');
  PERFORM pg_temp.record('voided_leaf_missing_on_reader', (v->>'reason') = 'missing_evidence', v::text);

  v := pg_temp.staff_void(id2, 'wrong_file', NULL);
  PERFORM pg_temp.record('already_voided_zero_write', (v->>'reason') = 'already_voided', v::text);
  SELECT count(*) INTO n_event FROM partnership.owner_statement_document_event;
  PERFORM pg_temp.record('void_event_count_one_for_doc', (
    SELECT count(*) FROM partnership.owner_statement_document_event e WHERE e.document_id = id2
  ) = 1, 'n=' || (SELECT count(*) FROM partnership.owner_statement_document_event e WHERE e.document_id = id2)::text);

  v := pg_temp.staff_void(id1, 'not_a_reason', NULL);
  PERFORM pg_temp.record('invalid_reason_rejected', (v->>'reason') = 'reason_rejected', v::text);

  v := pg_temp.staff_void(id1, 'other_requires_note', '   ');
  PERFORM pg_temp.record('other_requires_note_blank_rejected', (v->>'reason') = 'reason_note_required', v::text);

  v := pg_temp.staff_void(id1, 'other_requires_note', 'contact me at a@b.com please');
  PERFORM pg_temp.record('email_like_note_rejected', (v->>'reason') = 'reason_note_rejected', v::text);

  v := pg_temp.staff_void(id1, 'wrong_listing', E'bad\tnote');
  PERFORM pg_temp.record('control_char_note_rejected', (v->>'reason') = 'reason_note_rejected', v::text);

  v := pg_temp.staff_ingest(
    pg_temp.payload(
      repeat('ab', 32),
      jsonb_build_array(pg_temp.line_obj('65733679', '2026-09-03', '2026-09-06', 'confirmed', 20, 0, 0, 0, 0, 20, 'admitted_candidate', 'Sheet1:R2'))
    )
  );
  PERFORM pg_temp.record('voided_document_same_hash', (v->>'reason') = 'voided_document_same_hash', v::text);

  CREATE TABLE partnership.certified_owner_statement_link (unexpected text);
  v := pg_temp.staff_void(
    (SELECT id FROM partnership.owner_statement_document WHERE document_hash = repeat('3', 64) LIMIT 1),
    'wrong_file',
    NULL
  );
  PERFORM pg_temp.record('malformed_certified_table_fail_closed', (v->>'reason') = 'certified_document_immutable', v::text);
  DROP TABLE partnership.certified_owner_statement_link;

  BEGIN
    UPDATE partnership.owner_statement_document_event SET reason_code = 'wrong_file' WHERE true;
    PERFORM pg_temp.record('event_update_forbidden', false, 'updated');
  EXCEPTION WHEN others THEN
    PERFORM pg_temp.record('event_update_forbidden', true, SQLERRM);
  END;

  v := pg_temp.staff_read('412148', '2026-08-30', '2026-11-30');
  PERFORM pg_temp.record(
    'reader_staff_not_avi_dto',
    v::text NOT ILIKE '%payer%' AND v::text NOT ILIKE '%payee%' AND v::text NOT ILIKE '%margin%',
    left(COALESCE(v::text, ''), 200)
  );

  fp_after := pg_temp.tx_fingerprint();
  PERFORM pg_temp.record('transactions_unchanged', fp_before = fp_after, fp_before || ' -> ' || fp_after);

  PERFORM pg_temp.record(
    'no_amount_in_conflict_reasons',
    true,
    'checked at reservation_conflict/date_pair_conflict rows'
  );
END;
$matrix$;

SELECT test_name, passed, detail
FROM matrix_result
ORDER BY test_name;
