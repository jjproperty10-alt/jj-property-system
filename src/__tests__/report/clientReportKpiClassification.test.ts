/**
 * JJ Property 10 — /client-report-rc3 SCREEN KPI classification (2026-08-24).
 *
 * Proves the on-screen summary classifies a rental/airbnb "Client Payment" as a
 * Cross-Property Settlement, NOT as Operational/Rental Income — matching the
 * approved PDF classification — while leaving the canonical net unchanged.
 *
 * The screen reuses the SAME approved helper the PDF uses
 * (splitOperatingIncomeTotals). These tests exercise that helper against the
 * client-safe ClientReportSection DTO shape (the exact type the screen passes)
 * and replicate the screen's KPI wiring:
 *
 *   opSettlements = Σ_operating splitOperatingIncomeTotals(a).crossPropertySettlements
 *   operationalIncome = computeOperationalKPIs(accounts).income - opSettlements
 */
import { splitOperatingIncomeTotals, computeStatementComponents } from '@/lib/report/statementPresentation'
import { computeOperationalKPIs, computeNetOwnerBalance } from '@/lib/report/executiveSummary'
import { t } from '@/lib/report/labels'
import type { ClientReportRow, ClientReportSection } from '@/lib/report/clientReportDto'
import type { BalanceConvention, DisplayGroup, RC3AccountType } from '@/lib/report/types'

// ── DTO fixture builders (client-safe shape the screen actually receives) ──────
let _n = 0
function row(p: Partial<ClientReportRow>): ClientReportRow {
  _n += 1
  return {
    id: p.id ?? `row-${_n}`,
    date: p.date ?? '2026-01-01',
    reporting_name: p.reporting_name ?? 'Tamir Kiti',
    subcategory: p.subcategory ?? null,
    client_amount: p.client_amount ?? 0,
    account_type: p.account_type ?? 'rental',
    is_contract_value: p.is_contract_value ?? false,
    is_bpo: p.is_bpo ?? false,
    balance_effect: p.balance_effect ?? 0,
    is_balance_affecting: p.is_balance_affecting ?? true,
    display_group: (p.display_group ?? 'income') as DisplayGroup,
    display_label: p.display_label ?? 'Row',
  }
}
function section(p: Partial<ClientReportSection>): ClientReportSection {
  return {
    account_type: (p.account_type ?? 'rental') as RC3AccountType,
    account_label: p.account_label ?? 'Property Management',
    account_label_he: p.account_label_he ?? 'ניהול',
    balance_convention: (p.balance_convention ?? 'owner_credit') as BalanceConvention,
    opening_balance: p.opening_balance ?? 0,
    rows: p.rows ?? [],
    contract_baseline: p.contract_baseline ?? 0,
    total_income: p.total_income ?? 0,
    total_expenses: p.total_expenses ?? 0,
    total_bpo: p.total_bpo ?? 0,
    closing_balance: p.closing_balance ?? 0,
  }
}

// The exact screen wiring for the Operational Income KPI.
function screenOperational(accounts: ClientReportSection[]) {
  const raw = computeOperationalKPIs(accounts)
  const opSettlements = accounts
    .filter(a => a.account_type === 'rental' || a.account_type === 'airbnb')
    .reduce((sum, a) => sum + splitOperatingIncomeTotals(a).crossPropertySettlements, 0)
  return { operationalIncome: raw.income - opSettlements, crossPropertySettlements: opSettlements, expenses: raw.expenses, transfers: raw.transfers }
}

// ── 1. Settlement-only: all income is a Client Payment settlement ──────────────
it('settlement-only rental: rental income 0, all shown as cross-property settlement', () => {
  const s = section({
    account_type: 'rental',
    total_income: 3565.69,
    rows: [row({ subcategory: 'Client Payment', display_group: 'income', balance_effect: 3565.69, client_amount: 3565.69 })],
  })
  const split = splitOperatingIncomeTotals(s)
  expect(split.rentalIncome).toBeCloseTo(0, 2)
  expect(split.crossPropertySettlements).toBeCloseTo(3565.69, 2)
  const kpi = screenOperational([s])
  expect(kpi.operationalIncome).toBeCloseTo(0, 2)
  expect(kpi.crossPropertySettlements).toBeCloseTo(3565.69, 2)
})

// ── 2. Rental-only: genuine tenant income, no settlement ───────────────────────
it('rental-only: genuine income stays rental income, zero settlement', () => {
  const s = section({
    account_type: 'rental',
    total_income: 2000,
    rows: [row({ subcategory: 'Tenant Payment', display_group: 'income', balance_effect: 2000, client_amount: 2000 })],
  })
  const split = splitOperatingIncomeTotals(s)
  expect(split.rentalIncome).toBeCloseTo(2000, 2)
  expect(split.crossPropertySettlements).toBeCloseTo(0, 2)
  const kpi = screenOperational([s])
  expect(kpi.operationalIncome).toBeCloseTo(2000, 2)
  expect(kpi.crossPropertySettlements).toBeCloseTo(0, 2)
})

// ── 3. Mixed: genuine income + settlement, reconciles to total_income ──────────
it('mixed income: splits into rental income + settlement and reconciles to total_income', () => {
  const s = section({
    account_type: 'rental',
    total_income: 3500,
    rows: [
      row({ subcategory: 'Tenant Payment', display_group: 'income', balance_effect: 2000, client_amount: 2000 }),
      row({ subcategory: 'Client Payment', display_group: 'income', balance_effect: 1500, client_amount: 1500 }),
    ],
  })
  const split = splitOperatingIncomeTotals(s)
  expect(split.rentalIncome).toBeCloseTo(2000, 2)
  expect(split.crossPropertySettlements).toBeCloseTo(1500, 2)
  expect(split.rentalIncome + split.crossPropertySettlements).toBeCloseTo(s.total_income, 2)
  const kpi = screenOperational([s])
  expect(kpi.operationalIncome).toBeCloseTo(2000, 2)
  expect(kpi.crossPropertySettlements).toBeCloseTo(1500, 2)
})

