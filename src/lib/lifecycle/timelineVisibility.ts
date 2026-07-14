/**
 * @module lifecycle/timelineVisibility
 * @description Partner vs. admin visibility rules for timeline events.
 *
 * The partner-facing timeline NEVER exposes:
 *   - JJ internal cost basis (jj_cost_basis_eur)
 *   - JJ entry margin (jj_margin_from_entry_eur)
 *   - JJ net capital at risk
 *   - JJ direct acquisition payments / expenses (acquisition_payment, acquisition_expense)
 *   - business_source.reference (may contain internal identifiers)
 *   - business_source.notes
 *   - Yossi / Jacob internal allocation details
 *   - Raw DB notes that contain placeholder language or internal reconciliation text
 *
 * These rules implement P-ARCH-6 at the projection layer.
 *
 * @see P-ARCH-6: v_partner_investment_statement never exposes jj_* fields
 */

import type { TimelineDateConfidence, TimelineDateStatus } from './timelineTypes'

// ---------------------------------------------------------------------------
// Visibility sets
// ---------------------------------------------------------------------------

/**
 * Capital event subtypes visible in the partner-facing timeline.
 * These are movements the partner INITIATED or RECEIVED - their own capital story.
 */
const PARTNER_VISIBLE_CE_SUBTYPES = new Set([
  'partner_entry_payment',            // partner paying toward required entry capital
  'partner_acquisition_payment',      // partner funding acquisition directly
  'distribution_payment',             // distributions received by partner
  'additional_capital_contribution',  // voluntary extra capital from partner
  'capital_refund',                   // return of capital to partner
  'capital_withdrawal',               // partner withdraws capital
  'ownership_increase',               // partner acquires more %
  'ownership_decrease',               // partner sells partial %
])

/**
 * Capital event subtypes that are JJ-internal only.
 * These represent JJ's own acquisition economics - never shown to partners.
 */
const INTERNAL_CE_SUBTYPES = new Set([
  'acquisition_payment',      // JJ paid toward property purchase
  'acquisition_expense',      // JJ closing costs, notary, taxes
  'capital_call',             // JJ calls capital (internal mechanism)
  'buyout_internal',          // internal JJ equity buyout
  'refinance_capital_event',  // refinance affecting JJ capital stack
])

// ---------------------------------------------------------------------------
// Visibility predicates
// ---------------------------------------------------------------------------

/**
 * partner_entry events are ALWAYS partner-visible.
 * The agreement is the partner's own investment entry - they have a right to see it.
 * JJ economics (cost basis, margin) are in v_jj_lifecycle_internal only, not in the DTO.
 */
export function isPartnerEntryVisible(): boolean {
  return true
}

/**
 * capital_event visibility depends on event_subtype.
 * Partner capital movements -> visible.
 * JJ acquisition costs -> internal only.
 */
export function isCapitalEventVisible(eventSubtype: string | null): boolean {
  if (!eventSubtype) return false
  if (INTERNAL_CE_SUBTYPES.has(eventSubtype)) return false
  if (PARTNER_VISIBLE_CE_SUBTYPES.has(eventSubtype)) return true
  // Unknown subtype: default open (conservative) - show rather than silently hide
  return true
}

/**
 * ownership_period events are ALWAYS partner-visible.
 * Ownership percentage is a fundamental right of the investor to know.
 */
export function isOwnershipPeriodVisible(): boolean {
  return true
}

/**
 * property_acquisition events are NEVER partner-visible.
 * JJ acquisition economics are strictly internal.
 */
export function isPropertyAcquisitionVisible(): boolean {
  return false
}

/**
 * property_disposition events are partner-visible.
 * The sale/exit is the conclusion of the partner's investment journey.
 */
export function isPropertyDispositionVisible(): boolean {
  return true
}

// ---------------------------------------------------------------------------
// Source label mapping
// ---------------------------------------------------------------------------

/**
 * Maps business_source.source_type to a partner-readable label.
 * Internal source type identifiers are not exposed.
 */
export function toPartnerSourceLabel(sourceType: string | null): string | null {
  if (!sourceType) return null
  const MAP: Record<string, string> = {
    signed_agreement:           'Partnership Agreement',
    bank_transfer:              'Bank Transfer',
    notary_deed:                'Notary Deed',
    invoice:                    'Invoice',
    board_resolution:           'Board Resolution',
    email_confirmation:         'Written Confirmation',
    manual_approval:            'Verified Record',
    yossi_written_confirmation: 'Verified Record',
    other:                      'Verified Record',
  }
  return MAP[sourceType] ?? 'Verified Record'
}

/**
 * Partner-facing source reference - always null in M9-A.
 *
 * business_source.reference may contain internal document identifiers.
 * In a future release (post-M9-A), expose only references explicitly
 * marked as partner_visible in the business_source table.
 */
export function toPartnerSourceReference(): string | null {
  return null
}

// ---------------------------------------------------------------------------
// Title computation
// ---------------------------------------------------------------------------

/**
 * Compute a concise English title for a timeline event.
 *
 * Titles are PRESENTATION ONLY - they never affect amounts or ordering.
 * Title logic must never be used to infer business facts.
 */
