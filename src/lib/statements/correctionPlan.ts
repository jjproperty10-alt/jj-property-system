/**
 * JJ Property 10 - Immutable correction / reclassification plan builder (G7)
 *
 * Pure, deterministic construction of the CORRECTING ENTRIES for a manual
 * correction, WITHOUT ever mutating the original row. History is immutable:
 * corrections are always new appended entries that reference the original, never
 * edits. This mirrors the capitalEvent.ts void-and-replace template and feeds the
 * existing immutable correction-case architecture (statements.correction_cases /
 * append-only statements.correction_events) - it does not itself write anything.
 *
 * Correction taxonomy (locked):
 *   - 'append'           : book a brand-new entry (e.g. a missing charge).
 *   - 'reverse'          : negate an erroneous entry (net 0 with the original).
 *   - 'void_and_replace' : reverse the original AND book a corrected replacement.
 *   - 'reclassify'       : money-neutral MOVE between classifications - reverse in
 *                          the old class, re-book the SAME amount in the new class.
 *
 * Every produced entry references the original id and the original is returned
 * untouched. Amounts are only ever changed by 'append' / 'void_and_replace'; a
 * 'reverse' preserves magnitude (sign-flipped) and a 'reclassify' preserves the
 * amount exactly (classification changes only).
 */

/** DB correction_type vocabulary (statements.correction_cases CHECK constraint). */
export type DbCorrectionType =
  | 'amount_correction'
  | 'reclassification'
  | 'duplicate_resolution'
  | 'missing_charge'
  | 'disputed_charge'
  | 'description_fix'
  | 'date_correction'

export const DB_CORRECTION_TYPES: readonly DbCorrectionType[] = [
  'amount_correction', 'reclassification', 'duplicate_resolution',
  'missing_charge', 'disputed_charge', 'description_fix', 'date_correction',
] as const

export function isDbCorrectionType(v: unknown): v is DbCorrectionType {
  return typeof v === 'string' && (DB_CORRECTION_TYPES as readonly string[]).includes(v)
}

/** Correction mechanism (how the ledger is corrected). */
export type CorrectionKind = 'append' | 'reverse' | 'void_and_replace' | 'reclassify'

/** Default DB reason per mechanism (overridable via request.dbCorrectionType). */
export const KIND_DEFAULT_DB_TYPE: Record<CorrectionKind, DbCorrectionType> = {
  append: 'missing_charge',
  reverse: 'amount_correction',
  void_and_replace: 'amount_correction',
  reclassify: 'reclassification',
}

/** Correctable subset of the canonical RC3 transaction row. Original is read-only. */
export interface CorrectionSourceRow {
  readonly id: string
  readonly date: string
  readonly account_type: string
  readonly category: string
  readonly subcategory: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly description: string | null
}

export type CorrectionEntryRole = 'reversal' | 'replacement' | 'rebook' | 'append'

/** A new corrective entry to be appended (id assigned by the DB on apply). */
export interface CorrectionEntry {
  readonly role: CorrectionEntryRole
  readonly original_transaction_id: string | null
  readonly date: string
  readonly account_type: string
  readonly category: string
  readonly subcategory: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly description: string | null
}

/** New/target values supplied by the correction request. */
export interface CorrectionNewValues {
  readonly date?: string
  readonly account_type?: string
  readonly category?: string
  readonly subcategory?: string | null
  readonly amount_eur?: number
  readonly client_charge?: number | null
  readonly description?: string | null
}

export interface CorrectionRequest {
  readonly kind: CorrectionKind
  /** Optional override of the DB reason; must be a valid DbCorrectionType. */
  readonly dbCorrectionType?: DbCorrectionType
  /** Effective date for the corrective entries (defaults to the original's date). */
  readonly effectiveDate?: string
  /** Required for append / void_and_replace; the corrected/target values. */
  readonly newValues?: CorrectionNewValues
  /** Human reason (stored on the case). */
  readonly reason?: string
}

export interface CorrectionPlan {
  readonly kind: CorrectionKind
  readonly dbCorrectionType: DbCorrectionType
  readonly original_transaction_id: string | null
  readonly entries: CorrectionEntry[]
  /** Snapshot of the original fields that change (for correction_cases.original_field_values). */
  readonly original_field_values: Record<string, unknown> | null
  /** Snapshot of the corrected fields (for correction_cases.corrected_field_values). */
  readonly corrected_field_values: Record<string, unknown> | null
  /** Net amount_eur across the plan's new entries (0 for a money-neutral reclassify). */
  readonly netAmountEur: number
}

export class CorrectionError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'CorrectionError'
    // Restore the prototype chain (TS/ES5 down-level breaks instanceof otherwise).
    Object.setPrototypeOf(this, CorrectionError.prototype)
  }
}

