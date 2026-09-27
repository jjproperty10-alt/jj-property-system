import { URIEL_SHAPED_CERTIFIED } from '../../../finance/__fixtures__/certifiedClientSettlement'
import type { CertifiedClientSettlementDto } from '../../../finance/certifiedClientSettlementTypes'
import { compositionFromCertifiedSettlement, toLedgerRow, type RawTransactionRow } from '../certifiedSource'

function raw(partial: Partial<RawTransactionRow> & Pick<RawTransactionRow, 'id'>): RawTransactionRow {
  return {
    date: '2026-02-01',
    property_name: 'Property A',
    category: 'Management',
    subcategory: 'Repairs',
    description: 'תיקון',
    payer: 'Anastasia',
    payee: 'company',
    amount_eur: 10,
    client_charge: null,
    review_status: 'active',
    is_deleted: false,
    ...partial,
  }
}

describe('certified source mapping', () => {
  test('an unavailable certification is a blocked source, not an empty account', () => {
    const settlement: CertifiedClientSettlementDto = {
      unavailable: true,
      reason: 'no_applied_certification',
      entityId: '00000000-0000-4000-8000-000000000001',
      asOf: '2026-08-31',
    }
    expect(compositionFromCertifiedSettlement({ settlement, rows: [], clientDisplayName: 'לקוח', reportTitle: 'דוח' }))
      .toEqual({ status: 'blocked', code: 'NO_CERTIFIED_SOURCE', reason: 'no_applied_certification' })
  })

  test('certified lines, credits and rows map to the composition without changing any amount', () => {
    const result = compositionFromCertifiedSettlement({
      settlement: URIEL_SHAPED_CERTIFIED,
      rows: [
        raw({ id: 'a', amount_eur: '12.50', client_charge: '15.00' }),
        raw({ id: 'outside', property_name: 'Somewhere Else' }),
      ],
      clientDisplayName: 'לקוח',
      reportTitle: 'דוח',
      reportType: 'period_account',
      period: { start: '2026-01-01', end: '2026-08-31' },
    })
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    expect(result.input.openingDueToJj).toBe(URIEL_SHAPED_CERTIFIED.openingDueToJj)
    expect(result.input.closingDueToJj).toBe(URIEL_SHAPED_CERTIFIED.closingDueToJj)
    expect(result.input.lines.map((line) => line.amountDueToJj)).toEqual(URIEL_SHAPED_CERTIFIED.propertyLines.map((line) => line.amountDueToJj))
    expect(result.input.credits.map((credit) => credit.amount)).toEqual(URIEL_SHAPED_CERTIFIED.fifoCredits.map((credit) => credit.settlementAmount))
    expect(result.input.rows).toHaveLength(1)
    expect(result.input.rows[0]).toMatchObject({ id: 'a', amountEur: 12.5, clientCharge: 15 })
    expect(result.input.reportType).toBe('period_account')
    expect(result.input.currency).toBe('EUR')
    expect(result.input.clientId).toBe(URIEL_SHAPED_CERTIFIED.entityId)
  })

  test('a non-numeric amount blocks instead of becoming zero', () => {
    expect(() => toLedgerRow(raw({ id: 'bad', amount_eur: 'n/a' }))).toThrow(/not numeric/)
    expect(() => toLedgerRow(raw({ id: 'bad2', client_charge: 'x' }))).toThrow(/client charge is not numeric/)
    const result = compositionFromCertifiedSettlement({
      settlement: URIEL_SHAPED_CERTIFIED,
      rows: [raw({ id: 'bad', amount_eur: 'n/a' })],
      clientDisplayName: 'לקוח',
      reportTitle: 'דוח',
    })
    expect(result.status).toBe('blocked')
  })
})
