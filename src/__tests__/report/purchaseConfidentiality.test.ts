/**
 * P1 — Purchase Confidentiality Enforcement
 *
 * Internal Purchase (account_type = 'purchase') is JJ acquisition cost and
 * MUST NEVER appear in any client-facing output: DTO, screen, PDF, totals.
 * Sale (account_type = 'sale') is the client's Property Purchase account and
 * MUST remain present, displayed as "Property Purchase".
 *
 * Fixtures deliberately include both account_type = 'purchase' and 'sale' to
 * prove they are not confused despite overlapping client-facing terminology.
 */
import { toClientReport } from '@/lib/report/clientReportDto'
import { partitionReportAccounts } from '@/lib/report/reportAccountPartition'
import { filterOwnerFacingSections } from '@/lib/report/executiveSummary'
import { ACCOUNT_LABEL_EN } from '@/lib/report/labels'
import type {
  RC3PropertyReport,
  RC3AccountSection,
  RC3AccountRow,
  RC3AccountType,
  BalanceConvention,
  DisplayGroup,
} from '@/lib/report/types'

function mkRow(overrides: Partial<RC3AccountRow> = {}): RC3AccountRow {
  return {
    id: overrides.id ?? 'row-' + Math.random().toString(36).slice(2),
    date: '2026-01-15',
    property_name: 'Test Property',
    reporting_name: 'Test Property',
    category: overrides.category ?? 'Sale',
    subcategory: overrides.subcategory ?? 'Client Payment',
    description: 'INTERNAL_DESCRIPTION',
    payer: 'INTERNAL_PAYER',
    payee: 'INTERNAL_PAYEE',
    amount_eur: 50000,
    client_charge: null,
    client_amount: overrides.client_amount ?? 50000,
    notes: 'INTERNAL_NOTES',
    k_note: null,
    account_type: overrides.account_type ?? 'sale',
    is_contract_value: overrides.is_contract_value ?? false,
    is_platform_tracking: false,
    is_bpo: false,
    review_status: 'active',
    balance_effect: overrides.balance_effect ?? -50000,
    is_balance_affecting: true,
    display_group: (overrides.display_group ?? 'income') as DisplayGroup,
    display_label: overrides.display_label ?? 'Payment Received',
  }
}

function mkSection(overrides: Partial<RC3AccountSection> & { account_type: RC3AccountType }): RC3AccountSection {
  return {
    account_type: overrides.account_type,
    account_label: overrides.account_label ?? overrides.account_type,
    account_label_he: overrides.account_label_he ?? overrides.account_type,
    balance_convention: (overrides.balance_convention ?? 'client_debt') as BalanceConvention,
    opening_balance: 0,
    rows: overrides.rows ?? [mkRow({ account_type: overrides.account_type })],
    contract_baseline: overrides.contract_baseline ?? 0,
    total_income: overrides.total_income ?? 0,
    total_expenses: overrides.total_expenses ?? 0,
    total_bpo: 0,
    closing_balance: overrides.closing_balance ?? 0,
  }
}

function mkReport(accounts: RC3AccountSection[]): RC3PropertyReport {
  return {
    reporting_name: 'Test Property',
    from_date: null,
    to_date: null,
    generated_at: '2026-09-03T10:00:00Z',
    accounts,
    has_purchase: accounts.some(a => a.account_type === 'purchase'),
    has_sale: accounts.some(a => a.account_type === 'sale'),
    has_renovation: accounts.some(a => a.account_type === 'renovation'),
    has_rental: accounts.some(a => a.account_type === 'rental'),
    has_airbnb: accounts.some(a => a.account_type === 'airbnb'),
  }
}

const PURCHASE_SECTION = mkSection({
  account_type: 'purchase',
  account_label: 'Property Purchase',
  closing_balance: 75000,
  contract_baseline: 120000,
  total_income: 5000,
  total_expenses: 50000,
  rows: [
    mkRow({ account_type: 'purchase', category: 'Purchase', subcategory: 'Purchase Contract', client_amount: 120000, balance_effect: 0, is_contract_value: true, display_group: 'reference', display_label: 'Purchase Contract' }),
    mkRow({ account_type: 'purchase', category: 'Purchase', subcategory: 'Purchase Deposit', client_amount: 10000, balance_effect: -10000, display_group: 'income', display_label: 'Deposit Payment' }),
  ],
})

const SALE_SECTION = mkSection({
  account_type: 'sale',
  account_label: 'Property Sale',
  closing_balance: 58824,
  contract_baseline: 210000,
  total_income: 5600,
  total_expenses: 156776,
  rows: [
    mkRow({ account_type: 'sale', category: 'Sale', subcategory: 'Sale Contract', client_amount: 210000, balance_effect: 0, is_contract_value: true, display_group: 'reference', display_label: 'Sale Contract (Reference)' }),
    mkRow({ account_type: 'sale', category: 'Sale', subcategory: 'Client Payment', client_amount: 50000, balance_effect: -50000, display_group: 'income', display_label: 'Payment Received' }),
  ],
})

const RENTAL_SECTION = mkSection({
  account_type: 'rental',
  balance_convention: 'owner_credit',
  closing_balance: 1500,
  total_income: 3000,
  total_expenses: 1500,
})

