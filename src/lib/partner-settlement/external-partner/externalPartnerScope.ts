/**
 * @module partner-settlement/external-partner/externalPartnerScope
 * @description Shared exact-property scope and payer-field helpers (no I/O).
 * Notes / description never identify the payer.
 */

import type { RawExternalPartnerTransaction } from './externalPartnerReadTypes'

export const EXTERNAL_PARTNER_PROPERTY_NAME = 'Villa Mazotos' as const

const AVI_PAYER_KEYS = new Set(['avi', 'אבי'])

export function asFiniteEur(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function isExactExternalPartnerProperty(
  propertyName: string | null | undefined,
): boolean {
  return propertyName === EXTERNAL_PARTNER_PROPERTY_NAME
}

export function isInExternalPartnerReadScope(
  row: Pick<RawExternalPartnerTransaction, 'property_name' | 'is_deleted'>,
): boolean {
  return isExactExternalPartnerProperty(row.property_name) && row.is_deleted === false
}

/** Payer-field identity only. Notes / description / payee are ignored. */
export function resolvePayerIdentity(
  row: Pick<RawExternalPartnerTransaction, 'payer' | 'notes' | 'k_note' | 'description'>,
): string | null {
  void row.notes
  void row.k_note
  void row.description
  if (row.payer == null) return null
  const trimmed = row.payer.trim()
  return trimmed === '' ? null : trimmed
}

export function isAviPayerField(payer: string | null | undefined): boolean {
  if (payer == null) return false
  return AVI_PAYER_KEYS.has(payer.trim().toLowerCase())
}
