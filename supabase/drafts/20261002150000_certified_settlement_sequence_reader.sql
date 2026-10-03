-- ============================================================
-- UNAPPROVED DRAFT. Not a migration.
-- This file was moved out of supabase/migrations into supabase/drafts so
-- a pull request or `supabase db push` cannot apply it.
-- finance.read_certified_client_settlement — cumulative applied openings
-- LOCAL IMPLEMENTATION ONLY. Do not apply to Production, staging, or any
-- remote database from this branch. Separate Yossi authorization required.
-- Do not deploy. Do not merge.
--
-- Root cause (this reader only; no table, view, or rule change):
--   The previous body loaded one applied opening_property_obligations
--   header (ORDER BY as_of DESC, version DESC LIMIT 1) and then scoped
--   lines, slices, unbound lines, allocation sums, and cash_executions
--   to that header. A later applied certification on another as_of
--   replaced the earlier balance. finance.client_owner_level_obligations
--   was never read. Allocations on an earlier certification's lines
--   were dropped with that header.
--
-- Assumption — confirm before apply (no column marks incremental vs snapshot):
--   Applied opening_property_obligations rows for one entity are cumulative
--   across as_of. A supersedes_id chain stays inside one as_of: the apply
--   path voids the predecessor, and this reader also skips a row that an
--   applied successor supersedes. Different as_of dates are added in
--   as_of order. Owner-level amount_due_to_jj is added once for applied
--   rows with effective_date <= p_as_of (positive reduces what JJ owes).
--   Cash is the signed FIFO allocation total only. That total already
--   includes a partner-funded execution; partner-funding events are not
--   read and are not added again. A reversal is an offsetting allocation
--   and nets to zero once its execution date is on or before p_as_of.
--
-- Unchanged: (uuid, date) -> jsonb, STABLE, SECURITY DEFINER, search_path
-- '', owner (CREATE OR REPLACE preserves it), EXECUTE for service_role
-- only. public.read_certified_client_settlement is not rewritten.
-- public.read_client_settlement_balance is not rewritten.
--
-- When more than one certification is in range, JSON line_order on lines
-- and obligation_slices is a 1..n display sequence across those
-- certifications (as_of, version, stored line_order). Stored line_order
-- is not updated. One certification keeps the stored line_order.
--
-- Does not use COALESCE(client_charge, amount_eur). Opening uses stored
-- certification totals and owner-level amount_due_to_jj. Cash uses
-- allocation signed_amount.
--
-- When at least one applied owner-level obligation is inside p_as_of, the
-- payload gains owner_level_obligations (not a property line). When there
-- are none, that key is omitted so a payload with no owner-level row stays
-- the same shape as the previous reader.
-- ============================================================

