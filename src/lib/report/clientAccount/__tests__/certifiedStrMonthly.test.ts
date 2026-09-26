import fs from 'fs'
import path from 'path'
import { composeCertifiedClientAccount } from '../composeCertifiedAccount'
import { clientAccountPlainText, internalLeakHits } from '../gates'
import {
  admitCertifiedStrMonthly,
  readMonthlyStrOrUnavailable,
  toExactCents,
} from '../certifiedStrMonthly'
import type { CompositionInput } from '../types'

const ENTITY = '2944e9ad-c298-4dbf-b666-26561d934b61'
const NEER = 'b587f463-279d-4376-bb14-38789f34cbba'
const DUPLEX = 'f58180f8-97e2-41ef-abfd-b462ecb1595f'

const scope = {
  entityId: ENTITY,
  propertyId: NEER,
  propertyName: 'Apartment Neer Yoav Dekelia',
  periodStart: '2026-06-01',
  periodEnd: '2026-08-31',
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    unavailable: false,
    certification_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entity_id: ENTITY,
    property_id: NEER,
    period_from: '2026-06-01',
    period_to: '2026-08-31',
    total_owner_net: 3434.98,
    reconciliation: {
      monthly_sum: 3434.98,
      certified_total: 3434.98,
      difference: 0,
      status: 'exact',
    },
    months: [
      { month: '2026-08-01', reservation_count: 4, nights: 18, owner_net: 961.96, component_reconciliation_status: 'partial' },
      { month: '2026-06-01', reservation_count: 5, nights: 19, owner_net: 947.25, component_reconciliation_status: 'partial' },
      { month: '2026-07-01', reservation_count: 6, nights: 28, owner_net: 1525.77, component_reconciliation_status: 'partial' },
    ],
    ...overrides,
  }
}

function account(extra: Partial<CompositionInput> = {}): CompositionInput {
  return {
    asOf: '2026-08-31',
    clientDisplayName: 'אוריאל',
    reportTitle: 'סיכום חשבון לקוח מלא',
    openingDueToJj: 48901.54,
    closingDueToJj: 48901.54,
    cashAllocationSignedTotal: 0,
    lines: [{
      lineOrder: 1,
      propertyKey: NEER,
      propertyName: 'Apartment Neer Yoav Dekelia',
      amountDueToJj: 48901.54,
      evidenceRef: 'sample',
      metadata: {},
    }],
    credits: [],
    rows: [{
      id: 'charge',
      date: '2026-01-15',
      propertyName: 'Apartment Neer Yoav Dekelia',
      category: 'Management',
      subcategory: 'Repairs',
      description: 'תיקון',
      payer: 'Anastasia',
      payee: 'company',
      amountEur: 48901.54,
      clientCharge: null,
      reviewStatus: 'active',
      isDeleted: false,
    }],
    ...extra,
  }
}

