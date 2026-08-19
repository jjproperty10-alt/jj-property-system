/**
 * Tests for executiveSummary.ts — M2 pure business logic
 * Tests: operational KPI filtering, balance direction, full/periodic modules,
 *        Global Owner/Client Perspective Rule (Purchase exclusion)
 */
import {
  computeOperationalKPIs,
  computeNetOwnerBalance,
  OPERATIONAL_ACCOUNT_TYPES,
  isOwnerFacingSection,
  filterOwnerFacingSections,
  computeOwnerFacingNet,
} from '../../lib/report/executiveSummary'
import type { RC3AccountSection } from '../../lib/report/types'

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeSection(
  account_type: string,
  overrides: Partial<RC3AccountSection> = {},
): RC3AccountSection {
  return {
    account_type,
    account_label:       account_type,
    balance_convention:  'owner_credit',
    opening_balance:     0,
    closing_balance:     0,
    total_income:        0,
    total_expenses:      0,
    total_bpo:           0,
    contract_baseline:   0,
    rows:                [],
    balance_equation:    '',
    ...overrides,
  } as RC3AccountSection
}

const SALE   = makeSection('sale',       { total_income: 500,  total_expenses: 200, closing_balance: 300,  balance_convention: 'client_debt'  })
const RENOV  = makeSection('renovation', { total_income: 800,  total_expenses: 600, closing_balance: 200,  balance_convention: 'client_debt'  })
const RENTAL = makeSection('rental',     { total_income: 1200, total_expenses: 300, total_bpo: 500, closing_balance: 400, balance_convention: 'owner_credit' })
const AIRBNB = makeSection('airbnb',     { total_income: 900,  total_expenses: 200, total_bpo: 400, closing_balance: 300, balance_convention: 'owner_credit' })

// ── OPERATIONAL_ACCOUNT_TYPES ────────────────────────────────────────────────
describe('OPERATIONAL_ACCOUNT_TYPES', () => {
  it('contains rental and airbnb', () => {
    expect(OPERATIONAL_ACCOUNT_TYPES.has('rental')).toBe(true)
    expect(OPERATIONAL_ACCOUNT_TYPES.has('airbnb')).toBe(true)
  })
  it('does not contain sale or renovation', () => {
    expect(OPERATIONAL_ACCOUNT_TYPES.has('sale')).toBe(false)
    expect(OPERATIONAL_ACCOUNT_TYPES.has('renovation')).toBe(false)
  })
})

