/**
 * P2 — Sale presented as Property Purchase
 *
 * Internal account_type remains 'sale'. Client-facing section labels must
 * read "Property Purchase / רכישת הנכס", never "Property Sale / מכירת נכס".
 */
import { buildAccountSection } from '@/lib/report/computeBalance'
import { toClientReport } from '@/lib/report/clientReportDto'
import { buildRowLabel, t, ACCOUNT_LABEL_EN, ACCOUNT_LABEL_HE } from '@/lib/report/labels'
import { toClientRow } from '@/lib/report/clientRow'
import type { RC3Row, RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

function mkSaleRow(overrides: Partial<RC3Row> = {}): RC3Row {
  return {
    id: 'sale-row-1',
    date: '2026-01-10',
    property_name: 'Oshrit Deklia',
    reporting_name: 'Oshrit Deklia',
    category: 'Sale',
    subcategory: 'Sale Contract',
    description: null,
    payer: null,
    payee: null,
    amount_eur: 210000,
    client_charge: null,
    client_amount: 210000,
    notes: null,
    k_note: null,
    account_type: 'sale',
    is_contract_value: true,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    ...overrides,
  }
}

function mkSaleSection(): RC3AccountSection {
  return buildAccountSection('sale', [mkSaleRow()], 0)
}

function mkReport(section: RC3AccountSection): RC3PropertyReport {
  return {
    reporting_name: 'Oshrit Deklia',
    from_date: null,
    to_date: null,
    generated_at: '2026-09-03T10:00:00Z',
    accounts: [section],
    has_purchase: false,
    has_sale: true,
    has_renovation: false,
    has_rental: false,
    has_airbnb: false,
  }
}

describe('P2 — Sale presented as Property Purchase', () => {
  test('buildAccountSection sets sale account_label to Property Purchase', () => {
    const section = mkSaleSection()
    expect(section.account_type).toBe('sale')
    expect(section.account_label).toBe('Property Purchase')
    expect(section.account_label_he).toBe('רכישת הנכס')
  })

  test('client DTO carries Property Purchase for sale section', () => {
    const dto = toClientReport(mkReport(mkSaleSection()))
    const sale = dto.accounts.find(a => a.account_type === 'sale')!
    expect(sale.account_label).toBe('Property Purchase')
    expect(sale.account_label_he).toBe('רכישת הנכס')
  })

  test('labels.ts account keys match Property Purchase', () => {
    expect(t('accountSale', 'en')).toBe('Property Purchase')
    expect(t('accountSale', 'he')).toBe('רכישת הנכס')
    expect(ACCOUNT_LABEL_EN.sale).toBe('Property Purchase')
    expect(ACCOUNT_LABEL_HE.sale).toBe('רכישת הנכס')
  })

  test('forbidden sale wording absent from client-facing labels', () => {
    const section = mkSaleSection()
    const dto = toClientReport(mkReport(section))
    const serialized = JSON.stringify(dto)
    expect(serialized).not.toContain('Property Sale')
    expect(serialized).not.toContain('מכירת נכס')
  })

  test('Sale Contract row label uses Purchase Contract reference wording', () => {
    const section = mkSaleSection()
    const row = toClientRow(section.rows[0])
    expect(buildRowLabel(row, 'en')).toBe('Purchase Contract (Reference)')
    expect(buildRowLabel(row, 'he')).toBe('חוזה רכישה (לעיון)')
  })
})