describe('certified monthly STR admission', () => {
  test('parses the public reader and keeps June, July, August in order', () => {
    const admitted = admitCertifiedStrMonthly(payload(), scope)
    expect(admitted.unavailable).toBe(false)
    if (admitted.unavailable) return
    expect(admitted.months.map((month) => month.monthLabel)).toEqual(['יוני 2026', 'יולי 2026', 'אוגוסט 2026'])
    expect(admitted.months.map((month) => month.reservationCount)).toEqual([5, 6, 4])
    expect(admitted.months.map((month) => month.nights)).toEqual([19, 28, 18])
    expect(admitted.totalOwnerNet).toBe(3434.98)
    expect(admitted.arithmeticEffectOnCertifiedClosing).toBe(0)
    expect(toExactCents(947.25)! + toExactCents(1525.77)! + toExactCents(961.96)!).toBe(343498)
  })

  test('a missing certification, a duplicate month, and a total mismatch stay unavailable', () => {
    expect(admitCertifiedStrMonthly({ unavailable: true, reason: 'no_applied_certification' }, scope).unavailable).toBe(true)
    const months = payload().months as Array<Record<string, unknown>>
    expect(admitCertifiedStrMonthly(payload({ months: [months[1], months[1]] }), scope).unavailable).toBe(true)
    expect(admitCertifiedStrMonthly(payload({ total_owner_net: 1 }), scope).unavailable).toBe(true)
  })

  test('null counts stay unavailable text and a reader failure does not call a second time', async () => {
    const months = (payload().months as Array<Record<string, unknown>>).map((month) => (
      month.month === '2026-06-01' ? { ...month, reservation_count: null, nights: null } : month
    ))
    const admitted = admitCertifiedStrMonthly(payload({ months }), scope)
    expect(admitted.unavailable).toBe(false)
    if (!admitted.unavailable) {
      expect(admitted.months[0].reservationCountLabel).toBe('לא זמין')
      expect(admitted.months[0].nightsLabel).toBe('לא זמין')
    }
    let calls = 0
    const missing = await readMonthlyStrOrUnavailable(
      { ...scope, periodStart: null },
      async () => { calls += 1; return payload() },
    )
    expect(missing.unavailable).toBe(true)
    expect(calls).toBe(0)
    const failed = await readMonthlyStrOrUnavailable(scope, async () => { throw new Error('rpc') })
    expect(failed.unavailable).toBe(true)
  })

  test('attaching the table leaves the certified closing unchanged and does not add the total again', () => {
    const admitted = admitCertifiedStrMonthly(payload(), scope)
    const before = composeCertifiedClientAccount(account())
    const after = composeCertifiedClientAccount(account({
      certifiedStrMonthlyByPropertyKey: { [NEER]: admitted },
    }))
    expect(before.closingDueToJj).toBe(48901.54)
    expect(after.closingDueToJj).toBe(48901.54)
    expect(after.properties[0].amountDueToJj).toBe(before.properties[0].amountDueToJj)
    expect(after.properties[0].certifiedMonthlyStr?.arithmeticEffectOnCertifiedClosing).toBe(0)
    const text = clientAccountPlainText(after)
    expect(text).toContain('€947.25')
    expect(text).toContain('€1,525.77')
    expect(text).toContain('€961.96')
    expect(text.match(/€3,434\.98/g)).toHaveLength(1)
    expect(text).not.toContain('partial')
    expect(text).not.toContain('approved_reconstruction')
    expect(internalLeakHits(text)).toEqual([])
    expect(text).not.toMatch(/guest|60946949/i)
  })

  test('an uncertified client and Duplex do not gain a monthly table', () => {
    const plain = composeCertifiedClientAccount(account())
    expect(plain.properties[0].certifiedMonthlyStr).toBeNull()
    const duplex = composeCertifiedClientAccount(account({
      lines: [
        ...account().lines,
        {
          lineOrder: 2,
          propertyKey: DUPLEX,
          propertyName: 'Uriel Duplex',
          amountDueToJj: -6983.1,
          evidenceRef: 'sample',
          metadata: { str_credit: 6983.1 },
        },
      ],
      openingDueToJj: 41918.44,
      closingDueToJj: 41918.44,
      certifiedStrMonthlyByPropertyKey: {
        [DUPLEX]: { unavailable: true, reason: 'no_applied_certification', entityId: ENTITY, propertyId: DUPLEX, propertyName: 'Uriel Duplex', periodStart: '2026-06-01', periodEnd: '2026-08-31', arithmeticEffectOnCertifiedClosing: 0 },
      },
    }))
    const duplexProperty = duplex.properties.find((property) => property.propertyName === 'Uriel Duplex')
    expect(duplexProperty?.certifiedMonthlyStr).toBeNull()
    expect(clientAccountPlainText(duplex)).not.toContain('259.02')
  })

  test('browser report files do not import the service-role client', () => {
    const root = path.join(__dirname, '..')
    const pdf = fs.readFileSync(path.join(root, '../../pdf/ClientAccountPdf.tsx'), 'utf8')
    const compose = fs.readFileSync(path.join(root, 'composeCertifiedAccount.ts'), 'utf8')
    const presentation = fs.readFileSync(path.join(root, 'presentation.ts'), 'utf8')
    for (const source of [pdf, compose, presentation]) {
      expect(source).not.toContain('createServiceClient')
      expect(source).not.toContain('service_role')
      expect(source).not.toContain('server-only')
    }
  })
})
