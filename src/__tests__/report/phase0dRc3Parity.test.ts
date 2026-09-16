import { readFileSync } from 'fs'
import path from 'path'
import { computeNetOwnerBalance, filterOwnerFacingSections } from '@/lib/report/executiveSummary'
import { getOwnerClientReport } from '@/lib/report/ownerClientReport'
import { buildAccountSection } from '@/lib/report/computeBalance'
import { splitOperatingIncome } from '@/lib/report/statementPresentation'
import type { RC3PropertyReport, RC3Row } from '@/lib/report/types'

function tx(over: Partial<RC3Row>): RC3Row {
  return {
    id: over.id ?? '1',
    date: over.date ?? '2026-06-01',
    property_name: over.property_name ?? 'Villa Mazotos',
    reporting_name: over.reporting_name ?? over.property_name ?? 'Villa Mazotos',
    category: over.category ?? 'Management',
    subcategory: over.subcategory ?? 'Other',
    description: over.description ?? null,
    payer: over.payer ?? 'JJ',
    payee: over.payee ?? 'Supplier',
    amount_eur: over.amount_eur ?? 0,
    client_charge: over.client_charge ?? null,
    client_amount: over.client_amount ?? (over.client_charge ?? over.amount_eur ?? 0),
    notes: null,
    k_note: null,
    account_type: over.account_type ?? 'rental',
    is_contract_value: over.is_contract_value ?? false,
    is_platform_tracking: over.is_platform_tracking ?? false,
    is_bpo: over.is_bpo ?? false,
    review_status: over.review_status ?? 'active',
    ...over,
  }
}

describe('Phase 0D RC3 consumer parity / unchanged engines', () => {
  it('Purchase/Sale direction remains unchanged (contract is reference)', () => {
    const purchase = buildAccountSection('purchase', [
      tx({
        id: 'p1', category: 'Purchase', subcategory: 'Purchase Contract',
        account_type: 'purchase', is_contract_value: true, amount_eur: 200000, client_amount: 200000,
      }),
    ], 0)
    expect(purchase.rows.find(r => r.is_contract_value)?.balance_effect).toBe(0)

    const sale = buildAccountSection('sale', [
      tx({
        id: 's1', category: 'Sale', subcategory: 'Sale Contract',
        account_type: 'sale', is_contract_value: true, amount_eur: 300000, client_amount: 300000,
      }),
    ], 0)
    expect(sale.rows.find(r => r.is_contract_value)?.balance_effect).toBe(0)
  })

  it('billing-only fixtures remain present after filtering (amount 0, charge > 0)', () => {
    const section = buildAccountSection('airbnb', [
      tx({
        id: 'bill', category: 'Airbnb', subcategory: 'Software/Hostaway',
        account_type: 'airbnb', amount_eur: 0, client_charge: 40, client_amount: 40,
      }),
    ], 0)
    expect(section.rows).toHaveLength(1)
    expect(section.rows[0].client_amount).toBe(40)
    expect(section.rows[0].amount_eur).toBe(0)
  })

  it('Client Report screen net equals owner PDF net (same composer)', () => {
    const rental = buildAccountSection('rental', [
      tx({ id: 'rent', subcategory: 'Tenant Payment', amount_eur: 1000, client_amount: 1000, account_type: 'rental' }),
    ], 0)
    const purchase = buildAccountSection('purchase', [
      tx({
        id: 'p1', category: 'Purchase', subcategory: 'Purchase Contract',
        account_type: 'purchase', is_contract_value: true, amount_eur: 200000, client_amount: 200000,
      }),
    ], 0)
    const report = {
      reporting_name: 'Villa Mazotos',
      from_date: null,
      to_date: null,
      accounts: [rental, purchase],
    } as RC3PropertyReport
    const screen = computeNetOwnerBalance(filterOwnerFacingSections(report.accounts))
    const pdf = getOwnerClientReport(report).overallNet
    expect(screen).toBe(pdf)
    expect(screen).toBe(rental.closing_balance)
  })

  it('Owner Room uses the same owner-facing net as the settlement PDF', () => {
    const airbnb = buildAccountSection('airbnb', [
      tx({
        id: 'pi', category: 'Airbnb', subcategory: 'Platform Income',
        account_type: 'airbnb', amount_eur: 500, client_amount: 500,
      }),
    ], 0)
    const report = {
      reporting_name: 'Orit Rob Pingodes',
      from_date: null,
      to_date: null,
      accounts: [airbnb],
    } as RC3PropertyReport
    expect(getOwnerClientReport(report).overallNet).toBe(computeNetOwnerBalance(filterOwnerFacingSections(report.accounts)))
  })

  it('reversal of an expense stays in the expense bucket (unchanged rebook semantics)', () => {
    const original = tx({
      id: 'e1', subcategory: 'Electricity', amount_eur: 181.79, client_amount: 181.79, account_type: 'rental',
    })
    const reversal = tx({
      id: 'e1-rev', subcategory: 'Electricity', amount_eur: -181.79, client_amount: -181.79, account_type: 'rental',
    })
    const s = buildAccountSection('rental', [original, reversal], 0)
    expect(s.total_income).toBe(0)
    expect(s.closing_balance).toBe(0)
  })

  it('cross-property Client Payment remains a settlement split, not rent', () => {
    const rows = [
      { subcategory: 'Tenant Payment', display_group: 'income' as const },
      { subcategory: 'Client Payment', display_group: 'income' as const },
    ]
    const split = splitOperatingIncome(rows)
    expect(split.income.map(r => r.subcategory)).toEqual(['Tenant Payment'])
    expect(split.settlements.map(r => r.subcategory)).toEqual(['Client Payment'])
  })
})

describe('Phase 0D does not rewrite computeBalance settlement offsets', () => {
  it('computeBalance source is unchanged by the certified predicate', () => {
    const src = readFileSync(path.join(__dirname, '..', '..', 'lib', 'report', 'computeBalance.ts'), 'utf8')
    expect(src).not.toMatch(/is_deleted/)
    expect(src).not.toMatch(/transaction_exclusions/)
    expect(src).toMatch(/is_contract_value/)
  })
})
