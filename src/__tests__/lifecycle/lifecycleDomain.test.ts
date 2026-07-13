/**
 * M8-A — Investment Lifecycle Domain: 20 Mandatory Tests
 *
 * These tests verify the architectural invariants of the M8 domain layer.
 * They are PURE — no DB, no HTTP, no mocks needed.
 *
 * Tests map to the 20 requirements in the M8 mandate:
 *   ARCH-1/2/3  — structural independence
 *   CAPITAL-4/5 — Avi €50,000 facts
 *   UNKNOWN-6/7 — unknown values stay pending
 *   SOURCE-8    — BusinessSource required for confirmed facts
 *   IMMUT-9/10  — immutability and void rules
 *   REPLACE-11/12 — void-and-replace mechanics
 *   OWN-13/14/15/16 — ownership timeline
 *   CONF-17/18  — JJ confidentiality
 *   SEP-19/20   — Property Lifecycle ≠ Investment Lifecycle
 *
 * @see ADR_M8_INVESTMENT_LIFECYCLE.md
 */

import {
  // Factories
  createAcquisition,
  createPartnerEntry,
  createCapitalEvent,
  // Ledger
  voidCapitalEvent,
  createReplacementCapitalEvent,
  getActiveLedger,
  sumCapitalPaid,
  // Validation
  validateLifecycleEventBase,
  validateNoGapsOrOverlaps,
  validatePartnerEntryFull,
  NEVER_INFER_INVARIANTS,
  // Queries
  getCurrentOwnership,
  deriveOwnershipPeriodsFromSnapshots,
  closeOwnershipPeriod,
  getPartnerFacingFields,
  getPartnerView,
  isEntryFullyPaid,
  computeCapitalRemaining,
  pendingBusinessSource,
  // Reports
  computeInvestmentSummary,
  buildPartnerFacingReport,
  buildJJInternalReport,
} from '../../lib/lifecycle'

import type {
  PropertyAcquisition,
  PartnerEntry,
  CapitalEvent,
  OwnershipPeriod,
} from '../../lib/lifecycle'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const ENTITY_ID = 'villa-mazotos-test-uuid'

const confirmedAgreementSource = {
  sourceType: 'signed_agreement' as const,
  reference: 'Partnership Agreement 2022-06-01 — Avi Villa Mazotos',
  verifiedBy: 'Yossi',
  verifiedAt: '2026-07-13T00:00:00Z' as const,
}

const confirmedDeedSource = {
  sourceType: 'notary_deed' as const,
  reference: 'Notary Deed 2020-03-15 ref NA-2020-001',
  verifiedBy: 'Yossi',
  verifiedAt: '2026-07-13T00:00:00Z' as const,
}

const confirmedBankSource = {
  sourceType: 'bank_transfer' as const,
  reference: 'Bank transfer IBAN-CY60-2026-06-15 ref BT-AVI-001',
  verifiedBy: 'Yossi',
  verifiedAt: '2026-07-13T00:00:00Z' as const,
}

/**
 * Hypothetical acquisition for test purposes.
 * NOTE: Real Villa Mazotos acquisition date/price are UNKNOWN pending Business Decision Worksheet.
 * These values are test-only; "confirmed" is used only to satisfy ADR validation rules in tests.
 */
function makeTestAcquisition(): PropertyAcquisition {
  const acq = createAcquisition({
    id: 'acq-vm-test-001',
    entityId: ENTITY_ID,
    acquisitionDate: '2020-03-15',
    purchasePrice: 180000,
    closingCosts: 7000,
    fundingNotes: 'JJ company cash',
    documentRef: 'Notary Deed 2020-03-15',
    recordedBy: 'Yossi',
    businessSource: confirmedDeedSource,
  })
  // Override to confirmed for test purposes
  return { ...acq, status: 'confirmed' as const }
}

/**
 * Avi's entry — hypothetical values for test purposes.
 * CONFIRMED FACT (from M8 mandate): ownership = 50%, capital_paid = €50,000.
 * agreedEntryValuation is UNKNOWN — test uses a placeholder.
 */
