/**
 * M9-A — Investment Timeline Projection: 25 Tests
 *
 * These tests cover the pure projection layer.
 * No DB, no HTTP, no mocks required.
 *
 * Test map:
 *   SORT-01..04  — ordering rules
 *   VIS-05..13   — partner visibility
 *   CAP-14..16   — running capital sum
 *   OWN-17..18   — ownership before/after
 *   DATE-19      — null date preservation (P-ARCH-1)
 *   TITLE-20..21 — event title computation
 *   SOURCE-22..23 — source label/reference
 *   AVI-24       — real case: Avi two payments sum to €250,000
 *   OREN-25      — real case: Oren unknown capital stays null
 *
 * @see M9-A Investment Timeline Read Model spec
 */

import { projectTimeline, computeEvidence } from '../../lib/lifecycle/timelineProjection'
import type {
  RawPartnerEntryRow,
  RawCapitalEventRow,
  RawOwnershipPeriodRow,
} from '../../lib/lifecycle/timelineProjection'

import {
  isCapitalEventVisible,
  isPartnerEntryVisible,
  isOwnershipPeriodVisible,
  isPropertyAcquisitionVisible,
  isPropertyDispositionVisible,
  toPartnerSourceLabel,
  toPartnerSourceReference,
  computeEventTitle,
} from '../../lib/lifecycle/timelineVisibility'

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ENTITY_ID  = 'aaaaaaaa-0000-0000-0000-000000000001'
const PROPERTY   = 'Villa Mazotos'
const INVESTOR   = 'Avi'

function makeEntry(overrides: Partial<RawPartnerEntryRow> = {}): RawPartnerEntryRow {
  return {
    id:                        'entry-0001',
    property_name:             PROPERTY,
    entity_id:                 ENTITY_ID,
    event_type:                'partner_entry',
    event_nature:              'business_event',
    entry_date:                '2022-06-01',
    entry_date_note:           null,
    ownership_pct:             50,
    agreed_entry_valuation_eur: 500000,
    required_entry_capital_eur: 250000,
    status:                    'confirmed',
    created_at:                '2026-07-13T10:00:00Z',
    business_source_type:      'signed_agreement',
    ...overrides,
  }
}

function makeCapitalEvent(overrides: Partial<RawCapitalEventRow> = {}): RawCapitalEventRow {
  return {
    id:                          'ce-0001',
    property_name:               PROPERTY,
    entity_id:                   ENTITY_ID,
    event_type:                  'capital_event',
    event_subtype:               'partner_entry_payment',
    event_nature:                'accounting_event',
    direction:                   'inflow',
    amount_eur:                  200000,
    effective_date:              '2022-06-15',
    effective_date_confidence:   'confirmed',
    description:                 null,
    payer_name:                  'Avi',
    payee_name:                  'Seller',
    status:                      'confirmed',
    created_at:                  '2026-07-13T10:01:00Z',
    business_source_type:        'bank_transfer',
    ...overrides,
  }
}

function makeOwnershipPeriod(overrides: Partial<RawOwnershipPeriodRow> = {}): RawOwnershipPeriodRow {
  return {
    id:                           'op-0001',
    property_name:                PROPERTY,
    entity_id:                    ENTITY_ID,
    event_type:                   'ownership_period',
    event_nature:                 'business_event',
    ownership_pct:                50,
    effective_from:               '2022-06-01',
    effective_from_confidence:    'pending_verification',
    effective_to:                 null,
    status:                       'confirmed',
    created_at:                   '2026-07-13T10:02:00Z',
    business_source_type:         null,
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT — ordering rules
// ─────────────────────────────────────────────────────────────────────────────

test('SORT-01: dated events appear before null-date events', () => {
  const entry = makeEntry({ id: 'e1', entry_date: null })
  const ce = makeCapitalEvent({ id: 'e2', effective_date: '2022-06-15' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [entry],
    capitalEvents: [ce],
    ownershipPeriods: [],
  })

  expect(events[0].eventId).toBe('e2') // dated capital event comes first
  expect(events[1].eventId).toBe('e1') // null-date partner_entry comes last
})

test('SORT-02: dated events ordered by effectiveDate ASC', () => {
  const ce1 = makeCapitalEvent({ id: 'ce1', effective_date: '2023-03-01', created_at: '2026-07-13T10:00:00Z' })
  const ce2 = makeCapitalEvent({ id: 'ce2', effective_date: '2022-06-15', created_at: '2026-07-13T10:01:00Z' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce1, ce2], ownershipPeriods: [],
  })

  expect(events[0].effectiveDate).toBe('2022-06-15')
  expect(events[1].effectiveDate).toBe('2023-03-01')
})

test('SORT-03: null-date events ordered among themselves by recordedAt ASC', () => {
  const ce1 = makeCapitalEvent({ id: 'ce1', effective_date: null, created_at: '2026-07-13T10:05:00Z' })
  const ce2 = makeCapitalEvent({ id: 'ce2', effective_date: null, created_at: '2026-07-13T09:00:00Z' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce1, ce2], ownershipPeriods: [],
  })

  expect(events[0].canonicalEventId).toBe('ce2') // earlier recordedAt first
  expect(events[1].canonicalEventId).toBe('ce1')
})

