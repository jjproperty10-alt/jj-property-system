'use server'

/**
 * M1 correction workspace — hardened server actions.
 *
 * Mutations:
 *   authenticateStatementUser (ceo|finance_admin)
 *   → open/transition/apply via billingActions (session JWT → auth.uid())
 *   → statements.* RPCs (require_jj_staff)
 *
 * Never trusts browser-supplied original financial snapshots.
 * Never accepts arbitrary seriesId.
 * Never UPDATE/DELETE public.transactions.
 */

import { createServiceClient } from '@/lib/supabase'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { isValidUUID } from '@/lib/owners/validation'
import {
  openCorrectionCaseAction,
  transitionCorrectionCaseAction,
  applyCorrectionCaseAction,
} from '@/lib/owners/billingActions'
import type { OriginalTxRow } from '@/lib/statements/correctionInsertRows'
import {
  buildM1CorrectionPreview,
  type M1ProposedEditable,
  type RegisterTxForCorrection,
} from './buildM1CorrectionPreview'
import {
  validateM1Proposed,
  validateSubcategoryAgainstCategory,
} from './validateM1Proposed'
import {
  fingerprintCanonical,
  fingerprintProposed,
  buildIdempotencyKey,
  type M1PreviewToken,
  type CanonicalFingerprintSource,
} from './previewFingerprint'
import {
  resolveBoundCorrectionSeries,
  type BoundSeriesResult,
} from './resolveBoundCorrectionSeries'
import {
  isPostgresUniqueViolation,
  uniqueNonterminalCaseMessage,
} from './uniqueCaseViolation'

const CORRECTION_MUTATOR_ROLES = new Set(['ceo', 'finance_admin'])

export interface RegisterRowMeta {
  readonly hasActiveExclusion: boolean
  readonly hasCorrectionCase: boolean
  readonly correctionCaseCount: number
}

export interface CanonicalTransactionRow extends RegisterTxForCorrection {
  readonly is_deleted: boolean | null
  readonly review_status: string | null
  readonly updated_at: string | null
}

async function requireStaffAuth(): Promise<
  | { ok: true; userId: string; staffRole: string }
  | { ok: false; error: string }
> {
  const auth = await authenticateStatementUser()
  if (!auth.ok) return { ok: false, error: 'You must be signed in' }
  return { ok: true, userId: auth.userId, staffRole: auth.staffRole }
}

async function requireMutatorAuth(): Promise<
  | { ok: true; userId: string; staffRole: string }
  | { ok: false; error: string }
> {
  const auth = await requireStaffAuth()
  if (!auth.ok) return auth
  if (!CORRECTION_MUTATOR_ROLES.has(auth.staffRole)) {
    return {
      ok: false,
      error: `Apply requires ceo or finance_admin (signed-in role: "${auth.staffRole}")`,
    }
  }
  return auth
}

function toFingerprintSource(row: CanonicalTransactionRow): CanonicalFingerprintSource {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    subcategory: row.subcategory,
    amount_eur: row.amount_eur,
    client_charge: row.client_charge,
    description: row.description,
    property_id: row.property_id,
    property_name: row.property_name,
    payer: row.payer,
    payee: row.payee,
    notes: row.notes,
    is_deleted: row.is_deleted,
    review_status: row.review_status,
    updated_at: row.updated_at,
  }
}

function toRegisterTx(row: CanonicalTransactionRow): RegisterTxForCorrection {
  return {
    id: row.id,
    date: row.date,
    property_id: row.property_id,
    property_name: row.property_name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: row.payer,
    payee: row.payee,
    amount_eur: row.amount_eur,
    client_charge: row.client_charge,
    notes: row.notes,
  }
}

/**
 * Re-fetch canonical transaction. Never trust browser snapshots for apply.
 * Uses service client for read (RLS) after staff auth — reads only.
 */
export async function fetchCanonicalTransaction(
  transactionId: string,
): Promise<
  | { ok: true; row: CanonicalTransactionRow }
  | { ok: false; error: string }
> {
  if (!transactionId || !isValidUUID(transactionId)) {
    return { ok: false, error: 'Invalid transaction ID' }
  }
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from('transactions')
    .select(
      'id, date, property_id, property_name, category, subcategory, description, payer, payee, amount_eur, client_charge, notes, is_deleted, review_status, updated_at',
    )
    .eq('id', transactionId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message ?? 'Failed to load transaction' }
  if (!data) return { ok: false, error: 'Transaction not found or inaccessible' }

  const row = data as CanonicalTransactionRow
  if (row.is_deleted === true) {
    return { ok: false, error: 'Transaction is deleted — ineligible for correction' }
  }
  return { ok: true, row }
}

