/**
 * P-UI-504d — Client Report Privacy & Summary Alignment (pure-function proofs).
 *
 * Business rule (Yossi, supersedes 504b): `purchase` = JJ-internal acquisition and
 * is COMPLETELY HIDDEN from the client report (UI + PDF), including drill-down and
 * ALL summaries. The bottom settlement summary must reconcile to the SAME canonical
 * owner-facing net as the header (value + debt direction), and Payments/Expenses
 * components must reference client accounts only.
 *
 * These are node/pure proofs of the deterministic inputs the UI and PDF consume.
 * They do NOT touch RC3/computeBalance, the DB, or transactions. The €-figures are
 * built from account fixtures (never hardcoded into product code) and reproduce the
 * Neer Yoav Dekelia discrepancy so the root cause is verified, not patched over.
 */
import { getOwnerClientReport } from '@/lib/report/ownerClientReport'
import { computeNetOwnerBalance, filterOwnerFacingSections } from '@/lib/report/executiveSummary'
import { computeStatementComponents } from '@/lib/report/statementPresentation'
import { partitionReportAccounts } from '@/lib/report/reportAccountPartition'
import { shouldShowElectricitySubmeterNote, VERIFIED_ELECTRICITY_SUBMETER_PROPERTY_IDS } from '@/lib/report/electricitySubmeterNote'
import type { RC3PropertyReport, RC3AccountSection, RC3AccountType, BalanceConvention, DisplayGroup } from '@/lib/report/types'

type RowSpec = { subcategory: string | null; display_group: DisplayGroup; client_amount: number; balance_effect?: number }

function section(opts: {
  account_type: RC3AccountType
  balance_convention: BalanceConvention
  closing_balance: number
  contract_baseline?: number
  total_income?: number
  total_expenses?: number
  total_bpo?: number
  rows?: RowSpec[]
}): RC3AccountSection {
  const rows = (opts.rows ?? []).map((r, i) => ({
    id: `${opts.account_type}-${i}`,
    date: '2026-01-01',
    subcategory: r.subcategory,
    display_group: r.display_group,
    display_label: r.subcategory ?? '',
    client_amount: r.client_amount,
    balance_effect: r.balance_effect ?? r.client_amount,
  }))
  return {
    account_type: opts.account_type,
    account_label: opts.account_type,
    account_label_he: opts.account_type,
    balance_convention: opts.balance_convention,
    opening_balance: 0,
    rows,
    contract_baseline: opts.contract_baseline ?? 0,
    total_income: opts.total_income ?? 0,
    total_expenses: opts.total_expenses ?? 0,
    total_bpo: opts.total_bpo ?? 0,
    closing_balance: opts.closing_balance,
  } as unknown as RC3AccountSection
}

function report(name: string, accounts: RC3AccountSection[]): RC3PropertyReport {
  return {
    reporting_name: name,
    from_date: null,
    to_date: null,
    generated_at: '2026-01-01T00:00:00Z',
    accounts,
    has_purchase: accounts.some(a => a.account_type === 'purchase'),
    has_sale: accounts.some(a => a.account_type === 'sale'),
    has_renovation: accounts.some(a => a.account_type === 'renovation'),
    has_rental: accounts.some(a => a.account_type === 'rental'),
    has_airbnb: accounts.some(a => a.account_type === 'airbnb'),
  } as unknown as RC3PropertyReport
}

// computeDashboard net is a LOCAL fn in page.tsx AND the PDF; both sum closing_balance
// by convention. Mirror it here so we can assert UI-summary/PDF-summary == header.
function dashboardNet(accounts: RC3AccountSection[]): number {
  let net = 0
  for (const a of accounts) {
    if (a.balance_convention === 'owner_credit') net += a.closing_balance
    else net -= a.closing_balance
  }
  return net
}

// ── Neer Yoav Dekelia reproduction ───────────────────────────────────────────
// Client sale: contract 220,000; nine client payments 161,176; deal balance 58,824.
// Operational (rental) expenses 1,596.36 → total client debt 60,420.36.
// JJ purchase (internal): contract+payments 172,500; expenses 4,525; closing 4,525.
function neer(purchaseOverrides?: { payments?: number; expenses?: number; closing?: number; contract?: number }): RC3PropertyReport {
  const p = { payments: 172500, expenses: 4525, closing: 4525, contract: 172500, ...purchaseOverrides }
  return report('Apartment Neer Yoav Dekelia', [
    section({
      // client_debt account: payments (balance_effect<0) land in total_expenses; charges in total_income.
      account_type: 'sale', balance_convention: 'client_debt', closing_balance: 58824,
      contract_baseline: 220000, total_income: 0, total_expenses: 161176,
      rows: [
        { subcategory: 'Sale Contract (Reference)', display_group: 'reference', client_amount: 220000, balance_effect: 0 },
        { subcategory: 'Client Payment', display_group: 'income', client_amount: 161176, balance_effect: -161176 },
      ],
    }),
    section({
      account_type: 'purchase', balance_convention: 'client_debt', closing_balance: p.closing,
      contract_baseline: p.contract, total_income: p.expenses, total_expenses: p.payments,
      rows: [
        { subcategory: 'Purchase Contract (Reference)', display_group: 'reference', client_amount: p.contract, balance_effect: 0 },
        { subcategory: 'Purchase Payment', display_group: 'income', client_amount: p.payments, balance_effect: -p.payments },
        { subcategory: 'Purchase Expenses', display_group: 'expense', client_amount: p.expenses, balance_effect: p.expenses },
      ],
    }),
    section({
      account_type: 'rental', balance_convention: 'owner_credit', closing_balance: -1596.36,
      total_expenses: 1596.36,
      rows: [{ subcategory: 'Property Expenses', display_group: 'expense', client_amount: 1596.36 }],
    }),
  ])
}