const MIXED_REPORT = mkReport([PURCHASE_SECTION, SALE_SECTION, RENTAL_SECTION])

describe('P1 — Purchase Confidentiality Enforcement', () => {

  describe('DTO boundary (toClientReport)', () => {
    const dto = toClientReport(MIXED_REPORT)

    test('client DTO contains Sale (displayed as Property Purchase)', () => {
      expect(dto.accounts.some(a => a.account_type === 'sale')).toBe(true)
    })

    test('client DTO contains NO internal Purchase', () => {
      expect(dto.accounts.some(a => a.account_type === 'purchase')).toBe(false)
    })

    test('has_purchase is always false in client DTO', () => {
      expect(dto.has_purchase).toBe(false)
    })

    test('has_sale reflects actual Sale presence', () => {
      expect(dto.has_sale).toBe(true)
    })

    test('no internal Purchase row data is serialized', () => {
      const serialized = JSON.stringify(dto)
      expect(serialized).not.toContain('"purchase"')
      expect(serialized).not.toContain('Purchase Contract')
      expect(serialized).not.toContain('Purchase Deposit')
      expect(serialized).not.toContain('Deposit Payment')
    })

    test('Sale rows are preserved in DTO', () => {
      const saleSection = dto.accounts.find(a => a.account_type === 'sale')!
      expect(saleSection.rows).toHaveLength(2)
      expect(saleSection.closing_balance).toBe(58824)
      expect(saleSection.contract_baseline).toBe(210000)
    })

    test('Purchase does not affect client totals', () => {
      const dtoNet = dto.accounts.reduce((sum, a) => {
        return sum + (a.balance_convention === 'owner_credit' ? a.closing_balance : -a.closing_balance)
      }, 0)
      const expectedNet = -58824 + 1500
      expect(dtoNet).toBeCloseTo(expectedNet, 2)
    })

    test('internal fields are not present in DTO rows', () => {
      for (const acc of dto.accounts) {
        for (const row of acc.rows) {
          expect(Object.prototype.hasOwnProperty.call(row, 'payer')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(row, 'payee')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(row, 'amount_eur')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(row, 'description')).toBe(false)
          expect(Object.prototype.hasOwnProperty.call(row, 'category')).toBe(false)
        }
      }
    })
  })

  describe('Screen partition (displayAccounts)', () => {
    test('full-mode displayAccounts contains Sale, excludes Purchase', () => {
      const { displayAccounts } = partitionReportAccounts(MIXED_REPORT.accounts, 'full')
      expect(displayAccounts.some(a => a.account_type === 'sale')).toBe(true)
      expect(displayAccounts.some(a => a.account_type === 'rental')).toBe(true)
      expect(displayAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    })

    test('periodic-mode displayAccounts excludes both Purchase and Sale', () => {
      const { displayAccounts } = partitionReportAccounts(MIXED_REPORT.accounts, 'periodic')
      expect(displayAccounts.some(a => a.account_type === 'purchase')).toBe(false)
      expect(displayAccounts.some(a => a.account_type === 'sale')).toBe(false)
      expect(displayAccounts.some(a => a.account_type === 'rental')).toBe(true)
    })

    test('summaryAccounts also excludes Purchase', () => {
      const { summaryAccounts } = partitionReportAccounts(MIXED_REPORT.accounts, 'full')
      expect(summaryAccounts.some(a => a.account_type === 'purchase')).toBe(false)
      expect(summaryAccounts.some(a => a.account_type === 'sale')).toBe(true)
    })
  })

  describe('Sale label is "Property Purchase" (not confused with internal Purchase)', () => {
    test('ACCOUNT_LABEL_EN maps sale to Property Purchase', () => {
      expect(ACCOUNT_LABEL_EN['sale']).toBe('Property Purchase')
    })

    test('Sale section in DTO retains its account_type as sale', () => {
      const dto = toClientReport(MIXED_REPORT)
      const saleSection = dto.accounts.find(a => a.account_type === 'sale')
      expect(saleSection).toBeDefined()
      expect(saleSection!.account_type).toBe('sale')
    })
  })

  describe('PDF path (filterOwnerFacingSections)', () => {
    test('filterOwnerFacingSections excludes Purchase, retains Sale', () => {
      const filtered = filterOwnerFacingSections(MIXED_REPORT.accounts)
      expect(filtered.some(a => a.account_type === 'purchase')).toBe(false)
      expect(filtered.some(a => a.account_type === 'sale')).toBe(true)
      expect(filtered.some(a => a.account_type === 'rental')).toBe(true)
    })
  })

  describe('Edge cases', () => {
    test('report with ONLY Purchase produces empty client DTO accounts', () => {
      const purchaseOnly = mkReport([PURCHASE_SECTION])
      const dto = toClientReport(purchaseOnly)
      expect(dto.accounts).toHaveLength(0)
      expect(dto.has_purchase).toBe(false)
    })

    test('report with no Purchase passes through unchanged', () => {
      const noPurchase = mkReport([SALE_SECTION, RENTAL_SECTION])
      const dto = toClientReport(noPurchase)
      expect(dto.accounts).toHaveLength(2)
      expect(dto.accounts.map(a => a.account_type).sort()).toEqual(['rental', 'sale'])
    })
  })
})
