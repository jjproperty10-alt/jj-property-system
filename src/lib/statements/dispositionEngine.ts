/**
 * @module statements/dispositionEngine
 * @description VS-1A v4 — Disposition engine: classifies RC3 rows into statement buckets.
 *
 * Pure function. No side effects. No DB access. No state.
 * Takes RC3AccountRow[] from fetchRC3Report, returns DispositionSummary.
 *
 * v4 changes from v3:
 *   B2: sourceDataHash expanded to ALL statement-relevant source fields
 *       (19 source fields + 1 version tag = 20 canonical payload keys, versioned payload v3).
 *       Includes payee (from v_rc3_classified). Any change to date, property, category,
 *       description, payer, payee, display_label, or any other field shown on the partner
 *       statement now changes the provenance hash. null values are serialized explicitly
 *       via JSON.stringify (JSON null), ensuring consistent representation.
 *   B3: Additional provenance tests proving field changes alter hashes.
 *   v5: payee added to TransactionDisposition output for full traceability.
 *
 * v3 changes from v2:
 *   B2: Provenance rebuilt — sourceSetHash binds UUID+sourceDataHash,
 *       aggregateDispositionHash binds transactionId+sourceDataHash+dispositionHash,
 *       duplicate UUIDs rejected before classification.
 *   B3: Money handling strengthened — NaN/Infinity rejected, precision policy defined,
 *       negative amounts tested.
 *
 * Classification rules (derived from RC3 flags):
 *   is_contract_value === true     → EXCLUDED       (balance_effect = contract_value)
 *   is_platform_tracking === true  → INFORMATIONAL  (balance_effect = tracking_only)
 *   is_balance_affecting === true  → BALANCE_AFFECTING (income | expense | payment_out)
 *   display_group === 'info'       → INFORMATIONAL   (tracking_only)
 *   fallback                       → UNRESOLVED      (needs_review)
 *
 * Invariant: sourceRows = balanceAffecting + informational + excluded + unresolved
 *
 * @see RC3AccountRow — input contract (from fetchRC3Report TypeScript pipeline)
 * @see DispositionSummary in ./types — output contract
 * @see P-ARCH-1: Unknown values preserved as-is, never coerced.
 */

import 'server-only'

import { createHash } from 'crypto'

import type {
  TransactionDisposition,
  DispositionSummary,
  DispositionBucket,
  P1BalanceEffect,
  DraftProvenance,
} from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Classifier version — increment on any change to classification logic */
export const CLASSIFIER_VERSION = 'vs1a-disposition-v1.4.0'

/**
 * Source data hash payload version — increment when fields are added/removed.
 * v1: id, amount_eur, client_charge, client_amount, account_type, display_group,
 *     is_balance_affecting, is_bpo, is_contract_value, is_platform_tracking
 * v2: Added date, property_name, category, subcategory, description, payer,
 *     display_label, balance_effect. Now covers ALL statement-relevant source fields.
 * v3: Added payee. Now 19 source fields + 1 version tag = 20 canonical payload keys.
 */
export const SOURCE_HASH_PAYLOAD_VERSION = 'v3'

/**
 * Decimal precision policy (v3-B3):
 * All EUR amounts are rounded to 2 decimal places (cents).
 * This matches the database column type (NUMERIC) and business convention.
 * eurToCents() rounds to nearest integer cent. centsToEur() divides by 100.
 * No sub-cent precision is preserved or expected.
 */
export const PRECISION_DECIMALS = 2

// ─── RC3 Row shape (subset needed by disposition engine) ────────────────────────

/**
 * Minimal RC3AccountRow interface. These fields come from the TypeScript RC3
 * pipeline (fetchRC3Report → computeBalance), NOT directly from the database view.
 *
 * The database view v_rc3_classified provides 18 columns. The TypeScript engine
 * enriches those with: display_group, display_label, balance_effect, is_balance_affecting.
 * This interface requires the enriched output.
 */
export interface RC3RowForDisposition {
  readonly id: string
  readonly date: string
  readonly property_name: string | null
  readonly category: string
  readonly subcategory: string | null
  readonly description: string | null
  readonly payer: string | null
  readonly payee: string | null
  readonly amount_eur: number
  readonly client_charge: number | null
  readonly client_amount: number
  readonly balance_effect: number
  readonly is_balance_affecting: boolean
  readonly is_platform_tracking: boolean
  readonly is_contract_value: boolean
  readonly is_bpo: boolean
  readonly account_type: string
  readonly display_group: 'income' | 'expense' | 'payment_out' | 'info' | 'reference'
  readonly display_label: string
}