function neg(n: number | null): number | null {
  return n === null ? null : -n
}

function reversalOf(o: CorrectionSourceRow, date: string): CorrectionEntry {
  return {
    role: 'reversal',
    original_transaction_id: o.id,
    date,
    account_type: o.account_type,
    category: o.category,
    subcategory: o.subcategory,
    amount_eur: -o.amount_eur,
    client_charge: neg(o.client_charge),
    description: o.description,
  }
}

/**
 * Build the correction plan. The original (when supplied) is never mutated;
 * every entry references it. Throws CorrectionError on an incoherent request
 * (fail closed - never silently produce a no-op or a mutation).
 */
export function buildCorrectionPlan(
  original: CorrectionSourceRow | null,
  request: CorrectionRequest,
): CorrectionPlan {
  const { kind } = request
  if (request.dbCorrectionType !== undefined && !isDbCorrectionType(request.dbCorrectionType)) {
    throw new CorrectionError(`invalid dbCorrectionType: ${String(request.dbCorrectionType)}`)
  }
  const dbType = request.dbCorrectionType ?? KIND_DEFAULT_DB_TYPE[kind]
  const date = request.effectiveDate ?? original?.date ?? request.newValues?.date
  if (!date) throw new CorrectionError('an effective date is required')

  let entries: CorrectionEntry[]
  let originalFieldValues: Record<string, unknown> | null = null
  let correctedFieldValues: Record<string, unknown> | null = null

  if (kind === 'append') {
    const nv = request.newValues
    if (!nv || typeof nv.amount_eur !== 'number') {
      throw new CorrectionError('append requires newValues.amount_eur')
    }
    entries = [{
      role: 'append',
      original_transaction_id: original ? original.id : null,
      date,
      account_type: nv.account_type ?? original?.account_type ?? '',
      category: nv.category ?? original?.category ?? '',
      subcategory: nv.subcategory ?? original?.subcategory ?? null,
      amount_eur: nv.amount_eur,
      client_charge: nv.client_charge ?? null,
      description: nv.description ?? null,
    }]
    correctedFieldValues = { ...nv }
  } else {
    if (!original) throw new CorrectionError(`${kind} requires an original row`)

    if (kind === 'reverse') {
      entries = [reversalOf(original, date)]
      originalFieldValues = { amount_eur: original.amount_eur, client_charge: original.client_charge }
    } else if (kind === 'void_and_replace') {
      const nv = request.newValues
      if (!nv) throw new CorrectionError('void_and_replace requires newValues')
      const replacement: CorrectionEntry = {
        role: 'replacement',
        original_transaction_id: original.id,
        date,
        account_type: nv.account_type ?? original.account_type,
        category: nv.category ?? original.category,
        subcategory: nv.subcategory !== undefined ? nv.subcategory : original.subcategory,
        amount_eur: nv.amount_eur ?? original.amount_eur,
        client_charge: nv.client_charge !== undefined ? nv.client_charge : original.client_charge,
        description: nv.description !== undefined ? nv.description : original.description,
      }
      entries = [reversalOf(original, date), replacement]
      originalFieldValues = {
        date: original.date, account_type: original.account_type, category: original.category,
        subcategory: original.subcategory, amount_eur: original.amount_eur,
        client_charge: original.client_charge, description: original.description,
      }
      correctedFieldValues = { ...nv }
    } else {
      // reclassify - money-neutral MOVE; amount is preserved exactly.
      const nv = request.newValues
      if (!nv || (nv.account_type === undefined && nv.category === undefined && nv.subcategory === undefined)) {
        throw new CorrectionError('reclassify requires a new account_type/category/subcategory')
      }
      if (nv.amount_eur !== undefined && nv.amount_eur !== original.amount_eur) {
        throw new CorrectionError('reclassify must not change amount_eur (use void_and_replace)')
      }
      const newAccountType = nv.account_type ?? original.account_type
      const newCategory = nv.category ?? original.category
      const newSubcategory = nv.subcategory !== undefined ? nv.subcategory : original.subcategory
      const unchanged = newAccountType === original.account_type
        && newCategory === original.category
        && newSubcategory === original.subcategory
      if (unchanged) throw new CorrectionError('reclassify target is identical to the original classification')
      const rebook: CorrectionEntry = {
        role: 'rebook',
        original_transaction_id: original.id,
        date,
        account_type: newAccountType,
        category: newCategory,
        subcategory: newSubcategory,
        amount_eur: original.amount_eur, // preserved exactly
        client_charge: original.client_charge,
        description: original.description,
      }
      entries = [reversalOf(original, date), rebook]
      originalFieldValues = {
        account_type: original.account_type, category: original.category, subcategory: original.subcategory,
      }
      correctedFieldValues = { account_type: newAccountType, category: newCategory, subcategory: newSubcategory }
    }
  }

  const netAmountEur = entries.reduce((s, e) => s + e.amount_eur, 0)

  return {
    kind,
    dbCorrectionType: dbType,
    original_transaction_id: original ? original.id : null,
    entries,
    original_field_values: originalFieldValues,
    corrected_field_values: correctedFieldValues,
    netAmountEur,
  }
}

