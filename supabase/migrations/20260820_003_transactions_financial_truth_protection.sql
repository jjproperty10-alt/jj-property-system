-- =====================================================================
-- F3 - public.transactions append-only / financial-truth protection
-- Gate certification. Enforces the immutable-history decision: financial
-- and descriptive truth on public.transactions is frozen, and rows cannot
-- be deleted. Corrections happen by APPENDING new rows via
-- statements.apply_correction_case (F2), never by in-place edits.
--
-- SCOPE OF THE FREEZE (blocked on UPDATE):
--   date, property_id, property_name, category, subcategory, description,
--   payer, payee, amount_eur, client_charge, notes, k_note
-- STILL ALLOWED on UPDATE (operational metadata, non-financial):
--   review_status, is_deleted, deleted_by, deleted_at, updated_at
-- DELETE: always blocked.
--
-- BLAST RADIUS - READ BEFORE APPLYING:
--   * This blocks the deprecated public.apply_transaction_correction (it
--     UPDATEs financial columns) - intended.
--   * The app's only transaction write is an INSERT (transactions/new) and
--     statements.apply_correction_case INSERTs - both remain allowed
--     (this guard is BEFORE UPDATE OR DELETE only).
--   * It ALSO blocks ad-hoc data-repair migrations that UPDATE/DELETE
--     transactions. Future governed repairs must append via the correction
--     path, or a DBA temporarily disables this trigger for a reviewed,
--     audited maintenance window. Enumerate any remaining legitimate write
--     paths before applying in production.
--
-- Forward-only, additive. REVIEW before applying. Nothing runs on open.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_transactions_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      '[append-only] public.transactions does not allow DELETE (id=%). '
      'Void/correct by appending a new row via statements.apply_correction_case.',
      OLD.id;
  END IF;

  -- UPDATE: freeze financial + descriptive truth; permit operational metadata only.
  IF (NEW.date          IS DISTINCT FROM OLD.date)
     OR (NEW.property_id   IS DISTINCT FROM OLD.property_id)
     OR (NEW.property_name IS DISTINCT FROM OLD.property_name)
     OR (NEW.category      IS DISTINCT FROM OLD.category)
     OR (NEW.subcategory   IS DISTINCT FROM OLD.subcategory)
     OR (NEW.description   IS DISTINCT FROM OLD.description)
     OR (NEW.payer         IS DISTINCT FROM OLD.payer)
     OR (NEW.payee         IS DISTINCT FROM OLD.payee)
     OR (NEW.amount_eur    IS DISTINCT FROM OLD.amount_eur)
     OR (NEW.client_charge IS DISTINCT FROM OLD.client_charge)
     OR (NEW.notes         IS DISTINCT FROM OLD.notes)
     OR (NEW.k_note        IS DISTINCT FROM OLD.k_note)
  THEN
    RAISE EXCEPTION
      '[append-only] public.transactions financial/descriptive columns are immutable (id=%). '
      'Corrections must append a new row via statements.apply_correction_case; '
      'only review_status / is_deleted / deleted_by / deleted_at may be updated.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- BEFORE so the guard fires ahead of trg_transactions_updated_at and rejects
-- the write before updated_at is stamped. Coexists with audit_transactions (AFTER).
DROP TRIGGER IF EXISTS trg_transactions_append_only ON public.transactions;
CREATE TRIGGER trg_transactions_append_only
  BEFORE UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transactions_append_only();
