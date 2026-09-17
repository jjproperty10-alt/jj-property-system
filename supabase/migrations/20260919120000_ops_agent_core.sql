-- ============================================================
-- Phase 1B — Operations Core (conversation / task / artifact /
-- approval / append-only audit)
-- LOCAL IMPLEMENTATION ONLY. Do not Apply to Production from this
-- branch without a separate Yossi authorization.
--
-- Hidden finance schema. PostgREST is not granted access to finance.
-- Public RPCs: create conversation, append inbound message, list.
-- No send, post, Storage, AI, or public.transactions writes.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;

-- ── Safe JSON payload guard (no credentials / signed URLs / SQL blobs)
CREATE OR REPLACE FUNCTION finance.ops_assert_safe_payload(p_payload jsonb, p_label text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION '% must be a JSON object', p_label
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_payload::text ~* '"(token|password|secret|api_key|refresh_token|access_token|authorization|service_role|service_role_key)"\s*:' THEN
    RAISE EXCEPTION '% must not contain credentials or secrets', p_label
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_payload::text ~* '(signedurl|signed_url|x-amz-signature|eyJ[A-Za-z0-9_-]{20,}\.)' THEN
    RAISE EXCEPTION '% must not contain signed URLs or tokens', p_label
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION finance.ops_assert_safe_payload(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.ops_assert_safe_payload(jsonb, text) FROM anon, authenticated, service_role;

-- ── Task transition matrix (mirrors src/lib/ops/stateMachine.ts)
CREATE OR REPLACE FUNCTION finance.ops_task_transition_allowed(
  p_capability text,
  p_from text,
  p_to text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_needs_approval boolean;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN false;
  END IF;
  IF p_from = p_to THEN
    RETURN true;
  END IF;
  IF p_capability NOT IN (
    'transaction_draft',
    'account_query',
    'report_draft',
    'document_ingest',
    'document_request',
    'email_review',
    'message_draft',
    'contract_draft'
  ) THEN
    RETURN false;
  END IF;

  v_needs_approval := p_capability NOT IN ('account_query', 'email_review');

  IF p_from = 'received' AND p_to IN ('needs_information', 'ready', 'cancelled') THEN
    RETURN true;
  END IF;
  IF p_from = 'needs_information' AND p_to IN ('ready', 'cancelled') THEN
    RETURN true;
  END IF;
  IF p_from = 'ready' AND p_to = 'cancelled' THEN
    RETURN true;
  END IF;
  IF p_from = 'ready' AND p_to = 'awaiting_approval' THEN
    RETURN true;
  END IF;
  IF p_from = 'ready' AND p_to = 'completed' AND v_needs_approval = false THEN
    RETURN true;
  END IF;
  IF p_from = 'awaiting_approval' AND p_to IN ('executing', 'cancelled') THEN
    RETURN true;
  END IF;
  IF p_from = 'executing' AND p_to IN ('completed', 'failed', 'cancelled') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION finance.ops_task_transition_allowed(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.ops_task_transition_allowed(text, text, text) FROM anon, authenticated, service_role;

-- ============================================================
-- 1. finance.ops_conversations
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_conversations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel             text NOT NULL CHECK (channel IN ('web', 'whatsapp', 'email')),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by          uuid NOT NULL,
  external_thread_id  text NULL,
  idempotency_key     text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz NULL,
  CONSTRAINT ops_conversations_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS ops_conversations_channel_thread_key
  ON finance.ops_conversations (channel, external_thread_id)
  WHERE external_thread_id IS NOT NULL;

COMMENT ON TABLE finance.ops_conversations IS
  'Phase 1B Operations Core conversations. Channel-neutral. Web only on public RPCs.';

-- ============================================================
-- 2. finance.ops_messages
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid NOT NULL REFERENCES finance.ops_conversations (id),
  direction            text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  body                 text NOT NULL CHECK (char_length(body) >= 1 AND char_length(body) <= 2000),
  external_message_id  text NULL,
  actor_user_id        uuid NULL,
  idempotency_key      text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_messages_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS ops_messages_conversation_external_key
  ON finance.ops_messages (conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_messages_conversation
  ON finance.ops_messages (conversation_id, created_at, id);

COMMENT ON TABLE finance.ops_messages IS
  'Phase 1B conversation messages. Preserved; no ordinary physical delete.';

-- ============================================================
-- 3. finance.ops_tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES finance.ops_conversations (id),
  capability_type   text NOT NULL CHECK (capability_type IN (
                      'transaction_draft',
                      'account_query',
                      'report_draft',
                      'document_ingest',
                      'document_request',
                      'email_review',
                      'message_draft',
                      'contract_draft'
                    )),
  status            text NOT NULL CHECK (status IN (
                      'received',
                      'needs_information',
                      'ready',
                      'awaiting_approval',
                      'executing',
                      'completed',
                      'failed',
                      'cancelled'
                    )),
  input_payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload    jsonb NULL,
  error_code        text NULL,
  idempotency_key   text NOT NULL,
  created_by        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz NULL,
  CONSTRAINT ops_tasks_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ops_tasks_conversation
  ON finance.ops_tasks (conversation_id, created_at DESC);

COMMENT ON TABLE finance.ops_tasks IS
  'Phase 1B capability tasks. Closed capability registry. JSON is data, not SQL.';

-- ============================================================
-- 4. finance.ops_artifacts
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_artifacts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES finance.ops_tasks (id),
  artifact_type   text NOT NULL CHECK (artifact_type IN (
                    'transaction_draft_preview',
                    'report_preview',
                    'document_filing_proposal',
                    'document_request',
                    'email_summary',
                    'message_draft',
                    'contract_draft'
                  )),
  status          text NOT NULL CHECK (status IN ('prepared', 'superseded', 'approved', 'cancelled')),
  payload         jsonb NOT NULL,
  content_hash    text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'), -- artifact payload hash only
  version         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  sensitivity     text NOT NULL CHECK (sensitivity IN ('internal', 'confidential', 'restricted')),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_artifacts_task
  ON finance.ops_artifacts (task_id, version);

COMMENT ON TABLE finance.ops_artifacts IS
  'Prepared result metadata only. No binary files, IDs, bank details, or signed URLs.';
COMMENT ON COLUMN finance.ops_artifacts.content_hash IS
  'SHA-256 of the prepared artifact payload. Not an approval snapshot hash.';

-- ============================================================
-- 5. finance.ops_approvals
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES finance.ops_tasks (id),
  artifact_id       uuid NOT NULL REFERENCES finance.ops_artifacts (id),
  action_type       text NOT NULL,
  status            text NOT NULL CHECK (status IN ('pending', 'approved', 'consumed', 'expired', 'cancelled')),
  snapshot_hash           text NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  bound_artifact_version  integer NOT NULL CHECK (bound_artifact_version >= 1),
  bound_content_hash      text NOT NULL CHECK (bound_content_hash ~ '^[a-f0-9]{64}$'),
  approved_by             uuid NULL,
  required_role     text NULL,
  policy_version    text NOT NULL,
  nonce             uuid NOT NULL,
  idempotency_key   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  approved_at       timestamptz NULL,
  consumed_at       timestamptz NULL,
  cancelled_at      timestamptz NULL,
  CONSTRAINT ops_approvals_nonce_key UNIQUE (nonce),
  CONSTRAINT ops_approvals_idempotency_key_key UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ops_approvals_task
  ON finance.ops_approvals (task_id, created_at DESC);

COMMENT ON TABLE finance.ops_approvals IS
  'One-time approval receipts bound to an exact artifact snapshot. Phase 1B does not execute.';
COMMENT ON COLUMN finance.ops_approvals.snapshot_hash IS
  'SHA-256 of the complete approved action snapshot. Never treated as artifact.content_hash.';
COMMENT ON COLUMN finance.ops_approvals.bound_content_hash IS
  'Copy of artifact.content_hash at receipt creation. Used to detect artifact mutation, not as the approval hash.';
COMMENT ON COLUMN finance.ops_approvals.bound_artifact_version IS
  'Copy of artifact.version at receipt creation.';

-- ============================================================
-- 6. finance.ops_audit_events
-- ============================================================

CREATE TABLE IF NOT EXISTS finance.ops_audit_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id    uuid NOT NULL,
  conversation_id   uuid NULL,
  task_id           uuid NULL,
  actor_user_id     uuid NULL,
  actor_type        text NOT NULL CHECK (actor_type IN ('staff', 'system', 'webhook')),
  capability_type   text NULL,
  event_type        text NOT NULL,
  target_type       text NULL,
  target_id         uuid NULL,
  payload_hash      text NULL,
  safe_metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_correlation
  ON finance.ops_audit_events (correlation_id, created_at);

COMMENT ON TABLE finance.ops_audit_events IS
  'Append-only Operations Core audit. No raw bodies, OCR, PII, URLs, or secrets.';

-- ============================================================
-- Guards
-- ============================================================

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
  THEN
    RAISE EXCEPTION 'ops_conversations identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_conversations_guard ON finance.ops_conversations;
CREATE TRIGGER trg_ops_conversations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_conversations
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_conversations_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_messages forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ops_messages are immutable after creation'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
    RAISE EXCEPTION 'ops_messages.idempotency_key is required'
      USING ERRCODE = 'not_null_violation';
  END IF;
  NEW.idempotency_key := btrim(NEW.idempotency_key);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_messages_guard ON finance.ops_messages;
CREATE TRIGGER trg_ops_messages_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_messages
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_messages_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_tasks_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_tasks forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ops_tasks.created_by must equal auth.uid()'
        USING ERRCODE = 'restrict_violation';
    END IF;
    PERFORM finance.ops_assert_safe_payload(NEW.input_payload, 'ops_tasks.input_payload');
    IF NEW.result_payload IS NOT NULL THEN
      PERFORM finance.ops_assert_safe_payload(NEW.result_payload, 'ops_tasks.result_payload');
    END IF;
    IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
      RAISE EXCEPTION 'ops_tasks.idempotency_key is required'
        USING ERRCODE = 'not_null_violation';
    END IF;
    NEW.idempotency_key := btrim(NEW.idempotency_key);
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.capability_type IS DISTINCT FROM OLD.capability_type
  THEN
    RAISE EXCEPTION 'ops_tasks identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT finance.ops_task_transition_allowed(OLD.capability_type, OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'ops_tasks invalid status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM finance.ops_assert_safe_payload(NEW.input_payload, 'ops_tasks.input_payload');
  IF NEW.result_payload IS NOT NULL THEN
    PERFORM finance.ops_assert_safe_payload(NEW.result_payload, 'ops_tasks.result_payload');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_tasks_guard ON finance.ops_tasks;
CREATE TRIGGER trg_ops_tasks_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_tasks
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_tasks_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_artifacts_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_artifacts forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'ops_artifacts.created_by must equal auth.uid()'
        USING ERRCODE = 'restrict_violation';
    END IF;
    PERFORM finance.ops_assert_safe_payload(NEW.payload, 'ops_artifacts.payload');
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.artifact_type IS DISTINCT FROM OLD.artifact_type
  THEN
    RAISE EXCEPTION 'ops_artifacts identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('approved', 'superseded') THEN
    IF NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.sensitivity IS DISTINCT FROM OLD.sensitivity
    THEN
      RAISE EXCEPTION 'ops_artifacts snapshot is immutable after approval or supersession'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  PERFORM finance.ops_assert_safe_payload(NEW.payload, 'ops_artifacts.payload');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_artifacts_guard ON finance.ops_artifacts;
CREATE TRIGGER trg_ops_artifacts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_artifacts
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_artifacts_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_approvals_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_approvals forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.idempotency_key IS NULL OR btrim(NEW.idempotency_key) = '' THEN
      RAISE EXCEPTION 'ops_approvals.idempotency_key is required'
        USING ERRCODE = 'not_null_violation';
    END IF;
    NEW.idempotency_key := btrim(NEW.idempotency_key);
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.nonce IS DISTINCT FROM OLD.nonce
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.task_id IS DISTINCT FROM OLD.task_id
     OR NEW.artifact_id IS DISTINCT FROM OLD.artifact_id
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
     OR NEW.snapshot_hash IS DISTINCT FROM OLD.snapshot_hash
     OR NEW.bound_artifact_version IS DISTINCT FROM OLD.bound_artifact_version
     OR NEW.bound_content_hash IS DISTINCT FROM OLD.bound_content_hash
  THEN
    RAISE EXCEPTION 'ops_approvals identity and snapshot columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IN ('consumed', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'ops_approvals status % is terminal', OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status = 'approved'
     AND NEW.status NOT IN ('consumed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'ops_approvals invalid status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'pending'
     AND NEW.status NOT IN ('approved', 'consumed', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'ops_approvals invalid status transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_approvals_guard ON finance.ops_approvals;
CREATE TRIGGER trg_ops_approvals_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_approvals
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_approvals_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_audit_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ops_audit_events forbids physical DELETE'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'ops_audit_events forbids UPDATE'
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM finance.ops_assert_safe_payload(NEW.safe_metadata, 'ops_audit_events.safe_metadata');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_audit_guard ON finance.ops_audit_events;
CREATE TRIGGER trg_ops_audit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON finance.ops_audit_events
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_audit_guard();

CREATE OR REPLACE FUNCTION finance.trg_ops_conversations_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO finance.ops_audit_events (
    correlation_id,
    conversation_id,
    actor_user_id,
    actor_type,
    event_type,
    target_type,
    target_id,
    payload_hash,
    safe_metadata
  ) VALUES (
    NEW.id,
    NEW.id,
    NEW.created_by,
    'staff',
    'conversation_created',
    'conversation',
    NEW.id,
    encode(extensions.digest(convert_to(NEW.idempotency_key, 'UTF8'), 'sha256'::text), 'hex'),
    jsonb_build_object('channel', NEW.channel, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_conversations_audit ON finance.ops_conversations;
CREATE TRIGGER trg_ops_conversations_audit
  AFTER INSERT ON finance.ops_conversations
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_conversations_audit();

CREATE OR REPLACE FUNCTION finance.trg_ops_messages_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  INSERT INTO finance.ops_audit_events (
    correlation_id,
    conversation_id,
    actor_user_id,
    actor_type,
    event_type,
    target_type,
    target_id,
    payload_hash,
    safe_metadata
  ) VALUES (
    NEW.conversation_id,
    NEW.conversation_id,
    NEW.actor_user_id,
    'staff',
    'message_appended',
    'message',
    NEW.id,
    encode(extensions.digest(convert_to(NEW.body, 'UTF8'), 'sha256'::text), 'hex'),
    jsonb_build_object(
      'direction', NEW.direction,
      'body_length', char_length(NEW.body)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_messages_audit ON finance.ops_messages;
CREATE TRIGGER trg_ops_messages_audit
  AFTER INSERT ON finance.ops_messages
  FOR EACH ROW EXECUTE FUNCTION finance.trg_ops_messages_audit();

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE finance.ops_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_artifacts FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.ops_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_conversations_staff_select ON finance.ops_conversations;
CREATE POLICY ops_conversations_staff_select
  ON finance.ops_conversations
  FOR SELECT
  TO authenticated
  USING (finance.is_active_jj_staff() AND created_by = auth.uid());

DROP POLICY IF EXISTS ops_messages_staff_select ON finance.ops_messages;
CREATE POLICY ops_messages_staff_select
  ON finance.ops_messages
  FOR SELECT
  TO authenticated
  USING (
    finance.is_active_jj_staff()
    AND EXISTS (
      SELECT 1
      FROM finance.ops_conversations c
      WHERE c.id = ops_messages.conversation_id
        AND c.created_by = auth.uid()
    )
  );

REVOKE ALL ON TABLE finance.ops_conversations FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_conversations FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.ops_messages FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_messages FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.ops_tasks FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_tasks FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.ops_artifacts FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_artifacts FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.ops_approvals FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_approvals FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE finance.ops_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE finance.ops_audit_events FROM anon, authenticated, service_role;

-- ============================================================
-- Public RPCs (PostgREST-callable). finance stays hidden.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_ops_conversation(
  p_channel text,
  p_idempotency_key text,
  p_external_thread_id text DEFAULT NULL
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

  INSERT INTO finance.ops_conversations AS c (
    channel,
    status,
    created_by,
    external_thread_id,
    idempotency_key
  ) VALUES (
    v_channel,
    'open',
    v_uid,
    v_thread,
    v_key
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

CREATE OR REPLACE FUNCTION public.append_ops_inbound_message(
  p_conversation_id uuid,
  p_body text,
  p_idempotency_key text,
  p_external_message_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  reused_existing boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_id uuid;
  v_key text;
  v_body text;
  v_ext text;
  v_owner uuid;
  v_status text;
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

  IF p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'conversation_id is required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  v_body := COALESCE(p_body, '');
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN
    RAISE EXCEPTION 'message body must be between 1 and 2000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  v_key := btrim(COALESCE(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'idempotency_key is required'
      USING ERRCODE = 'not_null_violation';
  END IF;
  v_ext := NULLIF(btrim(COALESCE(p_external_message_id, '')), '');

  SELECT c.created_by, c.status
    INTO v_owner, v_status
    FROM finance.ops_conversations c
   WHERE c.id = p_conversation_id;

  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid OR v_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO finance.ops_messages AS m (
    conversation_id,
    direction,
    body,
    external_message_id,
    actor_user_id,
    idempotency_key
  ) VALUES (
    p_conversation_id,
    'inbound',
    v_body,
    v_ext,
    v_uid,
    v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING m.id
    INTO v_id;

  IF v_id IS NOT NULL THEN
    UPDATE finance.ops_conversations c
       SET updated_at = now()
     WHERE c.id = p_conversation_id;
    id := v_id;
    reused_existing := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT m.id
    INTO v_id
    FROM finance.ops_messages m
   WHERE m.idempotency_key = v_key
     AND m.conversation_id = p_conversation_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Message already exists for this key.'
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
    p_conversation_id,
    p_conversation_id,
    v_uid,
    'staff',
    'message_reused',
    'message',
    v_id,
    jsonb_build_object('direction', 'inbound', 'body_length', char_length(v_body))
  );

  id := v_id;
  reused_existing := true;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_ops_conversation(p_conversation_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  channel text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  messages jsonb
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
    ), '[]'::jsonb)
  FROM finance.ops_conversations c
  WHERE c.id = p_conversation_id
    AND c.created_by = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Internal consume-once helper for future execution. Not granted to
-- PostgREST roles. Does not send, post, or write public.transactions.
-- snapshot_hash is the action snapshot. artifact.content_hash is payload-only.
CREATE OR REPLACE FUNCTION finance.consume_ops_approval(
  p_approval_id uuid,
  p_expected_snapshot_hash text
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
  v_row finance.ops_approvals%ROWTYPE;
  v_art_id uuid;
  v_art_version integer;
  v_art_content_hash text;
  v_art_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING ERRCODE = '42501';
  END IF;
  IF NOT finance.is_active_jj_staff() THEN
    RAISE EXCEPTION 'not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF p_approval_id IS NULL
     OR p_expected_snapshot_hash IS NULL
     OR p_expected_snapshot_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'approval id and expected snapshot hash are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  SELECT a.*
    INTO v_row
    FROM finance.ops_approvals a
   WHERE a.id = p_approval_id
   FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'approval not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT ar.id, ar.version, ar.content_hash, ar.status
    INTO v_art_id, v_art_version, v_art_content_hash, v_art_status
    FROM finance.ops_artifacts ar
   WHERE ar.id = v_row.artifact_id
   FOR UPDATE;

  IF v_art_id IS NULL THEN
    RAISE EXCEPTION 'approval artifact not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_expected_snapshot_hash IS DISTINCT FROM v_row.snapshot_hash THEN
    RAISE EXCEPTION 'approval snapshot hash mismatch'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF v_row.status = 'consumed' THEN
    id := v_row.id;
    status := v_row.status;
    reused_existing := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.status IN ('expired', 'cancelled') THEN
    RAISE EXCEPTION 'approval cannot be consumed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF v_row.expires_at <= now() THEN
    UPDATE finance.ops_approvals a
       SET status = 'expired'
     WHERE a.id = v_row.id
       AND a.status IN ('pending', 'approved');
    RAISE EXCEPTION 'approval expired'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF v_art_id IS DISTINCT FROM v_row.artifact_id
     OR v_art_version IS DISTINCT FROM v_row.bound_artifact_version
     OR v_art_content_hash IS DISTINCT FROM v_row.bound_content_hash
     OR v_art_status IN ('superseded', 'cancelled') THEN
    RAISE EXCEPTION 'approval artifact identity no longer matches bound snapshot'
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE finance.ops_approvals a
     SET status = 'consumed',
         consumed_at = now(),
         approved_by = COALESCE(a.approved_by, auth.uid()),
         approved_at = COALESCE(a.approved_at, now())
   WHERE a.id = v_row.id
     AND a.status IN ('pending', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval cannot be consumed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO finance.ops_audit_events (
    correlation_id,
    task_id,
    actor_user_id,
    actor_type,
    event_type,
    target_type,
    target_id,
    payload_hash,
    safe_metadata
  ) VALUES (
    v_row.task_id,
    v_row.task_id,
    auth.uid(),
    'staff',
    'approval_consumed',
    'approval',
    v_row.id,
    v_row.snapshot_hash,
    jsonb_build_object('action_type', v_row.action_type, 'reused', false)
  );

  id := v_row.id;
  status := 'consumed';
  reused_existing := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ops_conversation(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ops_conversation(text, text, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_ops_conversation(text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.append_ops_inbound_message(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_ops_inbound_message(uuid, text, text, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.append_ops_inbound_message(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_ops_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_ops_conversation(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.list_ops_conversation(uuid) TO authenticated;

REVOKE ALL ON FUNCTION finance.consume_ops_approval(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION finance.consume_ops_approval(uuid, text) FROM anon, authenticated, service_role;

COMMIT;
