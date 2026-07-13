/**
 * @module lifecycle/validation
 * @description "Never Infer" invariant guards — the formal enforcement of ADR Principle 2.
 *
 * Each invariant has a named function (INV-1 through INV-6) corresponding directly
 * to the ADR's prohibition table. When a violation is detected, the error includes
 * the specific invariant name so it can be traced back to the architectural decision.
 *
 * These functions are PURE — they take values and return results. No side effects.
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md — Principle 2: Never Infer Investment Facts
 */

import type {
  ValidationResult,
  ValidationError,
  NeverInferInvariant,
  ISODate,
  BusinessSource,
} from './types'
import type { PropertyAcquisition } from './acquisition'
import type { PartnerEntry } from './partnerEntry'
import type { CapitalEvent } from './capitalEvent'
import type { OwnershipPeriod } from './ownershipPeriod'
import { validateAcquisition } from './acquisition'
import { validatePartnerEntry } from './partnerEntry'
import { validateCapitalEvent } from './capitalEvent'
import { validateOwnershipPeriod } from './ownershipPeriod'

// ---------------------------------------------------------------------------
// INV-1: Purchase Price ≠ Partner Entry Valuation
// ---------------------------------------------------------------------------

/**
 * INV-1: The partner's agreed entry valuation must not be derived from the acquisition price.
 *
 * These two numbers may accidentally be equal — that's not a violation.
 * The violation is when the system derives one from the other.
 *
 * How this is enforced:
 *   - Both values must have independent businessSource references.
 *   - The acquisition's source references the purchase deed.
 *   - The partner entry's source references the partnership agreement.
 *   - If they reference the same document, it's likely a "Never Infer" violation.
 *
 * @param entry         The PartnerEntry to check
 * @param acquisition   The PropertyAcquisition for the same property
 */