test('SORT-04: UUID tie-breaker is deterministic for same effectiveDate + recordedAt', () => {
  const sharedDate = '2022-06-15'
  const sharedTs = '2026-07-13T10:00:00Z'
  const ceA = makeCapitalEvent({ id: 'zz-last',   effective_date: sharedDate, created_at: sharedTs })
  const ceB = makeCapitalEvent({ id: 'aa-first',  effective_date: sharedDate, created_at: sharedTs })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ceA, ceB], ownershipPeriods: [],
  })

  // UUID sort: 'aa-first' < 'zz-last'
  expect(events[0].canonicalEventId).toBe('aa-first')
  expect(events[1].canonicalEventId).toBe('zz-last')
})

// ─────────────────────────────────────────────────────────────────────────────
// VIS — partner visibility
// ─────────────────────────────────────────────────────────────────────────────

test('VIS-05: partner_entry is always partnerVisible', () => {
  expect(isPartnerEntryVisible()).toBe(true)
})

test('VIS-06: ownership_period is always partnerVisible', () => {
  expect(isOwnershipPeriodVisible()).toBe(true)
})

test('VIS-07: partner_entry_payment inflow is partnerVisible', () => {
  expect(isCapitalEventVisible('partner_entry_payment')).toBe(true)
})

test('VIS-08: distribution_payment is partnerVisible', () => {
  expect(isCapitalEventVisible('distribution_payment')).toBe(true)
})

test('VIS-09: acquisition_payment is NOT partnerVisible', () => {
  expect(isCapitalEventVisible('acquisition_payment')).toBe(false)
})

test('VIS-10: acquisition_expense is NOT partnerVisible', () => {
  expect(isCapitalEventVisible('acquisition_expense')).toBe(false)
})

test('VIS-11: property_acquisition is NOT partnerVisible', () => {
  expect(isPropertyAcquisitionVisible()).toBe(false)
})

test('VIS-12: property_disposition is partnerVisible', () => {
  expect(isPropertyDispositionVisible()).toBe(true)
})

test('VIS-13: projectTimeline with default (partnerOnly) excludes internal capital events', () => {
  const internal = makeCapitalEvent({ id: 'internal', event_subtype: 'acquisition_payment' })
  const partner  = makeCapitalEvent({ id: 'partner',  event_subtype: 'partner_entry_payment' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [internal, partner], ownershipPeriods: [],
    // includeInternal defaults to false
  })

  const ids = events.map(e => e.canonicalEventId)
  expect(ids).not.toContain('internal')
  expect(ids).toContain('partner')
})

// ─────────────────────────────────────────────────────────────────────────────
// CAP — running capital sum
// ─────────────────────────────────────────────────────────────────────────────

test('CAP-14: running capital sum accumulates across multiple inflow payments', () => {
  const ce1 = makeCapitalEvent({ id: 'ce1', amount_eur: 100000, effective_date: '2022-06-01' })
  const ce2 = makeCapitalEvent({ id: 'ce2', amount_eur: 50000,  effective_date: '2022-08-01' })
  const ce3 = makeCapitalEvent({ id: 'ce3', amount_eur: 50000,  effective_date: '2022-12-01' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce1, ce2, ce3], ownershipPeriods: [],
  })

  const capitals = events.map(e => e.capitalPositionAfter)
  expect(capitals).toEqual([100000, 150000, 200000])
})