describe('P-UI-504d — Purchase is fully hidden from the client report + summaries', () => {
  test('drill-down (displayAccounts) excludes Purchase, for full and periodic', () => {
    for (const rt of ['full', 'periodic'] as const) {
      const { displayAccounts } = partitionReportAccounts(neer().accounts, rt)
      expect(displayAccounts.some(a => a.account_type === 'purchase')).toBe(false)
    }
  })

  test('header net == summary net == canonical owner-facing net (value + direction), Neer = −60,420.36', () => {
    const rep = neer()
    const client = filterOwnerFacingSections(rep.accounts)
    const canonical = computeNetOwnerBalance(client)
    expect(canonical).toBeCloseTo(-60420.36, 2)                 // client owes JJ 60,420.36
    expect(getOwnerClientReport(rep).overallNet).toBeCloseTo(canonical, 5) // UI header + PDF hero
    expect(dashboardNet(client)).toBeCloseTo(canonical, 5)       // UI FinalSummary + PDF FinalSummary
  })

  test('Payments component references client accounts only: 161,176 (NOT 333,676)', () => {
    const rep = neer()
    const clientComp = computeStatementComponents(filterOwnerFacingSections(rep.accounts))
    expect(clientComp.paymentsReceived).toBeCloseTo(161176, 2)
    // Guard — the OLD unfiltered path leaked the JJ purchase payments (172,500):
    const leaked = computeStatementComponents(rep.accounts)
    expect(leaked.paymentsReceived).toBeCloseTo(333676, 2)
  })

  test('bottom balance leak reproduced + fixed: unfiltered 64,945.36 vs client 60,420.36', () => {
    const rep = neer()
    expect(Math.abs(dashboardNet(rep.accounts))).toBeCloseTo(64945.36, 2)                       // OLD (leaked purchase 4,525)
    expect(Math.abs(dashboardNet(filterOwnerFacingSections(rep.accounts)))).toBeCloseTo(60420.36, 2) // FIXED
  })

  test('purchase-invariance: changing ANY purchase amount leaves every client value unchanged', () => {
    const base = neer()
    const bumped = neer({ payments: 999999, expenses: 88888, closing: 55555, contract: 777777 })

    const clientNet = (r: RC3PropertyReport) => computeNetOwnerBalance(filterOwnerFacingSections(r.accounts))
    const clientComp = (r: RC3PropertyReport) => computeStatementComponents(filterOwnerFacingSections(r.accounts))

    expect(clientNet(bumped)).toBeCloseTo(clientNet(base), 5)
    expect(getOwnerClientReport(bumped).overallNet).toBeCloseTo(getOwnerClientReport(base).overallNet, 5)
    expect(clientComp(bumped)).toEqual(clientComp(base))
    // Sale account + its payments preserved identically.
    const sale = (r: RC3PropertyReport) => filterOwnerFacingSections(r.accounts).find(a => a.account_type === 'sale')
    expect(sale(bumped)).toEqual(sale(base))
  })

  test('direct payment to the seller (Third-Party Payment) is credited ONCE', () => {
    const rep = report('direct-pay', [
      section({
        account_type: 'sale', balance_convention: 'client_debt', closing_balance: 40,
        contract_baseline: 200, total_income: 0, total_expenses: 160,
        rows: [
          { subcategory: 'Client Payment', display_group: 'income', client_amount: 80, balance_effect: -80 },
          { subcategory: 'Third-Party Payment', display_group: 'income', client_amount: 80, balance_effect: -80 },
        ],
      }),
    ])
    const comp = computeStatementComponents(filterOwnerFacingSections(rep.accounts))
    expect(comp.paymentsReceived).toBeCloseTo(160, 5) // 80 + 80, each counted once
  })

  test('regression: Tamir €4,098.56 and Tamir Kiti 2 €1,651.17 (owner-facing net unchanged)', () => {
    const tamir = report('Tamir Dekelia', [
      section({ account_type: 'purchase', balance_convention: 'client_debt', closing_balance: 126000 }),
      section({ account_type: 'sale', balance_convention: 'owner_credit', closing_balance: 4098.56 }),
    ])
    expect(getOwnerClientReport(tamir).overallNet).toBeCloseTo(4098.56, 2)

    const kiti2 = report('Tamir Kiti 2', [
      section({ account_type: 'rental', balance_convention: 'owner_credit', closing_balance: 1651.17 }),
    ])
    expect(getOwnerClientReport(kiti2).overallNet).toBeCloseTo(1651.17, 2)
  })
})

describe('P-UI-504d — electricity sub-meter (Kiti) note gated by verified association only', () => {
  test('NOT shown for Neer (no verified property_id association)', () => {
    expect(shouldShowElectricitySubmeterNote(neer())).toBe(false)
  })
  test('shown ONLY for a verified property_id in the allowlist', () => {
    // The allowlist is verified (property_id UUIDs), never the property name.
    expect(shouldShowElectricitySubmeterNote({ property_id: 'not-in-set' })).toBe(false)
    const anyVerified = Array.from(VERIFIED_ELECTRICITY_SUBMETER_PROPERTY_IDS)[0]
    if (anyVerified) expect(shouldShowElectricitySubmeterNote({ property_id: anyVerified })).toBe(true)
  })
})