function makeAviEntry(): PartnerEntry {
  return createPartnerEntry({
    id: 'entry-avi-vm-001',
    entityId: ENTITY_ID,
    partnerName: 'Avi',
    entryDate: '2022-06-01',
    agreedEntryValuation: 200000,   // TEST PLACEHOLDER — real value unknown
    entryOwnershipPct: 50,          // CONFIRMED: Avi owns 50%
    profitParticipationStartDate: '2022-06-01',
    agreementRef: 'Partnership Agreement 2022-06-01',
    recordedBy: 'Yossi',
    businessSource: confirmedAgreementSource,
  })
}

/** Avi's confirmed €50,000 capital payment — this is the confirmed fact from the mandate. */
function makeAviPayment(): CapitalEvent {
  return createCapitalEvent({
    id: 'payment-avi-001',
    entityId: ENTITY_ID,
    eventType: 'capital_payment',
    effectiveDate: '2022-06-15',
    amountEur: 50000,           // CONFIRMED: Avi paid €50,000
    direction: 'in',
    counterparty: 'Avi',
    linkedEventId: 'entry-avi-vm-001',
    recordedBy: 'Yossi',
    businessSource: confirmedBankSource,
    status: 'confirmed',
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('M8-A — Investment Lifecycle Domain', () => {

  // ── ARCH-1: One active acquisition per property ─────────────────────────

  test('ARCH-1 — createAcquisition produces a valid original_acquisition event', () => {
    const acq = makeTestAcquisition()

    expect(acq.entityId).toBe(ENTITY_ID)
    expect(acq.eventType).toBe('original_acquisition')
    expect(acq.eventNature).toBe('business_event')
    // totalJJCost is computed from purchasePrice + closingCosts
    expect(acq.totalJJCost).toBe(187000)   // 180000 + 7000
    // DB enforces one-per-entity (unique constraint on entity_id + eventType);
    // the domain layer produces the record, the DB enforces uniqueness.
    expect(acq.id).toBe('acq-vm-test-001')
  })

  // ── ARCH-2: Multiple independent partner entries are allowed ────────────

  test('ARCH-2 — two PartnerEntry records for same entityId are both structurally valid', () => {
    const aviEntry = makeAviEntry()
    const yossiEntry = createPartnerEntry({
      id: 'entry-yossi-vm-001',
      entityId: ENTITY_ID,       // same property, different partner
      partnerName: 'Yossi',
      entryDate: '2022-06-01',
      agreedEntryValuation: 200000,
      entryOwnershipPct: 50,
      profitParticipationStartDate: '2022-06-01',
      recordedBy: 'Yossi',
      businessSource: confirmedAgreementSource,
    })

    expect(aviEntry.partnerName).toBe('Avi')
    expect(yossiEntry.partnerName).toBe('Yossi')
    expect(aviEntry.entityId).toBe(yossiEntry.entityId)  // same property
    // Both are independently valid — neither references the other
    expect(aviEntry.id).not.toBe(yossiEntry.id)
  })

  // ── ARCH-3: PartnerEntry is independent of Acquisition ─────────────────

  test('ARCH-3 — PartnerEntry has no acquisitionId field (ADR Principle 6)', () => {
    const entry = makeAviEntry()

    // The domain model forbids FK between partner_entry and property_acquisition.
    // They share only entityId (the property). No acquisition reference exists.
    expect('acquisitionId' in entry).toBe(false)
    expect('propertyAcquisitionId' in entry).toBe(false)
    // Only shared field is entityId
    expect(entry.entityId).toBe(ENTITY_ID)
  })

  // ── CAPITAL-4: Avi's €50,000 is capital_paid only ──────────────────────

  test('CAPITAL-4 — €50,000 is tracked as capital_paid, separate from requiredEntryCapital', () => {
    const entry = makeAviEntry()
    const payment = makeAviPayment()

    // sumCapitalPaid tracks ACTUAL transfers — confirmed capital_payment events
    const capitalPaid = sumCapitalPaid([payment], 'Avi')
    expect(capitalPaid).toBe(50000)

    // requiredEntryCapital comes from the agreement: agreedEntryValuation × pct / 100
    // (test placeholder: 200000 × 50% = 100000)
    expect(entry.requiredEntryCapital).toBe(100000)

    // capitalPaid (50000) ≠ requiredEntryCapital (100000) — tracked separately (INV-2)
    expect(capitalPaid).not.toBe(entry.requiredEntryCapital)

    // INV-2: Do NOT assume payment equals required. Compute the remaining balance.
    const remaining = computeCapitalRemaining(entry.requiredEntryCapital, capitalPaid)
    expect(remaining).toBe(50000)   // still owes €50K
    expect(isEntryFullyPaid(entry.requiredEntryCapital, capitalPaid)).toBe(false)
  })

  // ── CAPITAL-5: €50,000 is not JJ income ────────────────────────────────

  test('CAPITAL-5 — Avi €50,000 payment is counterparty=Avi direction=in, not JJ income', () => {
    const payment = makeAviPayment()

    // The payment is capital coming IN from Avi, not income earned by JJ
    expect(payment.direction).toBe('in')
    expect(payment.counterparty).toBe('Avi')
    expect(payment.eventType).toBe('capital_payment')

    // sumCapitalPaid for 'JJ' returns 0 — Avi's payment is not JJ's income
    const jjCapital = sumCapitalPaid([payment], 'JJ')
    expect(jjCapital).toBe(0)

    // sumCapitalPaid for 'Avi' returns 50000 — it's Avi's capital contribution
    const aviCapital = sumCapitalPaid([payment], 'Avi')
    expect(aviCapital).toBe(50000)
  })

  // ── UNKNOWN-6: Unknown required capital remains pending ─────────────────

  test('UNKNOWN-6 — PartnerEntry with pendingBusinessSource has status pending_verification', () => {
    const pendingEntry = createPartnerEntry({
      id: 'entry-pending-001',
      entityId: ENTITY_ID,
      partnerName: 'Avi',
      entryDate: '2022-06-01',
      agreedEntryValuation: 1,   // placeholder — real value unknown
      entryOwnershipPct: 50,
      profitParticipationStartDate: '2022-06-01',
      recordedBy: 'Yossi',
      businessSource: pendingBusinessSource('Awaiting partnership agreement — real valuation unknown'),
    })

    // Factory always creates entries as pending_verification — unknown facts are NOT confirmed
    expect(pendingEntry.status).toBe('pending_verification')

    // requiredEntryCapital is computed but the whole entry is unconfirmed
    // (the computation exists but its inputs are not verified)
    expect(pendingEntry.requiredEntryCapital).toBeGreaterThan(0)  // formula runs
    expect(pendingEntry.status).not.toBe('confirmed')             // but not confirmed
  })

  // ── UNKNOWN-7: Confirming a fact requires explicit businessSource ───────

  test('UNKNOWN-7 — a confirmed event with empty businessSource.reference fails validation', () => {
    const entry = makeAviEntry()

    // Simulate someone trying to mark an entry as "confirmed" with no real source
    const invalidConfirmed = {
      ...entry,
      status: 'confirmed' as const,
      businessSource: { sourceType: 'other' as const, reference: '' },
    }

    const result = validateLifecycleEventBase(invalidConfirmed)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const sourceError = result.errors.find(e => e.field === 'businessSource.reference')
      expect(sourceError).toBeDefined()
      expect(sourceError?.rule).toBe('required-for-confirmed')
    }
  })

  // ── SOURCE-8: Confirmed facts require ≥ 3-char businessSource.reference ─

  test('SOURCE-8 — confirmed event requires a specific businessSource.reference', () => {
    const acquisition = makeTestAcquisition()

    // A confirmed event with a proper reference passes
    const goodResult = validateLifecycleEventBase(acquisition)
    expect(goodResult.ok).toBe(true)

    // A confirmed event with a too-short reference fails
    const badAcq = {
      ...acquisition,
      businessSource: { sourceType: 'other' as const, reference: 'AB' },  // < 3 chars
    }
    const badResult = validateLifecycleEventBase(badAcq)
    expect(badResult.ok).toBe(false)
  })

  // ── IMMUT-9: Void does not mutate the original ──────────────────────────

  test('IMMUT-9 — voidCapitalEvent returns a new object; original is unchanged', () => {
    const original = makeAviPayment()
    const voided = voidCapitalEvent(original, 'Test void — duplicate detected', 'Yossi')

    // Original is completely unchanged
    expect(original.status).toBe('confirmed')
    expect(original.isVoided).toBe(false)
    expect(original.voidReason).toBeUndefined()

    // Voided is a NEW object with void fields
    expect(voided.status).toBe('void')
    expect(voided.isVoided).toBe(true)
    expect(voided.voidReason).toBe('Test void — duplicate detected')
    expect(voided.voidedBy).toBe('Yossi')
    expect(voided.id).toBe(original.id)  // same id, new object
    expect(voided).not.toBe(original)    // strict reference inequality
  })

  // ── IMMUT-10: Void requires a reason ───────────────────────────────────

  test('IMMUT-10 — a voided event with no voidReason fails validateLifecycleEventBase', () => {
    const event = makeAviPayment()
    const voidedWithoutReason = {
      ...event,
      status: 'void' as const,
      isVoided: true,
      voidedBy: 'Yossi',
      voidReason: undefined,   // missing — should fail
    }

    const result = validateLifecycleEventBase(voidedWithoutReason)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const err = result.errors.find(e => e.rule === 'required-for-void')
      expect(err).toBeDefined()
    }
  })

  // ── REPLACE-11: Replacement references the superseded event ────────────

  test('REPLACE-11 — createReplacementCapitalEvent auto-sets supersedesEventId', () => {
    const original = makeAviPayment()
    const voided = voidCapitalEvent(original, 'Wrong amount — correcting', 'Yossi')

    const replacement = createReplacementCapitalEvent(voided, {
      id: 'payment-avi-002-corrected',
      entityId: ENTITY_ID,
      eventType: 'capital_payment',
      effectiveDate: '2022-06-15',
      amountEur: 60000,         // corrected amount
      direction: 'in',
      counterparty: 'Avi',
      linkedEventId: 'entry-avi-vm-001',
      recordedBy: 'Yossi',
      businessSource: confirmedBankSource,
      status: 'confirmed',
    })

    // Replacement auto-links to the voided event
    expect(replacement.supersedesEventId).toBe(voided.id)
    expect(replacement.id).toBe('payment-avi-002-corrected')
    expect(replacement.amountEur).toBe(60000)
    expect(replacement.isVoided).toBe(false)
  })

  test('REPLACE-11b — createReplacementCapitalEvent throws when event is not voided', () => {
    const active = makeAviPayment()  // not voided

    expect(() =>
      createReplacementCapitalEvent(active, {
        id: 'payment-avi-002',
        entityId: ENTITY_ID,
        eventType: 'capital_payment',
        effectiveDate: '2022-06-15',
        amountEur: 60000,
        direction: 'in',
        counterparty: 'Avi',
        recordedBy: 'Yossi',
        businessSource: confirmedBankSource,
      })
    ).toThrow()
  })

  // ── REPLACE-12: Voided events excluded from getActiveLedger ────────────

  test('REPLACE-12 — getActiveLedger excludes voided events', () => {
    const event1 = makeAviPayment()
    const event2 = createCapitalEvent({
      id: 'payment-avi-second-001',
      entityId: ENTITY_ID,
      eventType: 'capital_payment',
      effectiveDate: '2022-07-01',
      amountEur: 25000,
      direction: 'in',
      counterparty: 'Avi',
      recordedBy: 'Yossi',
      businessSource: confirmedBankSource,
      status: 'confirmed',
    })
    const voidedEvent1 = voidCapitalEvent(event1, 'Voiding for test', 'Yossi')

    const ledger = [voidedEvent1, event2]
    const active = getActiveLedger(ledger)

    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(event2.id)
    expect(active[0].amountEur).toBe(25000)
  })

  // ── OWN-13: Ownership periods derived from events ───────────────────────

  test('OWN-13 — deriveOwnershipPeriodsFromSnapshots creates correct periods', () => {
    const entry = makeAviEntry()

    const periods = deriveOwnershipPeriodsFromSnapshots(ENTITY_ID, [
      {
        effectiveFrom: '2022-06-01',
        ownership: [
          { partnerName: 'Avi', ownershipPct: 50 },
          { partnerName: 'JJ',  ownershipPct: 50 },
        ],
        sourceEventType: 'partner_entry',
        sourceEventId: entry.id,
        status: 'confirmed',
      },
    ])

    expect(periods).toHaveLength(2)

    const aviPeriod = periods.find(p => p.partnerName === 'Avi')!
    expect(aviPeriod.ownershipPct).toBe(50)
    expect(aviPeriod.effectiveFrom).toBe('2022-06-01')
    expect(aviPeriod.effectiveTo).toBeNull()   // open-ended = current
    expect(aviPeriod.sourceEventId).toBe(entry.id)

    const jjPeriod = periods.find(p => p.partnerName === 'JJ')!
    expect(jjPeriod.ownershipPct).toBe(50)
  })

  // ── OWN-14: Ownership totals cannot exceed 100% ─────────────────────────

  test('OWN-14 — validateNoGapsOrOverlaps catches ownership sum ≠ 100%', () => {
    // Invalid: 60% + 60% = 120%
    const badPeriods: OwnershipPeriod[] = [
      {
        entityId: ENTITY_ID,
        partnerName: 'Avi',
        ownershipPct: 60,
        effectiveFrom: '2022-06-01',
        effectiveTo: null,
        sourceEventType: 'partner_entry',
        sourceEventId: 'entry-avi-001',
        status: 'confirmed',
      },
      {
        entityId: ENTITY_ID,
        partnerName: 'JJ',
        ownershipPct: 60,
        effectiveFrom: '2022-06-01',
        effectiveTo: null,
        sourceEventType: 'partner_entry',
        sourceEventId: 'entry-jj-001',
        status: 'confirmed',
      },
    ]

    const result = validateNoGapsOrOverlaps(ENTITY_ID, badPeriods)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some(e => e.rule === 'must-sum-to-100')).toBe(true)
    }

    // Valid: 50% + 50% = 100%
    const goodPeriods: OwnershipPeriod[] = [
      { ...badPeriods[0], ownershipPct: 50 },
      { ...badPeriods[1], ownershipPct: 50 },
    ]
    const goodResult = validateNoGapsOrOverlaps(ENTITY_ID, goodPeriods)
    expect(goodResult.ok).toBe(true)
  })

  // ── OWN-15: Partial exit closes period prospectively ───────────────────

  test('OWN-15 — closeOwnershipPeriod sets effectiveTo without mutating original', () => {
    const entry = makeAviEntry()
    const openPeriod: OwnershipPeriod = {
      entityId: ENTITY_ID,
      partnerName: 'Avi',
      ownershipPct: 50,
      effectiveFrom: '2022-06-01',
      effectiveTo: null,
      sourceEventType: 'partner_entry',
      sourceEventId: entry.id,
      status: 'confirmed',
    }

    // Close the period (partial exit on 2024-01-01)
    const closedPeriod = closeOwnershipPeriod(openPeriod, '2024-01-01')

    // Original unchanged
    expect(openPeriod.effectiveTo).toBeNull()

    // New period is closed
    expect(closedPeriod.effectiveTo).toBe('2024-01-01')
    expect(closedPeriod.effectiveFrom).toBe('2022-06-01')   // start unchanged
    expect(closedPeriod.ownershipPct).toBe(50)
    expect(closedPeriod).not.toBe(openPeriod)               // new object
  })

  // ── OWN-16: Full exit — getCurrentOwnership returns 0 ──────────────────

  test('OWN-16 — getCurrentOwnership returns 0 when all periods have effectiveTo set', () => {
    // All periods closed = no current ownership
    const periods: OwnershipPeriod[] = [
      {
        entityId: ENTITY_ID,
        partnerName: 'Avi',
        ownershipPct: 50,
        effectiveFrom: '2022-06-01',
        effectiveTo: '2024-01-01',   // fully exited
        sourceEventType: 'partial_exit',
        sourceEventId: 'exit-avi-001',
        status: 'confirmed',
      },
    ]

    const currentPct = getCurrentOwnership(periods, 'Avi')
    expect(currentPct).toBe(0)   // no open period → 0%

    // Open period → returns the ownership %
    const openPeriods: OwnershipPeriod[] = [
      { ...periods[0], effectiveTo: null },
    ]
    expect(getCurrentOwnership(openPeriods, 'Avi')).toBe(50)
  })

  // ── CONF-17: PropertyAcquisition has zero partner-facing fields ─────────

  test('CONF-17 — getPartnerFacingFields returns empty object for PropertyAcquisition', () => {
    const acq = makeTestAcquisition()

    const partnerFields = getPartnerFacingFields(acq)

    // Empty object — no acquisition data leaks to partners
    expect(Object.keys(partnerFields)).toHaveLength(0)

    // The actual confidential fields exist on the acquisition but are NOT returned
    expect(acq.purchasePrice).toBe(180000)
    expect(acq.totalJJCost).toBe(187000)
    expect((partnerFields as Record<string, unknown>)['purchasePrice']).toBeUndefined()
    expect((partnerFields as Record<string, unknown>)['totalJJCost']).toBeUndefined()
  })

  // ── CONF-18: getPartnerView shows agreed entry terms, not JJ costs ──────

  test('CONF-18 — getPartnerView includes entry terms; excludes acquisition economics', () => {
    const entry = makeAviEntry()
    const view = getPartnerView(entry)

    // Partner-visible fields ARE present
    expect(view.partnerName).toBe('Avi')
    expect(view.entryDate).toBe('2022-06-01')
    expect(view.agreedEntryValuation).toBe(200000)
    expect(view.entryOwnershipPct).toBe(50)
    expect(view.requiredEntryCapital).toBe(100000)
    expect(view.profitParticipationStartDate).toBe('2022-06-01')

    // Acquisition economics are NOT in PartnerEntry at all —
    // the type itself enforces this (no purchasePrice field on PartnerEntry)
    expect((view as unknown as Record<string, unknown>)['purchasePrice']).toBeUndefined()
    expect((view as unknown as Record<string, unknown>)['totalJJCost']).toBeUndefined()
    expect((view as unknown as Record<string, unknown>)['jjMarginFromEntry']).toBeUndefined()
  })

  // ── SEP-19: Property Lifecycle ≠ Investment Lifecycle ───────────────────

  test('SEP-19 — PartnerEntry and PropertyAcquisition share only entityId, no FK', () => {
    const acq = makeTestAcquisition()
    const entry = makeAviEntry()

    // They share entityId (the property identifier)
    expect(acq.entityId).toBe(entry.entityId)

    // PartnerEntry has NO reference to PropertyAcquisition
    expect('acquisitionId' in entry).toBe(false)

    // PropertyAcquisition has NO reference to PartnerEntry
    expect('partnerEntryId' in acq).toBe(false)
    expect('partnerEntries' in acq).toBe(false)

    // They are different event types
    expect(acq.eventType).toBe('original_acquisition')
    expect(entry.eventType).toBe('partner_entry')
  })

  // ── SEP-20: buildPartnerFacingReport never includes jjInternal ──────────

  test('SEP-20 — buildPartnerFacingReport has no jjInternal; buildJJInternalReport has it', () => {
    const acq = makeTestAcquisition()
    const entry = makeAviEntry()
    const payment = makeAviPayment()

    const periods = deriveOwnershipPeriodsFromSnapshots(ENTITY_ID, [
      {
        effectiveFrom: '2022-06-01',
        ownership: [
          { partnerName: 'Avi', ownershipPct: 50 },
          { partnerName: 'JJ',  ownershipPct: 50 },
        ],
        sourceEventType: 'partner_entry',
        sourceEventId: entry.id,
        status: 'confirmed',
      },
    ])

    const summary = computeInvestmentSummary(
      entry,
      [payment],
      periods,
      null   // no Settlement Engine input yet
    )

    // Partner report: no jjInternal field
    const partnerReport = buildPartnerFacingReport(summary)
    expect((partnerReport as unknown as Record<string, unknown>)['jjInternal']).toBeUndefined()
    expect(partnerReport.capitalPaid).toBe(50000)      // financial facts preserved
    expect(partnerReport.entryOwnershipPct).toBe(50)

    // JJ internal report: adds jjInternal block
    const jjReport = buildJJInternalReport(summary, acq)
    expect(jjReport.jjInternal).toBeDefined()
    expect(jjReport.jjInternal.jjTotalAcquisitionCost).toBe(187000)
    // JJ margin = requiredEntryCapital(100000) - jjCostPortion(187000 × 50% = 93500) = 6500
    expect(jjReport.jjInternal.jjMarginFromEntry).toBe(6500)

    // Core financials are identical in both reports — output channel changes nothing
    expect(partnerReport.capitalPaid).toBe(jjReport.capitalPaid)
    expect(partnerReport.requiredEntryCapital).toBe(jjReport.requiredEntryCapital)

    // NEVER_INFER_INVARIANTS covers all 6 invariants
    expect(Object.keys(NEVER_INFER_INVARIANTS)).toHaveLength(6)
  })

})
