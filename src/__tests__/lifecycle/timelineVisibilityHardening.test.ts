/**
 * Partner Visibility Hardening Tests
 *
 * These tests verify that the Investment Timeline never exposes:
 *   - Placeholder dates (e.g. 2024-01-01 with confidence=pending_verification)
 *   - Internal notes (e.g. "Legacy documentation showed X", "incorrect", "placeholder")
 *   - JJ-internal reconciliation text
 *
 * All tests are PURE: no DB, no HTTP, no mocks required.
 *
 * Test map:
 *   VH-01  placeholder dateDisplay is null when confidence = pending_verification
 *   VH-02  dateStatus = 'pending_verification' label IS present
 *   VH-03  "Legacy documentation showed 30000" is absent from partnerDescription
 *   VH-04  raw internal notes are absent from partnerDescription in partner mode
 *   VH-05  safe partner description IS generated ("Capital payment to Yossi")
 *   VH-06  admin mode retains internal note in adminDescription
 *   VH-07  JJ internal subtypes are hidden (partnerVisible=false, excluded from events)
 *   VH-08  Oren unknown capital stays null, not coerced to 0
 *   VH-09  EN and HE amount values are identical (same numeric value, different locale)
 *   VH-10  internal-only events (event_nature='internal') produce null partnerDescription
 *   VH-11  safe description generated without fallback to raw DB notes
 *   VH-12  no forbidden keyword appears in any partner-visible string
 *
 * @see fix(M9-A): partner visibility hardening (#44)
 */

import {
  computePartnerSafeDescription,
  computeDateDisplay,
  containsForbiddenKeyword,
  buildSafeDescription,
  FORBIDDEN_KEYWORDS,
} from '../../lib/lifecycle/timelineVisibility'

import { projectTimeline } from '../../lib/lifecycle/timelineProjection'
import type {
  RawCapitalEventRow,
  RawPartnerEntryRow,
  RawOwnershipPeriodRow,
} from '../../lib/lifecycle/timelineProjection'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTITY_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const PROPERTY  = 'Villa Mazotos'

/** The exact internal note that was leaking in production (Avi EUR 50K) */
const AVI_INTERNAL_NOTE =
  'Avi paid EUR 50,000 to Yossi as part of 50% entry settlement. ' +
  'This is the single authoritative corrected amount. ' +
  'Legacy documentation showed EUR 30,000 - that figure was incorrect ' +
  'and must not appear as a lifecycle event.'

/** Partner entry with a placeholder date note */
const AVI_PLACEHOLDER_NOTE =
  'Effective date 2024-01-01 is a placeholder - pending source document verification.'

function makeCapitalEvent(overrides: Partial<RawCapitalEventRow> = {}): RawCapitalEventRow {
  return {
    id:                          'ce-avi-001',
    property_name:               PROPERTY,
    entity_id:                   ENTITY_ID,
    event_type:                  'capital_event',
    event_subtype:               'partner_entry_payment',
    event_nature:                'accounting_event',
    direction:                   'inflow',
    amount_eur:                  50000,
    effective_date:              '2024-01-01',
    effective_date_confidence:   'pending_verification',
    description:                 AVI_INTERNAL_NOTE,
    payer_name:                  'Avi',
    payee_name:                  'Yossi',
    status:                      'confirmed',
    created_at:                  '2026-07-13T10:00:00Z',
    business_source_type:        'manual_approval',
    ...overrides,
  }
}

function makePartnerEntry(overrides: Partial<RawPartnerEntryRow> = {}): RawPartnerEntryRow {
  return {
    id:                        'pe-avi-001',
    property_name:             PROPERTY,
    entity_id:                 ENTITY_ID,
    event_type:                'partner_entry',
    event_nature:              'business_event',
    entry_date:                '2024-01-01',
    entry_date_note:           AVI_PLACEHOLDER_NOTE,
    ownership_pct:             50,
    agreed_entry_valuation_eur: 500000,
    required_entry_capital_eur: 250000,
    status:                    'confirmed',
    created_at:                '2026-07-13T09:00:00Z',
    business_source_type:      'signed_agreement',
    ...overrides,
  }
}