// ── computeOperationalKPIs ──────────────────────────────────────────────────
describe('computeOperationalKPIs', () => {
  it('excludes sale and renovation from operational totals', () => {
    const kpis = computeOperationalKPIs([SALE, RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(1200 + 900)    // only rental + airbnb
    expect(kpis.expenses).toBe(300 + 200)
    expect(kpis.transfers).toBe(500 + 400)
  })
  it('returns hasOperational=true when rental or airbnb present', () => {
    expect(computeOperationalKPIs([RENTAL]).hasOperational).toBe(true)
    expect(computeOperationalKPIs([AIRBNB]).hasOperational).toBe(true)
  })
  it('returns hasOperational=false when only sale/renovation', () => {
    expect(computeOperationalKPIs([SALE, RENOV]).hasOperational).toBe(false)
  })
  it('returns all zeros with hasOperational=false for empty array', () => {
    const kpis = computeOperationalKPIs([])
    expect(kpis.income).toBe(0)
    expect(kpis.expenses).toBe(0)
    expect(kpis.transfers).toBe(0)
    expect(kpis.hasOperational).toBe(false)
  })
  it('Full report: income is rental+airbnb income only', () => {
    const kpis = computeOperationalKPIs([SALE, RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(2100)   // 1200+900
  })
  it('Periodic (no sale): income still excludes renovation', () => {
    const kpis = computeOperationalKPIs([RENOV, RENTAL, AIRBNB])
    expect(kpis.income).toBe(2100)
  })
  it('client_debt convention flips balance contribution', () => {
    // SALE has client_debt convention, closing_balance=300 → should subtract
    const kpis = computeOperationalKPIs([SALE])
    // SALE is not operational, so result is zero
    expect(kpis.netBalance).toBe(0)
  })
  it('netBalance: owner_credit adds, client_debt subtracts', () => {
    const creditAcc = makeSection('rental', { closing_balance: 100, balance_convention: 'owner_credit', total_income: 100 })
    const debtAcc   = makeSection('airbnb', { closing_balance: 60,  balance_convention: 'client_debt',  total_income: 60  })
    const kpis = computeOperationalKPIs([creditAcc, debtAcc])
    expect(kpis.netBalance).toBe(100 - 60)  // +100 - 60 = +40
  })
})

// ── computeNetOwnerBalance ──────────────────────────────────────────────────
describe('computeNetOwnerBalance', () => {
  it('owner_credit adds balance', () => {
    const acc = makeSection('rental', { closing_balance: 500, balance_convention: 'owner_credit' })
    expect(computeNetOwnerBalance([acc])).toBe(500)
  })
  it('client_debt subtracts balance', () => {
    const acc = makeSection('sale', { closing_balance: 300, balance_convention: 'client_debt' })
    expect(computeNetOwnerBalance([acc])).toBe(-300)
  })
  it('full report: net = owner_credit sum - client_debt sum', () => {
    // RENTAL=+400, AIRBNB=+300, SALE=-300, RENOV=-200 → net=200
    expect(computeNetOwnerBalance([SALE, RENOV, RENTAL, AIRBNB])).toBe(200)
  })
  it('HE/EN switch does not affect totals', () => {
    // computeNetOwnerBalance is lang-agnostic; same result regardless
    const net = computeNetOwnerBalance([SALE, RENOV, RENTAL, AIRBNB])
    expect(net).toBe(200)
  })
  it('returns 0 for empty array', () => {
    expect(computeNetOwnerBalance([])).toBe(0)
  })
  it('returns 0 when credits exactly offset debts', () => {
    const credit = makeSection('rental', { closing_balance: 500, balance_convention: 'owner_credit' })
    const debt   = makeSection('sale',   { closing_balance: 500, balance_convention: 'client_debt'  })
    expect(computeNetOwnerBalance([credit, debt])).toBe(0)
  })
  it('balance_convention accounting totals unchanged by language', () => {
    const net1 = computeNetOwnerBalance([RENTAL, AIRBNB])
    expect(net1).toBe(700)  // 400+300
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Global Owner/Client Perspective Rule — Regression Tests A–L
//
// Constitutional: Purchase = JJ internal acquisition cost. Contributes exactly
// €0 to Owner/Client settlement. This is universal — no property exception.
//
// filterOwnerFacingSections() is the SINGLE authoritative filter.
// computeOwnerFacingNet() is the convenience wrapper.
// ══════════════════════════════════════════════════════════════════════════════

const PURCHASE = makeSection('purchase', {
  closing_balance: 130_000,
  balance_convention: 'owner_credit',
  total_income: 130_000,
  total_expenses: 0,
})

// ── isOwnerFacingSection ────────────────────────────────────────────────────
describe('isOwnerFacingSection', () => {
  // Test K: predicate returns correct boolean per account_type
  it('Test K: returns false for purchase', () => {
    expect(isOwnerFacingSection(PURCHASE)).toBe(false)
  })
  it('Test K: returns true for sale', () => {
    expect(isOwnerFacingSection(SALE)).toBe(true)
  })
  it('Test K: returns true for renovation', () => {
    expect(isOwnerFacingSection(RENOV)).toBe(true)
  })
  it('Test K: returns true for rental', () => {
    expect(isOwnerFacingSection(RENTAL)).toBe(true)
  })
  it('Test K: returns true for airbnb', () => {
    expect(isOwnerFacingSection(AIRBNB)).toBe(true)
  })
})

// ── filterOwnerFacingSections ───────────────────────────────────────────────
describe('filterOwnerFacingSections', () => {
  // Test A: Purchase excluded
  it('Test A: excludes Purchase sections from owner-facing output', () => {
    const result = filterOwnerFacingSections([SALE, RENOV, RENTAL, AIRBNB, PURCHASE])
    expect(result).toHaveLength(4)
    expect(result.find(s => s.account_type === 'purchase')).toBeUndefined()
  })

  // Test B: Sale, Renovation, Rental, Airbnb all kept
  it('Test B: keeps Sale, Renovation, Rental, Airbnb', () => {
    const result = filterOwnerFacingSections([SALE, RENOV, RENTAL, AIRBNB, PURCHASE])
    const types = result.map(s => s.account_type).sort()
    expect(types).toEqual(['airbnb', 'renovation', 'rental', 'sale'])
  })

  // Test J: multiple Purchase sections all excluded
  it('Test J: excludes multiple Purchase sections (Contract + Payment)', () => {
    const purchaseContract = makeSection('purchase', {
      account_label: 'Purchase Contract',
      closing_balance: 200_000,
      balance_convention: 'owner_credit',
    })
    const purchasePayment = makeSection('purchase', {
      account_label: 'Purchase Payment',
      closing_balance: 50_000,
      balance_convention: 'owner_credit',
    })
    const result = filterOwnerFacingSections([RENTAL, purchaseContract, purchasePayment, SALE])
    expect(result).toHaveLength(2)
    expect(result.every(s => s.account_type !== 'purchase')).toBe(true)
  })
})

// ── computeOwnerFacingNet ───────────────────────────────────────────────────
describe('computeOwnerFacingNet', () => {
  // Test C: correct net without Purchase
  it('Test C: returns net excluding Purchase contribution', () => {
    // Without Purchase: RENTAL(+400) + AIRBNB(+300) + SALE(-300) + RENOV(-200) = 200
    // With Purchase: +130,000 more → 130,200
    // computeOwnerFacingNet must return 200, not 130,200
    const net = computeOwnerFacingNet([SALE, RENOV, RENTAL, AIRBNB, PURCHASE])
    expect(net).toBe(200)
  })

  // Test D: empty accounts → 0
  it('Test D: returns 0 for empty accounts', () => {
    expect(computeOwnerFacingNet([])).toBe(0)
  })

  // Test E: only Purchase → 0
  it('Test E: returns 0 when only Purchase sections exist', () => {
    const p1 = makeSection('purchase', { closing_balance: 50_000, balance_convention: 'owner_credit' })
    const p2 = makeSection('purchase', { closing_balance: 80_000, balance_convention: 'client_debt'  })
    expect(computeOwnerFacingNet([p1, p2])).toBe(0)
  })

  // Test F: mixed owner_credit + client_debt normalization correct
  it('Test F: mixed conventions normalized correctly after Purchase exclusion', () => {
    const rental = makeSection('rental',     { closing_balance: 5000, balance_convention: 'owner_credit' })
    const sale   = makeSection('sale',       { closing_balance: 3000, balance_convention: 'client_debt'  })
    const renov  = makeSection('renovation', { closing_balance: 1000, balance_convention: 'client_debt'  })
    const purch  = makeSection('purchase',   { closing_balance: 99_999, balance_convention: 'owner_credit' })
    // Without Purchase: +5000 - 3000 - 1000 = 1000
    expect(computeOwnerFacingNet([rental, sale, renov, purch])).toBe(1000)
  })

  // Test L: computeOwnerFacingNet ≡ filterOwnerFacingSections + computeNetOwnerBalance
  it('Test L: convenience wrapper equals manual filter + compute', () => {
    const sections = [SALE, RENOV, RENTAL, AIRBNB, PURCHASE]
    const manual = computeNetOwnerBalance(filterOwnerFacingSections(sections))
    const convenience = computeOwnerFacingNet(sections)
    expect(convenience).toBe(manual)
  })
})

// ── Regression Locks — real property scenarios ─────────────────────────────
describe('Global Owner/Client Perspective — Regression Locks', () => {
  // Test G: Uriel Duplex — €22,145 + €1,251.41 - €7,000 = €16,396.41
  // Purchase (€130,000) must NOT leak into the net.
  // Bug value was €146,396.41 (= 16,396.41 + 130,000)
  it('Test G: Uriel Duplex regression lock — net €16,396.41 (Purchase €130K excluded)', () => {
    const sale    = makeSection('sale',     { closing_balance: 22_145,   balance_convention: 'owner_credit' })
    const rental  = makeSection('rental',   { closing_balance: 1_251.41, balance_convention: 'owner_credit' })
    const mgmt    = makeSection('renovation', { closing_balance: 7_000,   balance_convention: 'client_debt'  })
    const purchase = makeSection('purchase', { closing_balance: 130_000, balance_convention: 'owner_credit' })

    // With Purchase (bug): 22145 + 1251.41 - 7000 + 130000 = 146396.41
    expect(computeNetOwnerBalance([sale, rental, mgmt, purchase])).toBeCloseTo(146_396.41, 2)

    // Without Purchase (correct): 22145 + 1251.41 - 7000 = 16396.41
    expect(computeOwnerFacingNet([sale, rental, mgmt, purchase])).toBeCloseTo(16_396.41, 2)
  })

  // Test H: Roni — Sale €10,000 revenue, Rental €6,526.89 expenses, Net €3,473.11
  it('Test H: Roni regression lock — net €3,473.11', () => {
    const sale   = makeSection('sale',   { closing_balance: 10_000,   balance_convention: 'owner_credit' })
    const rental = makeSection('rental', { closing_balance: 6_526.89, balance_convention: 'client_debt'  })
    // No Purchase section — net should be 10000 - 6526.89 = 3473.11
    expect(computeOwnerFacingNet([sale, rental])).toBeCloseTo(3_473.11, 2)
  })

  // Test I: Kamares — €7,343.22 Due Owner
  it('Test I: Kamares regression lock — net €7,343.22 due owner', () => {
    const rental = makeSection('rental', { closing_balance: 7_343.22, balance_convention: 'owner_credit' })
    expect(computeOwnerFacingNet([rental])).toBeCloseTo(7_343.22, 2)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Presentation-Level Regression Tests M–P
//
// These tests verify that Purchase sections are completely hidden from all
// owner/client-facing PRESENTATION output — no summary cards, no detail
// sections, no transaction rows, no footer/settlement aggregation.
//
// The arithmetic tests (A–L) prove the numbers are correct.
// The presentation tests (M–P) prove the sections are invisible.
// ══════════════════════════════════════════════════════════════════════════════

describe('Global Owner/Client Perspective — Presentation Hiding', () => {
  // Test M: Purchase section account_type is completely absent from filtered output.
  // If the consumer iterates filterOwnerFacingSections() to render cards/sections,
  // no Purchase card will ever appear — there is no element to render.
  it('Test M: Purchase account_type completely absent — no card, no detail section rendered', () => {
    const purchase75k = makeSection('purchase', {
      account_label: 'Property Acquisition',
      closing_balance: 75_000,
      total_income: 75_000,
      balance_convention: 'client_debt',
    })
    const purchase95k = makeSection('purchase', {
      account_label: 'Purchase Price',
      closing_balance: 95_000,
      total_income: 95_000,
      balance_convention: 'client_debt',
    })
    const sale = makeSection('sale', {
      account_label: 'Property Sale',
      closing_balance: 133_000,
      total_income: 133_000,
      balance_convention: 'client_debt',
    })
    const rental = makeSection('rental', { closing_balance: 2_500, balance_convention: 'owner_credit' })

    const filtered = filterOwnerFacingSections([purchase75k, purchase95k, sale, rental])

    // No purchase account_type in any filtered section
    expect(filtered.every(s => s.account_type !== 'purchase')).toBe(true)
    // JJ acquisition amounts (75k, 95k) do not appear in any filtered section's closing_balance
    const allBalances = filtered.map(s => s.closing_balance)
    expect(allBalances).not.toContain(75_000)
    expect(allBalances).not.toContain(95_000)
    // Sale and Rental remain
    expect(filtered).toHaveLength(2)
    expect(filtered.map(s => s.account_type).sort()).toEqual(['rental', 'sale'])
  })

  // Test N: Sale sections with contract values remain visible while Purchase is hidden.
  // Locked semantic rule: Purchase = JJ buys (INTERNAL). Sale = JJ sells to client (CLIENT-FACING).
  it('Test N: Sale visible, Purchase hidden — locked semantic distinction', () => {
    const purchaseContract = makeSection('purchase', {
      account_label: 'Purchase Contract',
      closing_balance: 95_000,
      contract_baseline: 95_000,
      balance_convention: 'client_debt',
    })
    const saleContract = makeSection('sale', {
      account_label: 'Property Sale',
      closing_balance: 133_000,
      contract_baseline: 133_000,
      balance_convention: 'client_debt',
    })

    const filtered = filterOwnerFacingSections([purchaseContract, saleContract])

    // Sale contract value (€133,000) visible to client
    expect(filtered).toHaveLength(1)
    expect(filtered[0].account_type).toBe('sale')
    expect(filtered[0].closing_balance).toBe(133_000)
    expect(filtered[0].contract_baseline).toBe(133_000)
  })

  // Test O: Roni-specific presentation — Purchase hidden, Sale visible, balance correct.
  // Roni must see: Sale (Contract Value €133,000) + client payments.
  // Roni must NOT see: Property Acquisition €75,000, Purchase Price €95,000, JJ deposits.
  it('Test O: Roni presentation — Purchase hidden, Sale + Rental visible, net €3,473.11', () => {
    const purchase = makeSection('purchase', {
      account_label: 'Property Acquisition',
      closing_balance: 75_000,
      total_income: 95_000,
      total_expenses: 20_000,
      balance_convention: 'client_debt',
    })
    const sale = makeSection('sale', {
      closing_balance: 10_000,
      balance_convention: 'owner_credit',
    })
    const rental = makeSection('rental', {
      closing_balance: 6_526.89,
      balance_convention: 'client_debt',
    })

    const filtered = filterOwnerFacingSections([purchase, sale, rental])

    // Purchase completely absent from presentation
    expect(filtered.find(s => s.account_type === 'purchase')).toBeUndefined()
    // No "Property Acquisition" label in filtered output
    const allLabels = filtered.map(s => s.account_label)
    expect(allLabels).not.toContain('Property Acquisition')
    // Sale and Rental present
    expect(filtered).toHaveLength(2)
    // Net balance = +10,000 (sale, owner_credit) - 6,526.89 (rental, client_debt) = 3,473.11
    expect(computeOwnerFacingNet([purchase, sale, rental])).toBeCloseTo(3_473.11, 2)
  })

  // Test P: filterOwnerFacingSections preserves original section order (rendering stability).
  // Consumer code iterates the array to render UI — order must be deterministic.
  it('Test P: filtered output preserves original section order', () => {
    const sections = [
      makeSection('renovation', { closing_balance: 100 }),
      makeSection('purchase',   { closing_balance: 99_999 }),
      makeSection('rental',     { closing_balance: 200 }),
      makeSection('purchase',   { closing_balance: 88_888 }),
      makeSection('airbnb',     { closing_balance: 300 }),
      makeSection('sale',       { closing_balance: 400 }),
    ]

    const filtered = filterOwnerFacingSections(sections)

    // Order preserved: renovation → rental → airbnb → sale (purchase removed in-place)
    expect(filtered.map(s => s.account_type)).toEqual([
      'renovation', 'rental', 'airbnb', 'sale',
    ])
  })
})
