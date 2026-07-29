/**
 * @jest VS-1A v4 — Disposition Engine Tests
 *
 * Tests the pure classification logic with no DB dependencies.
 *
 * v5 test groups (61 test declarations):
 *   1. Basic classification (7 tests)
 *   2. Reconciliation invariant (2 tests)
 *   3. Financial totals — HB4 integer cents (4 tests)
 *   4. Edge cases (3 tests)
 *   5. H1 2026 Villa Mazotos real data (4 tests)
 *   6. R1 — Source-row traceability (2 tests)
 *   7. R2 — Source amount reconciliation (2 tests)
 *   8. R3 — DraftProvenance + v3-B2 provenance binding (7 tests)
 *   9. v3-B2 — Duplicate UUID rejection (3 tests)
 *  10. v3-B2 — Source-field change alters provenance (3 tests)
 * 10b. v4-B3 — Statement-relevant field changes alter provenance (7 tests)
 * 10c. v5 — payee preservation in TransactionDisposition (2 tests)
 *  11. v3-B2 — Row reordering does NOT change provenance (2 tests)
 *  12. v3-B3 — NaN/Infinity rejection (6 tests)
 *  13. v3-B3 — Negative amounts (3 tests)
 *  14. v3-B3 — Fractional cents precision (2 tests)
 *  15. v3-B3 — Unsafe numeric edge cases (2 tests)
 */

jest.mock('server-only', () => ({}), { virtual: true })

import { classifyDisposition, CLASSIFIER_VERSION, SOURCE_HASH_PAYLOAD_VERSION } from '@/lib/statements/dispositionEngine'
import type { RC3RowForDisposition } from '@/lib/statements/dispositionEngine'

// ─── Test fixtures ──────────────────────────────────────────────────────────────

let fixtureCounter = 0
function makeRow(overrides: Partial<RC3RowForDisposition> = {}): RC3RowForDisposition {
  fixtureCounter++
  return {
    id: `test-uuid-${fixtureCounter.toString().padStart(6, '0')}`,
    date: '2026-03-15',
    property_name: 'Villa Mazotos',
    category: 'Airbnb',
    subcategory: 'Internet',
    description: 'test row',
    payer: 'Anastasia',
    payee: 'JJ',
    amount_eur: 30,
    client_charge: null,
    client_amount: 100,
    balance_effect: -100,
    is_balance_affecting: true,
    is_platform_tracking: false,
    is_contract_value: false,
    is_bpo: false,
    account_type: 'airbnb',
    display_group: 'expense',
    display_label: 'Internet',
    ...overrides,
  }
}

const PERIOD_START = '2026-01-01'
const PERIOD_END = '2026-06-30'

// Reset fixture counter between describes to keep IDs predictable
beforeEach(() => { fixtureCounter = 0 })

// ─── 1. Basic Classification (7 tests) ─────────────────────────────────────────