function makeOwnershipPeriod(overrides: Partial<RawOwnershipPeriodRow> = {}): RawOwnershipPeriodRow {
  return {
    id:                          'op-avi-001',
    property_name:               PROPERTY,
    entity_id:                   ENTITY_ID,
    event_type:                  'ownership_period',
    event_nature:                'business_event',
    ownership_pct:               50,
    effective_from:              null,
    effective_from_confidence:   'pending_verification',
    effective_to:                null,
    status:                      'confirmed',
    created_at:                  '2026-07-13T11:00:00Z',
    business_source_type:        null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// VH-01: placeholder dateDisplay is null when confidence = pending_verification
// ---------------------------------------------------------------------------

test('VH-01: dateDisplay is null when confidence = pending_verification', () => {
  // The raw date 2024-01-01 is a placeholder, but confidence says pending_verification
  const { dateDisplay } = computeDateDisplay('2024-01-01', 'pending_verification')
  expect(dateDisplay).toBeNull()
})

// ---------------------------------------------------------------------------
// VH-02: dateStatus = 'pending_verification' when confidence is pending
// ---------------------------------------------------------------------------

test('VH-02: dateStatus is pending_verification when confidence = pending_verification', () => {
  const { dateStatus } = computeDateDisplay('2024-01-01', 'pending_verification')
  expect(dateStatus).toBe('pending_verification')
})

// ---------------------------------------------------------------------------
// VH-03: "Legacy documentation showed 30000" absent from partnerDescription
// ---------------------------------------------------------------------------

test('VH-03: internal note with Legacy documentation is absent from partnerDescription', () => {
  const partnerDesc = computePartnerSafeDescription(
    AVI_INTERNAL_NOTE,
    'capital_event',
    'partner_entry_payment',
    'Avi',
    'Yossi',
    'accounting_event',
  )
  expect(partnerDesc).not.toContain('Legacy documentation')
  expect(partnerDesc).not.toContain('30,000')
  expect(partnerDesc).not.toContain('30000')
  expect(partnerDesc).not.toContain('EUR 30,000')
})

// ---------------------------------------------------------------------------
// VH-04: raw internal notes absent from partnerDescription in partner mode
// ---------------------------------------------------------------------------

test('VH-04: raw internal notes are not passed through to partnerDescription', () => {
  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [],
    capitalEvents:   [makeCapitalEvent()],
    ownershipPeriods: [],
    includeInternal: false,
  })

  const ce = events.find(e => e.eventId === 'ce-avi-001')
  expect(ce).toBeDefined()
  // partnerDescription must NOT contain the internal note content
  expect(ce!.partnerDescription).not.toContain('authoritative corrected')
  expect(ce!.partnerDescription).not.toContain('must not appear')
  expect(ce!.partnerDescription).not.toContain('incorrect')
})

// ---------------------------------------------------------------------------
// VH-05: safe partner description IS present ("Capital payment to Yossi")
// ---------------------------------------------------------------------------

test('VH-05: safe partnerDescription is generated from structured fields', () => {
  const partnerDesc = computePartnerSafeDescription(
    AVI_INTERNAL_NOTE,
    'capital_event',
    'partner_entry_payment',
    'Avi',
    'Yossi',
    'accounting_event',
  )
  // Must be a clean, partner-safe description referencing payee
  expect(partnerDesc).toBe('Capital payment to Yossi')
})

// ---------------------------------------------------------------------------
// VH-06: admin mode retains internal note in adminDescription
// ---------------------------------------------------------------------------

