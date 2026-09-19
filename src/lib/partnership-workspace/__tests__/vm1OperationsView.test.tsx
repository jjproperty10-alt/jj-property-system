jest.mock('next/link', () => {
  return function MockLink({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
})

import * as fs from 'fs'
import * as path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Vm1OperationsView } from '@/components/finance/Vm1OperationsView'
import {
  VM1_CANONICAL_PROPERTY_ID,
  VM1_HOSTAWAY_LISTING_ID,
  VM1_LEGACY_LEDGER_PROPERTY_ID,
} from '@/lib/partnership-workspace/vm1Identity'
import type { Vm1ReservationRow } from '@/lib/partnership-workspace/vm1IdentityAdapter'
import { forecastVm1Reservations } from '@/lib/partnership-workspace/vm1ForecastCalculator'
import { admitVm1DraftReservations } from '@/lib/partnership-workspace/vm1DraftAdmission'
import { admitVm1ApprovedFutureDraftExpense } from '@/lib/partnership-workspace/vm1ExpenseAdmission'
import { VM1_UNKNOWN_EVIDENCE_LABEL } from '@/lib/partnership-workspace/vm1OperationsPresentation'

const IDENTITY = {
  canonicalPropertyId: VM1_CANONICAL_PROPERTY_ID,
  legacyLedgerPropertyId: VM1_LEGACY_LEDGER_PROPERTY_ID,
  hostawayListingId: VM1_HOSTAWAY_LISTING_ID,
}

function row(overrides: Partial<Vm1ReservationRow> & Pick<Vm1ReservationRow, 'externalId' | 'disposition' | 'status' | 'reason'>): Vm1ReservationRow {
  return {
    listingId: VM1_HOSTAWAY_LISTING_ID,
    channel: 'airbnb',
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
    ...overrides,
  }
}

const ROWS: readonly Vm1ReservationRow[] = [
  row({
    externalId: '53139113',
    status: 'confirmed',
    checkIn: '2026-08-15',
    checkOut: '2026-08-29',
    nights: 14,
    totalPrice: 7463.28,
    cleaningFee: 120,
    hostServiceFee: null,
    expectedPayout: null,
    taxAmount: null,
    disposition: 'already_certified',
    reason: 'Already included in the frozen certified Avi stay set; never include again.',
  }),
  row({
    externalId: '65733679',
    disposition: 'operational_candidate',
    status: 'confirmed',
    reason: 'Confirmed stay with check-in on or after the new-period start.',
  }),
  row({
    externalId: '54720071',
    channel: 'booking',
    status: 'cancelled',
    checkIn: '2026-09-01',
    checkOut: '2026-09-10',
    nights: 9,
    totalPrice: 0,
    cleaningFee: 120,
    hostServiceFee: null,
    expectedPayout: null,
    taxAmount: null,
    cancellationDate: '2026-02-22 20:17:20',
    disposition: 'excluded',
    reason: 'Cancelled reservations are not revenue.',
  }),
  row({
    externalId: '65343332',
    status: 'inquiry',
    checkIn: '2026-09-03',
    checkOut: '2026-09-07',
    nights: 4,
    totalPrice: 2208,
    cleaningFee: 150,
    hostServiceFee: null,
    expectedPayout: null,
    taxAmount: null,
    disposition: 'excluded',
    reason: 'Inquiry reservations are not revenue.',
  }),
  row({
    externalId: '54972355',
    channel: 'booking',
    status: 'modified',
    checkIn: '2026-09-22',
    checkOut: '2026-09-26',
    nights: 4,
    totalPrice: 2365.5,
    cleaningFee: 150,
    hostServiceFee: null,
    expectedPayout: null,
    taxAmount: null,
    disposition: 'needs_review',
    reason: 'Status is modified.',
  }),
  row({
    externalId: '64232458',
    disposition: 'operational_candidate',
    status: 'confirmed',
    checkIn: '2026-09-18',
    checkOut: '2026-09-22',
    nights: 4,
    totalPrice: 2346,
    cleaningFee: 150,
    hostServiceFee: 363.63,
    expectedPayout: 1982.37,
    taxAmount: 0,
    reason: 'Confirmed stay with check-in on or after the new-period start.',
  }),
  row({
    externalId: '64011111',
    disposition: 'operational_candidate',
    status: 'confirmed',
    checkIn: '2026-08-20',
    checkOut: '2026-08-24',
    nights: 4,
    reason: 'Confirmed stay with check-in on or after the new-period start.',
  }),
  row({
    externalId: '53082517',
    channel: 'booking',
    status: 'confirmed',
    checkIn: '2026-09-11',
    checkOut: '2026-09-13',
    nights: 2,
    totalPrice: 1218.2,
    cleaningFee: 120,
    hostServiceFee: null,
    expectedPayout: null,
    taxAmount: null,
    disposition: 'operational_candidate',
    reason: 'Confirmed stay with check-in on or after the new-period start.',
  }),
]

function approvedExpense() {
  return admitVm1ApprovedFutureDraftExpense([
    {
      id: 'efe4e1f5-8524-5266-ab10-4eedaa5b3e76',
      date: '2026-09-06',
      property_id: VM1_LEGACY_LEDGER_PROPERTY_ID,
      category: 'Airbnb',
      subcategory: 'Internet',
      amount_eur: 30,
      client_charge: null,
      review_status: 'active',
      is_deleted: false,
    },
  ])
}

function renderVerified(): string {
  const admission = admitVm1DraftReservations(ROWS, {
    asOfIso: '2026-09-17',
    certifiedReservationIds: new Set(['53139113']),
  })
  if (!admission.ok) {
    throw new Error(admission.reason)
  }
  return renderToStaticMarkup(
    <Vm1OperationsView
      identityStatus="verified"
      from="2026-08-25"
      to="2026-09-17"
      identity={IDENTITY}
      reservations={ROWS}
      forecastLines={forecastVm1Reservations(ROWS, { asOfIso: '2026-09-17' })}
      draftAdmissionLines={admission.lines}
      expenseAdmission={approvedExpense()}
    />,
  )
}

describe('Vm1OperationsView', () => {
  it('renders property, listing, verified identity, and staff note', () => {
    const html = renderVerified()
    expect(html).toContain('TM20 — TelMar Royal Villa')
    expect(html).toContain('412148')
    expect(html).toContain('Verified')
    expect(html).toContain('Operational evidence only — not certified settlement data.')
    expect(html).toContain('2026-08-25 → 2026-09-17')
  })

  it('labels certified, candidate, cancelled, inquiry, and modified rows', () => {
    const html = renderVerified()
    expect(html).toContain('Already certified')
    expect(html).toContain('Confirmed candidate')
    expect(html).toContain('Excluded — cancelled')
    expect(html).toContain('Excluded — inquiry')
    expect(html).toContain('Needs Review — modified/unknown')
    expect(html).toContain('data-testid="vm1-operations-disposition-53139113"')
    expect(html).toContain('data-testid="vm1-operations-disposition-65733679"')
    expect(html).toContain('data-testid="vm1-operations-disposition-54972355"')
  })

  it('renders Booking null payout/fee/tax as Unknown, not zero', () => {
    const html = renderVerified()
    expect(html).toContain(VM1_UNKNOWN_EVIDENCE_LABEL)
    expect(html).toContain('data-evidence-amount="unknown"')
    const bookingChunk = html.slice(html.indexOf('53082517'), html.indexOf('53082517') + 2500)
    expect(bookingChunk).toContain(VM1_UNKNOWN_EVIDENCE_LABEL)
    expect(bookingChunk).not.toContain('€0.00')
  })

  it('does not render guest or contact fields', () => {
    const html = renderVerified()
    expect(html.toLowerCase()).not.toContain('guest name')
    expect(html.toLowerCase()).not.toContain('guestname')
    expect(html.toLowerCase()).not.toContain('email')
    expect(html.toLowerCase()).not.toContain('phone')
    expect(html.toLowerCase()).not.toContain('mobile')
  })

  it('does not render settlement totals or partner-share labels', () => {
    const html = renderVerified()
    expect(html).not.toContain('Net Owner Payout')
    expect(html).not.toContain('Avi share')
    expect(html).not.toContain('Yossi share')
    expect(html).not.toContain('Yaakov')
    expect(html).not.toContain('partner share')
    expect(html).not.toContain('Grand total')
    expect(html).not.toContain('subtotal')
    expect(html).not.toContain('594.25')
    expect(html).not.toContain('50%')
    expect(html).not.toContain('25%')
    const beforeExpense = html.slice(0, html.indexOf('data-testid="vm1-expense-admission-section"'))
    expect(beforeExpense).not.toContain('Internet')
  })

  it('renders the internal forecast section with the staff-only disclaimer', () => {
    const html = renderVerified()
    expect(html).toContain('Financial Forecast / תחזית כספית')
    expect(html).toContain('Internal forecast only — not received cash, not settlement, not Certified.')
    expect(html).toContain('data-testid="vm1-forecast-section"')
    expect(html).toContain('data-testid="vm1-forecast-state-65733679"')
    expect(html).toContain('Completed — pending reconciliation')
    expect(html).toContain('הושלם — ממתין להתאמה')
    expect(html).toContain('Blocked')
    expect(html).toContain('חסום')
    expect(html).toContain('Needs Review')
    expect(html).toContain('נדרשת בדיקה')
  })

  it('orders financial review cards and keeps excluded lines out of that list', () => {
    const html = renderVerified()
    const reviewStart = html.indexOf('data-testid="vm1-forecast-financial-review"')
    const excludedStart = html.indexOf('data-testid="vm1-forecast-excluded"')
    const review = html.slice(reviewStart, excludedStart)
    expect(review.indexOf('65733679')).toBeGreaterThan(-1)
    expect(review.indexOf('65733679')).toBeLessThan(review.indexOf('64232458'))
    expect(review.indexOf('64232458')).toBeLessThan(review.indexOf('53082517'))
    expect(review.indexOf('53082517')).toBeLessThan(review.indexOf('54972355'))
    expect(review).not.toContain('53139113')
    expect(review).not.toContain('54720071')
    expect(review).not.toContain('65343332')
    expect(review).not.toContain('64011111')
  })

  it('renders excluded evidence as a closed details list without amount grids', () => {
    const html = renderVerified()
    expect(html).toContain('data-testid="vm1-forecast-excluded"')
    expect(html).toContain('Excluded evidence / ראיות מוחרגות (4)')
    expect(html).not.toMatch(/data-testid="vm1-forecast-excluded"[^>]*\sopen/)
    expect(html).toContain('data-testid="vm1-forecast-excluded-53139113"')
    expect(html).toContain('data-testid="vm1-forecast-excluded-54720071"')
    expect(html).toContain('data-testid="vm1-forecast-excluded-65343332"')
    expect(html).toContain('data-testid="vm1-forecast-excluded-64011111"')
    expect(html).toContain('Already certified; never included in the new-period forecast.')
    expect(html).toContain('Cancelled reservations are not revenue.')
    expect(html).toContain('Inquiry reservations are not revenue.')
    expect(html).toContain('Check-in is before new-period start 2026-08-30.')
    expect(html).not.toContain('data-testid="vm1-forecast-amounts-53139113"')
    expect(html).not.toContain('data-testid="vm1-forecast-card-53139113"')
  })

  it('keeps approved forecast amounts and unknown Booking/modified values', () => {
    const html = renderVerified()
    const completed = html.slice(
      html.indexOf('data-testid="vm1-forecast-card-65733679"'),
      html.indexOf('data-testid="vm1-forecast-card-64232458"'),
    )
    expect(completed).toContain('Completed — pending reconciliation')
    expect(completed).toContain('€932.93')
    expect(completed).toContain('€82.94')
    expect(completed).toContain('€150.00')
    expect(completed).toContain('€77.03')
    expect(completed).toContain('€124.59')
    expect(completed).toContain('€498.37')
    expect(completed.toLowerCase()).not.toContain('paid')
    expect(completed.toLowerCase()).not.toContain('settled')

    const future = html.slice(
      html.indexOf('data-testid="vm1-forecast-card-64232458"'),
      html.indexOf('data-testid="vm1-forecast-card-53082517"'),
    )
    expect(future).toContain('Forecast')
    expect(future).toContain('תחזית')
    expect(future).toContain('€2,393.64')
    expect(future).toContain('€411.27')
    expect(future).toContain('€197.64')
    expect(future).toContain('€326.95')
    expect(future).toContain('€1,307.78')

    const booking = html.slice(
      html.indexOf('data-testid="vm1-forecast-card-53082517"'),
      html.indexOf('data-testid="vm1-forecast-card-54972355"'),
    )
    expect(booking).toContain(VM1_UNKNOWN_EVIDENCE_LABEL)
    expect(booking).toContain('UNKNOWN')
    expect(booking).not.toContain('€0.00')
    expect(booking).not.toContain('€498.37')

    const modified = html.slice(
      html.indexOf('data-testid="vm1-forecast-card-54972355"'),
      html.indexOf('data-testid="vm1-draft-admission-section"'),
    )
    expect(modified).toContain('Needs Review')
    expect(modified).toContain('modified')
    expect(modified).toContain(VM1_UNKNOWN_EVIDENCE_LABEL)
    expect(modified).not.toContain('€0.00')
  })

  it('uses responsive forecast cards instead of a wide scrolling table', () => {
    const html = renderVerified()
    const sectionStart = html.indexOf('data-testid="vm1-forecast-section"')
    const section = html.slice(sectionStart, html.indexOf('data-testid="vm1-draft-admission-section"'))
    expect(section).not.toContain('<table')
    expect(section).not.toContain('overflow-x-auto')
    expect(section).toContain('grid-cols-1')
    expect(section).toContain('sm:grid-cols-2')
    expect(section).toContain('lg:grid-cols-3')
    expect(section).toContain('data-testid="vm1-forecast-card-65733679"')
  })

  it('renders Draft admission review without totals or partner split', () => {
    const html = renderVerified()
    expect(html).toContain('Draft admission review / בדיקת קבלה לטיוטה')
    expect(html).toContain('Admission gates only — not a saved Draft, not settlement, not Certified, and no partner split.')
    expect(html).toContain('Initial partnership period')
    expect(html).toContain('Hostaway inventory is evidence at the time of the RPC read')
    expect(html).toContain('data-testid="vm1-draft-admission-state-65733679"')
    expect(html).toContain('Blocked — authoritative statement evidence required')
    expect(html).toContain('חסום — נדרשת ראיית דוח בעלים')
    expect(html).toContain('authoritative owner-statement payout evidence is not linked')
    expect(html).toContain('data-testid="vm1-draft-admission-state-53139113"')
    expect(html).toContain('data-testid="vm1-draft-admission-state-64232458"')
    expect(html).toContain('Forecast — not admitted')
    expect(html).toContain('data-testid="vm1-draft-admission-state-53082517"')
    const admission = html.slice(html.indexOf('data-testid="vm1-draft-admission-section"'))
    expect(admission).not.toContain('Admitted candidate')
    expect(admission).not.toContain('sourceId')
    expect(admission).not.toContain('os-')
    expect(admission).not.toContain('Grand total')
    expect(admission).not.toContain('Avi share')
    expect(admission).not.toContain('50%')
    expect(admission).not.toContain('25%')
    expect(admission).not.toContain('594.25')
    expect(admission).not.toContain('subtotal')
  })

  it('renders the approved future-Draft expense without partner split or transaction UUID', () => {
    const html = renderVerified()
    expect(html).toContain('Approved future-Draft expenses / הוצאות מאושרות לטיוטה עתידית')
    expect(html).toContain('Internal classification only — not posted, not allocated, not Settlement and not Certified.')
    expect(html).toContain('data-testid="vm1-expense-admission-approved"')
    expect(html).toContain('2026-09-06')
    expect(html).toContain('Airbnb')
    expect(html).toContain('Internet')
    expect(html).toContain('€30.00')
    expect(html).toContain('€0.00')
    expect(html).toContain('Approved future-Draft expense')
    expect(html).not.toContain('efe4e1f5')
    expect(html).not.toContain('Avi €15')
    expect(html).not.toContain('7.50')
    expect(html).not.toContain('50%')
    expect(html).not.toContain('25%')
    expect(html).not.toContain('594.25')
    const expense = html.slice(html.indexOf('data-testid="vm1-expense-admission-section"'))
    expect(expense).not.toContain('Grand total')
    expect(expense).not.toContain('subtotal')
    expect(expense).not.toContain('payer')
    expect(expense).not.toContain('payee')
  })

  it('shows Expense admission blocked without €0 amounts and without crashing revenue', () => {
    const admission = admitVm1DraftReservations(ROWS, {
      asOfIso: '2026-09-17',
      certifiedReservationIds: new Set(['53139113']),
    })
    if (!admission.ok) throw new Error(admission.reason)
    const html = renderToStaticMarkup(
      <Vm1OperationsView
        identityStatus="verified"
        from="2026-08-25"
        to="2026-09-17"
        identity={IDENTITY}
        reservations={ROWS}
        forecastLines={forecastVm1Reservations(ROWS, { asOfIso: '2026-09-17' })}
        draftAdmissionLines={admission.lines}
        expenseAdmission={{
          transactionId: null,
          date: null,
          category: null,
          subcategory: null,
          admissionState: 'blocked',
          partnershipChargeEur: null,
          jjActualCostEur: null,
          jjOperatingProfitEur: null,
          reason: 'Approved expense row was not returned as exactly one Production transaction.',
        }}
      />,
    )
    expect(html).toContain('Expense admission blocked')
    expect(html).toContain('data-testid="vm1-expense-admission-blocked"')
    expect(html).not.toContain('data-testid="vm1-expense-admission-approved"')
    expect(html).not.toContain('data-testid="vm1-expense-admission-charge"')
    expect(html).toContain('data-testid="vm1-forecast-section"')
    expect(html).toContain('data-testid="vm1-draft-admission-section"')
    expect(html).toContain('65733679')
    const expense = html.slice(html.indexOf('data-testid="vm1-expense-admission-section"'))
    expect(expense).not.toContain('€0.00')
    expect(expense).not.toContain('€30.00')
  })

  it('does not import the forecast calculator into the view module', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/components/finance/Vm1OperationsView.tsx'), 'utf8')
    expect(src).not.toContain('forecastVm1Reservation')
    expect(src).not.toContain('forecastAirbnbOwnerStatementAmounts')
    expect(src).not.toContain('vm1ForecastCalculator')
  })

  it('shows a blocked identity without reservation rows', () => {
    const html = renderToStaticMarkup(
      <Vm1OperationsView
        identityStatus="blocked"
        from="2026-08-25"
        to="2026-09-17"
        errorTitle="VM1 identity verification failed"
        errorDescription="Operational reservation data is not shown."
        expenseAdmission={approvedExpense()}
      />,
    )
    expect(html).toContain('Blocked')
    expect(html).toContain('data-testid="vm1-operations-blocked"')
    expect(html).not.toContain('65733679')
    expect(html).not.toContain('data-testid="vm1-operations-table-wrap"')
    expect(html).not.toContain('data-testid="vm1-forecast-section"')
    expect(html).not.toContain('data-testid="vm1-draft-admission-section"')
    expect(html).not.toContain('data-testid="vm1-expense-admission-section"')
    expect(html).not.toContain('data-testid="vm1-expense-admission-approved"')
    expect(html).not.toContain('data-testid="vm1-expense-admission-charge"')
    expect(html).not.toContain('€30.00')
    expect(html).not.toContain('Partnership charge')
    expect(html).not.toContain('JJ actual cost')
    expect(html).not.toContain('JJ operating profit')
    expect(html).not.toContain('efe4e1f5')
  })
})