describe('classifyDisposition — basic classification', () => {
  test('expense row → BALANCE_AFFECTING', () => {
    const result = classifyDisposition([makeRow({
      is_balance_affecting: true,
      display_group: 'expense',
    })], PERIOD_START, PERIOD_END)

    expect(result.balanceAffecting).toBe(1)
    expect(result.rows[0].bucket).toBe('BALANCE_AFFECTING')
    expect(result.rows[0].balanceEffect).toBe('expense')
  })

  test('income row → BALANCE_AFFECTING', () => {
    const result = classifyDisposition([makeRow({
      is_balance_affecting: true,
      display_group: 'income',
      balance_effect: 500,
      client_amount: 500,
    })], PERIOD_START, PERIOD_END)

    expect(result.balanceAffecting).toBe(1)
    expect(result.rows[0].bucket).toBe('BALANCE_AFFECTING')
    expect(result.rows[0].balanceEffect).toBe('income')
  })

  test('BPO row → BALANCE_AFFECTING with payment_out', () => {
    const result = classifyDisposition([makeRow({
      is_balance_affecting: true,
      is_bpo: true,
      display_group: 'payment_out',
    })], PERIOD_START, PERIOD_END)

    expect(result.balanceAffecting).toBe(1)
    expect(result.rows[0].bucket).toBe('BALANCE_AFFECTING')
    expect(result.rows[0].balanceEffect).toBe('payment_out')
  })

  test('platform tracking row → INFORMATIONAL', () => {
    const result = classifyDisposition([makeRow({
      is_platform_tracking: true,
      is_balance_affecting: false,
      display_group: 'info',
      balance_effect: 0,
    })], PERIOD_START, PERIOD_END)

    expect(result.informational).toBe(1)
    expect(result.rows[0].bucket).toBe('INFORMATIONAL')
    expect(result.rows[0].balanceEffect).toBe('tracking_only')
  })

  test('contract value row → EXCLUDED', () => {
    const result = classifyDisposition([makeRow({
      is_contract_value: true,
      is_balance_affecting: false,
      display_group: 'reference',
      balance_effect: 0,
    })], PERIOD_START, PERIOD_END)

    expect(result.excluded).toBe(1)
    expect(result.rows[0].bucket).toBe('EXCLUDED')
    expect(result.rows[0].balanceEffect).toBe('contract_value')
  })

  test('non-balance-affecting info row → INFORMATIONAL', () => {
    const result = classifyDisposition([makeRow({
      is_balance_affecting: false,
      is_platform_tracking: false,
      is_contract_value: false,
      display_group: 'info',
      balance_effect: 0,
    })], PERIOD_START, PERIOD_END)

    expect(result.informational).toBe(1)
    expect(result.rows[0].bucket).toBe('INFORMATIONAL')
  })

  test('ambiguous row (not balance-affecting, not info group) → UNRESOLVED', () => {
    const result = classifyDisposition([makeRow({
      is_balance_affecting: false,
      is_platform_tracking: false,
      is_contract_value: false,
      display_group: 'expense',
      balance_effect: 0,
    })], PERIOD_START, PERIOD_END)

    expect(result.unresolved).toBe(1)
    expect(result.rows[0].bucket).toBe('UNRESOLVED')
    expect(result.rows[0].balanceEffect).toBe('expense')
  })
})

// ─── 2. Reconciliation Invariant (2 tests) ──────────────────────────────────────