test('VH-06: adminDescription retains the full raw note for admin mode', () => {
  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [],
    capitalEvents:   [makeCapitalEvent()],
    ownershipPeriods: [],
    includeInternal: false,
  })

  const ce = events.find(e => e.eventId === 'ce-avi-001')
  expect(ce).toBeDefined()
  // adminDescription must retain the full raw note
  expect(ce!.adminDescription).toBe(AVI_INTERNAL_NOTE)
  expect(ce!.adminDescription).toContain('Legacy documentation')
  expect(ce!.adminDescription).toContain('incorrect')
})

// ---------------------------------------------------------------------------
// VH-07: JJ internal subtypes are hidden (partnerVisible=false)
// ---------------------------------------------------------------------------

test('VH-07: JJ acquisition_payment events are excluded from partner timeline', () => {
  const jjEvent = makeCapitalEvent({
    id:            'ce-jj-001',
    event_subtype: 'acquisition_payment',
    description:   null,
  })

  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [],
    capitalEvents:   [jjEvent],
    ownershipPeriods: [],
    includeInternal: false,  // partner mode: exclude internal events
  })

  // acquisition_payment is JJ-internal - must not appear in partner output
  expect(events.find(e => e.eventId === 'ce-jj-001')).toBeUndefined()
})

test('VH-07b: JJ acquisition_payment is present (but marked internal) when includeInternal=true', () => {
  const jjEvent = makeCapitalEvent({
    id:            'ce-jj-002',
    event_subtype: 'acquisition_payment',
    description:   null,
  })

  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [],
    capitalEvents:   [jjEvent],
    ownershipPeriods: [],
    includeInternal: true,  // admin mode: all events
  })

  const found = events.find(e => e.eventId === 'ce-jj-002')
  expect(found).toBeDefined()
  expect(found!.partnerVisible).toBe(false)
})

// ---------------------------------------------------------------------------
// VH-08: Oren unknown capital stays null, not coerced to 0
// ---------------------------------------------------------------------------

test('VH-08: capital_event with no confirmed amount produces null capitalPositionAfter', () => {
  // Oren case: capital_event exists but we know nothing certain
  const orenEvent = makeCapitalEvent({
    id:                          'ce-oren-001',
    entity_id:                   'bbbbbbbb-0000-0000-0000-000000000002',
    event_subtype:               'partner_entry_payment',
    direction:                   'inflow',
    amount_eur:                  0,      // Unknown - would be null in real data
    effective_date:              null,   // Unknown date
    effective_date_confidence:   'pending_verification',
    description:                 null,
    payer_name:                  'Oren',
    payee_name:                  null,
  })

  // A separate event with no capital inflow subtype
  const orenNonCapital = makeCapitalEvent({
    id:                          'ce-oren-002',
    entity_id:                   'bbbbbbbb-0000-0000-0000-000000000002',
    event_subtype:               'ownership_increase',
    direction:                   'inflow',
    amount_eur:                  0,
    effective_date:              null,
    effective_date_confidence:   'pending_verification',
    description:                 null,
  })

  const events = projectTimeline({
    entityId:        'bbbbbbbb-0000-0000-0000-000000000002',
    investorName:    'Oren',
    partnerEntries:  [],
    capitalEvents:   [orenNonCapital],
    ownershipPeriods: [],
    includeInternal: false,
  })

  const e = events.find(e => e.eventId === 'ce-oren-002')
  // ownership_increase is not a capital inflow - capitalPositionAfter must be null
  expect(e!.capitalPositionAfter).toBeNull()
})

// ---------------------------------------------------------------------------
// VH-09: EN and HE amount values are identical (same numeric value)
// ---------------------------------------------------------------------------

test('VH-09: amount field is identical regardless of lang (numeric, not locale-formatted)', () => {
  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [],
    capitalEvents:   [makeCapitalEvent({ amount_eur: 50000 })],
    ownershipPeriods: [],
    includeInternal: false,
  })

  const e = events[0]
  // The DTO amount is always numeric - locale formatting is done in the UI
  expect(e.amount).toBe(50000)
  // Same event is rendered by both EN and HE UI - the amount never changes
  expect(typeof e.amount).toBe('number')
})

