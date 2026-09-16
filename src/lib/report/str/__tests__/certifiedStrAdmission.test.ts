import { readFileSync } from 'fs'
import path from 'path'
import { isCertifiedLedgerRow } from '@/lib/ledger/certifiedLedger'
import { isOwnerStatementExtra } from '@/lib/report/str/ownerStrStatement'
import { composeOwnerStrStatement } from '@/lib/report/str/ownerStrStatement'

const EMPTY = new Set<string>()

describe('STR certified admission', () => {
  it('excludes a deleted STR extra', () => {
    expect(isCertifiedLedgerRow({ id: 'extra-del', is_deleted: true, review_status: 'active' }, EMPTY)).toBe(false)
    expect(isOwnerStatementExtra('Electricity', 'JJ')).toBe(true)
  })

  it('excludes an actively excluded STR extra', () => {
    expect(isCertifiedLedgerRow({ id: 'extra-ex', is_deleted: false, review_status: 'active' }, new Set(['extra-ex']))).toBe(false)
  })

  it('excludes deleted/excluded Platform Income', () => {
    expect(isCertifiedLedgerRow({
      id: '82c8ee31-3667-4c7e-893f-c0d7a6acb70b',
      is_deleted: true,
      review_status: 'active',
    }, new Set(['82c8ee31-3667-4c7e-893f-c0d7a6acb70b']))).toBe(false)
  })

  it('billing-only owner charge remains included where otherwise certified', () => {
    expect(isCertifiedLedgerRow({ id: 'bill-only', is_deleted: false, review_status: 'active' }, EMPTY)).toBe(true)
  })

  it('Hostaway reservation totals are unchanged by ledger filtering', () => {
    const s = composeOwnerStrStatement({
      ownerName: 'Orit Rob',
      properties: ['Orit Rob Pingodes'],
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      periodLabel: 'August 2026',
      issuedDate: '2026-08-13',
      reservations: [{
        reservationId: 'a1', channel: 'airbnb', propertyName: 'Orit Rob Pingodes', guestName: 'Guest A',
        checkIn: '2026-08-02', checkOut: '2026-08-16', nights: 14,
        grossEur: 1026, platformFeesEur: 159.03, platformFeesSource: 'hostaway:airbnbListingHostFee',
        cleaningEur: 60, taxesEur: 0, platformPayoutEvidenceEur: 866.97,
      }],
      extras: [],
      jjPlatformIncomeInPeriodEur: null,
      jjPlatformIncomeIsAggregate: false,
    })
    expect(s.totals.grossEur).toBe(1026)
    expect(s.totals.netOwnerPayoutEur).toBe(645.58)
  })
})

describe('STR service uses the certified view', () => {
  it('ownerStrStatementService queries certified ledger helper, not raw transactions', () => {
    const src = readFileSync(path.join(__dirname, '..', 'ownerStrStatementService.ts'), 'utf8')
    expect(src).toContain('fetchCertifiedLedgerRows')
    expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
  })

  it('ownerStrStatementService fail-closes extras without dropping Hostaway compose', () => {
    const src = readFileSync(path.join(__dirname, '..', 'ownerStrStatementService.ts'), 'utf8')
    expect(src).toContain('CertifiedLedgerUnavailableError')
    expect(src).toContain('ledgerUnavailable')
    expect(src).toContain('Hostaway reservation figures are shown')
  })

  it('ownerStrAuditAdapter Platform Income uses the same certified helper', () => {
    const src = readFileSync(path.join(__dirname, '..', '..', '..', 'owners', 'ownerStrAuditAdapter.ts'), 'utf8')
    expect(src).toContain('fetchCertifiedLedgerRows')
    expect(src).toContain('CertifiedLedgerUnavailableError')
    expect(src).not.toMatch(/from\(\s*['"]transactions['"]\s*\)/)
  })
})