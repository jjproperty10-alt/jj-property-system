# public.transactions write-path audit (Gate cert, migration 003)

Purpose: before migration `20260820_003` (append-only guard: block DELETE + freeze
financial/descriptive columns; allow `review_status`/`is_deleted`/`deleted_by`/
`deleted_at`/`updated_at`) is applied, enumerate **every** legitimate write to
`public.transactions` and confirm whether it survives the guard.

Sources checked: application code (`src/**`), repo migrations (`supabase/migrations/**`,
legacy `migrations/**`), and the **live database** (read-only introspection of
`pg_proc`, `pg_trigger`, `pg_policy` on project vsiiprzjrstjcmjpwcrd).

## Column classification under 003

- **Frozen on UPDATE (financial/descriptive truth):** `date, property_id, property_name,
  category, subcategory, description, payer, payee, amount_eur, client_charge, notes, k_note`.
- **Still updatable (operational metadata):** `review_status, is_deleted, deleted_by,
  deleted_at, updated_at`.
- **DELETE:** always blocked.
- **INSERT:** always allowed (the guard is `BEFORE UPDATE OR DELETE` only).

## Application writes

| File | Operation | Columns | Survives 003? |
|---|---|---|---|
| `src/app/transactions/new/page.tsx:107` | INSERT | date, property_id, property_name, category, subcategory, description, payer, payee, amount_eur, client_charge, notes | ✅ INSERT allowed |

No `.from('transactions').update(...)`, `.delete(...)`, or `.upsert(...)` exists anywhere in `src/**`. All other `.from('transactions')` usages are read-only `.select(...)`.

## Live database functions that mutate public.transactions

Introspected every `pg_proc` body for UPDATE/DELETE of transactions:

| Function | Operation | Verdict under 003 |
|---|---|---|
| `public.apply_transaction_correction(...)` | UPDATE (in-place field edit) | ⚠️ **Blocked — intended.** This is the in-place corrector this package DEPRECATES; the append path (`statements.apply_correction_case`) replaces it. Blocking it is the point. |
| `public.trg_check_allocation_overflow()` | `SELECT amount_eur FROM transactions … FOR UPDATE` (read lock only) | ✅ Not a mutation. It is a `BEFORE INSERT/UPDATE` trigger on `public.settlement_allocation`, and only *reads* a transactions row (row lock). `SELECT … FOR UPDATE` does not fire UPDATE/DELETE triggers. Unaffected. |

No other live function INSERTs/UPDATEs/DELETEs `public.transactions`. `statements.apply_correction_case` (this package) and `transactions/new` are the only writers, both INSERT-only.

## Triggers on public.transactions (live)

| Trigger | Timing | Function | Interaction with 003 |
|---|---|---|---|
| `trg_transactions_updated_at` | BEFORE UPDATE | `public.update_updated_at()` (stamps updated_at) | Coexists. Our guard is also BEFORE UPDATE; a blocked financial-column UPDATE aborts before/independent of the stamp. Allowed metadata updates still stamp `updated_at`. |
| `audit_transactions` | AFTER INSERT/UPDATE/DELETE | `public.log_transaction_change()` → INSERTs into `public.audit_logs` | Writes to `audit_logs`, not transactions. On a blocked UPDATE/DELETE the statement aborts, so the AFTER trigger never fires. No conflict. |
| `trg_transactions_append_only` (NEW, this package) | BEFORE UPDATE OR DELETE | `public.enforce_transactions_append_only()` | The guard itself. |

## RLS

`public.transactions` has RLS enabled with `auth_read_transactions` (SELECT) and
`auth_write_transactions` (cmd = ALL). So an authenticated session is *permitted by RLS*
to UPDATE/DELETE — but **no application code does so**, and after 003 the trigger blocks
financial-column UPDATE + all DELETE regardless of RLS. The trigger is the hard guarantee;
RLS is not relied upon for immutability.

Recommendation (optional, follow-up — not in this package): tighten `auth_write_transactions`
to INSERT-only for defense in depth, so RLS and the trigger agree. Not required for 003 safety.

## Migrations that UPDATE/DELETE transactions (historical, one-off)

| File | Operation | Status |
|---|---|---|
| `supabase/migrations/20260807_001_liora_201_to_101.sql:22` | UPDATE (property remap) | One-off data repair, already applied. Does not re-run. No effect on future writes. |
| `migrations/20260709_002_reclassify_avi_villa_mazotos.sql:36` | UPDATE (reclassify) | Legacy one-off, already applied. Does not re-run. |

These are past, already-executed maintenance migrations; 003 does not retroactively affect them. **Future** ad-hoc data-repair migrations that UPDATE/DELETE transactions would be blocked and must instead append via `statements.apply_correction_case`, or run inside a reviewed maintenance window with the trigger temporarily disabled by a DBA.

## Verdict

**003 is SAFE TO APPLY** to the current system:

- The only live mutator of `public.transactions` is `apply_transaction_correction`, which this package deprecates and intends to block.
- The only application writer is INSERT-only.
- The overflow trigger only reads (SELECT … FOR UPDATE), the audit trigger writes elsewhere.
- The historical repair migrations already ran and do not re-execute.

**Operational note for the reviewer:** after applying 003, financial corrections and any future "data fix" MUST go through the append-only correction path. Keep a documented, audited break-glass procedure (DBA disables `trg_transactions_append_only` for a maintenance window) for exceptional recovery. Apply order remains **001 → 002 → 003**; do not apply 003 before 002 (the append apply RPC must exist first).
