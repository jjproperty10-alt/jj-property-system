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

// ─── Validation vocab (must match the deployed send_statement/set_draft_status RPCs) ───
const ALLOWED_LANGUAGES = new Set(['he', 'en'])
const ALLOWED_BALANCE_DIRECTIONS = new Set(['owner_credit', 'client_debt'])
const ALLOWED_STATEMENT_TYPES = new Set(['owner_statement', 'client_report', 'investor_statement', 'partner_statement'])
const ALLOWED_BALANCE_EFFECTS = new Set(['income', 'expense', 'payment_out', 'tracking_only', 'needs_review', 'contract_value'])
export type DraftStatus = 'draft' | 'ready_to_send'
const ALLOWED_DRAFT_STATUSES = new Set<DraftStatus>(['draft', 'ready_to_send'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function isIsoDate(v: unknown): boolean {
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Validate the send_statement payload before it reaches the DB. Returns an error string or null. */
function validateSendPayload(payload: SendStatementPayload): string | null {
  if (!payload || !isValidUUID(payload.draftId)) return 'Invalid draft ID'
  if (!isIsoDate(payload.periodStart) || !isIsoDate(payload.periodEnd)) return 'periodStart/periodEnd must be ISO dates (YYYY-MM-DD)'
  if (payload.periodStart > payload.periodEnd) return 'periodStart must not be after periodEnd'
  if (!ALLOWED_STATEMENT_TYPES.has(payload.statementType)) return `Invalid statementType "${payload.statementType}"`
  if (!ALLOWED_LANGUAGES.has(payload.language)) return `Invalid language "${payload.language}" (allowed: he, en)`
  if (payload.balanceDirection !== null && !ALLOWED_BALANCE_DIRECTIONS.has(payload.balanceDirection)) {
    return `Invalid balanceDirection "${payload.balanceDirection}"`
  }
  if (payload.expectedClosingBalanceEur !== null && !isFiniteNum(payload.expectedClosingBalanceEur)) {
    return 'expectedClosingBalanceEur must be null or a finite number'
  }
  if (payload.ownershipPercentage !== null && !isFiniteNum(payload.ownershipPercentage)) {
    return 'ownershipPercentage must be null or a finite number'
  }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) return 'send requires at least one snapshot entry'
  const seen = new Set<string>()
  for (let i = 0; i < payload.entries.length; i++) {
    const e = payload.entries[i]
    if (!e || !isValidUUID(e.source_transaction_id)) return `entry ${i}: invalid source_transaction_id`
    if (seen.has(e.source_transaction_id)) return `entry ${i}: duplicate source_transaction_id ${e.source_transaction_id}`
    seen.add(e.source_transaction_id)
    if (!isFiniteNum(e.released_amount_eur)) return `entry ${i}: released_amount_eur must be a finite number`
    if (!isFiniteNum(e.signed_balance_effect_eur)) return `entry ${i}: signed_balance_effect_eur must be a finite number`
    if (typeof e.is_balance_affecting !== 'boolean') return `entry ${i}: is_balance_affecting must be boolean`
    if (typeof e.is_bpo !== 'boolean') return `entry ${i}: is_bpo must be boolean`
    if (!ALLOWED_BALANCE_EFFECTS.has(e.balance_effect)) return `entry ${i}: invalid balance_effect "${e.balance_effect}"`
  }
  return null
}

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

/** Set draft status. Only the non-terminal 'draft' | 'ready_to_send' transitions are
 *  permitted here (cancel/send are separate RPCs) - matches the deployed set_draft_status. */
export async function setDraftStatusAction(
  draftId: string,
  newStatus: DraftStatus,
): Promise<OkVoid | Err> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  if (!draftId || !isValidUUID(draftId)) return { ok: false, error: 'Invalid draft ID' }
  if (!ALLOWED_DRAFT_STATUSES.has(newStatus)) {
    return { ok: false, error: `Invalid draft status "${String(newStatus)}" (allowed: draft, ready_to_send)` }
  }

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
  // Strict client-side validation; the DB send_statement independently re-validates
  // and reconciles (entries must match draft lines, closing balance must reconcile).
  const invalid = validateSendPayload(payload)
  if (invalid) return { ok: false, error: invalid }

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
