import * as fs from 'fs'
import * as path from 'path'
import { forecastVm1Reservation } from '../vm1ForecastCalculator'
import { VM1_HOSTAWAY_LISTING_ID } from '../vm1Identity'
import type { Vm1ReservationRow } from '../vm1IdentityAdapter'
import {
  admitVm1DraftReservation,
  admitVm1DraftReservations,
  VM1_DRAFT_ADMISSION_REASON,
  type Vm1AuthoritativeOwnerStatementEvidence,
  type Vm1DraftAdmissionContext,
} from '../vm1DraftAdmission'
import {
  adaptVm1OwnerStatementEvidence,
  ownerStatementInventoryFromReservations,
} from '../vm1OwnerStatementEvidence'
import {
  TM20_OS_TEST_DOCUMENT,
  TM20_OS_TEST_DOCUMENT_HASH,
  TM20_OS_TEST_IDENTITY,
} from './vm1OwnerStatementEvidence.fixture'

const CERTIFIED = new Set<string>(['53139113'])
const AS_OF = '2026-09-17'
const LIVE_AS_OF = '2026-09-18'
const NEER_LISTING = '426237'
const VM2_LISTING = '999001'

function row(
  overrides: Partial<Vm1ReservationRow> & Pick<Vm1ReservationRow, 'externalId'>,
): Vm1ReservationRow {
  return {
    listingId: VM1_HOSTAWAY_LISTING_ID,
    channel: 'airbnb',
    status: 'confirmed',
    checkIn: '2026-09-03',
    checkOut: '2026-09-06',
    nights: 3,
    totalPrice: 1005.9,
    cleaningFee: 150,
    hostServiceFee: 155.91,
    expectedPayout: 849.99,
    taxAmount: 0,
    paymentStatus: 'Paid',
    cancellationDate: null,
    disposition: 'operational_candidate',
    reason: 'Confirmed stay with check-in on or after the new-period start.',
    ...overrides,
  }
}

function osEvidence(
  overrides: Partial<Vm1AuthoritativeOwnerStatementEvidence> = {},
): Vm1AuthoritativeOwnerStatementEvidence {
  return {
    sourceKind: 'hostaway_owner_statement',
    sourceId: 'os-65733679',
    payoutEur: 849.99,
    cleaningEur: 150,
    status: 'verified',
    reconciliationStatus: 'not_required',
    ...overrides,
  }
}

function admit(
  subject: Vm1ReservationRow,
  extra: Partial<Vm1DraftAdmissionContext> = {},
) {
  return admitVm1DraftReservation(subject, {
    asOfIso: AS_OF,
    certifiedReservationIds: CERTIFIED,
    ...extra,
  })
}

function admitBatch(
  rows: readonly Vm1ReservationRow[],
  extra: Partial<Vm1DraftAdmissionContext> = {},
) {
  const result = admitVm1DraftReservations(rows, {
    asOfIso: extra.asOfIso ?? AS_OF,
    certifiedReservationIds: extra.certifiedReservationIds ?? CERTIFIED,
    ...extra,
  })
  if (!result.ok) {
    throw new Error(`expected admission batch to succeed: ${result.reason}`)
  }
  return result.lines
}