test('CAP-15: running sum uses effectiveDate ordering, not array insertion order', () => {
  // ce2 is earlier by effectiveDate but provided second in the array
  const ce1 = makeCapitalEvent({ id: 'ce1', amount_eur: 50000,  effective_date: '2023-01-01', created_at: '2026-07-13T10:00:00Z' })
  const ce2 = makeCapitalEvent({ id: 'ce2', amount_eur: 200000, effective_date: '2022-06-01', created_at: '2026-07-13T10:01:00Z' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce1, ce2], ownershipPeriods: [],
  })

  // ce2 (2022-06-01) should appear first with capitalPositionAfter=200000
  expect(events[0].canonicalEventId).toBe('ce2')
  expect(events[0].capitalPositionAfter).toBe(200000)
  // ce1 (2023-01-01) appears second with capitalPositionAfter=250000
  expect(events[1].canonicalEventId).toBe('ce1')
  expect(events[1].capitalPositionAfter).toBe(250000)
})

test('CAP-16: non-payment events have capitalPositionAfter=null', () => {
  const ce = makeCapitalEvent({ event_subtype: 'distribution_payment', direction: 'outflow' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce], ownershipPeriods: [],
  })

  expect(events[0].capitalPositionAfter).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// OWN — ownership before/after
// ─────────────────────────────────────────────────────────────────────────────

test('OWN-17: first ownership_period has ownershipPctBefore=null', () => {
  const op = makeOwnershipPeriod({ ownership_pct: 50 })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [], ownershipPeriods: [op],
  })

  const ownershipEvent = events.find(e => e.eventType === 'ownership_period')!
  expect(ownershipEvent.ownershipPctBefore).toBeNull()
  expect(ownershipEvent.ownershipPctAfter).toBe(50)
})

test('OWN-18: second ownership_period gets ownershipPctBefore from first period', () => {
  const op1 = makeOwnershipPeriod({ id: 'op1', ownership_pct: 50, effective_from: '2022-06-01', created_at: '2026-07-13T10:00:00Z' })
  const op2 = makeOwnershipPeriod({ id: 'op2', ownership_pct: 75, effective_from: '2024-01-01', created_at: '2026-07-13T11:00:00Z' })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [], ownershipPeriods: [op1, op2],
  })

  const ownershipEvents = events.filter(e => e.eventType === 'ownership_period')
  expect(ownershipEvents[0].ownershipPctBefore).toBeNull()
  expect(ownershipEvents[0].ownershipPctAfter).toBe(50)
  expect(ownershipEvents[1].ownershipPctBefore).toBe(50)
  expect(ownershipEvents[1].ownershipPctAfter).toBe(75)
})

// ─────────────────────────────────────────────────────────────────────────────
// DATE — null date preservation (P-ARCH-1)
// ─────────────────────────────────────────────────────────────────────────────

test('DATE-19: null effectiveDate is preserved as null — never coerced to a placeholder', () => {
  const ce = makeCapitalEvent({ effective_date: null, effective_date_confidence: null })

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce], ownershipPeriods: [],
  })

  expect(events[0].effectiveDate).toBeNull()
  expect(events[0].effectiveDateConfidence).toBe('pending_verification')
})

// ─────────────────────────────────────────────────────────────────────────────
// TITLE — event title computation
// ─────────────────────────────────────────────────────────────────────────────

test('TITLE-20: partner_entry → "Partnership Investment Agreement"', () => {
  expect(computeEventTitle('partner_entry', null, null)).toBe('Partnership Investment Agreement')
})

