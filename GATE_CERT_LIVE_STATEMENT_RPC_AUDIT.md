# Live statement-lifecycle RPC audit (Gate cert, F4/F6)

Read-only audit of the DEPLOYED `statements` finalize/send RPCs (introspected from
project vsiiprzjrstjcmjpwcrd via `pg_get_functiondef`). These are the functions the
app-side `statementLifecycleActions.ts` calls. Purpose: prove what the DB actually
guarantees before claiming the finalize/send path is safe. Nothing here was modified.

All five are `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''` and begin with
`public.require_jj_staff(ARRAY['ceo','finance_admin','statement_operator'])`.

---

## statements.send_statement — the finalization/immutable-snapshot RPC

**Signature:**
```
send_statement(p_draft_id uuid, p_period_start date, p_period_end date,
  p_statement_type text, p_expected_closing_balance_eur numeric, p_entries jsonb,
  p_language text DEFAULT 'he', p_balance_direction text DEFAULT NULL,
  p_ownership_percentage numeric DEFAULT NULL, p_checklist_result jsonb DEFAULT NULL,
  p_delivery_channels jsonb DEFAULT '[]', p_rendered_package_json jsonb DEFAULT NULL,
  p_description_he text DEFAULT NULL, p_description_en text DEFAULT NULL) RETURNS uuid
```

Verification of the 15 required guarantees (all **ENFORCED**):

1. **Auth/staff** — `v_actor_id := public.require_jj_staff(ARRAY['ceo','finance_admin','statement_operator']);`
2. **Draft exists** — `SELECT * INTO v_draft FROM statements.statement_drafts WHERE draft_id = p_draft_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION '[not_found] Draft % does not exist.'`
3. **Draft ready_to_send** — `IF v_draft.status <> 'ready_to_send' THEN RAISE EXCEPTION '[denied] Draft % has status "%" — only ready_to_send drafts can be sent.'`
4. **Included lines exactly match entries** — bidirectional subset check:
   `IF NOT (v_required_tx_ids <@ v_seen_tx_ids AND v_seen_tx_ids <@ v_required_tx_ids) THEN RAISE EXCEPTION '[validation] Mismatch between draft lines and p_entries...'` where `v_required_tx_ids` = draft lines with `include_in_statement = true`.
5. **Source ids cannot be swapped** — per entry `SELECT reserved_amount_eur ... WHERE draft_id=p_draft_id AND source_transaction_id=v_src_tx; IF NOT FOUND THEN RAISE '[validation] Entry source_transaction_id % is not in draft lines...'`, plus duplicate guard `IF v_src_tx = ANY(v_seen_tx_ids) THEN RAISE '[validation] Duplicate source_transaction_id %...'`.
6. **Released amounts reconcile** — `IF v_released IS DISTINCT FROM v_reserved THEN RAISE '[validation] Transaction %: entry released_amount_eur=% but draft line reserved_amount_eur=%.'`
7. **Closing-balance reconciliation** — `v_computed_closing := v_draft.opening_balance_eur + v_draft.contract_baseline_eur + v_sum_effects; IF abs(v_computed_closing - p_expected_closing_balance_eur) > 0.005 THEN RAISE '[validation] Closing balance mismatch...'` (only `is_balance_affecting` entries add to `v_sum_effects`).
8. **Opening balance explicit (P-ARCH-1: NULL ≠ 0)** — `IF v_draft.opening_balance_eur IS NULL THEN RAISE '...A balance cannot be silently treated as zero.'`; `opening_balance_source` required; `manual_entry`/`zero_initial` require `opening_balance_confirmed_by`/`_at`.
9. **Immutable sent_statement_snapshots created** — single `INSERT INTO statements.sent_statement_snapshots (...) VALUES (...)` with `is_current_in_series=true`, `version_number=v_new_version`.
10. **Immutable sent_entry_snapshots created** — one `INSERT INTO statements.sent_entry_snapshots` per entry, freezing `released_amount_eur/signed_balance_effect_eur/is_balance_affecting/is_bpo/balance_effect/display_group/display_label`.
11. **Versioning / replacement safety** — `IF EXISTS (SELECT 1 FROM sent_statement_snapshots WHERE statement_series_id=v_series_id AND is_current_in_series=true) THEN RAISE '...Use replace_sent_statement() to issue a corrected version.'`; `v_new_version := COALESCE(MAX(version_number),0)+1`.
12. **Duplicate-send / idempotency** — `PERFORM pg_advisory_xact_lock(hashtext('series:send:'||v_series_id))`; the is_current guard (11); the draft is flipped `status='sent'` (a sent draft fails the ready_to_send check on any retry).
13. **Series scope integrity** — series derived from the draft (`v_series_id := v_draft.series_id`); snapshot + entries + event all scoped to that series.
14. **Language / rendered package persistence** — persists `language`, `description_he`, `description_en`, `delivery_channels`, `checklist_result`, `rendered_package_json`, `ownership_percentage`, `proportional_amount`.
15. **Prior sent snapshot not mutated** — send never writes a prior snapshot; it refuses when a current one exists (11). DB-level immutability is additionally enforced by trigger **`trg_sent_snapshots_guard` (BEFORE UPDATE OR DELETE → fn_sent_snapshots_guard)** on `sent_statement_snapshots` and **`trg_sent_entries_immutable` (BEFORE UPDATE OR DELETE → fn_sent_entries_immutable)** on `sent_entry_snapshots`. `statement_events` and `correction_events` are likewise append-only (`trg_events_append_only`, `trg_correction_events_no_update`).

