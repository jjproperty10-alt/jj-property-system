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

function renderVerified(): string {
  return renderToStaticMarkup(
    <Vm1OperationsView
      identityStatus="verified"
      from="2026-08-25"
      to="2026-09-17"
      identity={IDENTITY}
      reservations={ROWS}
      forecastLines={forecastVm1Reservations(ROWS, { asOfIso: '2026-09-17' })}
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
    expect(html.toLowerCase()).not.toContain('guest')
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
    expect(html).not.toContain('594.25')
  })

  it('renders the internal forecast section with the staff-only disclaimer', () => {
    const html = renderVerified()
    expect(html).toContain('Financial Forecast / תחזית כספית')
    expect(html).toContain('Internal forecast only — not received cash, not settlement, not Certified.')
    expect(html).toContain('data-testid="vm1-forecast-section"')
    expect(html).toContain('data-testid="vm1-forecast-state-65733679"')
    expect(html).toContain('Completed — pending reconciliation')
    expect(html).toContain('Blocked — unknown payout')
    expect(html).toContain('Needs Review')
  })

  it('shows a blocked identity without reservation rows', () => {
    const html = renderToStaticMarkup(
      <Vm1OperationsView
        identityStatus="blocked"
        from="2026-08-25"
        to="2026-09-17"
        errorTitle="VM1 identity verification failed"
        errorDescription="Operational reservation data is not shown."
      />,
    )
    expect(html).toContain('Blocked')
    expect(html).toContain('data-testid="vm1-operations-blocked"')
    expect(html).not.toContain('65733679')
    expect(html).not.toContain('data-testid="vm1-operations-table-wrap"')
    expect(html).not.toContain('data-testid="vm1-forecast-section"')
  })
})
