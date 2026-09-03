/**
 * M1 controlled-correction field matrix.
 *
 * Editable fields must be supported end-to-end by:
 *   CorrectionNewValues → buildCorrectionPlan → buildCorrectionInsertRows
 *   → openCorrectionCaseAction / applyCorrectionCaseAction
 *   → statements.apply_correction_case
 *
 * Fields that the DB binding layer could accept in corrected_field_values but
 * that correctionInsertRows ALWAYS inherits from the original (property_*,
 * payer, payee, notes) are intentionally READ-ONLY in M1 — no unsafe UPDATE.
 */

export const M1_EDITABLE_FIELDS = [
  'date',
  'category',
  'subcategory',
  'amount_eur',
  'client_charge',
  'description',
] as const

export type M1EditableField = (typeof M1_EDITABLE_FIELDS)[number]

export const M1_READONLY_FIELDS = [
  'property_id',
  'property_name',
  'payer',
  'payee',
  'notes',
  'review_status',
  'is_deleted',
] as const

export type M1ReadonlyField = (typeof M1_READONLY_FIELDS)[number]

export const M1_READONLY_REASONS: Record<M1ReadonlyField, string> = {
  property_id:
    'Inherited by buildCorrectionInsertRows from the original; not in CorrectionNewValues.',
  property_name:
    'Inherited by buildCorrectionInsertRows from the original; not in CorrectionNewValues.',
  payer:
    'Inherited by buildCorrectionInsertRows from the original; not in CorrectionNewValues.',
  payee:
    'Inherited by buildCorrectionInsertRows from the original; not in CorrectionNewValues.',
  notes:
    'Inherited by buildCorrectionInsertRows from the original; plan carries description only.',
  review_status: 'Out of scope for M1 — no review_status mutation.',
  is_deleted: 'Out of scope for M1 — no is_deleted mutation.',
}

export function isM1EditableField(field: string): field is M1EditableField {
  return (M1_EDITABLE_FIELDS as readonly string[]).includes(field)
}

export function assertNoUnsupportedApplyFields(
  proposed: Record<string, unknown>,
): { ok: true } | { ok: false; unsupported: string[] } {
  const unsupported = Object.keys(proposed).filter((k) => !isM1EditableField(k))
  if (unsupported.length > 0) return { ok: false, unsupported }
  return { ok: true }
}
