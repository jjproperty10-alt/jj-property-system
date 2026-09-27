-- Store a property suggestion only when a conversation is created.
-- Existing rows gain a NULL column and are not updated.
-- A later open reads the stored name; the app checks it again against the current catalog.

BEGIN;

ALTER TABLE finance.ops_conversations
  ADD COLUMN IF NOT EXISTS suggested_property_name text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ops_conversations_suggested_property_name_len'
      AND conrelid = 'finance.ops_conversations'::regclass
  ) THEN
    ALTER TABLE finance.ops_conversations
      ADD CONSTRAINT ops_conversations_suggested_property_name_len
      CHECK (
        suggested_property_name IS NULL
        OR char_length(suggested_property_name) BETWEEN 1 AND 200
      );
  END IF;
END;
$constraint$;

COMMENT ON COLUMN finance.ops_conversations.suggested_property_name IS
  'Exact unique staff-visible property name, set only on insert. NULL when unknown or not unique.';

CREATE OR REPLACE FUNCTION finance.trg_ops_conversations_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_conversations forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ops_conversations.created_by must equal auth.uid()'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
      RAISE EXCEPTION 'ops_conversations.idempotency_key is required'
        USING ERRCODE = 'not_null_violation';
    END IF;
    NEW.idempotency_key := btrim(NEW.idempotency_key);
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.external_thread_id IS DISTINCT FROM OLD.external_thread_id
     OR NEW.suggested_property_name IS DISTINCT FROM OLD.suggested_property_name
  THEN
    RAISE EXCEPTION 'ops_conversations identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.create_ops_conversation(text, text, text);
DROP FUNCTION IF EXISTS public.create_ops_conversation(text, text, text, text);

CREATE FUNCTION public.create_ops_conversation(
  p_channel text,
  p_idempotency_key text,
  p_external_thread_id text DEFAULT NULL,
  p_suggested_property_name text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  status text,
  reused_existing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
  v_status text;
  v_channel text;
  v_key text;
  v_thread text;
  v_raw text;
  v_suggestion text;
  v_match_count integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  v_channel := lower(btrim(COALESCE(p_channel, '')));
  IF v_channel <> 'web' THEN
    RAISE EXCEPTION 'Phase 1B allows only the web channel'
      USING ERRCODE = 'check_violation';
  END IF;

  v_key := btrim(COALESCE(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'idempotency_key is required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  v_thread := NULLIF(btrim(COALESCE(p_external_thread_id, '')), '');

  -- Staff SELECT on public.properties is finance.is_active_jj_staff() with no row filter.
  -- That gate already passed. Store the name only when it equals exactly one catalog row.
  -- A partial, unknown, or repeated name becomes NULL and does not fail creation.
  v_suggestion := NULL;
  v_raw := NULLIF(btrim(COALESCE(p_suggested_property_name, '')), '');
  IF v_raw IS NOT NULL AND char_length(v_raw) BETWEEN 1 AND 200 THEN
    SELECT count(*)::integer
      INTO v_match_count
      FROM public.properties AS property
     WHERE property.name = v_raw;
    IF v_match_count = 1 THEN
      v_suggestion := v_raw;
    END IF;
  END IF;

  INSERT INTO finance.ops_conversations AS c (
    channel,
    status,
    created_by,
    external_thread_id,
    idempotency_key,
    suggested_property_name
  ) VALUES (
    v_channel,
    'open',
    v_uid,
    v_thread,
    v_key,
    v_suggestion
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING c.id, c.status
    INTO v_id, v_status;

  IF v_id IS NOT NULL THEN
    id := v_id;
    status := v_status;
    reused_existing := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT c.id, c.status
    INTO v_id, v_status
    FROM finance.ops_conversations c
   WHERE c.idempotency_key = v_key
     AND c.created_by = v_uid;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Conversation already exists for this key.'
      USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO finance.ops_audit_events (
    correlation_id,
    conversation_id,
    actor_user_id,
    actor_type,
    event_type,
    target_type,
    target_id,
    safe_metadata
  ) VALUES (
    v_id,
    v_id,
    v_uid,
    'staff',
    'conversation_reused',
    'conversation',
    v_id,
    jsonb_build_object('channel', v_channel)
  );

  id := v_id;
  status := v_status;
  reused_existing := true;
  RETURN NEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.list_ops_conversation(uuid);

CREATE FUNCTION public.list_ops_conversation(p_conversation_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  channel text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  messages jsonb,
  suggested_property_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.channel,
    c.status,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.completed_at,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'direction', m.direction,
          'body', m.body,
          'actor_user_id', m.actor_user_id,
          'created_at', m.created_at
        )
        ORDER BY m.created_at ASC, m.id ASC
      )
      FROM finance.ops_messages m
      WHERE m.conversation_id = c.id
    ), '[]'::jsonb),
    c.suggested_property_name
  FROM finance.ops_conversations c
  WHERE c.id = p_conversation_id
    AND c.created_by = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ops_conversation(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ops_conversation(text, text, text, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_ops_conversation(text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_ops_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_ops_conversation(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_ops_conversation(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