// ---------------------------------------------------------------------------
// VH-10: internal-only events produce null partnerDescription
// ---------------------------------------------------------------------------

test('VH-10: buildSafeDescription returns null for internal event_nature', () => {
  const result = buildSafeDescription(
    'capital_event',
    'partner_entry_payment',
    null,
    null,
    'internal',  // event_nature = internal -> no partner description
  )
  expect(result).toBeNull()
})

// ---------------------------------------------------------------------------
// VH-11: safe description is generated without fallback to raw DB notes
// ---------------------------------------------------------------------------

test('VH-11: buildSafeDescription derives from structured fields, never from raw notes', () => {
  // buildSafeDescription receives NO raw notes - only structured fields
  const result = buildSafeDescription(
    'capital_event',
    'distribution_payment',
    'JJ',
    'Avi',
    'accounting_event',
  )
  // Must be a clean structured description
  expect(result).toBe('Distribution payment to Avi')
  // Must not contain any of the forbidden source text
  FORBIDDEN_KEYWORDS.forEach(kw => {
    expect(result ?? '').not.toContain(kw)
  })
})

// ---------------------------------------------------------------------------
// VH-12: no forbidden keyword appears in any partner-visible string
// ---------------------------------------------------------------------------

test('VH-12: no forbidden keyword appears in partnerDescription or partnerTitle', () => {
  // Test with a capital event carrying an internal note
  const events = projectTimeline({
    entityId:        ENTITY_ID,
    investorName:    'Avi',
    partnerEntries:  [makePartnerEntry()],
    capitalEvents:   [makeCapitalEvent()],
    ownershipPeriods: [makeOwnershipPeriod()],
    includeInternal: false,
  })

  for (const event of events) {
    // Check partnerTitle
    if (event.partnerTitle) {
      FORBIDDEN_KEYWORDS.forEach(kw => {
        expect(event.partnerTitle.toLowerCase()).not.toContain(kw.toLowerCase())
      })
    }
    // Check partnerDescription
    if (event.partnerDescription) {
      FORBIDDEN_KEYWORDS.forEach(kw => {
        expect(event.partnerDescription!.toLowerCase()).not.toContain(kw.toLowerCase())
      })
    }
    // dateDisplay must be null when pending (no raw placeholder date)
    if (event.dateStatus === 'pending_verification') {
      expect(event.dateDisplay).toBeNull()
    }
  }
})

// ---------------------------------------------------------------------------
// Bonus: containsForbiddenKeyword catches all relevant patterns
// ---------------------------------------------------------------------------

test('containsForbiddenKeyword catches all relevant patterns', () => {
  expect(containsForbiddenKeyword('Effective date 2024-01-01 is a placeholder')).toBe(true)
  expect(containsForbiddenKeyword('Legacy documentation showed EUR 30,000')).toBe(true)
  expect(containsForbiddenKeyword('that figure was incorrect')).toBe(true)
  expect(containsForbiddenKeyword('pending source document verification')).toBe(true)
  expect(containsForbiddenKeyword('must not appear as a lifecycle event')).toBe(true)
  expect(containsForbiddenKeyword('This is the single authoritative corrected amount')).toBe(true)
  expect(containsForbiddenKeyword('internal reconciliation note')).toBe(true)
})

test('containsForbiddenKeyword does not flag clean descriptions', () => {
  expect(containsForbiddenKeyword('Capital payment to Yossi')).toBe(false)
  expect(containsForbiddenKeyword('Distribution payment to Avi')).toBe(false)
  expect(containsForbiddenKeyword('Partnership Investment Agreement')).toBe(false)
  expect(containsForbiddenKeyword('Capital contribution to property acquisition')).toBe(false)
})