export async function enrichTransactionRegisterMetaAction(
  transactionIds: string[],
): Promise<
  | { ok: true; meta: Record<string, RegisterRowMeta> }
  | { ok: false; error: string }
> {
  const auth = await requireStaffAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const ids = Array.from(new Set(transactionIds.filter((id) => isValidUUID(id))))
  const meta: Record<string, RegisterRowMeta> = {}
  for (const id of ids) {
    meta[id] = { hasActiveExclusion: false, hasCorrectionCase: false, correctionCaseCount: 0 }
  }
  if (ids.length === 0) return { ok: true, meta }

  const db = createServiceClient()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const excl = await (db as any)
      .from('transaction_exclusions')
      .select('transaction_id, is_active')
      .in('transaction_id', ids)
      .eq('is_active', true)

    if (!excl.error && Array.isArray(excl.data)) {
      for (const row of excl.data as Array<{ transaction_id: string }>) {
        const id = String(row.transaction_id)
        if (meta[id]) meta[id] = { ...meta[id], hasActiveExclusion: true }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cases = await (db as any)
      .schema('statements')
      .from('correction_cases')
      .select('id, original_transaction_id, status')
      .in('original_transaction_id', ids)

    if (!cases.error && Array.isArray(cases.data)) {
      const counts = new Map<string, number>()
      for (const row of cases.data as Array<{ original_transaction_id: string }>) {
        const id = String(row.original_transaction_id)
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      for (const [id, count] of Array.from(counts.entries())) {
        if (meta[id]) {
          meta[id] = {
            ...meta[id],
            hasCorrectionCase: count > 0,
            correctionCaseCount: count,
          }
        }
      }
    }

    return { ok: true, meta }
  } catch (err) {
    console.error('[correctionWorkspace] enrich meta error:', err)
    return { ok: false, error: 'Unexpected error loading register meta' }
  }
}

export interface BoundSeriesOption {
  readonly seriesId: string
  readonly label: string
  readonly ownerPartyId: string
}

export async function resolveCorrectionSeriesForTransactionAction(
  transactionId: string,
): Promise<
  | {
      ok: true
      bound: BoundSeriesResult
      series: BoundSeriesOption | null
    }
  | { ok: false; error: string }
> {
  const auth = await requireStaffAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const fetched = await fetchCanonicalTransaction(transactionId)
  if (!fetched.ok) return { ok: false, error: fetched.error }

  const bound = await resolveBoundCorrectionSeries({
    propertyName: fetched.row.property_name,
    propertyId: fetched.row.property_id,
  })

  if (bound.status === 'bound') {
    return {
      ok: true,
      bound,
      series: {
        seriesId: bound.seriesId,
        ownerPartyId: bound.ownerPartyId,
        label: `Bound series ${bound.seriesId.slice(0, 8)}… · ${bound.propertyName}`,
      },
    }
  }
  return { ok: true, bound, series: null }
}

function normalizeProposed(
  proposed: M1ProposedEditable,
  canonical: CanonicalTransactionRow,
): M1ProposedEditable {
  const category = proposed.category ?? canonical.category
  const subcategory =
    proposed.subcategory !== undefined ? proposed.subcategory : canonical.subcategory
  return {
    date: proposed.date ?? canonical.date,
    category,
    subcategory,
    amount_eur: proposed.amount_eur ?? canonical.amount_eur,
    client_charge:
      proposed.client_charge !== undefined ? proposed.client_charge : canonical.client_charge,
    description:
      proposed.description !== undefined ? proposed.description : canonical.description,
  }
}

export async function previewControlledCorrectionAction(
  transactionId: string,
  proposedRaw: Record<string, unknown>,
): Promise<
  | {
      ok: true
      preview: ReturnType<typeof buildM1CorrectionPreview>
      token: M1PreviewToken
      boundSeries: BoundSeriesOption | null
      seriesBlockReason: string | null
      canonical: RegisterTxForCorrection
    }
  | { ok: false; error: string }
> {
  const auth = await requireStaffAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  const validated = validateM1Proposed(proposedRaw)
  if (!validated.ok) return { ok: false, error: validated.error }

  const fetched = await fetchCanonicalTransaction(transactionId)
  if (!fetched.ok) return { ok: false, error: fetched.error }
  const canonical = fetched.row

  const effectiveCategory = validated.value.category ?? canonical.category
  const effectiveSub =
    validated.value.subcategory !== undefined
      ? validated.value.subcategory
      : canonical.subcategory
  const subCheck = validateSubcategoryAgainstCategory(effectiveCategory, effectiveSub)
  if (!subCheck.ok) return { ok: false, error: subCheck.error }

  const proposed = normalizeProposed(validated.value, canonical)

  let preview
  try {
    preview = buildM1CorrectionPreview(toRegisterTx(canonical), proposed)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Preview failed' }
  }

  const originalFingerprint = fingerprintCanonical(toFingerprintSource(canonical))
  const proposedFingerprint = fingerprintProposed(proposed)
  const token: M1PreviewToken = {
    originalFingerprint,
    proposedFingerprint,
    idempotencyKey: buildIdempotencyKey(canonical.id, originalFingerprint, proposedFingerprint),
  }

  const bound = await resolveBoundCorrectionSeries({
    propertyName: canonical.property_name,
    propertyId: canonical.property_id,
  })

  return {
    ok: true,
    preview,
    token,
    boundSeries:
      bound.status === 'bound'
        ? {
            seriesId: bound.seriesId,
            ownerPartyId: bound.ownerPartyId,
            label: `Bound series ${bound.seriesId.slice(0, 8)}… · ${bound.propertyName}`,
          }
        : null,
    seriesBlockReason: bound.status === 'unbound' ? bound.reason : null,
    canonical: toRegisterTx(canonical),
  }
}

export interface ApplyControlledCorrectionInput {
  readonly transactionId: string
  /** Supported proposed fields only — never an original snapshot. */
  readonly proposed: Record<string, unknown>
  readonly reason: string
  readonly evidenceReference: string
  readonly confirmed: boolean
  /** Required — issued by previewControlledCorrectionAction. */
  readonly previewToken: M1PreviewToken
  /**
   * Optional. If provided must equal server-bound series.
   * If omitted, server uses the freshly bound series only when unambiguous.
   */
  readonly seriesId?: string | null
  /** Resume an existing case after partial failure (same idempotency key). */
  readonly resumeCaseId?: string | null
}

export type ApplyControlledCorrectionResult =
  | {
      ok: true
      caseId: string
      caseStatus: 'applied'
      appliedTransactionIds: string[]
      resumed: boolean
    }
  | {
      ok: false
      error: string
      caseId?: string
      caseStatus?: string
      resumable?: boolean
    }

async function findCaseByIdempotencyKey(
  transactionId: string,
  idempotencyKey: string,
): Promise<{
  id: string
  status: string
  series_id: string
  corrected_field_values: Record<string, unknown> | null
  applied_transaction_id: string | null
} | null> {
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .schema('statements')
    .from('correction_cases')
    .select('id, status, series_id, corrected_field_values, applied_transaction_id, original_transaction_id')
    .eq('original_transaction_id', transactionId)
    .order('opened_at', { ascending: false })
    .limit(50)

  if (error || !Array.isArray(data)) return null
  for (const row of data as Array<{
    id: string
    status: string
    series_id: string
    corrected_field_values: Record<string, unknown> | null
    applied_transaction_id: string | null
  }>) {
    const key = row.corrected_field_values?.m1_idempotency_key
    if (key === idempotencyKey) {
      return row
    }
  }
  return null
}

async function loadAppliedIds(caseId: string): Promise<string[]> {
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .schema('statements')
    .from('correction_applied_transactions')
    .select('applied_transaction_id, sequence_no')
    .eq('case_id', caseId)
    .order('sequence_no', { ascending: true })
  if (!Array.isArray(data)) return []
  return data.map((r: { applied_transaction_id: string }) => String(r.applied_transaction_id))
}

/**
 * Controlled apply — re-fetches canonical row, verifies preview token,
 * binds series server-side, resumes existing case on retry.
 */
export async function applyControlledCorrectionAction(
  input: ApplyControlledCorrectionInput,
): Promise<ApplyControlledCorrectionResult> {
  const auth = await requireMutatorAuth()
  if (!auth.ok) return { ok: false, error: auth.error }

  if (!input.confirmed) {
    return { ok: false, error: 'Explicit confirmation is required before applying a correction' }
  }
  if (!input.previewToken?.originalFingerprint || !input.previewToken?.proposedFingerprint || !input.previewToken?.idempotencyKey) {
    return { ok: false, error: 'Apply without Preview rejected — preview token is required' }
  }
  if (!input.reason || input.reason.trim().length === 0) {
    return { ok: false, error: 'Correction reason is required' }
  }
  if (!input.transactionId || !isValidUUID(input.transactionId)) {
    return { ok: false, error: 'Invalid transaction ID' }
  }

  const validated = validateM1Proposed(input.proposed)
  if (!validated.ok) return { ok: false, error: validated.error }

  const fetched = await fetchCanonicalTransaction(input.transactionId)
  if (!fetched.ok) return { ok: false, error: fetched.error }
  const canonical = fetched.row

  const liveFingerprint = fingerprintCanonical(toFingerprintSource(canonical))
  if (liveFingerprint !== input.previewToken.originalFingerprint) {
    return {
      ok: false,
      error:
        'Stale Preview — the canonical transaction changed since Preview. Regenerate Preview and try again.',
    }
  }

  const effectiveCategory = validated.value.category ?? canonical.category
  const effectiveSub =
    validated.value.subcategory !== undefined
      ? validated.value.subcategory
      : canonical.subcategory
  const subCheck = validateSubcategoryAgainstCategory(effectiveCategory, effectiveSub)
  if (!subCheck.ok) return { ok: false, error: subCheck.error }

  // Reject if client claimed a category context that doesn't match when they
  // omit category but somehow fingerprint still matched — already covered by fingerprint.
  const proposed = normalizeProposed(validated.value, canonical)
  const proposedFp = fingerprintProposed(proposed)
  if (proposedFp !== input.previewToken.proposedFingerprint) {
    return {
      ok: false,
      error: 'Proposed values do not match the Preview token. Regenerate Preview.',
    }
  }

  const expectedKey = buildIdempotencyKey(
    canonical.id,
    input.previewToken.originalFingerprint,
    input.previewToken.proposedFingerprint,
  )
  if (expectedKey !== input.previewToken.idempotencyKey) {
    return { ok: false, error: 'Invalid preview token (idempotency key mismatch)' }
  }

  const bound = await resolveBoundCorrectionSeries({
    propertyName: canonical.property_name,
    propertyId: canonical.property_id,
  })
  if (bound.status !== 'bound') {
    return { ok: false, error: bound.reason }
  }
  if (input.seriesId != null && input.seriesId !== '' && input.seriesId !== bound.seriesId) {
    return {
      ok: false,
      error:
        'Rejected seriesId — must equal the server-bound series for this transaction’s property/owner. Arbitrary or cross-owner series are not allowed.',
    }
  }
  const seriesId = bound.seriesId

  // Idempotent resume: existing case with same key.
  const existing = await findCaseByIdempotencyKey(canonical.id, expectedKey)
  if (existing && input.resumeCaseId && input.resumeCaseId !== existing.id) {
    return {
      ok: false,
      error: 'resumeCaseId does not match the idempotent case for this Preview',
      caseId: existing.id,
      caseStatus: existing.status,
      resumable: true,
    }
  }

  let preview
  try {
    preview = buildM1CorrectionPreview(toRegisterTx(canonical), proposed)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid correction' }
  }

  const originalRow: OriginalTxRow = {
    id: canonical.id,
    date: canonical.date,
    property_id: canonical.property_id,
    property_name: canonical.property_name,
    category: canonical.category,
    subcategory: canonical.subcategory,
    description: canonical.description,
    payer: canonical.payer,
    payee: canonical.payee,
    amount_eur: canonical.amount_eur,
    client_charge: canonical.client_charge,
    notes: canonical.notes,
    k_note: null,
  }

  const description = [
    input.reason.trim(),
    input.evidenceReference?.trim()
      ? `Evidence/reference: ${input.evidenceReference.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  const correctedFields = {
    ...(preview.plan.corrected_field_values ?? preview.proposedSnapshot),
    evidence_reference: input.evidenceReference?.trim() || null,
    reason: input.reason.trim(),
    m1_idempotency_key: expectedKey,
    m1_original_fingerprint: input.previewToken.originalFingerprint,
    m1_proposed_fingerprint: input.previewToken.proposedFingerprint,
  }

  // ── Resume path ──────────────────────────────────────────────
  if (existing) {
    if (existing.status === 'applied') {
      const ids = await loadAppliedIds(existing.id)
      return {
        ok: true,
        caseId: existing.id,
        caseStatus: 'applied',
        appliedTransactionIds:
          ids.length > 0
            ? ids
            : existing.applied_transaction_id
              ? [String(existing.applied_transaction_id)]
              : [],
        resumed: true,
      }
    }

    if (existing.status === 'rejected' || existing.status === 'void') {
      return {
        ok: false,
        error: `Existing case ${existing.id} is ${existing.status} — regenerate Preview for a new correction`,
        caseId: existing.id,
        caseStatus: existing.status,
        resumable: false,
      }
    }

    // open | under_review | approved → continue same case
    let caseId = existing.id
    if (existing.status === 'open' || existing.status === 'under_review') {
      const approved = await transitionCorrectionCaseAction({
        caseId,
        newStatus: 'approved',
        notes: 'M1 workspace: resume approve for controlled apply',
      })
      if (!approved.ok) {
        return {
          ok: false,
          error: `Case opened but approval failed: ${approved.error}`,
          caseId,
          caseStatus: existing.status,
          resumable: true,
        }
      }
    }

    const applied = await applyCorrectionCaseAction({
      caseId,
      plan: preview.plan,
      original: originalRow,
    })
    if (!applied.ok) {
      return {
        ok: false,
        error: `Case approved but apply failed: ${applied.error}`,
        caseId,
        caseStatus: 'approved',
        resumable: true,
      }
    }
    return {
      ok: true,
      caseId,
      caseStatus: 'applied',
      appliedTransactionIds: applied.appliedTransactionIds,
      resumed: true,
    }
  }

  // ── Fresh open → approve → apply ─────────────────────────────
  // Guard: another non-terminal case on this tx (different proposal) blocks concurrent apply.
  const db = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openCases } = await (db as any)
    .schema('statements')
    .from('correction_cases')
    .select('id, status, corrected_field_values')
    .eq('original_transaction_id', canonical.id)
    .in('status', ['open', 'under_review', 'approved'])
    .limit(5)

  if (Array.isArray(openCases) && openCases.length > 0) {
    const other = openCases[0] as {
      id: string
      status: string
      corrected_field_values: Record<string, unknown> | null
    }
    // Same idempotency key → resume that case instead of failing.
    if (other.corrected_field_values?.m1_idempotency_key === expectedKey) {
      const resumedExisting = await findCaseByIdempotencyKey(canonical.id, expectedKey)
      if (resumedExisting) {
        // Fall through by recursively treating as existing — call resume path inline
        if (resumedExisting.status === 'applied') {
          const ids = await loadAppliedIds(resumedExisting.id)
          return {
            ok: true,
            caseId: resumedExisting.id,
            caseStatus: 'applied',
            appliedTransactionIds:
              ids.length > 0
                ? ids
                : resumedExisting.applied_transaction_id
                  ? [String(resumedExisting.applied_transaction_id)]
                  : [],
            resumed: true,
          }
        }
        let caseId = resumedExisting.id
        if (resumedExisting.status === 'open' || resumedExisting.status === 'under_review') {
          const approved = await transitionCorrectionCaseAction({
            caseId,
            newStatus: 'approved',
            notes: 'M1 workspace: resume approve after discovering existing idempotent case',
          })
          if (!approved.ok) {
            return {
              ok: false,
              error: `Case opened but approval failed: ${approved.error}`,
              caseId,
              caseStatus: resumedExisting.status,
              resumable: true,
            }
          }
        }
        const applied = await applyCorrectionCaseAction({
          caseId,
          plan: preview.plan,
          original: originalRow,
        })
        if (!applied.ok) {
          return {
            ok: false,
            error: `Case approved but apply failed: ${applied.error}`,
            caseId,
            caseStatus: 'approved',
            resumable: true,
          }
        }
        return {
          ok: true,
          caseId,
          caseStatus: 'applied',
          appliedTransactionIds: applied.appliedTransactionIds,
          resumed: true,
        }
      }
    }
    return {
      ok: false,
      error: uniqueNonterminalCaseMessage(other.id),
      caseId: other.id,
      caseStatus: other.status,
      resumable: true,
    }
  }

  const opened = await openCorrectionCaseAction({
    seriesId,
    originalTransactionId: canonical.id,
    correctionType: preview.dbCorrectionType,
    description,
    originalAmountEur: canonical.amount_eur,
    correctedAmountEur: proposed.amount_eur ?? canonical.amount_eur,
    priority: 'normal',
    originalFields: preview.plan.original_field_values ?? preview.originalSnapshot,
    correctedFields,
  })
  if (!opened.ok) {
    // Race: unique partial index fired between pre-check and INSERT.
    if (opened.code === 'unique_violation' || isPostgresUniqueViolation({ message: opened.error })) {
      const raced = await findCaseByIdempotencyKey(canonical.id, expectedKey)
      if (raced) {
        // Same idempotency key → resume (never surface as unhandled unique violation).
        if (raced.status === 'applied') {
          const ids = await loadAppliedIds(raced.id)
          return {
            ok: true,
            caseId: raced.id,
            caseStatus: 'applied',
            appliedTransactionIds:
              ids.length > 0
                ? ids
                : raced.applied_transaction_id
                  ? [String(raced.applied_transaction_id)]
                  : [],
            resumed: true,
          }
        }
        let caseId = raced.id
        if (raced.status === 'open' || raced.status === 'under_review') {
          const approved = await transitionCorrectionCaseAction({
            caseId,
            newStatus: 'approved',
            notes: 'M1 workspace: resume approve after unique-index race (same idempotency key)',
          })
          if (!approved.ok) {
            return {
              ok: false,
              error: `Case opened but approval failed: ${approved.error}`,
              caseId,
              caseStatus: raced.status,
              resumable: true,
            }
          }
        }
        const applied = await applyCorrectionCaseAction({
          caseId,
          plan: preview.plan,
          original: originalRow,
        })
        if (!applied.ok) {
          return {
            ok: false,
            error: `Case approved but apply failed: ${applied.error}`,
            caseId,
            caseStatus: 'approved',
            resumable: true,
          }
        }
        return {
          ok: true,
          caseId,
          caseStatus: 'applied',
          appliedTransactionIds: applied.appliedTransactionIds,
          resumed: true,
        }
      }
      // Different active case for this transaction — fail closed with clear message.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: racedOpen } = await (db as any)
        .schema('statements')
        .from('correction_cases')
        .select('id, status')
        .eq('original_transaction_id', canonical.id)
        .in('status', ['open', 'under_review', 'approved'])
        .limit(1)
      const row = Array.isArray(racedOpen) && racedOpen[0]
        ? (racedOpen[0] as { id: string; status: string })
        : null
      return {
        ok: false,
        error: uniqueNonterminalCaseMessage(row?.id ?? null),
        caseId: row?.id,
        caseStatus: row?.status,
        resumable: !!row,
      }
    }
    return { ok: false, error: opened.error }
  }

  const caseId = opened.caseId

  const approved = await transitionCorrectionCaseAction({
    caseId,
    newStatus: 'approved',
    notes: 'M1 workspace: approved for controlled apply',
  })
  if (!approved.ok) {
    return {
      ok: false,
      error: `Case opened but approval failed: ${approved.error}`,
      caseId,
      caseStatus: 'open',
      resumable: true,
    }
  }

  const applied = await applyCorrectionCaseAction({
    caseId,
    plan: preview.plan,
    original: originalRow,
  })
  if (!applied.ok) {
    return {
      ok: false,
      error: `Case approved but apply failed: ${applied.error}`,
      caseId,
      caseStatus: 'approved',
      resumable: true,
    }
  }

  return {
    ok: true,
    caseId,
    caseStatus: 'applied',
    appliedTransactionIds: applied.appliedTransactionIds,
    resumed: false,
  }
}

/** Load a single transaction for the register deep-link (?tx=). */
export async function loadTransactionForCorrectionAction(
  transactionId: string,
): Promise<
  | { ok: true; transaction: CanonicalTransactionRow }
  | { ok: false; error: string }
> {
  const auth = await requireStaffAuth()
  if (!auth.ok) return { ok: false, error: auth.error }
  const fetched = await fetchCanonicalTransaction(transactionId)
  if (!fetched.ok) return fetched
  return { ok: true, transaction: fetched.row }
}