// ─── Money safety (v3-B3) ──────────────────────────────────────────────────────

/**
 * Validate that a number is safe for financial arithmetic.
 * Rejects NaN, Infinity, -Infinity.
 * @throws Error if the value is not a finite number
 */
function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Unsafe financial value: ${label} = ${value} (must be finite number)`)
  }
}

// ─── Integer-cent arithmetic (HB4 + v3-B3) ─────────────────────────────────────

/**
 * Convert EUR to integer cents. Rounds to nearest cent.
 * v3-B3: Rejects NaN and Infinity before conversion.
 */
function eurToCents(eur: number): number {
  requireFinite(eur, 'eurToCents input')
  return Math.round(eur * 100)
}

/**
 * Convert integer cents back to EUR.
 */
function centsToEur(cents: number): number {
  requireFinite(cents, 'centsToEur input')
  return cents / 100
}

// ─── Hashing (R3 + HB3: server-only SHA-256, no fallback) ────────────────────────

/**
 * Compute SHA-256 hash of a string. Server-only — uses Node.js crypto directly.
 * If crypto is unavailable, the error propagates — fail closed.
 */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * Compute source data hash for a single row.
 * Uses canonical JSON with explicitly sorted keys for deterministic serialization.
 *
 * v4 (SOURCE_HASH_PAYLOAD_VERSION=v3): 19 source fields + 1 version tag = 20 canonical payload keys.
 * If ANY field that appears on the partner's statement changes, the provenance hash changes.
 * null values are serialized as JSON null by JSON.stringify — consistent across all nullable fields.
 * Keys are listed alphabetically for canonicalization.
 */
function computeSourceDataHash(row: RC3RowForDisposition): string {
  const hashPayload = JSON.stringify({
    _version: SOURCE_HASH_PAYLOAD_VERSION,
    account_type: row.account_type,
    amount_eur: row.amount_eur,
    balance_effect: row.balance_effect,
    category: row.category,
    client_amount: row.client_amount,
    client_charge: row.client_charge,
    date: row.date,
    description: row.description,
    display_group: row.display_group,
    display_label: row.display_label,
    id: row.id,
    is_balance_affecting: row.is_balance_affecting,
    is_bpo: row.is_bpo,
    is_contract_value: row.is_contract_value,
    is_platform_tracking: row.is_platform_tracking,
    payer: row.payer,
    payee: row.payee,
    property_name: row.property_name,
    subcategory: row.subcategory,
  })
  return sha256(hashPayload)
}

/**
 * Compute disposition hash for a single classified row.
 * v3-B2: Binds transactionId + sourceDataHash into the disposition hash
 * so that both source identity and source content are covered.
 */
function computeDispositionHash(disposition: TransactionDisposition): string {
  const hashPayload = JSON.stringify({
    balanceEffect: disposition.balanceEffect,
    bucket: disposition.bucket,
    clientAmountEur: disposition.clientAmountEur,
    displayGroup: disposition.displayGroup,
    includedInArithmetic: disposition.includedInArithmetic,
    signedBalanceEffect: disposition.signedBalanceEffect,
    sourceDataHash: disposition.sourceDataHash,
    transactionId: disposition.transactionId,
  })
  return sha256(hashPayload)
}

// ─── Display group → P1-1 balance_effect mapping ────────────────────────────────

function toP1BalanceEffect(
  displayGroup: string,
  isBpo: boolean,
  isContractValue: boolean,
  isPlatformTracking: boolean,
): P1BalanceEffect {
  if (isContractValue) return 'contract_value'
  if (isPlatformTracking) return 'tracking_only'
  if (isBpo) return 'payment_out'

  switch (displayGroup) {
    case 'income':      return 'income'
    case 'expense':     return 'expense'
    case 'payment_out': return 'payment_out'
    case 'info':        return 'tracking_only'
    case 'reference':   return 'contract_value'
    default:            return 'needs_review'
  }
}

// ─── Classification logic ───────────────────────────────────────────────────────

function classifyRow(row: RC3RowForDisposition): TransactionDisposition {
  // v3-B3: Validate financial fields before classification
  requireFinite(row.amount_eur, `amount_eur for ${row.id}`)
  requireFinite(row.client_amount, `client_amount for ${row.id}`)
  requireFinite(row.balance_effect, `balance_effect for ${row.id}`)
  if (row.client_charge !== null) {
    requireFinite(row.client_charge, `client_charge for ${row.id}`)
  }

  let bucket: DispositionBucket
  let reason: string

  if (row.is_contract_value) {
    bucket = 'EXCLUDED'
    reason = 'Contract value — excluded from balance equation (is_contract_value=true)'
  } else if (row.is_platform_tracking) {
    bucket = 'INFORMATIONAL'
    reason = 'Platform tracking row — displayed but does not affect balance (is_platform_tracking=true)'
  } else if (row.is_balance_affecting) {
    bucket = 'BALANCE_AFFECTING'
    reason = row.is_bpo
      ? 'Bank Payment to Owner — reduces owner balance (is_bpo=true, is_balance_affecting=true)'
      : `${row.display_group} — affects owner balance (is_balance_affecting=true, display_group=${row.display_group})`
  } else {
    if (row.display_group === 'info') {
      bucket = 'INFORMATIONAL'
      reason = 'Info display group — tracked but not balance-affecting (is_balance_affecting=false, display_group=info)'
    } else {
      bucket = 'UNRESOLVED'
      reason = `Cannot classify — is_balance_affecting=false, display_group=${row.display_group} (not info or platform_tracking)`
    }
  }

  const balanceEffect = toP1BalanceEffect(
    row.display_group,
    row.is_bpo,
    row.is_contract_value,
    row.is_platform_tracking,
  )

  const sourceDataHash = computeSourceDataHash(row)

  return {
    transactionId: row.id,
    transactionDate: row.date,
    propertyName: row.property_name,
    category: row.category,
    subcategory: row.subcategory,
    description: row.description,
    payer: row.payer,
    payee: row.payee,
    amountEur: row.amount_eur,
    clientCharge: row.client_charge,
    clientAmountEur: row.client_amount,
    accountType: row.account_type,
    isContractValue: row.is_contract_value,
    isPlatformTracking: row.is_platform_tracking,
    isBpo: row.is_bpo,
    isBalanceAffecting: bucket === 'BALANCE_AFFECTING',
    bucket,
    balanceEffect,
    displayGroup: row.display_group,
    displayLabel: row.display_label,
    signedBalanceEffect: row.balance_effect,
    reason,
    includedInArithmetic: bucket === 'BALANCE_AFFECTING',
    classifierVersion: CLASSIFIER_VERSION,
    sourceDataHash,
  }
}

// ─── Provenance computation (R3, rebuilt in v3-B2) ────────────────────────────

function computeProvenance(
  dispositions: readonly TransactionDisposition[],
  periodStart: string,
  periodEnd: string,
): DraftProvenance {
  // v3-B2: Sort by transactionId for deterministic ordering
  const sortedSourceIds = dispositions
    .map(d => d.transactionId)
    .sort()

  // v3-B2: sourceSetHash binds each UUID to its sourceDataHash
  // This ensures that changing source data (not just adding/removing rows) changes the hash
  const sourceSetEntries = sortedSourceIds.map(id => {
    const d = dispositions.find(dd => dd.transactionId === id)!
    return `${id}:${d.sourceDataHash}`
  })
  const sourceSetHash = sha256(sourceSetEntries.join('\n'))

  // v3-B2: Each row disposition hash already includes transactionId + sourceDataHash
  // (via computeDispositionHash above)
  const rowDispositionHashes = sortedSourceIds.map(id => {
    const d = dispositions.find(dd => dd.transactionId === id)!
    return computeDispositionHash(d)
  })

  // v3-B2: aggregateDispositionHash binds all three: transactionId + sourceDataHash + disposition
  // Each rowDispositionHash already includes transactionId and sourceDataHash
  const aggregateDispositionHash = sha256(rowDispositionHashes.join('\n'))

  return {
    classifierVersion: CLASSIFIER_VERSION,
    periodStart,
    periodEnd,
    computedAt: new Date().toISOString(),
    sortedSourceIds,
    sourceSetHash,
    rowDispositionHashes,
    aggregateDispositionHash,
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Classify all RC3 rows into disposition buckets.
 * Returns a DispositionSummary with the reconciliation invariant check.
 *
 * Pure function. No side effects. No DB calls.
 *
 * v3-B2: Rejects duplicate transaction UUIDs before classification (fail closed).
 * v3-B3: Rejects NaN/Infinity in financial fields.
 * HB4: All financial sums use integer-cent arithmetic.
 *
 * @param rows         RC3AccountRow[] from fetchRC3Report (enriched by computeBalance)
 * @param periodStart  ISO date — statement period start
 * @param periodEnd    ISO date — statement period end
 * @returns            DispositionSummary with per-row classification, totals, and provenance
 * @throws             Error if duplicate UUIDs found or financial values are NaN/Infinity
 */
export function classifyDisposition(
  rows: readonly RC3RowForDisposition[],
  periodStart: string = '',
  periodEnd: string = '',
): DispositionSummary {
  // v3-B2: Reject duplicate transaction UUIDs before classification
  const seenIds = new Set<string>()
  for (const row of rows) {
    if (seenIds.has(row.id)) {
      throw new Error(`Duplicate transaction UUID rejected: ${row.id}. Each source row must have a unique ID.`)
    }
    seenIds.add(row.id)
  }

  const dispositions = rows.map(classifyRow)

  const balanceAffecting = dispositions.filter(d => d.bucket === 'BALANCE_AFFECTING').length
  const informational = dispositions.filter(d => d.bucket === 'INFORMATIONAL').length
  const excluded = dispositions.filter(d => d.bucket === 'EXCLUDED').length
  const unresolved = dispositions.filter(d => d.bucket === 'UNRESOLVED').length

  const sourceRows = rows.length
  const reconciled = sourceRows === balanceAffecting + informational + excluded + unresolved

  // Financial totals from balance-affecting rows only — HB4: integer-cent arithmetic
  const affectingRows = dispositions.filter(d => d.bucket === 'BALANCE_AFFECTING')

  const totalIncomeEurCents = affectingRows
    .filter(d => d.displayGroup === 'income')
    .reduce((sum, d) => sum + eurToCents(d.clientAmountEur), 0)

  const totalExpensesEurCents = affectingRows
    .filter(d => d.displayGroup === 'expense')
    .reduce((sum, d) => sum + eurToCents(d.clientAmountEur), 0)

  const totalBpoEurCents = affectingRows
    .filter(d => d.displayGroup === 'payment_out')
    .reduce((sum, d) => sum + eurToCents(d.clientAmountEur), 0)

  const closingBalanceContributionCents = affectingRows
    .reduce((sum, d) => sum + eurToCents(d.signedBalanceEffect), 0)

  // Source amount totals for reconciliation (R2) — HB4: integer-cent arithmetic
  const totalAmountEurCents = dispositions.reduce((sum, d) => sum + eurToCents(d.amountEur), 0)
  const totalClientChargeEurCents = dispositions
    .filter(d => d.clientCharge !== null)
    .reduce((sum, d) => sum + eurToCents(d.clientCharge ?? 0), 0)
  const markupRows = dispositions.filter(
    d => d.clientCharge !== null && d.clientCharge !== d.amountEur,
  )
  const markupRowCount = markupRows.length
  const totalMarkupEurCents = markupRows.reduce(
    (sum, d) => sum + (eurToCents(d.clientCharge ?? 0) - eurToCents(d.amountEur)), 0,
  )

  // Draft provenance for drift detection (R3)
  const provenance = computeProvenance(dispositions, periodStart, periodEnd)

  return {
    sourceRows,
    balanceAffecting,
    informational,
    excluded,
    unresolved,
    reconciled,
    rows: dispositions,
    totals: {
      totalIncomeEur: centsToEur(totalIncomeEurCents),
      totalExpensesEur: centsToEur(totalExpensesEurCents),
      totalBpoEur: centsToEur(totalBpoEurCents),
      closingBalanceContribution: centsToEur(closingBalanceContributionCents),
    },
    sourceAmounts: {
      totalAmountEur: centsToEur(totalAmountEurCents),
      totalClientChargeEur: centsToEur(totalClientChargeEurCents),
      markupRowCount,
      totalMarkupEur: centsToEur(totalMarkupEurCents),
    },
    provenance,
  }
}