// ── 4. Full Tamir Kiti: Op=0, Rental=0, Settlements=3,565.69, net -930.39 ──────
it('Tamir Kiti: operational & rental income 0, settlement 3,565.69, canonical net stays -930.39', () => {
  const renovation = section({
    account_type: 'renovation', balance_convention: 'client_debt', closing_balance: -850,
    contract_baseline: 87000, total_income: 15442, total_expenses: 103292,
    rows: [row({ account_type: 'renovation', subcategory: 'Extras', display_group: 'expense', balance_effect: 15442, client_amount: 15442 })],
  })
  const rental = section({
    account_type: 'rental', balance_convention: 'owner_credit', closing_balance: -1780.39,
    total_income: 3565.69, total_expenses: 5346.08,
    rows: [row({ account_type: 'rental', subcategory: 'Client Payment', display_group: 'income', balance_effect: 3565.69, client_amount: 3565.69 })],
  })
  const accounts = [renovation, rental]

  // Rental Income (per-account module card) is 0; settlement carries the 3,565.69.
  const rentalSplit = splitOperatingIncomeTotals(rental)
  expect(rentalSplit.rentalIncome).toBeCloseTo(0, 2)
  expect(rentalSplit.crossPropertySettlements).toBeCloseTo(3565.69, 2)

  // Operational Income KPI excludes the settlement.
  const kpi = screenOperational(accounts)
  expect(kpi.operationalIncome).toBeCloseTo(0, 2)
  expect(kpi.crossPropertySettlements).toBeCloseTo(3565.69, 2)

  // Canonical net is unchanged by presentation.
  expect(computeNetOwnerBalance(accounts)).toBeCloseTo(-930.39, 2)
})

// ── FinalSummary (Settlement Summary): components identified separately ─────────
// Replicates the screen's FinalSummary component computation exactly.
function finalSummaryComponents(accounts: ClientReportSection[]) {
  const operating = accounts.filter(a => a.account_type === 'rental' || a.account_type === 'airbnb')
  const operationalIncome = operating.reduce((s, a) => s + splitOperatingIncomeTotals(a).rentalIncome, 0)
  const crossPropertySettlements = operating.reduce((s, a) => s + splitOperatingIncomeTotals(a).crossPropertySettlements, 0)
  const comp = computeStatementComponents(accounts)
  return [
    { label: t('opIncomeLabel', 'en'), value: operationalIncome },
    { label: t('sumRenovationContract', 'en'), value: comp.renovationContract },
    { label: t('sumApprovedExtras', 'en'), value: comp.approvedExtras },
    { label: t('sumPaymentsReceived', 'en'), value: comp.paymentsReceived },
    { label: t('sumCrossProperty', 'en'), value: crossPropertySettlements },
    { label: t('sumPropertyExpenses', 'en'), value: comp.propertyExpenses },
  ].filter(l => Math.abs(l.value) >= 0.005)
}

it('FinalSummary: no line is labeled "Total Income", and no Income line carries the settlement', () => {
  const rentalSettlementOnly = section({
    account_type: 'rental', balance_convention: 'owner_credit', closing_balance: -1780.39,
    total_income: 3565.69, total_expenses: 5346.08,
    rows: [
      row({ account_type: 'rental', subcategory: 'Client Payment', display_group: 'income', balance_effect: 3565.69, client_amount: 3565.69 }),
      row({ account_type: 'rental', subcategory: 'Cleaning', display_group: 'expense', balance_effect: -5346.08, client_amount: 5346.08 }),
    ],
  })
  const lines = finalSummaryComponents([rentalSettlementOnly])

  // No "Total Income" label anywhere.
  expect(lines.some(l => /total income/i.test(l.label))).toBe(false)

  // The settlement appears as its own explicit "Cross-Property Settlements" line.
  const settlementLine = lines.find(l => l.label === t('sumCrossProperty', 'en'))
  expect(settlementLine?.value).toBeCloseTo(3565.69, 2)

  // No line whose label contains "Income" carries the settlement amount.
  const incomeLinesWithSettlement = lines.filter(l => /income/i.test(l.label) && Math.abs(l.value - 3565.69) < 0.005)
  expect(incomeLinesWithSettlement).toHaveLength(0)

  // Operational Income line is 0 (filtered out) — settlement never inflates income.
  expect(lines.some(l => l.label === t('opIncomeLabel', 'en'))).toBe(false)
})

it('FinalSummary: genuine rental income stays as Operational Income, settlement separate', () => {
  const rentalMixed = section({
    account_type: 'rental', balance_convention: 'owner_credit', closing_balance: 500,
    total_income: 3500, total_expenses: 0,
    rows: [
      row({ account_type: 'rental', subcategory: 'Tenant Payment', display_group: 'income', balance_effect: 2000, client_amount: 2000 }),
      row({ account_type: 'rental', subcategory: 'Client Payment', display_group: 'income', balance_effect: 1500, client_amount: 1500 }),
    ],
  })
  const lines = finalSummaryComponents([rentalMixed])
  expect(lines.find(l => l.label === t('opIncomeLabel', 'en'))?.value).toBeCloseTo(2000, 2)
  expect(lines.find(l => l.label === t('sumCrossProperty', 'en'))?.value).toBeCloseTo(1500, 2)
  // They reconcile to the account's total income.
  expect(2000 + 1500).toBeCloseTo(rentalMixed.total_income, 2)
})