CREATE OR REPLACE FUNCTION finance.read_certified_client_settlement(
  p_entity_id UUID,
  p_as_of     DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $csc$
DECLARE
  v_header           finance.client_settlement_certifications%ROWTYPE;
  v_lines            JSONB;
  v_fifo             JSONB;
  v_exclusions       JSONB;
  v_slices           JSONB;
  v_unbound          JSONB;
  v_cash_exec        JSONB;
  v_fifo_total       NUMERIC(12,2);
  v_closing          NUMERIC(12,2);
  v_alloc_signed     NUMERIC(12,2);
  v_remaining_due    NUMERIC(12,2);
  v_remaining_r      NUMERIC(12,2);
  v_layer_ok         BOOLEAN;
  v_cert_ids         UUID[];
  v_cert_count       INTEGER;
  v_certs_due        NUMERIC(12,2);
  v_owner_due        NUMERIC(12,2);
  v_owner_lines      JSONB;
  v_opening          NUMERIC(12,2);
  v_payload          JSONB;
BEGIN
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION '[input] entity_id must be a UUID.';
  END IF;
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION '[input] as_of must be a date.';
  END IF;

  v_layer_ok := finance.settlement_layer_available();

  -- Applied rows only. An applied successor supersedes its predecessor
  -- inside one as_of chain. Distinct as_of dates stay in the set and are
  -- summed below; there is no incremental/snapshot flag on the table.
  SELECT COALESCE(
    pg_catalog.array_agg(c.id ORDER BY c.as_of, c.version, c.id),
    '{}'::uuid[]
  )
    INTO v_cert_ids
  FROM finance.client_settlement_certifications c
  WHERE c.entity_id = p_entity_id
    AND c.as_of <= p_as_of
    AND c.certification_type = 'opening_property_obligations'
    AND c.status = 'applied'
    AND NOT EXISTS (
      SELECT 1
      FROM finance.client_settlement_certifications newer
      WHERE newer.supersedes_id = c.id
        AND newer.entity_id = c.entity_id
        AND newer.certification_type = c.certification_type
        AND newer.status = 'applied'
    );

  v_cert_count := COALESCE(pg_catalog.cardinality(v_cert_ids), 0);

  SELECT * INTO v_header
  FROM finance.client_settlement_certifications c
  WHERE c.id = ANY (v_cert_ids)
  ORDER BY c.as_of DESC, c.version DESC
  LIMIT 1;

  IF NOT FOUND OR v_layer_ok IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object(
      'unavailable', true,
      'reason', CASE
        WHEN v_layer_ok IS NOT TRUE THEN 'settlement_layer_unavailable'
        ELSE 'no_applied_certification'
      END
    );
  END IF;

  IF v_cert_count = 1 THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.line_order),
      '[]'::jsonb
    )
      INTO v_lines
    FROM finance.client_settlement_certification_lines l
    WHERE l.certification_id = v_header.id;
  ELSE
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_set(
          pg_catalog.to_jsonb(q.line),
          '{line_order}',
          pg_catalog.to_jsonb(q.seq)
        )
        ORDER BY q.seq
      ),
      '[]'::jsonb
    )
      INTO v_lines
    FROM (
      SELECT
        l AS line,
        pg_catalog.row_number() OVER (
          ORDER BY c.as_of, c.version, l.line_order, l.id
        )::integer AS seq
      FROM finance.client_settlement_certification_lines l
      JOIN finance.client_settlement_certifications c
        ON c.id = l.certification_id
      WHERE c.id = ANY (v_cert_ids)
    ) q;
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.effective_date, f.created_at, f.event_id), '[]'::jsonb),
         COALESCE(pg_catalog.sum(f.settlement_amount), 0)
    INTO v_fifo, v_fifo_total
  FROM finance.client_fifo_credits(p_entity_id, p_as_of) f;

  v_fifo_total := COALESCE(v_fifo_total, 0);

  SELECT COALESCE(pg_catalog.sum(c.total_due_to_jj), 0)
    INTO v_certs_due
  FROM finance.client_settlement_certifications c
  WHERE c.id = ANY (v_cert_ids);

  SELECT COALESCE(pg_catalog.sum(o.amount_due_to_jj), 0),
         COALESCE(
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id', o.id,
               'effective_date', o.effective_date,
               'amount_due_to_jj', o.amount_due_to_jj,
               'component_code', o.component_code,
               'source_transaction_id', o.source_transaction_id
             )
             ORDER BY o.effective_date, o.id
           ),
           '[]'::jsonb
         )
    INTO v_owner_due, v_owner_lines
  FROM finance.client_owner_level_obligations o
  WHERE o.entity_id = p_entity_id
    AND o.status = 'applied'
    AND o.effective_date <= p_as_of;

  -- One certification and no owner-level row: same numeric source as the
  -- previous reader (the header total), not a re-rounded sum.
  IF v_cert_count = 1 AND v_owner_due = 0 THEN
    v_opening := v_header.total_due_to_jj;
  ELSE
    v_opening := pg_catalog.round(v_certs_due + v_owner_due, 2);
  END IF;

  v_closing := pg_catalog.round(v_opening - v_fifo_total, 2);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'event_id', e.id,
        'event_type', e.event_type,
        'settlement_amount', e.settlement_amount,
        'effective_date', e.effective_date,
        'source_transaction_id', e.source_transaction_id,
        'reason', e.reason,
        'evidence_ref', e.evidence_ref
      )
      ORDER BY e.effective_date, e.created_at, e.id
    ),
    '[]'::jsonb
  )
    INTO v_exclusions
  FROM finance.client_settlement_events e
  WHERE e.entity_id = p_entity_id
    AND e.status = 'applied'
    AND e.event_type = 'exclude_transaction_from_settlement'
    AND e.effective_date <= p_as_of;

  SELECT COALESCE(pg_catalog.sum(a.signed_amount), 0)
    INTO v_alloc_signed
  FROM finance.client_obligation_fifo_allocations a
  JOIN finance.client_cash_settlement_executions x
    ON x.id = a.execution_id
  JOIN finance.client_settlement_certification_lines l
    ON l.id = a.certification_line_id
  WHERE l.certification_id = ANY (v_cert_ids)
    AND x.effective_date <= p_as_of;

  v_alloc_signed := COALESCE(v_alloc_signed, 0);
  v_remaining_due := pg_catalog.round(v_closing - v_alloc_signed, 2);
  v_remaining_r := pg_catalog.round((- v_remaining_due), 2);

  IF v_cert_count = 1 THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(s.j ORDER BY s.line_order, s.property_key),
      '[]'::jsonb
    )
      INTO v_slices
    FROM (
      SELECT
        l.line_order,
        l.property_key,
        pg_catalog.jsonb_build_object(
          'certification_line_id', l.id,
          'line_order', l.line_order,
          'property_key', l.property_key,
          'property_name', l.property_name,
          'property_id', b.property_id,
          'binding_status', CASE WHEN b.property_id IS NULL THEN 'unbound' ELSE 'bound' END,
          'original_signed_amount', pg_catalog.round((- l.amount_due_to_jj), 2),
          'allocated_signed_amount', pg_catalog.round(COALESCE((
            SELECT pg_catalog.sum(a.signed_amount)
            FROM finance.client_obligation_fifo_allocations a
            JOIN finance.client_cash_settlement_executions x
              ON x.id = a.execution_id
            WHERE a.certification_line_id = l.id
              AND x.effective_date <= p_as_of
          ), 0), 2),
          'remaining_signed_amount', pg_catalog.round(
            (- l.amount_due_to_jj) + COALESCE((
              SELECT pg_catalog.sum(a.signed_amount)
              FROM finance.client_obligation_fifo_allocations a
              JOIN finance.client_cash_settlement_executions x
                ON x.id = a.execution_id
              WHERE a.certification_line_id = l.id
                AND x.effective_date <= p_as_of
            ), 0),
            2
          )
        ) AS j
      FROM finance.client_settlement_certification_lines l
      LEFT JOIN finance.client_obligation_property_bindings b
        ON b.certification_line_id = l.id
       AND b.status = 'active'
      WHERE l.certification_id = v_header.id
    ) s;
  ELSE
    SELECT COALESCE(
      pg_catalog.jsonb_agg(s.j ORDER BY s.seq),
      '[]'::jsonb
    )
      INTO v_slices
    FROM (
      SELECT
        q.seq,
        pg_catalog.jsonb_build_object(
          'certification_line_id', q.id,
          'line_order', q.seq,
          'property_key', q.property_key,
          'property_name', q.property_name,
          'property_id', q.property_id,
          'binding_status', CASE WHEN q.property_id IS NULL THEN 'unbound' ELSE 'bound' END,
          'original_signed_amount', pg_catalog.round((- q.amount_due_to_jj), 2),
          'allocated_signed_amount', pg_catalog.round(COALESCE((
            SELECT pg_catalog.sum(a.signed_amount)
            FROM finance.client_obligation_fifo_allocations a
            JOIN finance.client_cash_settlement_executions x
              ON x.id = a.execution_id
            WHERE a.certification_line_id = q.id
              AND x.effective_date <= p_as_of
          ), 0), 2),
          'remaining_signed_amount', pg_catalog.round(
            (- q.amount_due_to_jj) + COALESCE((
              SELECT pg_catalog.sum(a.signed_amount)
              FROM finance.client_obligation_fifo_allocations a
              JOIN finance.client_cash_settlement_executions x
                ON x.id = a.execution_id
              WHERE a.certification_line_id = q.id
                AND x.effective_date <= p_as_of
            ), 0),
            2
          )
        ) AS j
      FROM (
        SELECT
          l.id,
          l.property_key,
          l.property_name,
          l.amount_due_to_jj,
          b.property_id,
          pg_catalog.row_number() OVER (
            ORDER BY c.as_of, c.version, l.line_order, l.id
          )::integer AS seq
        FROM finance.client_settlement_certification_lines l
        JOIN finance.client_settlement_certifications c
          ON c.id = l.certification_id
        LEFT JOIN finance.client_obligation_property_bindings b
          ON b.certification_line_id = l.id
         AND b.status = 'active'
        WHERE c.id = ANY (v_cert_ids)
      ) q
    ) s;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'certification_line_id', u.source_line_identity,
        'property_key', u.property_key,
        'line_order', u.line_order,
        'original_signed_amount', u.original_signed_amount,
        'remaining_signed_amount', u.original_signed_amount,
        'blocked_code', u.blocked_code
      )
      ORDER BY u.line_order, u.source_line_identity
    ),
    '[]'::jsonb
  )
    INTO v_unbound
  FROM finance.v_client_obligation_unbound_lines u
  WHERE u.certification_id = ANY (v_cert_ids);

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'execution_id', x.id,
        'transaction_id', x.transaction_id,
        'direction', x.direction,
        'amount', x.amount,
        'effective_date', x.effective_date,
        'reversal_of', x.reversal_of
      )
      ORDER BY x.effective_date, x.created_at, x.id
    ),
    '[]'::jsonb
  )
    INTO v_cash_exec
  FROM finance.client_cash_settlement_executions x
  WHERE x.entity_id = p_entity_id
    AND x.effective_date <= p_as_of
    AND EXISTS (
      SELECT 1
      FROM finance.client_obligation_fifo_allocations a
      JOIN finance.client_settlement_certification_lines l
        ON l.id = a.certification_line_id
      WHERE a.execution_id = x.id
        AND l.certification_id = ANY (v_cert_ids)
    );

  v_payload := pg_catalog.jsonb_build_object(
    'unavailable', false,
    'as_of', p_as_of,
    'certification_as_of', v_header.as_of,
    'certification', pg_catalog.to_jsonb(v_header),
    'lines', v_lines,
    'fifo_credits', v_fifo,
    'exclusions', v_exclusions,
    'certified_opening_due_to_jj', v_opening,
    'fifo_credits_total', v_fifo_total,
    'certified_closing_due_to_jj', v_closing,
    'cash_allocation_signed_total', v_alloc_signed,
    'certified_remaining_due_to_jj', v_remaining_due,
    'remaining_r', v_remaining_r,
    'remaining_s', v_remaining_due,
    'obligation_slices', v_slices,
    'unbound_lines', v_unbound,
    'cash_executions', v_cash_exec
  );
  -- Omit the key when empty so a client with no owner-level row keeps the
  -- previous payload shape. The rows are not property lines.
  IF pg_catalog.jsonb_array_length(v_owner_lines) > 0 THEN
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'owner_level_obligations', v_owner_lines
    );
  END IF;
  RETURN v_payload;
