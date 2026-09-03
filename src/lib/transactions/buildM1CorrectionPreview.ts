/**
 * Pure M1 correction preview builder — no I/O.
 * Builds a void_and_replace / reclassify plan from editable fields only.
 */
import {
  buildCorrectionPlan,
  netLedgerEffect,
  type CorrectionKind,
  type CorrectionNewValues,
  type CorrectionPlan,
  type CorrectionSourceRow,
  type DbCorrectionType,
} from '@/lib/statements/correctionPlan'
import { assertNoUnsupportedApplyFields } from './correctionFieldSupport'
import { categoryToAccountType } from './categoryToAccountType'

export interface RegisterTxForCorrection {
  readonly id: string
  readonly date: string
  readonly property_id: string | null
  readonly property_name: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly notes: string | null
}

export interface M1ProposedEditable {
  readonly date?: string
  readonly category?: string
  readonly subcategory?: string | null
  readonly amount_eur?: number
  readonly client_charge?: number | null
  readonly description?: string | null
}

export interface M1CorrectionPreview {
  readonly kind: CorrectionKind
  readonly dbCorrectionType: DbCorrectionType
  readonly plan: CorrectionPlan
  readonly netLedgerEffectEur: number
  readonly originalSnapshot: Record<string, unknown>
  readonly proposedSnapshot: Record<string, unknown>
  readonly changedFields: string[]
}

function sameNum(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

function sameStr(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '') === (b ?? '')
}

export function toCorrectionSourceRow(tx: RegisterTxForCorrection): CorrectionSourceRow {
  return {
    id: tx.id,
    date: tx.date,
    account_type: categoryToAccountType(tx.category),
    category: tx.category,
    subcategory: tx.subcategory,
    amount_eur: tx.amount_eur,
    client_charge: tx.client_charge,
    description: tx.description,
  }
}

/**
 * Decide kind + DB type from which editable fields changed.
 * Money / date / description changes → void_and_replace.
 * Classification-only → reclassify.
 */
export function chooseCorrectionKind(
  original: RegisterTxForCorrection,
  proposed: M1ProposedEditable,
): { kind: CorrectionKind; dbCorrectionType: DbCorrectionType } {
  const amountChanged = proposed.amount_eur !== undefined && !sameNum(proposed.amount_eur, original.amount_eur)
  const chargeChanged =
    proposed.client_charge !== undefined && !sameNum(proposed.client_charge, original.client_charge)
  const dateChanged = proposed.date !== undefined && !sameStr(proposed.date, original.date)
  const descChanged =
    proposed.description !== undefined && !sameStr(proposed.description, original.description)
  const catChanged = proposed.category !== undefined && !sameStr(proposed.category, original.category)
  const subChanged =
    proposed.subcategory !== undefined && !sameStr(proposed.subcategory, original.subcategory)

  if (amountChanged || chargeChanged) {
    return { kind: 'void_and_replace', dbCorrectionType: 'amount_correction' }
  }
  if (dateChanged && !catChanged && !subChanged && !descChanged) {
    return { kind: 'void_and_replace', dbCorrectionType: 'date_correction' }
  }
  if (descChanged && !catChanged && !subChanged && !dateChanged) {
    return { kind: 'void_and_replace', dbCorrectionType: 'description_fix' }
  }
  if ((catChanged || subChanged) && !amountChanged && !chargeChanged && !dateChanged && !descChanged) {
    return { kind: 'reclassify', dbCorrectionType: 'reclassification' }
  }
  if (catChanged || subChanged) {
    return { kind: 'void_and_replace', dbCorrectionType: 'reclassification' }
  }
  return { kind: 'void_and_replace', dbCorrectionType: 'amount_correction' }
}

export function buildM1CorrectionPreview(
  original: RegisterTxForCorrection,
  proposed: M1ProposedEditable,
): M1CorrectionPreview {
  const gate = assertNoUnsupportedApplyFields({ ...proposed })
  if (!gate.ok) {
    throw new Error(`Unsupported apply fields: ${gate.unsupported.join(', ')}`)
  }

  const source = toCorrectionSourceRow(original)
  const { kind, dbCorrectionType } = chooseCorrectionKind(original, proposed)

  const newValues: CorrectionNewValues = {
    date: proposed.date ?? original.date,
    category: proposed.category ?? original.category,
    subcategory:
      proposed.subcategory !== undefined ? proposed.subcategory : original.subcategory,
    amount_eur: proposed.amount_eur ?? original.amount_eur,
    client_charge:
      proposed.client_charge !== undefined ? proposed.client_charge : original.client_charge,
    description:
      proposed.description !== undefined ? proposed.description : original.description,
    account_type: categoryToAccountType(proposed.category ?? original.category),
  }

  if (kind === 'reclassify') {
    // reclassify forbids amount change — strip amount from newValues to match plan rules
    const plan = buildCorrectionPlan(source, {
      kind,
      dbCorrectionType,
      newValues: {
        account_type: newValues.account_type,
        category: newValues.category,
        subcategory: newValues.subcategory,
      },
      reason: undefined,
    })
    return finalizePreview(original, proposed, plan, kind, dbCorrectionType, source)
  }

  const plan = buildCorrectionPlan(source, {
    kind: 'void_and_replace',
    dbCorrectionType,
    effectiveDate: newValues.date,
    newValues,
  })
  return finalizePreview(original, proposed, plan, 'void_and_replace', dbCorrectionType, source)
}

function finalizePreview(
  original: RegisterTxForCorrection,
  proposed: M1ProposedEditable,
  plan: CorrectionPlan,
  kind: CorrectionKind,
  dbCorrectionType: DbCorrectionType,
  source: CorrectionSourceRow,
): M1CorrectionPreview {
  const changedFields: string[] = []
  const originalSnapshot: Record<string, unknown> = {}
  const proposedSnapshot: Record<string, unknown> = {}

  const pairs: Array<[keyof M1ProposedEditable, unknown, unknown]> = [
    ['date', original.date, proposed.date ?? original.date],
    ['category', original.category, proposed.category ?? original.category],
    ['subcategory', original.subcategory, proposed.subcategory !== undefined ? proposed.subcategory : original.subcategory],
    ['amount_eur', original.amount_eur, proposed.amount_eur ?? original.amount_eur],
    [
      'client_charge',
      original.client_charge,
      proposed.client_charge !== undefined ? proposed.client_charge : original.client_charge,
    ],
    [
      'description',
      original.description,
      proposed.description !== undefined ? proposed.description : original.description,
    ],
  ]

  for (const [field, o, p] of pairs) {
    originalSnapshot[field] = o
    proposedSnapshot[field] = p
    const changed =
      typeof o === 'number' || typeof p === 'number'
        ? !sameNum(o as number | null, p as number | null)
        : !sameStr(String(o ?? ''), String(p ?? ''))
    if (changed) changedFields.push(field)
  }

  if (changedFields.length === 0) {
    throw new Error('No editable fields changed — nothing to correct')
  }

  return {
    kind,
    dbCorrectionType,
    plan,
    netLedgerEffectEur: netLedgerEffect(source, plan),
    originalSnapshot,
    proposedSnapshot,
    changedFields,
  }
}