test('TITLE-21: distribution_payment → "Distribution to Investor"', () => {
  expect(computeEventTitle('capital_event', 'distribution_payment', 'outflow')).toBe(
    'Distribution to Investor'
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// SOURCE — source label and reference
// ─────────────────────────────────────────────────────────────────────────────

test('SOURCE-22: "bank_transfer" source_type → "Bank Transfer" partner label', () => {
  expect(toPartnerSourceLabel('bank_transfer')).toBe('Bank Transfer')
})

test('SOURCE-23: toPartnerSourceReference always returns null in M9-A', () => {
  expect(toPartnerSourceReference()).toBeNull()
})

// ─────────────────────────────────────────────────────────────────────────────
// AVI — real-case: Villa Mazotos, two capital payments totalling €250,000
// ─────────────────────────────────────────────────────────────────────────────

test('AVI-24: two capital payments accumulate to €250,000 (Avi / Villa Mazotos)', () => {
  const entry = makeEntry()
  const pay1  = makeCapitalEvent({ id: 'avi-pay-1', amount_eur: 200000, effective_date: '2022-06-15', created_at: '2026-07-13T10:01:00Z' })
  const pay2  = makeCapitalEvent({ id: 'avi-pay-2', amount_eur: 50000,  effective_date: '2022-09-01', created_at: '2026-07-13T10:02:00Z' })
  const op    = makeOwnershipPeriod()

  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [entry],
    capitalEvents:  [pay1, pay2],
    ownershipPeriods: [op],
  })

  // Running sum on the capital events
  const capEvents = events.filter(e => e.eventType === 'capital_event')
  expect(capEvents).toHaveLength(2)

  const firstPayment  = capEvents.find(e => e.canonicalEventId === 'avi-pay-1')!
  const secondPayment = capEvents.find(e => e.canonicalEventId === 'avi-pay-2')!

  expect(firstPayment.capitalPositionAfter).toBe(200000)
  expect(secondPayment.capitalPositionAfter).toBe(250000) // total = €250,000
})

// ─────────────────────────────────────────────────────────────────────────────
// OREN — real-case: Villa Mazotos 2, capital unknown (P-ARCH-1)
// ─────────────────────────────────────────────────────────────────────────────

test('OREN-25: no capital events → all capitalPositionAfter remain null (P-ARCH-1)', () => {
  // Oren case: required_entry_capital is unknown; no capital_event rows exist.
  const entry = makeEntry({
    id:                          'oren-entry',
    property_name:               'Villa Mazotos 2',
    entity_id:                   'oren-entity-id',
    ownership_pct:               50,
    agreed_entry_valuation_eur:  520000,
    required_entry_capital_eur:  null,   // P-ARCH-1: unknown
    entry_date:                  null,   // P-ARCH-1: unknown
  })
  const op = makeOwnershipPeriod({
    id: 'oren-op', property_name: 'Villa Mazotos 2', entity_id: 'oren-entity-id',
    effective_from: null,         // P-ARCH-1: unknown
  })

  const events = projectTimeline({
    entityId: 'oren-entity-id', investorName: 'Oren',
    partnerEntries:   [entry],
    capitalEvents:    [],          // no payments recorded — amounts unknown
    ownershipPeriods: [op],
  })

  // Should have 2 events: partner_entry + ownership_period
  expect(events).toHaveLength(2)

  // No capitalPositionAfter set on any event
  for (const e of events) {
    expect(e.capitalPositionAfter).toBeNull()
  }

  // partner_entry amount reflects required_entry_capital_eur = null
  const entryEvent = events.find(e => e.eventType === 'partner_entry')!
  expect(entryEvent.amount).toBeNull() // unknown capital stays null — never 0
})

// ─────────────────────────────────────────────────────────────────────────────
// computeEvidence
// ─────────────────────────────────────────────────────────────────────────────

// (evidence helper tested via OREN-25 context implicitly, explicit test here)
test('EVIDENCE (bonus): computeEvidence flags hasPendingDates when any event has pending confidence', () => {
  const ce = makeCapitalEvent({ effective_date_confidence: 'pending_verification' })
  const events = projectTimeline({
    entityId: ENTITY_ID, investorName: INVESTOR,
    partnerEntries: [], capitalEvents: [ce], ownershipPeriods: [],
  })
  const evidence = computeEvidence(events, 3)
  expect(evidence.hasPendingDates).toBe(true)
  expect(evidence.openVerificationTasks).toBe(3)
})