END;
$csc$;

COMMENT ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) IS
  'Cumulative applied openings (superseded predecessors excluded) plus applied owner-level obligations plus overlay FIFO credits plus cash allocation remaining as-of. Owner-level is not cash and not a property line. Partner-funding events are not added on top of allocations. Closing due_to_jj remains opening minus overlay; remaining applies signed allocations, including reversal offsets. SECURITY DEFINER, empty search_path.';

REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) TO service_role;

-- ROLLBACK-BEGIN
-- Restore the previous body from 20260919190000. Do not run this block with
-- the migration. Strip one leading "-- " from each line below (a line that is
-- only "--" becomes blank) and execute that statement. It restores the exact
-- previous function body, comment, and grants. It does not drop data.
-- CREATE OR REPLACE FUNCTION finance.read_certified_client_settlement(
--   p_entity_id UUID,
--   p_as_of     DATE
-- )
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- STABLE
-- SECURITY DEFINER
-- SET search_path TO ''
-- AS $csc$
-- DECLARE
--   v_header           finance.client_settlement_certifications%ROWTYPE;
--   v_lines            JSONB;
--   v_fifo             JSONB;
--   v_exclusions       JSONB;
--   v_slices           JSONB;
--   v_unbound          JSONB;
--   v_cash_exec        JSONB;
--   v_fifo_total       NUMERIC(12,2);
--   v_closing          NUMERIC(12,2);
--   v_alloc_signed     NUMERIC(12,2);
--   v_remaining_due    NUMERIC(12,2);
--   v_remaining_r      NUMERIC(12,2);
--   v_layer_ok         BOOLEAN;
-- BEGIN
--   IF p_entity_id IS NULL THEN
--     RAISE EXCEPTION '[input] entity_id must be a UUID.';
--   END IF;
--   IF p_as_of IS NULL THEN
--     RAISE EXCEPTION '[input] as_of must be a date.';
--   END IF;
--
--   v_layer_ok := finance.settlement_layer_available();
--
--   SELECT * INTO v_header
--   FROM finance.client_settlement_certifications c
--   WHERE c.entity_id = p_entity_id
--     AND c.as_of <= p_as_of
--     AND c.certification_type = 'opening_property_obligations'
--     AND c.status = 'applied'
--   ORDER BY c.as_of DESC, c.version DESC
--   LIMIT 1;
--
--   IF NOT FOUND OR v_layer_ok IS NOT TRUE THEN
--     RETURN pg_catalog.jsonb_build_object(
--       'unavailable', true,
--       'reason', CASE
--         WHEN v_layer_ok IS NOT TRUE THEN 'settlement_layer_unavailable'
--         ELSE 'no_applied_certification'
--       END
--     );
--   END IF;
--
--   SELECT COALESCE(
--     pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) ORDER BY l.line_order),
--     '[]'::jsonb
--   )
--     INTO v_lines
--   FROM finance.client_settlement_certification_lines l
--   WHERE l.certification_id = v_header.id;
--
--   SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.effective_date, f.created_at, f.event_id), '[]'::jsonb),
--          COALESCE(pg_catalog.sum(f.settlement_amount), 0)
--     INTO v_fifo, v_fifo_total
--   FROM finance.client_fifo_credits(p_entity_id, p_as_of) f;
--
--   v_fifo_total := COALESCE(v_fifo_total, 0);
--   v_closing := pg_catalog.round(v_header.total_due_to_jj - v_fifo_total, 2);
--
--   SELECT COALESCE(
--     pg_catalog.jsonb_agg(
--       pg_catalog.jsonb_build_object(
--         'event_id', e.id,
--         'event_type', e.event_type,
--         'settlement_amount', e.settlement_amount,
--         'effective_date', e.effective_date,
--         'source_transaction_id', e.source_transaction_id,
--         'reason', e.reason,
--         'evidence_ref', e.evidence_ref
--       )
--       ORDER BY e.effective_date, e.created_at, e.id
--     ),
--     '[]'::jsonb
--   )
--     INTO v_exclusions
--   FROM finance.client_settlement_events e
--   WHERE e.entity_id = p_entity_id
--     AND e.status = 'applied'
--     AND e.event_type = 'exclude_transaction_from_settlement'
--     AND e.effective_date <= p_as_of;
--
--   SELECT COALESCE(pg_catalog.sum(a.signed_amount), 0)
--     INTO v_alloc_signed
--   FROM finance.client_obligation_fifo_allocations a
--   JOIN finance.client_cash_settlement_executions x
--     ON x.id = a.execution_id
--   JOIN finance.client_settlement_certification_lines l
--     ON l.id = a.certification_line_id
--   WHERE l.certification_id = v_header.id
--     AND x.effective_date <= p_as_of;
--
--   v_alloc_signed := COALESCE(v_alloc_signed, 0);
--   v_remaining_due := pg_catalog.round(v_closing - v_alloc_signed, 2);
--   v_remaining_r := pg_catalog.round((- v_remaining_due), 2);
--
--   SELECT COALESCE(
--     pg_catalog.jsonb_agg(s.j ORDER BY s.line_order, s.property_key),
--     '[]'::jsonb
--   )
--     INTO v_slices
--   FROM (
--     SELECT
--       l.line_order,
--       l.property_key,
--       pg_catalog.jsonb_build_object(
--         'certification_line_id', l.id,
--         'line_order', l.line_order,
--         'property_key', l.property_key,
--         'property_name', l.property_name,
--         'property_id', b.property_id,
--         'binding_status', CASE WHEN b.property_id IS NULL THEN 'unbound' ELSE 'bound' END,
--         'original_signed_amount', pg_catalog.round((- l.amount_due_to_jj), 2),
--         'allocated_signed_amount', pg_catalog.round(COALESCE((
--           SELECT pg_catalog.sum(a.signed_amount)
--           FROM finance.client_obligation_fifo_allocations a
--           JOIN finance.client_cash_settlement_executions x
--             ON x.id = a.execution_id
--           WHERE a.certification_line_id = l.id
--             AND x.effective_date <= p_as_of
--         ), 0), 2),
--         'remaining_signed_amount', pg_catalog.round(
--           (- l.amount_due_to_jj) + COALESCE((
--             SELECT pg_catalog.sum(a.signed_amount)
--             FROM finance.client_obligation_fifo_allocations a
--             JOIN finance.client_cash_settlement_executions x
--               ON x.id = a.execution_id
--             WHERE a.certification_line_id = l.id
--               AND x.effective_date <= p_as_of
--           ), 0),
--           2
--         )
--       ) AS j
--     FROM finance.client_settlement_certification_lines l
--     LEFT JOIN finance.client_obligation_property_bindings b
--       ON b.certification_line_id = l.id
--      AND b.status = 'active'
--     WHERE l.certification_id = v_header.id
--   ) s;
--
--   SELECT COALESCE(
--     pg_catalog.jsonb_agg(
--       pg_catalog.jsonb_build_object(
--         'certification_line_id', u.source_line_identity,
--         'property_key', u.property_key,
--         'line_order', u.line_order,
--         'original_signed_amount', u.original_signed_amount,
--         'remaining_signed_amount', u.original_signed_amount,
--         'blocked_code', u.blocked_code
--       )
--       ORDER BY u.line_order, u.source_line_identity
--     ),
--     '[]'::jsonb
--   )
--     INTO v_unbound
--   FROM finance.v_client_obligation_unbound_lines u
--   WHERE u.certification_id = v_header.id;
--
--   SELECT COALESCE(
--     pg_catalog.jsonb_agg(
--       pg_catalog.jsonb_build_object(
--         'execution_id', x.id,
--         'transaction_id', x.transaction_id,
--         'direction', x.direction,
--         'amount', x.amount,
--         'effective_date', x.effective_date,
--         'reversal_of', x.reversal_of
--       )
--       ORDER BY x.effective_date, x.created_at, x.id
--     ),
--     '[]'::jsonb
--   )
--     INTO v_cash_exec
--   FROM finance.client_cash_settlement_executions x
--   WHERE x.entity_id = p_entity_id
--     AND x.effective_date <= p_as_of
--     AND EXISTS (
--       SELECT 1
--       FROM finance.client_obligation_fifo_allocations a
--       JOIN finance.client_settlement_certification_lines l
--         ON l.id = a.certification_line_id
--       WHERE a.execution_id = x.id
--         AND l.certification_id = v_header.id
--     );
--
--   RETURN pg_catalog.jsonb_build_object(
--     'unavailable', false,
--     'as_of', p_as_of,
--     'certification_as_of', v_header.as_of,
--     'certification', pg_catalog.to_jsonb(v_header),
--     'lines', v_lines,
--     'fifo_credits', v_fifo,
--     'exclusions', v_exclusions,
--     'certified_opening_due_to_jj', v_header.total_due_to_jj,
--     'fifo_credits_total', v_fifo_total,
--     'certified_closing_due_to_jj', v_closing,
--     'cash_allocation_signed_total', v_alloc_signed,
--     'certified_remaining_due_to_jj', v_remaining_due,
--     'remaining_r', v_remaining_r,
--     'remaining_s', v_remaining_due,
--     'obligation_slices', v_slices,
--     'unbound_lines', v_unbound,
--     'cash_executions', v_cash_exec
--   );
-- END;
-- $csc$;
--
-- COMMENT ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) IS
--   'Applied opening + overlay FIFO credits + cash allocation remaining as-of. Overlay is not cash. Closing due_to_jj remains opening minus overlay; remaining applies signed allocations. SECURITY DEFINER, empty search_path.';
--
-- REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM PUBLIC;
-- REVOKE ALL ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) FROM anon, authenticated;
-- GRANT EXECUTE ON FUNCTION finance.read_certified_client_settlement(UUID, DATE) TO service_role;
-- ROLLBACK-END