export function computeEventTitle(
  sourceTable: string,
  eventSubtype: string | null,
  direction: string | null,
): string {
  switch (sourceTable) {
    case 'partner_entry':
      return 'Partnership Investment Agreement'
    case 'ownership_period':
      return 'Ownership Position Established'
    case 'property_acquisition':
      return 'Property Acquisition (JJ Internal)'
    case 'property_disposition':
      return 'Property Disposition'
  }

  // capital_event
  switch (eventSubtype) {
    case 'partner_entry_payment':
      return direction === 'inflow'
        ? 'Capital Payment'
        : 'Capital Payment (Out)'
    case 'partner_acquisition_payment':
      return 'Capital Payment - Direct to Seller'
    case 'distribution_payment':
      return 'Distribution to Investor'
    case 'additional_capital_contribution':
      return 'Additional Capital Contribution'
    case 'capital_refund':
      return 'Capital Refund'
    case 'capital_withdrawal':
      return 'Capital Withdrawal'
    case 'ownership_increase':
      return 'Ownership Increase'
    case 'ownership_decrease':
      return 'Ownership Decrease'
    case 'acquisition_payment':
      return 'Acquisition Payment (JJ)'
    case 'acquisition_expense':
      return 'Acquisition Expense (JJ)'
    case 'capital_call':
      return 'Capital Call'
    default:
      return 'Capital Event'
  }
}

// ---------------------------------------------------------------------------
// Partner description sanitization
// ---------------------------------------------------------------------------

/**
 * Keywords that indicate internal notes not suitable for partner view.
 *
 * If a raw description (from capital_event.notes or partner_entry.entry_date_note)
 * contains ANY of these keywords (case-insensitive), the entire description is
 * replaced with a structured safe description derived from event fields.
 *
 * RATIONALE: Raw notes are authored for internal use and may contain:
 *   - Placeholder date warnings ("2024-01-01 is a placeholder")
 *   - Internal reconciliation context ("Legacy documentation showed X")
 *   - Confidential correction history ("that figure was incorrect")
 *   - Authoritative overrides ("must not appear as a lifecycle event")
 */
export const FORBIDDEN_KEYWORDS: string[] = [
  'placeholder',
  'legacy documentation',
  'legacy',
  'incorrect',
  'internal',
  'reconciliation',
  'pending source document',
  'must not appear',
  'authoritative corrected',
]

/**
 * Returns true if the text contains any forbidden keyword (case-insensitive).
 */
export function containsForbiddenKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return FORBIDDEN_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))
}

/**
 * Build a structured, partner-safe description from event fields.
 * Never uses raw notes as input - derives the label from structured fields only.
 *
 * Returns null when no meaningful partner-facing description can be constructed
 * (e.g. for internal-only events).
 */
export function buildSafeDescription(
  sourceTable: string,
  eventSubtype: string | null,
  payerName: string | null,
  payeeName: string | null,
  eventNature: string | null,
): string | null {
  // Internal-only events have no partner-facing description
  if (eventNature === 'internal') return null

  switch (sourceTable) {
    case 'partner_entry':
      return 'Partnership Investment Agreement'
    case 'ownership_period':
      return 'Ownership period recorded'
    case 'property_disposition':
      return 'Property disposition event'
  }

  // capital_event - generate from event subtype and counterparty
  switch (eventSubtype) {
    case 'partner_entry_payment':
    case 'partner_acquisition_payment':
      if (payeeName) return `Capital payment to ${payeeName}`
      return 'Capital contribution to property acquisition'
    case 'distribution_payment':
      return payeeName
        ? `Distribution payment to ${payeeName}`
        : 'Distribution payment'
    case 'additional_capital_contribution':
      return 'Additional capital contribution'
    case 'capital_refund':
      return 'Capital refund'
    case 'capital_withdrawal':
      return 'Capital withdrawal'
    case 'ownership_increase':
      return 'Ownership position increased'
    case 'ownership_decrease':
      return 'Ownership position decreased'
    default:
      return null
  }
}

/**
 * Compute a partner-safe description for a timeline event.
 *
 * Rules:
 *   1. If rawDescription is null -> return null (nothing to sanitize)
 *   2. If rawDescription contains a FORBIDDEN_KEYWORD -> replace with buildSafeDescription()
 *   3. Otherwise -> pass rawDescription through unchanged
 *
 * This function is the ONLY place that decides whether a raw description is
 * safe for partner view. Never bypass it.
 */
export function computePartnerSafeDescription(
  rawDescription: string | null,
  sourceTable: string,
  eventSubtype: string | null,
  payerName: string | null,
  payeeName: string | null,
  eventNature: string | null,
): string | null {
  if (!rawDescription) return null

  // Forbidden keyword detected - replace with structured safe description
  if (containsForbiddenKeyword(rawDescription)) {
    return buildSafeDescription(sourceTable, eventSubtype, payerName, payeeName, eventNature)
  }

  // Description is safe - pass through
  return rawDescription
}

// ---------------------------------------------------------------------------
// Date display computation
// ---------------------------------------------------------------------------

/**
 * Compute the partner-safe date display value and status for a timeline event.
 *
 * The critical rule: when confidence = 'pending_verification', the raw date
 * MUST NOT be passed to the partner UI, even if the date field is non-null.
 * A date like 2024-01-01 may be a placeholder inserted during data entry,
 * not a verified business fact.
 *
 * @param effectiveDate  Raw date string (YYYY-MM-DD) or null from the DB
 * @param confidence     Confidence level from the DB column
 * @returns              { dateDisplay, dateStatus } safe for partner rendering
 */
export function computeDateDisplay(
  effectiveDate: string | null,
  confidence: TimelineDateConfidence | string | null,
): { dateDisplay: string | null; dateStatus: TimelineDateStatus } {
  // Pending verification: hide the raw date even if it is non-null.
  // The date may be a placeholder - never expose it to partners.
  if (confidence === 'pending_verification') {
    return { dateDisplay: null, dateStatus: 'pending_verification' }
  }

  // No date available at all
  if (!effectiveDate) {
    return { dateDisplay: null, dateStatus: 'unknown' }
  }

  // Date is available and not pending - safe to display
  // 'confirmed' and 'estimated' both produce a displayable date
  return { dateDisplay: effectiveDate, dateStatus: 'confirmed' }
}
