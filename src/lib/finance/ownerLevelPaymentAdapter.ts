/**
 * Server adapter — reads finance.v_owner_level_payments via service_role.
 *
 * Fail-closed:
 *   not_deployed → skip overlay (migration not Applied)
 *   blocked      → NEEDS REVIEW (permission / timeout / malformed / unexpected)
 * Never swallow those into an empty list that looks like "no payments".
 */

import 'server-only'

import { createServiceClient } from '@/lib/supabase'
import {
  classifyOwnerLevelDbError,
  parseOwnerLevelAmount,
} from './ownerLevelFetchStatus'
import type { OwnerLevelPaymentCandidate } from './ownerLevelPaymentTypes'

export type OwnerLevelFetchResult =
  | { status: 'ok'; candidates: OwnerLevelPaymentCandidate[] }
  | { status: 'not_deployed'; reason: string; code?: string }
  | { status: 'blocked'; reason: string; code?: string }

interface ViewRow {
  transaction_id: string
  owner_entity_id: string
  owner_display_name: string | null
  date: string
  payer: string | null
  payee: string | null
  amount_eur: number | string | null
  description: string | null
  idempotency_key: string
  review_status: 'approved' | 'needs_review' | 'ignored'
  k_note?: string | null
}

interface ConflictRow {
  transaction_id: string
  owner_entity_id: string
  property_id: string | null
  property_name: string | null
  date: string
  payer: string | null
  amount_eur: number | string | null
  idempotency_key: string
  review_status: 'approved' | 'needs_review' | 'ignored'
}

function ownerIdFromKNote(kNote: string | null | undefined): string | null {
  if (!kNote) return null
  const m = kNote.match(/OWNER_ID=([0-9a-f-]{36})/i)
  return m ? m[1] : null
}

function fromViewRow(row: ViewRow, amountEur: number): OwnerLevelPaymentCandidate {
  return {
    transactionId: row.transaction_id,
    ownerEntityId: row.owner_entity_id,
    ownerCanonicalName: row.owner_display_name ?? '',
    date: String(row.date),
    payer: row.payer ?? '',
    payee: row.payee ?? '',
    amountEur,
    description: row.description,
    idempotencyKey: row.idempotency_key,
    reviewStatus: row.review_status,
    linkRole: 'owner_level_payment',
    isDeletedLink: false,
    isDeletedTransaction: false,
    transactionReviewStatus: 'active',
    propertyId: null,
    propertyName: null,
    category: 'Management',
    subcategory: 'Bank Payment to Owner',
    transactionLinkedOwnerEntityId: ownerIdFromKNote(row.k_note),
  }
}

function fromConflictRow(row: ConflictRow, amountEur: number): OwnerLevelPaymentCandidate {
  return {
    transactionId: row.transaction_id,
    ownerEntityId: row.owner_entity_id,
    ownerCanonicalName: '',
    date: String(row.date),
    payer: row.payer ?? '',
    payee: 'Owner',
    amountEur,
    description: null,
    idempotencyKey: row.idempotency_key,
    reviewStatus: row.review_status,
    linkRole: 'owner_level_payment',
    isDeletedLink: false,
    isDeletedTransaction: false,
    transactionReviewStatus: 'active',
    propertyId: row.property_id,
    propertyName: row.property_name,
    category: 'Management',
    subcategory: 'Bank Payment to Owner',
  }
}

function asDbError(err: unknown): { code?: string; message?: string; details?: string; hint?: string } {
  if (err && typeof err === 'object') {
    const o = err as { code?: string; message?: string; details?: string; hint?: string }
    return { code: o.code, message: o.message, details: o.details, hint: o.hint }
  }
  return { message: String(err) }
}

/**
 * Authorized report-path read.
 */
export async function fetchOwnerLevelPaymentsForEntity(
  ownerEntityId: string,
): Promise<OwnerLevelFetchResult> {
  if (!ownerEntityId) {
    return { status: 'blocked', reason: 'owner entity id missing' }
  }

  try {
    const sb = createServiceClient()
    const finance = sb.schema('finance')

    const [payments, conflicts] = await Promise.all([
      finance
        .from('v_owner_level_payments')
        .select(
          'transaction_id, owner_entity_id, owner_display_name, date, payer, payee, amount_eur, description, idempotency_key, review_status, k_note',
        )
        .eq('owner_entity_id', ownerEntityId),
      finance
        .from('v_owner_level_payment_conflicts')
        .select(
          'transaction_id, owner_entity_id, property_id, property_name, date, payer, amount_eur, idempotency_key, review_status',
        )
        .eq('owner_entity_id', ownerEntityId),
    ])

    if (payments.error) {
      const classified = classifyOwnerLevelDbError(payments.error)
      return { status: classified.kind, reason: classified.reason, code: classified.code }
    }
    if (conflicts.error) {
      const classified = classifyOwnerLevelDbError(conflicts.error)
      return { status: classified.kind, reason: classified.reason, code: classified.code }
    }

    const out: OwnerLevelPaymentCandidate[] = []
    for (const row of (payments.data ?? []) as ViewRow[]) {
      const amount = parseOwnerLevelAmount(row.amount_eur)
      if (!amount.ok) {
        return { status: 'blocked', reason: `${amount.reason} (${row.transaction_id})` }
      }
      out.push(fromViewRow(row, amount.n))
    }
    for (const row of (conflicts.data ?? []) as ConflictRow[]) {
      const amount = parseOwnerLevelAmount(row.amount_eur)
      if (!amount.ok) {
        return { status: 'blocked', reason: `${amount.reason} (${row.transaction_id})` }
      }
      out.push(fromConflictRow(row, amount.n))
    }
    return { status: 'ok', candidates: out }
  } catch (err) {
    const classified = classifyOwnerLevelDbError(asDbError(err))
    return { status: classified.kind, reason: classified.reason, code: classified.code }
  }
}
