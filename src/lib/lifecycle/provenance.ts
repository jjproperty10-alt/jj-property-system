/**
 * @module lifecycle/provenance
 * @description BusinessSource factory, validation, and audit utilities.
 *
 * Principle 3 from the ADR: "Every financial fact must answer:
 *   (1) Why does this value exist?
 *   (2) From which business source was it obtained?"
 *
 * This module is the implementation of that principle.
 */

import type {
  BusinessSource,
  ISODateTime,
  ValidationResult,
  ValidationError,
} from './types'

// ---------------------------------------------------------------------------
// Source type evidentiary weight (for display/audit, not for logic)
// ---------------------------------------------------------------------------

/**
 * Relative evidentiary strength of each source type.
 * Higher = stronger legal standing.
 * Used only for informational display — never for financial routing.
 */
const SOURCE_WEIGHT: Record<BusinessSource['sourceType'], number> = {
  notary_deed:       100,
  signed_agreement:   90,
  bank_transfer:      80,
  invoice:            70,
  board_resolution:   65,
  manual_approval:    50,
  email_confirmation: 40,
  other:              10,
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a BusinessSource record.
 * Validates that required fields are present.
 */
export function createBusinessSource(
  params: BusinessSource
): ValidationResult<BusinessSource> {
  const errors: ValidationError[] = []

  if (!params.sourceType) {
    errors.push({
      field: 'sourceType',
      rule: 'required',
      message: 'sourceType is required on every BusinessSource.',
    })
  }

  if (!params.reference || params.reference.trim().length < 3) {
    errors.push({
      field: 'reference',
      rule: 'min-length',
      message:
        'reference must describe the source specifically (e.g. "Partnership Agreement signed 2022-06-01"). ' +
        'A generic placeholder like "agreement" is not sufficient.',
    })
  }

  if (params.sourceType === 'other' && !params.notes) {
    errors.push({
      field: 'notes',
      rule: 'required-for-other',
      message: 'When sourceType is "other", notes must explain the source.',
    })
  }

  if (errors.length > 0) return { ok: false, errors }

  return { ok: true, value: { ...params } }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a BusinessSource that was loaded from storage.
 * Useful for migration and integrity checks.
 */
export function validateBusinessSource(
  source: BusinessSource
): ValidationResult<BusinessSource> {
  return createBusinessSource(source)
}

/**
 * Returns true if this source is considered strong evidence
 * (notary deed, signed agreement, or bank transfer).
 */
export function isStrongEvidence(source: BusinessSource): boolean {
  return SOURCE_WEIGHT[source.sourceType] >= 80
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Human-readable description of a business source.
 * Used in audit reports and partner-facing "why does this value exist?" explanations.
 *
 * Example output:
 *   "Signed Agreement — Partnership Agreement dated 2022-06-01 (verified by Yossi on 2022-07-01)"
 */
export function describeSource(source: BusinessSource): string {
  const typeLabel: Record<BusinessSource['sourceType'], string> = {
    notary_deed:       'Notary Deed',
    signed_agreement:  'Signed Agreement',
    bank_transfer:     'Bank Transfer',
    invoice:           'Invoice',
    board_resolution:  'Board Resolution',
    manual_approval:   'Manual Approval',
    email_confirmation:'Email Confirmation',
    other:             'Other',
  }

  const label = typeLabel[source.sourceType]
  let description = `${label} — ${source.reference}`

  if (source.verifiedBy && source.verifiedAt) {
    const date = source.verifiedAt.substring(0, 10)
    description += ` (verified by ${source.verifiedBy} on ${date})`
  } else if (source.verifiedBy) {
    description += ` (verified by ${source.verifiedBy})`
  }

  if (source.notes) {
    description += `. Note: ${source.notes}`
  }

  return description
}

// ---------------------------------------------------------------------------
// Provenance chain — for full audit trail on a single value
// ---------------------------------------------------------------------------

/**
 * A provenance chain records the business evidence for a single field value.
 * When answering "why is this value X?", each link in the chain is one piece of evidence.
 *
 * Example:
 *   field: 'requiredEntryCapital'
 *   value: 100000
 *   derivedFrom: [
 *     { field: 'agreedEntryValuation', value: 200000, source: { ... signed agreement ... } },
 *     { field: 'entryOwnershipPct',    value: 50,     source: { ... signed agreement ... } },
 *   ]
 *   formula: 'agreedEntryValuation × entryOwnershipPct / 100'
 */
export interface ProvenanceChain {
  /** The field whose value is being explained */
  field: string

  /** The value of that field */
  value: unknown

  /** If this value is computed, the formula used */
  formula?: string

  /** The direct business source, if this is a fact (not computed) */
  directSource?: BusinessSource

  /** If computed, the source facts this was derived from */
  derivedFrom?: Array<{
    field: string
    value: unknown
    source: BusinessSource
  }>

  /** When this provenance record was created */
  recordedAt: ISODateTime

  /** Who recorded this */
  recordedBy: string
}

/**
 * Build a simple provenance chain for a directly sourced fact.
 * For computed values, build manually or use buildComputedProvenance().
 */
export function buildDirectProvenance(
  field: string,
  value: unknown,
  source: BusinessSource,
  recordedBy: string
): ProvenanceChain {
  return {
    field,
    value,
    directSource: source,
    recordedAt: new Date().toISOString(),
    recordedBy,
  }
}

/**
 * Build a provenance chain for a computed value.
 *
 * Example: requiredEntryCapital = agreedEntryValuation × ownershipPct / 100
 */
export function buildComputedProvenance(
  field: string,
  value: unknown,
  formula: string,
  derivedFrom: Array<{ field: string; value: unknown; source: BusinessSource }>,
  recordedBy: string
): ProvenanceChain {
  return {
    field,
    value,
    formula,
    derivedFrom,
    recordedAt: new Date().toISOString(),
    recordedBy,
  }
}

// ---------------------------------------------------------------------------
// Missing source placeholder
// ---------------------------------------------------------------------------

/**
 * Placeholder BusinessSource for fields that are UNKNOWN and pending Yossi decision.
 * Signals that this value cannot be confirmed until a source is provided.
 *
 * Used in the Business Decision Worksheet workflow.
 */
export function pendingBusinessSource(description: string): BusinessSource {
  return {
    sourceType: 'other',
    reference: `PENDING — ${description}`,
    notes: 'This value requires a business decision from Yossi. Do not use in production reports.',
  }
}