export function assertEntryValuationHasIndependentSource(
  entry: PartnerEntry,
  acquisition: PropertyAcquisition
): ValidationResult<PartnerEntry> {
  const errors: ValidationError[] = []

  // Check: the entry's businessSource must reference a different document than the acquisition
  const entryRef = entry.businessSource?.reference?.toLowerCase().trim()
  const acquisitionRef = acquisition.businessSource?.reference?.toLowerCase().trim()

  if (
    entryRef &&
    acquisitionRef &&
    entryRef === acquisitionRef &&
    entryRef !== 'pending'
  ) {
    errors.push({
      field: 'agreedEntryValuation',
      rule: 'INV-1',
      neverInferViolation: 'INV-1:purchase-price-ne-entry-valuation',
      message:
        `INV-1 violation: The partner entry valuation and the acquisition price reference ` +
        `the same source document ("${entry.businessSource.reference}"). ` +
        `The entry valuation must come from the partnership agreement, ` +
        `not from the original purchase deed. ` +
        `Provide a separate businessSource for agreedEntryValuation.`,
    })
  }

  // Warn if the values are exactly equal (not a hard violation, but suspicious)
  if (
    entry.agreedEntryValuation === acquisition.purchasePrice &&
    entry.agreedEntryValuation > 0
  ) {
    // This is a warning, not a blocking error — values CAN coincidentally match.
    // But we note it for human review.
    errors.push({
      field: 'agreedEntryValuation',
      rule: 'INV-1-suspicious',
      neverInferViolation: 'INV-1:purchase-price-ne-entry-valuation',
      message:
        `INV-1 advisory: The agreed entry valuation (${entry.agreedEntryValuation}) ` +
        `equals the acquisition purchase price (${acquisition.purchasePrice}). ` +
        `This may be coincidental but requires explicit Yossi confirmation that ` +
        `the entry valuation was independently agreed, not derived from the purchase price.`,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: entry }
}

// ---------------------------------------------------------------------------
// INV-2: Capital Paid ≠ Required Entry Capital
// ---------------------------------------------------------------------------

/**
 * INV-2: The system must not assume a partner has paid their required entry capital
 * just because the amounts are equal.
 *
 * Capital Paid tracks actual transfers (from CapitalEvent records).
 * Required Entry Capital is what was agreed in the partnership agreement.
 *
 * These values should be compared, never conflated.
 */
export function assertCapitalPaidNotAssumedComplete(
  requiredEntryCapital: number,
  capitalPaid: number
): ValidationResult<{ capitalPaid: number; capitalRemaining: number }> {
  const capitalRemaining = requiredEntryCapital - capitalPaid

  // This invariant is informational — we're not blocking anything here.
  // We return the computed remaining balance, which the caller uses.
  // The "violation" would be if code elsewhere SKIPS this check and assumes paid = required.

  return {
    ok: true,
    value: {
      capitalPaid,
      capitalRemaining: Math.round(capitalRemaining * 100) / 100,
    },
  }
}

// ---------------------------------------------------------------------------
// INV-3: Ownership % ≠ Amount Paid
// ---------------------------------------------------------------------------

/**
 * INV-3: The ownership percentage must not be derived from payment amounts.
 *
 * The system must never compute ownershipPct = capitalPaid / somePrice.
 * Ownership % comes from the signed agreement.
 *
 * This guard checks that the entry's ownershipPct has a businessSource
 * that is a signed agreement — not a bank transfer.
 */
export function assertOwnershipPctFromAgreement(
  entry: PartnerEntry
): ValidationResult<PartnerEntry> {
  const errors: ValidationError[] = []

  if (
    entry.businessSource?.sourceType === 'bank_transfer' &&
    entry.status === 'confirmed'
  ) {
    errors.push({
      field: 'entryOwnershipPct',
      rule: 'INV-3',
      neverInferViolation: 'INV-3:ownership-pct-ne-amount-paid',
      message:
        `INV-3 violation: The entryOwnershipPct is confirmed from a bank_transfer source. ` +
        `Ownership percentages must come from a signed_agreement or notary_deed, ` +
        `not from payment records. The bank transfer proves capital paid — ` +
        `not the agreed ownership percentage.`,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: entry }
}

// ---------------------------------------------------------------------------
// INV-4: Entry Date ≠ Payment Date
// ---------------------------------------------------------------------------

/**
 * INV-4: The partner's legal entry date must not be assumed to equal any payment date.
 *
 * The entry date is when ownership legally transferred (per the agreement/notary).
 * Payment dates are when capital moved (per bank records).
 * These may be days, weeks, or months apart.
 */
export function assertEntryDateFromLegalSource(
  entry: PartnerEntry
): ValidationResult<PartnerEntry> {
  const errors: ValidationError[] = []

  if (
    entry.businessSource?.sourceType === 'bank_transfer' &&
    entry.status === 'confirmed'
  ) {
    errors.push({
      field: 'entryDate',
      rule: 'INV-4',
      neverInferViolation: 'INV-4:entry-date-ne-payment-date',
      message:
        `INV-4 violation: The entryDate is confirmed from a bank_transfer source. ` +
        `The legal entry date must come from a signed_agreement or notary_deed, ` +
        `not from a payment record. A payment may occur before or after the legal ` +
        `transfer of ownership.`,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: entry }
}

// ---------------------------------------------------------------------------
// INV-5: Effective Ownership Date ≠ Contract Signature Date
// ---------------------------------------------------------------------------

/**
 * INV-5: The date an ownership period becomes legally effective may differ from
 * the date the contract was signed.
 *
 * Example: Contract signed 2022-05-15. Notary registration completed 2022-06-01.
 *          Legal ownership effective: 2022-06-01 (not 2022-05-15).
 */
export function assertEffectiveDateExplicit(
  period: OwnershipPeriod
): ValidationResult<OwnershipPeriod> {
  // This guard is primarily a documentation requirement.
  // The sourceEventId must point to a lifecycle event that has an explicit effectiveDate.
  // If it does, the invariant is satisfied.

  const errors: ValidationError[] = []

  if (!period.sourceEventId) {
    errors.push({
      field: 'sourceEventId',
      rule: 'INV-5',
      neverInferViolation: 'INV-5:effective-date-ne-signature-date',
      message:
        `INV-5 violation: This ownership period has no sourceEventId. ` +
        `Every ownership period must be traceable to a lifecycle event that ` +
        `has an explicit effectiveDate (not a signature date or payment date). ` +
        `Add the sourceEventId of the partner_entry or other event that established this period.`,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: period }
}

// ---------------------------------------------------------------------------
// INV-6: Profit Participation Start ≠ Ownership Effective Date
// ---------------------------------------------------------------------------

/**
 * INV-6: The date a partner starts participating in profits may differ from
 * the date their ownership became legally effective.
 *
 * Both dates must be explicitly recorded from the partnership agreement.
 * The system must never assume profitParticipationStartDate === entryDate.
 */
export function assertProfitParticipationExplicit(
  entry: PartnerEntry
): ValidationResult<PartnerEntry> {
  const errors: ValidationError[] = []

  // The field must exist and be a valid date.
  if (
    !entry.profitParticipationStartDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.profitParticipationStartDate)
  ) {
    errors.push({
      field: 'profitParticipationStartDate',
      rule: 'INV-6',
      neverInferViolation: 'INV-6:profit-start-ne-ownership-effective',
      message:
        `INV-6 violation: profitParticipationStartDate is missing or invalid. ` +
        `This date must be explicitly stated in the partnership agreement. ` +
        `It may equal entryDate, but that must be confirmed — not assumed. ` +
        `Set it to the agreed profit participation start date.`,
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: entry }
}

// ---------------------------------------------------------------------------
// Composite: validate all "Never Infer" invariants for a PartnerEntry
// ---------------------------------------------------------------------------

/**
 * Run all applicable "Never Infer" invariants for a PartnerEntry.
 * Collects all violations into a single ValidationResult.
 *
 * @param entry       The PartnerEntry to validate
 * @param acquisition The PropertyAcquisition for the same property (for INV-1)
 */
export function validateNeverInferInvariants(
  entry: PartnerEntry,
  acquisition?: PropertyAcquisition
): ValidationResult<PartnerEntry> {
  const allErrors: ValidationError[] = []

  // INV-1 (requires acquisition to check)
  if (acquisition) {
    const inv1 = assertEntryValuationHasIndependentSource(entry, acquisition)
    if (!inv1.ok) allErrors.push(...inv1.errors)
  }

  // INV-3
  const inv3 = assertOwnershipPctFromAgreement(entry)
  if (!inv3.ok) allErrors.push(...inv3.errors)

  // INV-4
  const inv4 = assertEntryDateFromLegalSource(entry)
  if (!inv4.ok) allErrors.push(...inv4.errors)

  // INV-6
  const inv6 = assertProfitParticipationExplicit(entry)
  if (!inv6.ok) allErrors.push(...inv6.errors)

  if (allErrors.length > 0) return { ok: false, errors: allErrors }
  return { ok: true, value: entry }
}

// ---------------------------------------------------------------------------
// Composite: full entity validation
// ---------------------------------------------------------------------------

/**
 * Fully validate a PropertyAcquisition.
 */
export { validateAcquisition } from './acquisition'

/**
 * Fully validate a PartnerEntry including "Never Infer" guards.
 */
export function validatePartnerEntryFull(
  entry: PartnerEntry,
  acquisition?: PropertyAcquisition
): ValidationResult<PartnerEntry> {
  const structuralResult = validatePartnerEntry(entry)
  if (!structuralResult.ok) return structuralResult

  return validateNeverInferInvariants(entry, acquisition)
}

/**
 * Fully validate a CapitalEvent.
 */
export { validateCapitalEvent } from './capitalEvent'

/**
 * Fully validate an OwnershipPeriod including INV-5.
 */
export function validateOwnershipPeriodFull(
  period: OwnershipPeriod
): ValidationResult<OwnershipPeriod> {
  const structuralResult = validateOwnershipPeriod(period)
  if (!structuralResult.ok) return structuralResult

  return assertEffectiveDateExplicit(period)
}

// ---------------------------------------------------------------------------
// Named invariant reference
// ---------------------------------------------------------------------------

/**
 * Human-readable descriptions of all 6 "Never Infer" invariants.
 * For use in error messages and documentation.
 */
export const NEVER_INFER_INVARIANTS: Record<NeverInferInvariant, string> = {
  'INV-1:purchase-price-ne-entry-valuation':
    'Partner Entry Valuation must not be derived from the original Purchase Price. ' +
    'Each value must come from its own independent business source.',

  'INV-2:capital-paid-ne-required-capital':
    'Capital Paid (actual transfers) must not be assumed to equal Required Entry Capital ' +
    '(the amount agreed in the partnership agreement). Track them separately.',

  'INV-3:ownership-pct-ne-amount-paid':
    'Ownership percentage must not be computed from payment amounts. ' +
    'It must come from the signed partnership agreement.',

  'INV-4:entry-date-ne-payment-date':
    'The legal entry date (ownership effective) must not be assumed to equal any payment date. ' +
    'A partner may pay before or after the legal transfer of ownership.',

  'INV-5:effective-date-ne-signature-date':
    'The date ownership becomes legally effective may differ from the contract signature date. ' +
    'Use the notary registration date or the date specified in the agreement as effective.',

  'INV-6:profit-start-ne-ownership-effective':
    'The profit participation start date may differ from the ownership effective date. ' +
    'Both must be explicitly stated in the agreement, not assumed to be the same.',
}
