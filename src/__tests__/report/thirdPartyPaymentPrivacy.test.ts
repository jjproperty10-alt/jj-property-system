/**
 * P3 / P3b — Third-Party Payment Privacy
 *
 * Sale / Third-Party Payment rows represent money the client paid toward
 * buying the property. The client-facing label must be neutral and must
 * not expose "seller", "Owner", "Jacob", bank-routing, or internal
 * recipient information.
 *
 * English: "Payment toward property purchase"
 * Hebrew:  "תשלום עבור רכישת הנכס"
 *
 * P3:  labels.ts presentation wording
 * P3b: browser DTO sanitization at toClientReport boundary
 */
import { buildRowLabel, t, DISPLAY_LABEL_OVERRIDES } from '@/lib/report/labels'
import { buildAccountSection } from '@/lib/report/computeBalance'
import { toClientReport } from '@/lib/report/clientReportDto'
import type { RC3Row, RC3PropertyReport, DisplayGroup } from '@/lib/report/types'
import type { ClientDisplayRow } from '@/lib/report/clientRow'

function mkSaleRow(overrides: Partial<RC3Row> = {}): RC3Row {
  return {
    id: 'tp-row-1',
    date: '2026-03-15',
    property_name: 'Oshrit Deklia',
    reporting_name: 'Oshrit Deklia',
    category: 'Sale',
    subcategory: 'Third-Party Payment',
    description: 'Bank transfer to seller CONFIDENTIAL',
    payer: 'Oshrit',
    payee: 'Jacob',
    amount_eur: 49900,
    client_charge: null,
    client_amount: 49900,
    notes: null,
    k_note: null,
    account_type: 'sale',
    is_contract_value: false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    ...overrides,
  }
}

function mkDisplayRow(overrides: Partial<ClientDisplayRow> = {}): ClientDisplayRow {
  return {
    id: 'tp-row-1',
    date: '2026-03-15',
    client_amount: 49900,
    account_type: 'sale',
    subcategory: 'Third-Party Payment',
    display_group: 'income' as DisplayGroup,
    display_label: 'Third-Party Payment (Bank Transfer to Seller)',
    ...overrides,
  }
}