describe('vm1DraftAdmission', () => {
  it('is independent of the forecast calculator and does not treat raw expectedPayout as authority', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1DraftAdmission.ts'), 'utf8')
    expect(src).not.toContain('vm1ForecastCalculator')
    expect(src).not.toContain('forecastAirbnbOwnerStatementAmounts')
    expect(src).not.toContain('forecastVm1Reservation')
    expect(src).not.toContain('AVI_HOSTAWAY_STAYS')
    expect(src).not.toContain('transactions')
    expect(src).not.toContain('property_name')
    expect(src).not.toContain('594.25')
    expect(src).not.toContain('50%')
    expect(src).not.toContain('25%')
    expect(src).not.toContain('guest_name')
    expect(src).not.toContain('guestName')
    expect(src).toContain('authoritativeEvidenceByReservationId')
    expect(src).toContain('operational evidence only')
  })

  it('excludes check-in 2026-08-29 and includes 2026-08-30 and 2026-11-30; excludes 2026-12-01', () => {
    expect(admit(row({ externalId: 'b0829', checkIn: '2026-08-29' })).periodMember).toBe(false)
    expect(admit(row({ externalId: 'b0829', checkIn: '2026-08-29' })).admissionState).toBe('excluded')
    const included = admit(row({ externalId: 'b0830', checkIn: '2026-08-30', checkOut: '2026-09-02' }))
    expect(included.periodMember).toBe(true)
    expect(included.admittedCandidate).toBe(false)
    expect(included.admissionState).toBe('completed_pending_authoritative_evidence')
    const lastDay = admit(
      row({
        externalId: 'b1130',
        checkIn: '2026-11-30',
        checkOut: '2026-12-04',
      }),
    )
    expect(lastDay.periodMember).toBe(true)
    expect(lastDay.admissionState).toBe('forecast')
    expect(lastDay.admittedCandidate).toBe(false)
    expect(admit(row({ externalId: 'b1201', checkIn: '2026-12-01' })).periodMember).toBe(false)
    expect(admit(row({ externalId: 'b1201', checkIn: '2026-12-01' })).admissionState).toBe('excluded')
  })

  it('does not treat an overlap-probe row with earlier check-in as a period member', () => {
    const overlap = admit(
      row({
        externalId: 'overlap-early',
        checkIn: '2026-08-20',
        checkOut: '2026-08-27',
        disposition: 'excluded',
        reason: 'Check-in 2026-08-20 is before new-period start 2026-08-30.',
      }),
    )
    expect(overlap.periodMember).toBe(false)
    expect(overlap.admittedCandidate).toBe(false)
    expect(overlap.admissionState).toBe('excluded')
    expect(overlap.reason).toBe(VM1_DRAFT_ADMISSION_REASON.notPeriodMember)
  })

  it('never admits certified 53139113', () => {
    const certified = admit(
      row({
        externalId: '53139113',
        checkIn: '2026-08-15',
        checkOut: '2026-08-29',
        disposition: 'already_certified',
        reason: 'Already included in the frozen certified Avi stay set; never include again.',
      }),
    )
    expect(certified.admittedCandidate).toBe(false)
    expect(certified.admissionState).toBe('excluded')
    expect(certified.reason).toBe(VM1_DRAFT_ADMISSION_REASON.certified)
  })

  it('does not admit a completed stay from non-null raw expectedPayout alone', () => {
    const completed = admit(row({ externalId: '65733679' }))
    expect(completed.periodMember).toBe(true)
    expect(completed.checkoutCompleted).toBe(true)
    expect(completed.operationalEvidencePresent).toBe(true)
    expect(completed.authoritativeEvidenceLinked).toBe(false)
    expect(completed.admissionState).toBe('completed_pending_authoritative_evidence')
    expect(completed.admittedCandidate).toBe(false)
    expect(completed.reason).toBe(VM1_DRAFT_ADMISSION_REASON.missingAuthoritative)
  })

  it('blocks completed 65733679 without an authoritative map and admits only verified owner-statement evidence', () => {
    const withoutMap = admit(row({ externalId: '65733679' }))
    expect(withoutMap.admissionState).toBe('completed_pending_authoritative_evidence')
    expect(withoutMap.admittedCandidate).toBe(false)

    const admitted = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([['65733679', osEvidence()]]),
    })
    expect(admitted.admissionState).toBe('admitted')
    expect(admitted.admittedCandidate).toBe(true)
    expect(admitted.authoritativeEvidenceLinked).toBe(true)
  })

  it('blocks missing, empty, wrong-kind, and unverified authoritative evidence', () => {
    const emptyId = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ sourceId: '   ' })],
      ]),
    })
    expect(emptyId.admissionState).toBe('blocked')
    expect(emptyId.admittedCandidate).toBe(false)
    expect(emptyId.reason).toBe(VM1_DRAFT_ADMISSION_REASON.sourceId)

    const wrongKind = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        [
          '65733679',
          {
            ...osEvidence(),
            sourceKind: 'pms_reservations_for_property',
          } as unknown as Vm1AuthoritativeOwnerStatementEvidence,
        ],
      ]),
    })
    expect(wrongKind.admissionState).toBe('blocked')
    expect(wrongKind.reason).toBe(VM1_DRAFT_ADMISSION_REASON.sourceKind)

    const unverified = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        [
          '65733679',
          {
            ...osEvidence(),
            status: 'draft',
          } as unknown as Vm1AuthoritativeOwnerStatementEvidence,
        ],
      ]),
    })
    expect(unverified.admissionState).toBe('blocked')
    expect(unverified.reason).toBe(VM1_DRAFT_ADMISSION_REASON.unverified)
  })

  it('blocks reconciliation conflict and allows matched or not_required verified evidence', () => {
    const conflict = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ reconciliationStatus: 'conflict' })],
      ]),
    })
    expect(conflict.admissionState).toBe('blocked')
    expect(conflict.admittedCandidate).toBe(false)
    expect(conflict.reason).toBe(VM1_DRAFT_ADMISSION_REASON.reconConflict)

    const matched = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ reconciliationStatus: 'matched' })],
      ]),
    })
    expect(matched.admissionState).toBe('admitted')
    expect(matched.admittedCandidate).toBe(true)

    const notRequired = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ reconciliationStatus: 'not_required' })],
      ]),
    })
    expect(notRequired.admissionState).toBe('admitted')
  })

  it('blocks invalid authoritative payout or cleaning and never falls back to totalPrice', () => {
    const badPayout = admit(row({ externalId: '65733679', totalPrice: 1005.9, expectedPayout: 849.99 }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ payoutEur: Number.NaN })],
      ]),
    })
    expect(badPayout.admissionState).toBe('blocked')
    expect(badPayout.reason).toBe(VM1_DRAFT_ADMISSION_REASON.payout)

    const negativeCleaning = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ cleaningEur: -1 })],
      ]),
    })
    expect(negativeCleaning.admissionState).toBe('blocked')
    expect(negativeCleaning.reason).toBe(VM1_DRAFT_ADMISSION_REASON.cleaning)

    const infPayout = admit(row({ externalId: '65733679' }), {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ payoutEur: Number.POSITIVE_INFINITY })],
      ]),
    })
    expect(infPayout.admissionState).toBe('blocked')

    const rawOnly = admit(
      row({ externalId: 'no-os', expectedPayout: null, totalPrice: 1005.9, cleaningFee: 150 }),
    )
    expect(rawOnly.admittedCandidate).toBe(false)
    expect(rawOnly.admissionState).toBe('completed_pending_authoritative_evidence')
    expect(rawOnly.reason).not.toContain('totalPrice')
  })

  it('keeps a calculable future-checkout forecast row from being admitted', () => {
    const future = row({
      externalId: '64232458',
      checkIn: '2026-09-18',
      checkOut: '2026-09-22',
      totalPrice: 2346,
      cleaningFee: 150,
      expectedPayout: 1982.37,
    })
    const forecast = forecastVm1Reservation(future, { asOfIso: AS_OF })
    expect(forecast.calculable).toBe(true)
    expect(forecast.recognitionState).toBe('forecast')
    const admission = admit(future)
    expect(admission.admissionState).toBe('forecast')
    expect(admission.admittedCandidate).toBe(false)
    expect(admission.reason).toBe(VM1_DRAFT_ADMISSION_REASON.futureCheckout)
  })

  it('blocks Booking UNKNOWN payout and does not fall back to totalPrice', () => {
    const booking = admit(
      row({
        externalId: '53082517',
        channel: 'booking',
        checkIn: '2026-09-11',
        checkOut: '2026-09-13',
        totalPrice: 1218.2,
        cleaningFee: 120,
        expectedPayout: null,
        taxAmount: null,
        hostServiceFee: null,
      }),
    )
    expect(booking.admissionState).toBe('blocked')
    expect(booking.admittedCandidate).toBe(false)
    expect(booking.reason).toBe(VM1_DRAFT_ADMISSION_REASON.bookingUnknown)
  })

  it('sends modified status to needs_review', () => {
    const modified = admit(
      row({
        externalId: '54972355',
        channel: 'booking',
        status: 'modified',
        checkIn: '2026-09-22',
        checkOut: '2026-09-26',
        expectedPayout: null,
        disposition: 'needs_review',
        reason: 'Status is modified.',
      }),
    )
    expect(modified.admissionState).toBe('needs_review')
    expect(modified.admittedCandidate).toBe(false)
  })

  it('excludes cancelled and inquiry', () => {
    expect(
      admit(
        row({
          externalId: '54720071',
          channel: 'booking',
          status: 'cancelled',
          disposition: 'excluded',
          reason: 'Cancelled reservations are not revenue.',
        }),
      ).admissionState,
    ).toBe('excluded')
    expect(
      admit(
        row({
          externalId: '65343332',
          status: 'inquiry',
          disposition: 'excluded',
          reason: 'Inquiry reservations are not revenue.',
        }),
      ).admissionState,
    ).toBe('excluded')
  })

  it('does not create a second income line when owner-statement evidence is absent', () => {
    const lines = admitBatch([row({ externalId: '65733679' })])
    expect(lines).toHaveLength(1)
    expect(lines[0].externalId).toBe('65733679')
    expect(lines[0].admittedCandidate).toBe(false)
    expect(lines.filter((l) => l.externalId !== '65733679')).toEqual([])
  })

  it('blocks Neer listing 426237 and non-VM1 listings with no property_name fallback', () => {
    const neer = admit(row({ externalId: 'neer-row', listingId: NEER_LISTING }))
    expect(neer.admittedCandidate).toBe(false)
    expect(neer.admissionState).toBe('blocked')
    expect(neer.reason).toBe(VM1_DRAFT_ADMISSION_REASON.listing)
    const vm2 = admit(row({ externalId: 'vm2-row', listingId: VM2_LISTING }))
    expect(vm2.admissionState).toBe('blocked')
    const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/partnership-workspace/vm1DraftAdmission.ts'), 'utf8')
    expect(src).not.toContain('property_name')
    expect(src).not.toContain('Oren')
    expect(src).not.toContain('Villa Mazotos 2')
  })

  it('never places 594.25 into an admission line', () => {
    const lines = admitBatch(
      [
        row({ externalId: '65733679' }),
        row({
          externalId: '53139113',
          checkIn: '2026-08-15',
          disposition: 'already_certified',
          reason: 'certified',
        }),
      ],
    )
    expect(JSON.stringify(lines)).not.toContain('594.25')
    expect(JSON.stringify(lines)).not.toContain('280600')
  })

  it('classifies the current live inventory with zero admitted Draft lines as of 2026-09-18', () => {
    const live: readonly Vm1ReservationRow[] = [
      row({
        externalId: '53139113',
        checkIn: '2026-08-15',
        checkOut: '2026-08-29',
        nights: 14,
        disposition: 'already_certified',
        reason: 'Already included in the frozen certified Avi stay set; never include again.',
      }),
      row({ externalId: '65733679' }),
      row({
        externalId: '53082517',
        channel: 'booking',
        checkIn: '2026-09-11',
        checkOut: '2026-09-13',
        nights: 2,
        totalPrice: 1218.2,
        cleaningFee: 120,
        expectedPayout: null,
        hostServiceFee: null,
        taxAmount: null,
      }),
      row({
        externalId: '64232458',
        checkIn: '2026-09-18',
        checkOut: '2026-09-22',
        nights: 4,
        totalPrice: 2346,
        expectedPayout: 1982.37,
      }),
      row({
        externalId: '65255834',
        channel: 'booking',
        checkIn: '2026-10-02',
        checkOut: '2026-10-12',
        nights: 10,
        expectedPayout: null,
        cleaningFee: 150,
      }),
      row({
        externalId: '63475414',
        channel: 'booking',
        checkIn: '2026-10-16',
        checkOut: '2026-10-19',
        nights: 3,
        expectedPayout: null,
      }),
      row({
        externalId: '64374576',
        channel: 'booking',
        checkIn: '2026-10-25',
        checkOut: '2026-10-29',
        nights: 4,
        expectedPayout: null,
      }),
      row({
        externalId: '54972355',
        channel: 'booking',
        status: 'modified',
        checkIn: '2026-09-22',
        checkOut: '2026-09-26',
        expectedPayout: null,
        disposition: 'needs_review',
        reason: 'Status is modified.',
      }),
      row({
        externalId: '54720071',
        channel: 'booking',
        status: 'cancelled',
        checkIn: '2026-09-01',
        disposition: 'excluded',
        reason: 'Cancelled reservations are not revenue.',
      }),
      row({
        externalId: '54224821',
        channel: 'booking',
        status: 'cancelled',
        checkIn: '2026-09-20',
        disposition: 'excluded',
        reason: 'Cancelled reservations are not revenue.',
      }),
      row({
        externalId: '64006881',
        channel: 'booking',
        status: 'cancelled',
        checkIn: '2026-10-24',
        disposition: 'excluded',
        reason: 'Cancelled reservations are not revenue.',
      }),
      row({
        externalId: '65343332',
        status: 'inquiry',
        checkIn: '2026-09-03',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      row({
        externalId: '63995050',
        status: 'inquiry',
        checkIn: '2026-09-03',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      row({
        externalId: '52454782',
        status: 'inquiry',
        checkIn: '2026-09-18',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      row({
        externalId: '47205185',
        status: 'inquiry',
        checkIn: '2026-09-25',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      row({
        externalId: '48331454',
        status: 'inquiry',
        checkIn: '2026-10-17',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
      row({
        externalId: '59213972',
        status: 'inquiry',
        checkIn: '2026-10-25',
        disposition: 'excluded',
        reason: 'Inquiry reservations are not revenue.',
      }),
    ]
    const lines = admitBatch(live, { asOfIso: LIVE_AS_OF })
    expect(lines.filter((l) => l.admittedCandidate)).toEqual([])
    expect(lines.find((l) => l.externalId === '65733679')?.admissionState).toBe(
      'completed_pending_authoritative_evidence',
    )
    expect(lines.find((l) => l.externalId === '53082517')?.admissionState).toBe('blocked')
    expect(lines.find((l) => l.externalId === '64232458')?.admissionState).toBe('forecast')
    expect(lines.find((l) => l.externalId === '65255834')?.admissionState).toBe('forecast')
    expect(lines.find((l) => l.externalId === '63475414')?.admissionState).toBe('forecast')
    expect(lines.find((l) => l.externalId === '64374576')?.admissionState).toBe('forecast')
    expect(lines.find((l) => l.externalId === '54972355')?.admissionState).toBe('needs_review')
    expect(lines.find((l) => l.externalId === '53139113')?.admissionState).toBe('excluded')
    expect(lines.find((l) => l.externalId === '54720071')?.admissionState).toBe('excluded')
    expect(lines.find((l) => l.externalId === '65343332')?.admissionState).toBe('excluded')
  })

  it('admits Booking 53082517 from verified Owner Statement without RPC expectedPayout', () => {
    const booking = admit(
      row({
        externalId: '53082517',
        channel: 'booking',
        checkIn: '2026-09-11',
        checkOut: '2026-09-13',
        cleaningFee: 120,
        expectedPayout: null,
        taxAmount: null,
        hostServiceFee: null,
        totalPrice: 1218.2,
      }),
      {
        asOfIso: '2026-09-19',
        authoritativeEvidenceByReservationId: new Map([
          [
            '53082517',
            osEvidence({
              sourceId: TM20_OS_TEST_DOCUMENT_HASH,
              documentHash: TM20_OS_TEST_DOCUMENT_HASH,
              reservationId: '53082517',
              payoutEur: 716.78,
              cleaningEur: 120,
            }),
          ],
        ]),
      },
    )
    expect(booking.admissionState).toBe('admitted')
    expect(booking.admittedCandidate).toBe(true)
    expect(booking.authoritativeEvidenceLinked).toBe(true)
    expect(booking.operationalEvidencePresent).toBe(false)
  })

  it('keeps 64232458 as forecast when checkout is after as-of 2026-09-19 even with OS evidence', () => {
    const future = admit(
      row({
        externalId: '64232458',
        checkIn: '2026-09-18',
        checkOut: '2026-09-22',
        totalPrice: 2346,
        expectedPayout: 1982.37,
      }),
      {
        asOfIso: '2026-09-19',
        authoritativeEvidenceByReservationId: new Map([
          [
            '64232458',
            osEvidence({
              sourceId: TM20_OS_TEST_DOCUMENT_HASH,
              documentHash: TM20_OS_TEST_DOCUMENT_HASH,
              reservationId: '64232458',
              payoutEur: 1307.78,
            }),
          ],
        ]),
      },
    )
    expect(future.admissionState).toBe('forecast')
    expect(future.admittedCandidate).toBe(false)
    expect(future.authoritativeEvidenceLinked).toBe(true)
    expect(future.reason).toBe(VM1_DRAFT_ADMISSION_REASON.futureCheckout)
  })

  it('keeps 54972355 needs_review while status is modified even with OS evidence', () => {
    const modified = admit(
      row({
        externalId: '54972355',
        channel: 'booking',
        status: 'modified',
        checkIn: '2026-09-22',
        checkOut: '2026-09-26',
        disposition: 'needs_review',
        expectedPayout: null,
        reason: 'Status is modified.',
      }),
      {
        asOfIso: '2026-09-19',
        authoritativeEvidenceByReservationId: new Map([
          [
            '54972355',
            osEvidence({
              sourceId: TM20_OS_TEST_DOCUMENT_HASH,
              documentHash: TM20_OS_TEST_DOCUMENT_HASH,
              reservationId: '54972355',
              payoutEur: 1458.26,
            }),
          ],
        ]),
      },
    )
    expect(modified.admissionState).toBe('needs_review')
    expect(modified.admittedCandidate).toBe(false)
    expect(modified.authoritativeEvidenceLinked).toBe(true)
    expect(modified.reason).toBe(VM1_DRAFT_ADMISSION_REASON.modified)
  })

  it('admits a unique verified sourceId on one reservation', () => {
    const lines = admitBatch([row({ externalId: '65733679' })], {
      authoritativeEvidenceByReservationId: new Map([['65733679', osEvidence({ sourceId: 'os-unique-1' })]]),
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].admissionState).toBe('admitted')
    expect(lines[0].admittedCandidate).toBe(true)
  })

  it('allows the same verified documentHash on distinct reservation ids', () => {
    const sharedHash = TM20_OS_TEST_DOCUMENT_HASH
    const lines = admitBatch(
      [
        row({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
        row({
          externalId: '53082517',
          channel: 'booking',
          checkIn: '2026-09-11',
          checkOut: '2026-09-13',
          cleaningFee: 120,
          expectedPayout: null,
          taxAmount: null,
          hostServiceFee: null,
        }),
      ],
      {
        authoritativeEvidenceByReservationId: new Map([
          [
            '65733679',
            osEvidence({
              sourceId: sharedHash,
              documentHash: sharedHash,
              reservationId: '65733679',
              payoutEur: 498.37,
            }),
          ],
          [
            '53082517',
            osEvidence({
              sourceId: sharedHash,
              documentHash: sharedHash,
              reservationId: '53082517',
              payoutEur: 716.78,
              cleaningEur: 120,
            }),
          ],
        ]),
      },
    )
    expect(lines.filter((l) => l.admittedCandidate)).toHaveLength(2)
    expect(lines.find((l) => l.externalId === '65733679')?.admissionState).toBe('admitted')
    expect(lines.find((l) => l.externalId === '53082517')?.admissionState).toBe('admitted')
    expect(lines.find((l) => l.externalId === '65733679')?.authoritativeEvidenceLinked).toBe(true)
    expect(lines.find((l) => l.externalId === '53082517')?.authoritativeEvidenceLinked).toBe(true)
  })

  it('admits two reservations with distinct verified sourceIds', () => {
    const lines = admitBatch(
      [
        row({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
        row({
          externalId: '64011112',
          checkIn: '2026-09-04',
          checkOut: '2026-09-07',
        }),
      ],
      {
        authoritativeEvidenceByReservationId: new Map([
          ['65733679', osEvidence({ sourceId: 'os-a' })],
          ['64011112', osEvidence({ sourceId: 'os-b' })],
        ]),
      },
    )
    expect(lines.filter((l) => l.admittedCandidate)).toHaveLength(2)
    expect(lines.find((l) => l.externalId === '65733679')?.admissionState).toBe('admitted')
    expect(lines.find((l) => l.externalId === '64011112')?.admissionState).toBe('admitted')
  })

  it('fails the whole batch on duplicate reservation external_id with no silent dedupe', () => {
    const result = admitVm1DraftReservations(
      [row({ externalId: '65733679' }), row({ externalId: '65733679', checkIn: '2026-09-04' })],
      { asOfIso: AS_OF, certifiedReservationIds: CERTIFIED },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(VM1_DRAFT_ADMISSION_REASON.duplicateReservationId('65733679'))
  })

  it('ignores evidence map keys that are not in the reservation batch', () => {
    const lines = admitBatch([row({ externalId: '65733679' })], {
      authoritativeEvidenceByReservationId: new Map([
        ['65733679', osEvidence({ sourceId: 'os-on-batch' })],
        ['missing-id', osEvidence({ sourceId: 'os-orphan' })],
      ]),
    })
    expect(lines.map((l) => l.externalId)).toEqual(['65733679'])
    expect(lines).toHaveLength(1)
    expect(lines[0].admittedCandidate).toBe(true)
    expect(lines.some((l) => l.externalId === 'missing-id')).toBe(false)
  })

  it('with injected Owner Statement fixture at 2026-09-19 admits completed stays only', () => {
    const inventoryRows = [
      row({ externalId: '65733679', checkIn: '2026-09-03', checkOut: '2026-09-06' }),
      row({
        externalId: '53082517',
        channel: 'booking',
        checkIn: '2026-09-11',
        checkOut: '2026-09-13',
        cleaningFee: 120,
        expectedPayout: null,
        taxAmount: null,
        hostServiceFee: null,
        totalPrice: 1218.2,
      }),
      row({
        externalId: '64232458',
        checkIn: '2026-09-18',
        checkOut: '2026-09-22',
        totalPrice: 2346,
        expectedPayout: 1982.37,
      }),
      row({
        externalId: '54972355',
        channel: 'booking',
        status: 'modified',
        checkIn: '2026-09-22',
        checkOut: '2026-09-26',
        disposition: 'needs_review',
        expectedPayout: null,
        reason: 'Status is modified.',
      }),
      row({
        externalId: '53139113',
        checkIn: '2026-08-15',
        checkOut: '2026-08-29',
        disposition: 'already_certified',
        reason: 'Already included in the frozen certified Avi stay set; never include again.',
      }),
    ]
    const os = adaptVm1OwnerStatementEvidence({
      identity: TM20_OS_TEST_IDENTITY,
      document: TM20_OS_TEST_DOCUMENT,
      inventory: ownerStatementInventoryFromReservations(inventoryRows),
    })
    expect(os.ok).toBe(true)
    if (!os.ok) throw new Error(os.reason)
    const lines = admitBatch(inventoryRows, {
      asOfIso: '2026-09-19',
      authoritativeEvidenceByReservationId: os.evidenceByReservationId,
    })
    expect(lines.find((l) => l.externalId === '65733679')?.admissionState).toBe('admitted')
    expect(lines.find((l) => l.externalId === '65733679')?.admittedCandidate).toBe(true)
    expect(lines.find((l) => l.externalId === '53082517')?.admissionState).toBe('admitted')
    expect(lines.find((l) => l.externalId === '53082517')?.admittedCandidate).toBe(true)
    expect(lines.find((l) => l.externalId === '64232458')?.admissionState).toBe('forecast')
    expect(lines.find((l) => l.externalId === '64232458')?.admittedCandidate).toBe(false)
    expect(lines.find((l) => l.externalId === '54972355')?.admissionState).toBe('needs_review')
    expect(lines.find((l) => l.externalId === '53139113')?.admissionState).toBe('excluded')
    expect(lines.filter((l) => l.admittedCandidate)).toHaveLength(2)
    expect(lines.find((l) => l.externalId === '65733679')?.reason).toContain(
      'Raw expectedPayout is not admission authority',
    )
    expect(lines.find((l) => l.externalId === '53082517')?.reason).toContain('hostaway_owner_statement')
  })
})