/**
 * The net amount the ledger changes by after this correction is applied,
 * INCLUDING the original that remains in place. reverse and reclassify are
 * money-neutral against the original (=> 0); append adds; void_and_replace moves
 * to the replacement value.
 */
export function netLedgerEffect(original: CorrectionSourceRow | null, plan: CorrectionPlan): number {
  const base = plan.kind === 'append' ? 0 : (original ? original.amount_eur : 0)
  return base + plan.netAmountEur
}

/* ---------------------------------------------------------------------------
 * Apply contract (INSERT-only) - the safe shape the missing apply path must use.
 *
 * The existing statements.transition_correction_case RPC only RECORDS an
 * applied_transaction_id it is handed; it does not itself create the correcting
 * public.transactions row. That "apply" path does not exist yet and is a DB
 * change requiring review (open question: whether public.transactions itself
 * rejects UPDATE/DELETE is unproven). To keep history immutable, applying a
 * correction MUST be INSERT-only: create the plan's entries as NEW canonical
 * transactions, then transition the case to 'applied' with the new id(s).
 * It MUST NEVER UPDATE or DELETE the original row.
 *
 * These types/guards describe that contract so a future RPC/service implements
 * the safe operation; this module performs no I/O and mutates nothing.
 * ------------------------------------------------------------------------- */

/** One INSERT the apply path must perform: a new canonical transaction. */
export interface CorrectionInsertOp {
  readonly op: 'insert_transaction'
  readonly role: CorrectionEntryRole
  /** The original this entry corrects (null for a standalone append). */
  readonly corrects_transaction_id: string | null
  readonly values: {
    readonly date: string
    readonly account_type: string
    readonly category: string
    readonly subcategory: string | null
    readonly amount_eur: number
    readonly client_charge: number | null
    readonly description: string | null
  }
}

/** The full, INSERT-only application of a correction plan against a case. */
export interface CorrectionApplyContract {
  readonly caseId: string
  readonly seriesId: string
  readonly kind: CorrectionKind
  readonly dbCorrectionType: DbCorrectionType
  readonly original_transaction_id: string | null
  /** Insert operations ONLY - never an update/delete of the original. */
  readonly inserts: CorrectionInsertOp[]
  /** After the inserts, transition the case to 'applied'. */
  readonly caseTransition: 'applied'
}

export interface BuildApplyContractInput {
  readonly caseId: string
  readonly seriesId: string
  readonly plan: CorrectionPlan
}

/**
 * Translate a correction plan into the INSERT-only apply contract. Pure: it
 * emits the operations a future apply RPC must run, and by construction contains
 * no update/delete of any existing row. Fails closed if the case/series ids are
 * missing.
 */
export function buildApplyContract(input: BuildApplyContractInput): CorrectionApplyContract {
  const { caseId, seriesId, plan } = input
  if (!caseId) throw new CorrectionError('buildApplyContract requires a caseId')
  if (!seriesId) throw new CorrectionError('buildApplyContract requires a seriesId')
  const inserts: CorrectionInsertOp[] = plan.entries.map(e => ({
    op: 'insert_transaction',
    role: e.role,
    corrects_transaction_id: e.original_transaction_id,
    values: {
      date: e.date,
      account_type: e.account_type,
      category: e.category,
      subcategory: e.subcategory,
      amount_eur: e.amount_eur,
      client_charge: e.client_charge,
      description: e.description,
    },
  }))
  return {
    caseId,
    seriesId,
    kind: plan.kind,
    dbCorrectionType: plan.dbCorrectionType,
    original_transaction_id: plan.original_transaction_id,
    inserts,
    caseTransition: 'applied',
  }
}

/**
 * Defensive guard: proves an apply contract is non-destructive - every operation
 * is an insert_transaction and nothing targets a mutation of the original.
 * Returns true when safe; use in tests and as a server-side assertion.
 */
export function isNonDestructiveApply(contract: CorrectionApplyContract): boolean {
  return (
    contract.caseTransition === 'applied' &&
    contract.inserts.length > 0 &&
    contract.inserts.every(i => i.op === 'insert_transaction')
  )
}