**Verdict:** `send_statement` is a robust, self-validating finalization boundary. It cannot be coerced into an inconsistent snapshot by a bad caller payload — mismatched entries, swapped ids, wrong amounts, or an unreconciled closing balance all fail closed, and NULL opening balances are rejected rather than zeroed.

---

## statements.create_statement_draft(p_series_id uuid) RETURNS uuid
- Staff-gated; requires an **active** series (`series_status='active'`); refuses a second active draft (`status IN ('draft','ready_to_send','scheduled')`); inserts a `draft` row + a `draft_created` event.

## statements.add_draft_line(p_draft_id, p_source_transaction_id, p_release_amount_eur DEFAULT NULL, p_include DEFAULT true, p_line_notes) RETURNS uuid
- Staff-gated; draft must be `draft`|`ready_to_send`; `pg_advisory_xact_lock('tx:reserve:'||tx)`; computes remaining releasable via `compute_remaining_releasable`; rejects release ≤ 0 or > remaining; `ON CONFLICT (draft_id, source_transaction_id) DO UPDATE` upsert. **Reservation integrity prevents over-release across drafts/snapshots.**

## statements.set_draft_status(p_draft_id, p_new_status) RETURNS void
- Staff-gated; only allows `'draft'|'ready_to_send'` (cancel/send are separate RPCs); terminal `sent`/`cancelled` cannot move; `ready_to_send` requires opening balance (+ confirmation for manual/zero) and ≥1 included line.

## statements.compute_remaining_releasable(p_transaction_id, p_exclude_draft_id DEFAULT NULL) RETURNS numeric  [STABLE]
- `remaining = COALESCE(client_charge,0) − Σ released_on_current_sent_snapshots − Σ reserved_on_active_drafts`. This is the single canonical release-accounting function; the app-side planning must NOT re-derive it.

---

## Consequence for this package (F4)

The deployed write path is safe and self-reconciling. Therefore the app-side lifecycle
actions must **not** duplicate accounting; they must (a) build snapshot entries from the
canonical disposition, (b) match the DB's draft-line/reservation model, and (c) not
present unknown amounts as numbers. Item G hardens the actions to add strict input
validation and to defer all reconciliation to `send_statement`; Item H removes the
unknown-amount→0 coercion so a re-proposed obligation with an unknown remaining can never
become a €0 line feeding `add_draft_line`.

**Residual (honest):** the RPCs are safe, but a fully certified end-to-end finalize
requires the app to compose a correct `send_statement` payload (opening-balance
confirmation via `set_draft_opening_balance`, checklist, rendered package) and to reconcile
`released_amount_eur` to each draft line's `reserved_amount_eur`. `buildSnapshotEntries`
produces the entry classification; the opening-balance + reservation composition is the
remaining UI/integration step and is NOT yet proven end-to-end.
