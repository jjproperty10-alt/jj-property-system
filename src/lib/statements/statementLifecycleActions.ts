'use server'

/**
 * statementLifecycleActions - Server Actions that drive the statement Draft ->
 * Finalize/Send lifecycle by calling the DEPLOYED statements-schema RPCs.
 *
 * This is the deliberate, authorized lift of the VS-1A read-only STOP: the
 * read-only statementBuilderService stays read-only; these actions are the
 * separate, explicit mutation path. Each action is a thin wrapper over an
 * existing production RPC (no new engine, no accounting recompute):
 *   create_statement_draft(p_series_id)
 *   add_draft_line(p_draft_id, p_source_transaction_id, p_release_amount_eur, p_include, p_line_notes)
 *   remove_draft_line(p_draft_id, p_source_transaction_id)
 *   set_draft_status(p_draft_id, p_new_status)
 *   send_statement(p_draft_id, ... , p_entries jsonb, ...)
 *
 * Security boundary mirrors billingActions: authenticateStatementUser() ->
 * createServiceClient() -> SECURITY DEFINER RPC (require_jj_staff inside).
 *
 * The WHICH-lines decision (current period + re-proposed obligations) and the
 * frozen snapshot entries are computed by the PURE module statementLifecycle.ts;
 * these actions only persist that decision.
 */

import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { isValidUUID } from '@/lib/owners/validation'
import type { DraftLineInput, SnapshotEntryInput } from '@/lib/statements/types'

type Ok<T> = { ok: true } & T
type OkVoid = { ok: true }
type Err = { ok: false; error: string }

/** Create a fresh draft for a series. Returns the new draft id. */
export async function createStatementDraftAction(
  seriesId: string,
): Promise<Ok<{ draftId: string }> | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!seriesId || !isValidUUID(seriesId)) return { ok: false, error: 'Invalid series ID' }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).schema('statements')
      .rpc('create_statement_draft', { p_series_id: seriesId })
    if (error) return { ok: false, error: error.message ?? 'Database error' }
    return { ok: true, draftId: String(data) }
  } catch (err) {
    console.error('[statementLifecycle] createStatementDraft error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

/** Add one draft line. */
export async function addDraftLineAction(
  draftId: string,
  line: DraftLineInput,
): Promise<Ok<{ lineId: string }> | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!draftId || !isValidUUID(draftId)) return { ok: false, error: 'Invalid draft ID' }
  if (!line || !isValidUUID(line.sourceTransactionId)) return { ok: false, error: 'Invalid source transaction ID' }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).schema('statements')
      .rpc('add_draft_line', {
        p_draft_id: draftId,
        p_source_transaction_id: line.sourceTransactionId,
        p_release_amount_eur: line.releaseAmountEur,
        p_include: line.includeInStatement,
        p_line_notes: line.lineNotes ?? null,
      })
    if (error) return { ok: false, error: error.message ?? 'Database error' }
    return { ok: true, lineId: String(data) }
  } catch (err) {
    console.error('[statementLifecycle] addDraftLine error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

/** Add many draft lines in order. Stops and reports on the first failure. */
export async function addDraftLinesAction(
  draftId: string,
  lines: readonly DraftLineInput[],
): Promise<Ok<{ addedLineIds: string[] }> | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!draftId || !isValidUUID(draftId)) return { ok: false, error: 'Invalid draft ID' }

  const added: string[] = []
  for (const line of lines) {
    const res = await addDraftLineAction(draftId, line)
    if (!res.ok) return { ok: false, error: `line ${line.sourceTransactionId}: ${res.error}` }
    added.push(res.lineId)
  }
  return { ok: true, addedLineIds: added }
}

/** Remove a draft line by source transaction id. */
export async function removeDraftLineAction(
  draftId: string,
  sourceTransactionId: string,
): Promise<OkVoid | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!draftId || !isValidUUID(draftId)) return { ok: false, error: 'Invalid draft ID' }
  if (!sourceTransactionId || !isValidUUID(sourceTransactionId)) return { ok: false, error: 'Invalid source transaction ID' }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).schema('statements')
      .rpc('remove_draft_line', { p_draft_id: draftId, p_source_transaction_id: sourceTransactionId })
    if (error) return { ok: false, error: error.message ?? 'Database error' }
    return { ok: true }
  } catch (err) {
    console.error('[statementLifecycle] removeDraftLine error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

/** Set draft status (draft lifecycle transitions). */
export async function setDraftStatusAction(
  draftId: string,
  newStatus: string,
): Promise<OkVoid | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!draftId || !isValidUUID(draftId)) return { ok: false, error: 'Invalid draft ID' }
  if (!newStatus || typeof newStatus !== 'string') return { ok: false, error: 'Invalid status' }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any).schema('statements')
      .rpc('set_draft_status', { p_draft_id: draftId, p_new_status: newStatus })
    if (error) return { ok: false, error: error.message ?? 'Database error' }
    return { ok: true }
  } catch (err) {
    console.error('[statementLifecycle] setDraftStatus error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}

/** Full payload for send_statement (finalize -> immutable sent snapshot). */
export interface SendStatementPayload {
  draftId: string
  periodStart: string
  periodEnd: string
  statementType: string
  expectedClosingBalanceEur: number | null
  entries: SnapshotEntryInput[]
  language: string
  balanceDirection: string
  ownershipPercentage: number | null
  checklistResult: Record<string, unknown> | null
  deliveryChannels: Record<string, unknown> | null
  renderedPackageJson: Record<string, unknown> | null
  descriptionHe: string | null
  descriptionEn: string | null
}

/**
 * Finalize + send: freezes the draft into an immutable sent snapshot via the
 * deployed send_statement RPC (which enforces the immutability guards). The
 * caller composes the payload (entries via buildSnapshotEntries in the pure
 * statementLifecycle module). Returns the new snapshot id.
 */
export async function sendStatementAction(
  payload: SendStatementPayload,
): Promise<Ok<{ snapshotId: string }> | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!payload || !isValidUUID(payload.draftId)) return { ok: false, error: 'Invalid draft ID' }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    return { ok: false, error: 'send requires at least one snapshot entry' }
  }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any).schema('statements')
      .rpc('send_statement', {
        p_draft_id: payload.draftId,
        p_period_start: payload.periodStart,
        p_period_end: payload.periodEnd,
        p_statement_type: payload.statementType,
        p_expected_closing_balance_eur: payload.expectedClosingBalanceEur,
        p_entries: payload.entries,
        p_language: payload.language,
        p_balance_direction: payload.balanceDirection,
        p_ownership_percentage: payload.ownershipPercentage,
        p_checklist_result: payload.checklistResult,
        p_delivery_channels: payload.deliveryChannels,
        p_rendered_package_json: payload.renderedPackageJson,
        p_description_he: payload.descriptionHe,
        p_description_en: payload.descriptionEn,
      })
    if (error) return { ok: false, error: error.message ?? 'Database error' }
    return { ok: true, snapshotId: String(data) }
  } catch (err) {
    console.error('[statementLifecycle] sendStatement error:', err)
    return { ok: false, error: 'Unexpected error' }
  }
}