function mkThirdPartyReport(): RC3PropertyReport {
  const section = buildAccountSection('sale', [mkSaleRow({
    id: 'oshrit-tp-49900',
    client_amount: 49900,
    date: '2026-03-15',
    description: 'Bank transfer to seller CONFIDENTIAL',
    payer: 'Oshrit',
    payee: 'Jacob',
  })], 0)
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

describe('P3 — Third-Party Payment Privacy', () => {

  describe('Label values', () => {
    test('English label is "Payment toward property purchase"', () => {
      expect(t('rowDirectSeller', 'en')).toBe('Payment toward property purchase')
    })

    test('Hebrew label is "תשלום עבור רכישת הנכס"', () => {
      expect(t('rowDirectSeller', 'he')).toBe('תשלום עבור רכישת הנכס')
    })

    test('DISPLAY_LABEL_OVERRIDES maps to neutral wording', () => {
      expect(DISPLAY_LABEL_OVERRIDES['Third-Party Payment (Bank Transfer to Seller)'])
        .toBe('Payment toward property purchase')
    })
  })

  describe('buildRowLabel produces neutral output', () => {
    test('English output for Third-Party Payment row', () => {
      const label = buildRowLabel(mkDisplayRow(), 'en')
      expect(label).toBe('Payment toward property purchase')
    })

    test('Hebrew output for Third-Party Payment row', () => {
      const label = buildRowLabel(mkDisplayRow(), 'he')
      expect(label).toBe('תשלום עבור רכישת הנכס')
    })
  })

  describe('Forbidden terms absent from client output', () => {
    const enLabel = buildRowLabel(mkDisplayRow(), 'en')
    const heLabel = buildRowLabel(mkDisplayRow(), 'he')

    test.each([
      'seller', 'Seller', 'Direct Payment to Seller',
      'Owner', 'Jacob', 'תשלום ישיר למוכר',
    ])('client label does not contain "%s"', (forbidden) => {
      expect(enLabel).not.toContain(forbidden)
      expect(heLabel).not.toContain(forbidden)
    })
  })

  describe('Balance effect unchanged', () => {
    test('Third-Party Payment still reduces client debt (negative balance_effect)', () => {
      const row = mkSaleRow({ client_amount: 49900 })
      const section = buildAccountSection('sale', [row], 0)
      const enriched = section.rows[0]
      expect(enriched.balance_effect).toBe(-49900)
      expect(enriched.is_balance_affecting).toBe(true)
      expect(enriched.display_group).toBe('income')
    })

    test('amount and date are preserved through classification', () => {
      const row = mkSaleRow({ client_amount: 128100, date: '2026-05-20' })
      const section = buildAccountSection('sale', [row], 0)
      const enriched = section.rows[0]
      expect(enriched.client_amount).toBe(128100)
      expect(enriched.date).toBe('2026-05-20')
    })
  })

  describe('Other payment labels remain unchanged', () => {
    test('Client Payment label is still "Client Payment"', () => {
      const row = mkDisplayRow({
        subcategory: 'Client Payment',
        display_label: 'Payment Received',
        display_group: 'income' as DisplayGroup,
      })
      expect(buildRowLabel(row, 'en')).toBe('Client Payment')
    })

    test('Bank Payment to Owner label is still "Transfer to Owner"', () => {
      const row = mkDisplayRow({
        subcategory: 'Bank Payment to Owner',
        display_label: 'BPO',
        display_group: 'payment_out' as DisplayGroup,
      })
      expect(buildRowLabel(row, 'en')).toBe('Transfer to Owner')
    })
  })

  describe('Screen and PDF use the same label source', () => {
    test('buildRowLabel is the single label resolver for both screen and PDF', () => {
      const row = mkDisplayRow()
      const en = buildRowLabel(row, 'en')
      const he = buildRowLabel(row, 'he')
      expect(en).toBe('Payment toward property purchase')
      expect(he).toBe('תשלום עבור רכישת הנכס')
    })
  })
})

describe('P3b — ClientReport DTO sanitization', () => {
  const dto = toClientReport(mkThirdPartyReport())
  const row = dto.accounts.find(a => a.account_type === 'sale')!.rows[0]
  const serialized = JSON.stringify(dto)

  test('A. serialized DTO does not contain internal terminology', () => {
    for (const forbidden of [
      'Third-Party Payment',
      'Third-Party Payment (Bank Transfer to Seller)',
      'Seller',
      'seller',
      'Direct Payment to Seller',
      'Owner',
      'Jacob',
      'תשלום ישיר למוכר',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  test('B. serialized row contains client-safe wording', () => {
    expect(row.display_label).toBe('Payment toward property purchase')
    expect(row.subcategory).toBe('Payment toward property purchase')
    expect(serialized).toContain('Payment toward property purchase')
  })

  test('C. financial and structural fields are unchanged', () => {
    expect(row.date).toBe('2026-03-15')
    expect(row.client_amount).toBe(49900)
    expect(row.balance_effect).toBe(-49900)
    expect(row.account_type).toBe('sale')
    expect(row.display_group).toBe('income')
    expect(row.is_balance_affecting).toBe(true)
  })

  test('D. buildRowLabel on sanitized DTO row returns EN and HE', () => {
    const displayRow: ClientDisplayRow = {
      id: row.id,
      date: row.date,
      client_amount: row.client_amount,
      display_group: row.display_group,
      display_label: row.display_label,
      account_type: row.account_type,
      subcategory: row.subcategory,
    }
    expect(buildRowLabel(displayRow, 'en')).toBe('Payment toward property purchase')
    expect(buildRowLabel(displayRow, 'he')).toBe('תשלום עבור רכישת הנכס')
  })

  test('E. other Sale payment labels remain unchanged through DTO', () => {
    const clientPay = buildAccountSection('sale', [mkSaleRow({
      id: 'cp-1',
      subcategory: 'Client Payment',
      client_amount: 10000,
      description: null,
      payer: 'Client',
      payee: 'JJ',
    })], 0)
    const report: RC3PropertyReport = {
      reporting_name: 'Oshrit Deklia',
      from_date: null, to_date: null, generated_at: '2026-09-03T10:00:00Z',
      accounts: [clientPay],
      has_purchase: false, has_sale: true, has_renovation: false, has_rental: false, has_airbnb: false,
    }
    const cpDto = toClientReport(report)
    const cpRow = cpDto.accounts[0].rows[0]
    expect(cpRow.subcategory).toBe('Client Payment')
    expect(cpRow.display_label).toBe('Payment Received')
    expect(buildRowLabel({
      id: cpRow.id, date: cpRow.date, client_amount: cpRow.client_amount,
      display_group: cpRow.display_group, display_label: cpRow.display_label,
      account_type: cpRow.account_type, subcategory: cpRow.subcategory,
    }, 'en')).toBe('Client Payment')

    expect(buildRowLabel(mkDisplayRow({
      subcategory: 'Bank Payment to Owner',
      display_label: 'BPO',
      display_group: 'payment_out' as DisplayGroup,
    }), 'en')).toBe('Transfer to Owner')
    expect(buildRowLabel(mkDisplayRow({
      subcategory: 'Client Sale Expenses',
      display_label: 'Client Sale Expenses',
      display_group: 'expense' as DisplayGroup,
    }), 'en')).toBe('Purchase Expense')
  })

  test('raw server section still carries internal display_label (PDF path)', () => {
    const section = buildAccountSection('sale', [mkSaleRow()], 0)
    expect(section.rows[0].subcategory).toBe('Third-Party Payment')
    expect(section.rows[0].display_label).toBe('Third-Party Payment (Bank Transfer to Seller)')
  })
})