describe('classifyDisposition — reconciliation invariant', () => {
  test('sourceRows === sum of all buckets', () => {
    const rows = [
      makeRow({ is_balance_affecting: true }),
      makeRow({ is_platform_tracking: true, is_balance_affecting: false, display_group: 'info', balance_effect: 0 }),
      makeRow({ is_contract_value: true, is_balance_affecting: false, display_group: 'reference', balance_effect: 0 }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.sourceRows).toBe(3)
    expect(result.balanceAffecting + result.informational + result.excluded + result.unresolved).toBe(3)
    expect(result.reconciled).toBe(true)
  })

  test('empty input → reconciled with zeros', () => {
    const result = classifyDisposition([], PERIOD_START, PERIOD_END)

    expect(result.sourceRows).toBe(0)
    expect(result.reconciled).toBe(true)
  })
})

// ─── 3. Financial Totals — HB4 integer cents (4 tests) ─────────────────────────

describe('classifyDisposition — financial totals (HB4: integer cents)', () => {
  test('income + expense totals computed from balance-affecting rows only', () => {
    const rows = [
      makeRow({ display_group: 'income', client_amount: 1000, balance_effect: 1000, is_balance_affecting: true }),
      makeRow({ display_group: 'expense', client_amount: 300, balance_effect: -300, is_balance_affecting: true }),
      makeRow({ display_group: 'expense', client_amount: 200, balance_effect: -200, is_balance_affecting: true }),
      makeRow({ is_platform_tracking: true, client_amount: 500, balance_effect: 0, display_group: 'info', is_balance_affecting: false }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.totals.totalIncomeEur).toBe(1000)
    expect(result.totals.totalExpensesEur).toBe(500)
    expect(result.totals.totalBpoEur).toBe(0)
    expect(result.totals.closingBalanceContribution).toBe(500)
  })

  test('BPO totals computed correctly', () => {
    const rows = [
      makeRow({ display_group: 'payment_out', client_amount: 800, balance_effect: -800, is_balance_affecting: true, is_bpo: true }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.totals.totalBpoEur).toBe(800)
  })

  test('informational and excluded rows do not affect financial totals', () => {
    const rows = [
      makeRow({ is_platform_tracking: true, client_amount: 999, balance_effect: 0, display_group: 'info', is_balance_affecting: false }),
      makeRow({ is_contract_value: true, client_amount: 200000, balance_effect: 0, display_group: 'reference', is_balance_affecting: false }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.totals.totalIncomeEur).toBe(0)
    expect(result.totals.totalExpensesEur).toBe(0)
    expect(result.totals.totalBpoEur).toBe(0)
    expect(result.totals.closingBalanceContribution).toBe(0)
  })

  test('HB4: fractional cents sum correctly without IEEE 754 drift', () => {
    const rows = [
      makeRow({ client_amount: 0.1, balance_effect: -0.1, is_balance_affecting: true }),
      makeRow({ client_amount: 0.2, balance_effect: -0.2, is_balance_affecting: true }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.totals.totalExpensesEur).toBe(0.3)
    expect(result.totals.closingBalanceContribution).toBe(-0.3)
  })
})

// ─── 4. Edge Cases (3 tests) ────────────────────────────────────────────────────

describe('classifyDisposition — edge cases', () => {
  test('contract_value flag takes priority over platform_tracking', () => {
    const result = classifyDisposition([makeRow({
      is_contract_value: true,
      is_platform_tracking: true,
      is_balance_affecting: false,
      display_group: 'reference',
      balance_effect: 0,
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].bucket).toBe('EXCLUDED')
  })

  test('each row gets correct transactionId', () => {
    const rows = [
      makeRow({ id: 'uuid-1' }),
      makeRow({ id: 'uuid-2' }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.rows[0].transactionId).toBe('uuid-1')
    expect(result.rows[1].transactionId).toBe('uuid-2')
  })

  test('display_label is preserved', () => {
    const result = classifyDisposition([makeRow({
      display_label: 'Electricity Bill',
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].displayLabel).toBe('Electricity Bill')
  })
})

// ─── 5. H1 2026 Villa Mazotos Simulation (4 tests) ─────────────────────────────

describe('classifyDisposition — H1 2026 Villa Mazotos', () => {
  const h1Rows: RC3RowForDisposition[] = [
    { id: '5e346dc3-dd6a-4c93-9f1e-339b4fd5ee85', date: '2026-01-02', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: 'internet', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: '676ac2e9-eb54-4fca-99d1-964f3445d138', date: '2026-01-20', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Key Duplication', description: 'key copy', payer: 'Anastasia', payee: 'JJ', amount_eur: 10.5, client_charge: null, client_amount: 10.5, balance_effect: -10.5, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Key Duplication' },
    { id: '860eb0ef-7721-43a5-8041-573c83102839', date: '2026-01-22', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Electricity bill', description: 'elec bill', payer: 'Anastasia', payee: 'JJ', amount_eur: 165.4, client_charge: null, client_amount: 165.4, balance_effect: -165.4, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Electricity bill' },
    { id: '9bb870c9-a320-4b30-a11b-87ce13b0290f', date: '2026-01-27', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Airbnb Equipment', description: 'כיבוי אש + עזרה ראשונה', payer: 'Jacob', payee: 'JJ', amount_eur: 11.08, client_charge: null, client_amount: 11.08, balance_effect: -11.08, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Airbnb Equipment' },
    { id: 'b664e749-7768-46ad-ae41-a66aefd3d2b8', date: '2026-01-27', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Airbnb Equipment', description: 'safe', payer: 'Anastasia', payee: 'JJ', amount_eur: 53.99, client_charge: null, client_amount: 53.99, balance_effect: -53.99, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Airbnb Equipment' },
    { id: 'ae90ee87-af07-4ed2-b187-11176424abd1', date: '2026-02-10', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: 'Netflash Wifi', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: '70ae288d-26e8-4ffc-9764-593cde057d0c', date: '2026-03-03', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Airbnb Equipment', description: 'Pillows and glasses', payer: 'Anastasia', payee: 'JJ', amount_eur: 48.55, client_charge: null, client_amount: 48.55, balance_effect: -48.55, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Airbnb Equipment' },
    { id: 'ab45d874-cee2-40ce-ba9f-c317a2e8114f', date: '2026-03-05', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: 'Wifi Netflash', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: '00e84a59-7972-428b-bc54-7b3407c16754', date: '2026-03-14', property_name: 'Villa Mazotos', category: 'Management', subcategory: 'Pool Service', description: 'Pool Oct–Mar', payer: 'Anastasia', payee: 'JJ', amount_eur: 480, client_charge: null, client_amount: 480, balance_effect: -480, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'rental', display_group: 'expense', display_label: 'Pool Service' },
    { id: '747aa644-d8f8-44ee-b79c-8f4cc925207b', date: '2026-04-14', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: 'internet for villa mazotos', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: 'ade3b388-7c35-45e1-96fa-fdfad368e2e8', date: '2026-04-16', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Electricity bill', description: 'villa mazotos electricity', payer: 'Anastasia', payee: 'JJ', amount_eur: 199.87, client_charge: null, client_amount: 199.87, balance_effect: -199.87, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Electricity bill' },
    { id: '4c40f610-c173-4027-b513-cffe12fcd288', date: '2026-04-20', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Pool Service', description: 'משאבה לבריכה חדשה', payer: 'Yossi', payee: 'JJ', amount_eur: 250, client_charge: 450, client_amount: 450, balance_effect: -450, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Pool Service' },
    { id: '4fe32069-97fc-48e9-a8c8-2dae300991cb', date: '2026-04-22', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Consumable Supplies', description: 'צינור 25 מטר', payer: 'Yossi', payee: 'JJ', amount_eur: 86, client_charge: null, client_amount: 86, balance_effect: -86, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Consumable Supplies' },
    { id: '617ebfde-64d5-48d6-9dc5-3d86502cab50', date: '2026-04-27', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Design', description: 'Jumbo boxes', payer: 'Anastasia', payee: 'JJ', amount_eur: 60.54, client_charge: null, client_amount: 60.54, balance_effect: -60.54, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Design' },
    { id: '7ecc7b57-1d2d-4718-bc03-dd2fa3296eee', date: '2026-05-05', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: 'internet', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: 'bb7f44e1-7249-458d-8325-f863f8953193', date: '2026-05-07', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Consumable Supplies', description: 'שמן דק', payer: 'Yossi', payee: 'JJ', amount_eur: 49.3, client_charge: null, client_amount: 49.3, balance_effect: -49.3, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Consumable Supplies' },
    { id: 'eb6b2423-1689-4a22-8696-42933999682c', date: '2026-05-09', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Other', description: 'התקנת גוף תאורה', payer: 'Yossi', payee: 'JJ', amount_eur: 250, client_charge: 320, client_amount: 320, balance_effect: -320, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Other' },
    { id: '26ec3563-cd7b-470f-aae6-e2f1544e268c', date: '2026-05-09', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Water', description: 'water bill', payer: 'JJ', payee: 'JJ', amount_eur: 316.15, client_charge: null, client_amount: 316.15, balance_effect: -316.15, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Water' },
    { id: 'b9239808-c0fc-4342-a489-3d5c10ecb3db', date: '2026-05-26', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Pool Service', description: 'pool man Apr+May', payer: 'Anastasia', payee: 'JJ', amount_eur: 160, client_charge: null, client_amount: 160, balance_effect: -160, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Pool Service' },
    { id: '13e2aba9-da9d-4bb7-bd5d-ff8f902fb582', date: '2026-06-04', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Property insurance', description: 'חידוש ביטוח שנתי', payer: 'JJ', payee: 'JJ', amount_eur: 497, client_charge: null, client_amount: 497, balance_effect: -497, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Property insurance' },
    { id: '792b0bfb-7341-4929-96ca-052a00036d53', date: '2026-06-10', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Internet', description: '', payer: 'Anastasia', payee: 'JJ', amount_eur: 30, client_charge: null, client_amount: 30, balance_effect: -30, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Internet' },
    { id: '2fdf9d76-4b75-4624-a482-5cd8ce2863c1', date: '2026-06-18', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Electricity', description: 'camera electrician', payer: 'Anastasia', payee: 'JJ', amount_eur: 120, client_charge: null, client_amount: 120, balance_effect: -120, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Electricity' },
    { id: '26d2a829-f945-4997-a320-7faf9427a5f9', date: '2026-06-20', property_name: 'Villa Mazotos', category: 'Airbnb', subcategory: 'Electricity bill', description: 'electricity bill', payer: 'Anastasia', payee: 'JJ', amount_eur: 316.55, client_charge: null, client_amount: 316.55, balance_effect: -316.55, is_balance_affecting: true, is_platform_tracking: false, is_contract_value: false, is_bpo: false, account_type: 'airbnb', display_group: 'expense', display_label: 'Electricity bill' },
  ]

  test('23 expense rows → all BALANCE_AFFECTING, exact totals', () => {
    const result = classifyDisposition(h1Rows, PERIOD_START, PERIOD_END)

    expect(result.sourceRows).toBe(23)
    expect(result.balanceAffecting).toBe(23)
    expect(result.informational).toBe(0)
    expect(result.excluded).toBe(0)
    expect(result.unresolved).toBe(0)
    expect(result.reconciled).toBe(true)

    expect(result.totals.totalIncomeEur).toBe(0)
    expect(result.totals.totalBpoEur).toBe(0)
    expect(result.totals.totalExpensesEur).toBe(3524.93)
    expect(result.totals.closingBalanceContribution).toBe(-3524.93)
  })

  test('correct payer distribution: 16A/4Y/2JJ/1Ja', () => {
    const result = classifyDisposition(h1Rows, PERIOD_START, PERIOD_END)
    const payers = result.rows.reduce((acc, r) => {
      acc[r.payer ?? 'null'] = (acc[r.payer ?? 'null'] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    expect(payers['Anastasia']).toBe(16)
    expect(payers['Yossi']).toBe(4)
    expect(payers['JJ']).toBe(2)
    expect(payers['Jacob']).toBe(1)
  })

  test('exact source amount totals', () => {
    const result = classifyDisposition(h1Rows, PERIOD_START, PERIOD_END)

    expect(result.sourceAmounts.totalAmountEur).toBe(3254.93)
    expect(result.sourceAmounts.totalClientChargeEur).toBe(770)
    expect(result.sourceAmounts.markupRowCount).toBe(2)
    expect(result.sourceAmounts.totalMarkupEur).toBe(270)
  })

  test('provenance includes all 23 full UUIDs', () => {
    const result = classifyDisposition(h1Rows, PERIOD_START, PERIOD_END)

    expect(result.provenance.sortedSourceIds).toHaveLength(23)
    // v3: All UUIDs are full 36-char canonical UUIDs
    for (const id of result.provenance.sortedSourceIds) {
      expect(id).toHaveLength(36)
    }
    expect(result.provenance.classifierVersion).toBe(CLASSIFIER_VERSION)
    expect(result.provenance.aggregateDispositionHash).toHaveLength(64)
  })
})

// ─── 6. R1 — Source-row traceability (2 tests) ──────────────────────────────────

describe('classifyDisposition — R1 source-row traceability', () => {
  test('every disposition row carries full source fields', () => {
    const sourceRow = makeRow({
      id: 'trace-uuid-001',
      date: '2026-02-15',
      property_name: 'Villa Mazotos',
      category: 'Airbnb',
      subcategory: 'Internet',
      description: 'Feb wifi',
      payer: 'Anastasia', payee: 'JJ',
      amount_eur: 30,
      client_charge: null,
      client_amount: 30,
      account_type: 'airbnb',
    })

    const result = classifyDisposition([sourceRow], PERIOD_START, PERIOD_END)
    const d = result.rows[0]

    expect(d.transactionId).toBe('trace-uuid-001')
    expect(d.transactionDate).toBe('2026-02-15')
    expect(d.propertyName).toBe('Villa Mazotos')
    expect(d.category).toBe('Airbnb')
    expect(d.subcategory).toBe('Internet')
    expect(d.description).toBe('Feb wifi')
    expect(d.payer).toBe('Anastasia')
    expect(d.amountEur).toBe(30)
    expect(d.clientCharge).toBeNull()
    expect(d.clientAmountEur).toBe(30)
    expect(d.accountType).toBe('airbnb')
    expect(d.classifierVersion).toBe(CLASSIFIER_VERSION)
    expect(d.sourceDataHash).toHaveLength(64)
  })

  test('null source fields preserved as null (P-ARCH-1)', () => {
    const result = classifyDisposition([makeRow({
      property_name: null,
      subcategory: null,
      description: null,
      payer: null,
      client_charge: null,
    })], PERIOD_START, PERIOD_END)

    const d = result.rows[0]
    expect(d.propertyName).toBeNull()
    expect(d.subcategory).toBeNull()
    expect(d.description).toBeNull()
    expect(d.payer).toBeNull()
    expect(d.clientCharge).toBeNull()
  })
})

// ─── 7. R2 — Source amount reconciliation (2 tests) ─────────────────────────────

describe('classifyDisposition — R2 source amount reconciliation', () => {
  test('sourceAmounts totals computed across all rows', () => {
    const rows = [
      makeRow({ amount_eur: 100, client_charge: null, client_amount: 100 }),
      makeRow({ amount_eur: 200, client_charge: 300, client_amount: 300 }),
      makeRow({ amount_eur: 50, client_charge: 50, client_amount: 50 }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.sourceAmounts.totalAmountEur).toBe(350)
    expect(result.sourceAmounts.totalClientChargeEur).toBe(350)
  })

  test('markup rows counted where client_charge ≠ amount_eur', () => {
    const rows = [
      makeRow({ amount_eur: 100, client_charge: null, client_amount: 100 }),
      makeRow({ amount_eur: 200, client_charge: 300, client_amount: 300 }),
      makeRow({ amount_eur: 50, client_charge: 50, client_amount: 50 }),
      makeRow({ amount_eur: 250, client_charge: 320, client_amount: 320 }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.sourceAmounts.markupRowCount).toBe(2)
    expect(result.sourceAmounts.totalMarkupEur).toBe(170)
  })
})

// ─── 8. R3 — DraftProvenance + v3-B2 binding (7 tests) ─────────────────────────

describe('classifyDisposition — R3 DraftProvenance (v3-B2)', () => {
  test('provenance includes classifier version', () => {
    const result = classifyDisposition([makeRow()], PERIOD_START, PERIOD_END)
    expect(result.provenance.classifierVersion).toBe(CLASSIFIER_VERSION)
  })

  test('provenance includes period boundaries', () => {
    const result = classifyDisposition([makeRow()], '2026-01-01', '2026-06-30')
    expect(result.provenance.periodStart).toBe('2026-01-01')
    expect(result.provenance.periodEnd).toBe('2026-06-30')
  })

  test('all hashes are 64-char hex (real SHA-256)', () => {
    const result = classifyDisposition([makeRow({ id: 'sha-test-v3' })], PERIOD_START, PERIOD_END)

    expect(result.provenance.sourceSetHash).toHaveLength(64)
    expect(result.provenance.sourceSetHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.provenance.aggregateDispositionHash).toHaveLength(64)
    expect(result.provenance.aggregateDispositionHash).toMatch(/^[0-9a-f]{64}$/)
    expect(result.provenance.rowDispositionHashes[0]).toHaveLength(64)
    expect(result.rows[0].sourceDataHash).toHaveLength(64)
  })

  test('sortedSourceIds are deterministic (sorted by UUID)', () => {
    const rows = [
      makeRow({ id: 'zzz-uuid' }),
      makeRow({ id: 'aaa-uuid' }),
      makeRow({ id: 'mmm-uuid' }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)
    expect(result.provenance.sortedSourceIds).toEqual(['aaa-uuid', 'mmm-uuid', 'zzz-uuid'])
  })

  test('sourceSetHash is deterministic (same input = same hash)', () => {
    const rows = [
      makeRow({ id: 'stable-1', amount_eur: 100, client_charge: null, client_amount: 100 }),
      makeRow({ id: 'stable-2', amount_eur: 200, client_charge: null, client_amount: 200 }),
    ]

    const result1 = classifyDisposition(rows, PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).toBe(result2.provenance.sourceSetHash)
  })

  test('aggregateDispositionHash changes when classification changes', () => {
    const row1 = makeRow({ id: 'drift-1', is_balance_affecting: true, display_group: 'expense' })
    fixtureCounter = 0 // reset so next makeRow gets same counter
    const row2 = makeRow({ id: 'drift-1', is_balance_affecting: false, display_group: 'info', balance_effect: 0 })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('rowDispositionHashes has one entry per sorted source ID', () => {
    const rows = [makeRow({ id: 'h-a' }), makeRow({ id: 'h-b' }), makeRow({ id: 'h-c' })]
    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.provenance.rowDispositionHashes).toHaveLength(3)
    expect(result.provenance.rowDispositionHashes.every(h => /^[0-9a-f]{64}$/.test(h))).toBe(true)
  })
})

// ─── 9. v3-B2 — Duplicate UUID rejection (3 tests) ─────────────────────────────

describe('v3-B2 — duplicate UUID rejection', () => {
  test('duplicate UUIDs throw Error before classification', () => {
    const rows = [
      makeRow({ id: 'dup-uuid-001' }),
      makeRow({ id: 'dup-uuid-001' }), // duplicate
    ]

    expect(() => classifyDisposition(rows, PERIOD_START, PERIOD_END))
      .toThrow('Duplicate transaction UUID rejected: dup-uuid-001')
  })

  test('three rows with one duplicate throws on first duplicate', () => {
    const rows = [
      makeRow({ id: 'aaa' }),
      makeRow({ id: 'bbb' }),
      makeRow({ id: 'aaa' }), // duplicate of first
    ]

    expect(() => classifyDisposition(rows, PERIOD_START, PERIOD_END))
      .toThrow('Duplicate transaction UUID rejected: aaa')
  })

  test('all unique UUIDs pass without error', () => {
    const rows = [
      makeRow({ id: 'unique-1' }),
      makeRow({ id: 'unique-2' }),
      makeRow({ id: 'unique-3' }),
    ]

    expect(() => classifyDisposition(rows, PERIOD_START, PERIOD_END)).not.toThrow()
    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)
    expect(result.sourceRows).toBe(3)
  })
})

// ─── 10. v3-B2 — Source-field change alters provenance (3 tests) ────────────────

describe('v3-B2 — source-field change alters provenance', () => {
  test('changing amount_eur alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'prov-1', amount_eur: 100, client_amount: 100, balance_effect: -100 })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'prov-1', amount_eur: 200, client_amount: 200, balance_effect: -200 })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    // sourceSetHash binds UUID+sourceDataHash, so changing amount changes hash
    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
  })

  test('changing account_type alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'prov-2', account_type: 'airbnb' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'prov-2', account_type: 'rental' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
  })

  test('changing is_bpo alters aggregateDispositionHash', () => {
    const row1 = makeRow({ id: 'prov-3', is_bpo: false })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'prov-3', is_bpo: true, display_group: 'payment_out' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })
})

// ─── 10b. v4-B3 — Statement-relevant field changes alter provenance (6 tests) ──

describe('v4-B3 — statement-relevant field changes alter provenance', () => {
  test('changing date alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'date-prov-1', date: '2026-01-15' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'date-prov-1', date: '2026-02-15' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing property_name alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'prop-prov-1', property_name: 'Villa Mazotos' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'prop-prov-1', property_name: 'Tamir Dekelia' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing category alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'cat-prov-1', category: 'Airbnb' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'cat-prov-1', category: 'Management' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing description alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'desc-prov-1', description: 'internet bill' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'desc-prov-1', description: 'electricity bill' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing payer alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'payer-prov-1', payer: 'Anastasia' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'payer-prov-1', payer: 'Yossi' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing display_label alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'label-prov-1', display_label: 'Internet' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'label-prov-1', display_label: 'Water' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })

  test('changing payee alters sourceSetHash', () => {
    const row1 = makeRow({ id: 'payee-prov-1', payee: 'JJ' })
    fixtureCounter = 0
    const row2 = makeRow({ id: 'payee-prov-1', payee: 'Yossi' })

    const result1 = classifyDisposition([row1], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([row2], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).not.toBe(result2.provenance.sourceSetHash)
    expect(result1.provenance.aggregateDispositionHash).not.toBe(result2.provenance.aggregateDispositionHash)
  })
})

// ─── 10c. v5 — payee preservation in TransactionDisposition (2 tests) ──────────

describe('v5 — payee preservation in TransactionDisposition', () => {
  test('payee value is preserved exactly in disposition output', () => {
    const row = makeRow({ payee: 'Yossi' })
    const result = classifyDisposition([row], PERIOD_START, PERIOD_END)

    expect(result.rows[0].payee).toBe('Yossi')
  })

  test('null payee is preserved as null in disposition output', () => {
    const row = makeRow({ payee: null })
    const result = classifyDisposition([row], PERIOD_START, PERIOD_END)

    expect(result.rows[0].payee).toBeNull()
  })
})

// ─── 11. v3-B2 — Row reordering does NOT change provenance (2 tests) ───────────

describe('v3-B2 — row reordering does not change provenance', () => {
  test('reordering input rows produces same sourceSetHash', () => {
    const rowA = makeRow({ id: 'order-a', amount_eur: 100, client_amount: 100, balance_effect: -100 })
    const rowB = makeRow({ id: 'order-b', amount_eur: 200, client_amount: 200, balance_effect: -200 })

    const result1 = classifyDisposition([rowA, rowB], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([rowB, rowA], PERIOD_START, PERIOD_END)

    expect(result1.provenance.sourceSetHash).toBe(result2.provenance.sourceSetHash)
  })

  test('reordering input rows produces same aggregateDispositionHash', () => {
    const rowA = makeRow({ id: 'agg-a', amount_eur: 50, client_amount: 50, balance_effect: -50 })
    const rowB = makeRow({ id: 'agg-b', amount_eur: 75, client_amount: 75, balance_effect: -75 })
    const rowC = makeRow({ id: 'agg-c', amount_eur: 100, client_amount: 100, balance_effect: -100 })

    const result1 = classifyDisposition([rowA, rowB, rowC], PERIOD_START, PERIOD_END)
    const result2 = classifyDisposition([rowC, rowA, rowB], PERIOD_START, PERIOD_END)

    expect(result1.provenance.aggregateDispositionHash).toBe(result2.provenance.aggregateDispositionHash)
  })
})

// ─── 12. v3-B3 — NaN/Infinity rejection (6 tests) ──────────────────────────────

describe('v3-B3 — NaN/Infinity rejection', () => {
  test('NaN amount_eur throws', () => {
    expect(() => classifyDisposition([makeRow({ amount_eur: NaN })], PERIOD_START, PERIOD_END))
      .toThrow('Unsafe financial value')
  })

  test('Infinity amount_eur throws', () => {
    expect(() => classifyDisposition([makeRow({ amount_eur: Infinity })], PERIOD_START, PERIOD_END))
      .toThrow('Unsafe financial value')
  })

  test('-Infinity client_amount throws', () => {
    expect(() => classifyDisposition([makeRow({ client_amount: -Infinity })], PERIOD_START, PERIOD_END))
      .toThrow('Unsafe financial value')
  })

  test('NaN balance_effect throws', () => {
    expect(() => classifyDisposition([makeRow({ balance_effect: NaN })], PERIOD_START, PERIOD_END))
      .toThrow('Unsafe financial value')
  })

  test('NaN client_charge throws', () => {
    expect(() => classifyDisposition([makeRow({ client_charge: NaN })], PERIOD_START, PERIOD_END))
      .toThrow('Unsafe financial value')
  })

  test('null client_charge does NOT throw (P-ARCH-1)', () => {
    expect(() => classifyDisposition([makeRow({ client_charge: null })], PERIOD_START, PERIOD_END))
      .not.toThrow()
  })
})

// ─── 13. v3-B3 — Negative amounts (3 tests) ────────────────────────────────────

describe('v3-B3 — negative amounts', () => {
  test('negative amount_eur is accepted and preserved', () => {
    const result = classifyDisposition([makeRow({
      amount_eur: -150.50,
      client_amount: -150.50,
      balance_effect: 150.50,
      display_group: 'income',
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].amountEur).toBe(-150.50)
    expect(result.rows[0].clientAmountEur).toBe(-150.50)
  })

  test('negative client_charge is accepted and preserved', () => {
    const result = classifyDisposition([makeRow({
      amount_eur: -50,
      client_charge: -75,
      client_amount: -75,
      balance_effect: 75,
      display_group: 'income',
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].clientCharge).toBe(-75)
  })

  test('negative amounts contribute correctly to totals', () => {
    const rows = [
      makeRow({ client_amount: 100, balance_effect: -100, is_balance_affecting: true, display_group: 'expense' }),
      makeRow({ client_amount: -30, balance_effect: 30, is_balance_affecting: true, display_group: 'expense' }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    // -30 is counted as expense with client_amount -30
    expect(result.totals.totalExpensesEur).toBe(70)
  })
})

// ─── 14. v3-B3 — Fractional cents precision (2 tests) ──────────────────────────

describe('v3-B3 — fractional cents precision', () => {
  test('sub-cent amounts round to nearest cent', () => {
    // 33.333 → rounds to 3333 cents → 33.33
    const rows = [
      makeRow({ client_amount: 33.333, balance_effect: -33.333, is_balance_affecting: true }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    // eurToCents(33.333) = Math.round(3333.3) = 3333 → 33.33
    expect(result.totals.totalExpensesEur).toBe(33.33)
  })

  test('three amounts that drift in float sum correctly', () => {
    // 10.01 + 10.02 + 10.03 = 30.06 (exactly, not 30.060000000000002)
    const rows = [
      makeRow({ client_amount: 10.01, balance_effect: -10.01, is_balance_affecting: true }),
      makeRow({ client_amount: 10.02, balance_effect: -10.02, is_balance_affecting: true }),
      makeRow({ client_amount: 10.03, balance_effect: -10.03, is_balance_affecting: true }),
    ]

    const result = classifyDisposition(rows, PERIOD_START, PERIOD_END)

    expect(result.totals.totalExpensesEur).toBe(30.06)
  })
})

// ─── 15. v3-B3 — Unsafe numeric edge cases (2 tests) ───────────────────────────

describe('v3-B3 — unsafe numeric edge cases', () => {
  test('zero amounts are accepted', () => {
    const result = classifyDisposition([makeRow({
      amount_eur: 0,
      client_amount: 0,
      balance_effect: 0,
      is_balance_affecting: false,
      display_group: 'info',
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].amountEur).toBe(0)
  })

  test('very large amounts are accepted', () => {
    const result = classifyDisposition([makeRow({
      amount_eur: 999999999.99,
      client_amount: 999999999.99,
      balance_effect: -999999999.99,
    })], PERIOD_START, PERIOD_END)

    expect(result.rows[0].amountEur).toBe(999999999.99)
  })
})
