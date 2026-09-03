/**
 * Server-side preview fingerprint / version token for M1.
 * Derived only from canonical transaction fields + normalized proposed values.
 */
import { createHash } from 'crypto'
import type { M1ProposedEditable } from './buildM1CorrectionPreview'

export interface CanonicalFingerprintSource {
  readonly id: string
  readonly date: string
  readonly category: string
  readonly subcategory: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly description: string | null
  readonly property_id: string | null
  readonly property_name: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly notes: string | null
  readonly is_deleted: boolean | null
  readonly review_status: string | null
  readonly updated_at: string | null
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => (v === undefined ? null : v))
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex')
}

export function fingerprintCanonical(row: CanonicalFingerprintSource): string {
  return hashPayload({
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
    is_deleted: row.is_deleted === true,
    review_status: row.review_status,
    updated_at: row.updated_at,
  })
}

export function fingerprintProposed(proposed: M1ProposedEditable): string {
  return hashPayload({
    date: proposed.date ?? null,
    category: proposed.category ?? null,
    subcategory: proposed.subcategory !== undefined ? proposed.subcategory : null,
    amount_eur: proposed.amount_eur ?? null,
    client_charge: proposed.client_charge !== undefined ? proposed.client_charge : null,
    description: proposed.description !== undefined ? proposed.description : null,
  })
}

/** Idempotency key ties transaction + original fingerprint + proposed fingerprint. */
export function buildIdempotencyKey(
  transactionId: string,
  originalFingerprint: string,
  proposedFingerprint: string,
): string {
  return hashPayload({ transactionId, originalFingerprint, proposedFingerprint })
}

export interface M1PreviewToken {
  readonly originalFingerprint: string
  readonly proposedFingerprint: string
  readonly idempotencyKey: string
}
