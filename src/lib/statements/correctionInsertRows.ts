/**
 * JJ Property 10 - INSERT-only correction rows builder (append model) (Gate cert)
 *
 * Pure, deterministic mapping from a G7 CorrectionPlan (buildCorrectionPlan) + the
 * ORIGINAL transaction row into the COMPLETE public.transactions insert payloads
 * that the append-only apply RPC (statements.apply_correction_case) will INSERT.
 *
 * Append model: corrections NEVER mutate the original row. Each correcting entry
 * becomes a NEW public.transactions row that references the original id. Descriptive
 * metadata not carried by the plan entry (property_id/property_name/payer/payee/
 * notes/k_note) is inherited from the original; the entry supplies the corrected
 * financial/classification/date/description fields.
 *
 * No I/O, no accounting recompute. The RPC performs the atomic INSERT + case link.
 */
import type { CorrectionPlan, CorrectionEntry, CorrectionEntryRole } from './correctionPlan'

/** The original transaction row (subset of public.transactions) for metadata inheritance. */
export interface OriginalTxRow {
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
  readonly k_note: string | null
}

/** A complete correcting row to INSERT into public.transactions (append-only). */
export interface CorrectionInsertRow {
  readonly role: CorrectionEntryRole
  readonly corrects_transaction_id: string | null
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
  readonly k_note: string | null
}

export class CorrectionInsertError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'CorrectionInsertError'
    Object.setPrototypeOf(this, CorrectionInsertError.prototype)
  }
}

/**
 * Build the complete INSERT payloads for a correction plan. The original supplies
 * descriptive metadata (and must be present for reverse/void_and_replace/reclassify);
 * a standalone 'append' may pass original=null. `category` is required by the table
 * (NOT NULL) - fails closed if it cannot be resolved.
 */
export function buildCorrectionInsertRows(
  plan: CorrectionPlan,
  original: OriginalTxRow | null,
): CorrectionInsertRow[] {
  if (!plan || !Array.isArray(plan.entries) || plan.entries.length === 0) {
    throw new CorrectionInsertError('plan has no entries')
  }
  if (plan.kind !== 'append' && !original) {
    throw new CorrectionInsertError(`${plan.kind} requires the original transaction row`)
  }
  if (original && plan.original_transaction_id && plan.original_transaction_id !== original.id) {
    throw new CorrectionInsertError('original row id does not match the plan original_transaction_id')
  }
  const VALID_ROLES = new Set(['reversal', 'replacement', 'rebook', 'append'])
  return plan.entries.map((e: CorrectionEntry, i: number) => {
    if (!VALID_ROLES.has(e.role)) {
      throw new CorrectionInsertError(`row ${i}: invalid role "${String(e.role)}"`)
    }
    if (!e.date || String(e.date).trim() === '') {
      throw new CorrectionInsertError(`row ${i}: a date is required`)
    }
    // P-ARCH-1: amount must be a finite number; never coerce Unknown to 0.
    if (typeof e.amount_eur !== 'number' || !Number.isFinite(e.amount_eur)) {
      throw new CorrectionInsertError(`row ${i}: amount_eur must be a finite number (Unknown != 0)`)
    }
    if (e.client_charge !== null && (typeof e.client_charge !== 'number' || !Number.isFinite(e.client_charge))) {
      throw new CorrectionInsertError(`row ${i}: client_charge must be null or a finite number`)
    }
    const category = (e.category || original?.category || '').trim()
    if (!category) throw new CorrectionInsertError(`row ${i}: a non-empty category is required for the correcting row`)
    return {
      role: e.role,
      corrects_transaction_id: e.original_transaction_id ?? (original ? original.id : null),
      date: e.date,
      // descriptive metadata inherited from the original (append keeps null if none)
      property_id: original?.property_id ?? null,
      property_name: original?.property_name ?? null,
      // classification + financials from the plan entry
      category,
      subcategory: e.subcategory ?? original?.subcategory ?? null,
      description: e.description ?? original?.description ?? null,
      payer: original?.payer ?? null,
      payee: original?.payee ?? null,
      amount_eur: e.amount_eur,
      client_charge: e.client_charge,
      notes: original?.notes ?? null,
      k_note: original?.k_note ?? null,
    }
  })
}

/** Net amount_eur across the correcting rows (0 for a money-neutral reclassify). */
export function insertRowsNet(rows: readonly CorrectionInsertRow[]): number {
  return rows.reduce((s, r) => s + r.amount_eur, 0)
}
