/**
 * JJ Property 10 — Orchestrator Unit Tests
 * Phase 2-B — 2026-07-13
 *
 * Tests the pure `assemblePortfolio` function.
 * No DB calls — all data is provided inline.
 *
 * Mock: @/lib/supabase is mocked so orchestrator.ts can be imported without
 * a real Supabase URL (createClient() would throw in the test environment).
 *
 * Coverage:
 *   T_OC1 — Two properties, owner has ownership in both → correct portfolio
 *   T_OC2 — Property with no RC3 data in reports map → skipped (not in output)
 *   T_OC3 — Empty entity list → empty portfolio, finalNetBalance = 0
 *   T_OC4 — Owner not found in one property's ownership rows → pct = 0 for that property
 */

// Jest hoists jest.mock() calls before imports, so this runs before
// orchestrator.ts loads @/lib/supabase and triggers createClient().
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  createServiceClient: jest.fn(),
  createSupabaseBrowserClient: jest.fn(),
}))

import { assemblePortfolio } from '@/lib/ownership/orchestrator'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReport(
  name: string,
  closingBalance: number,
  convention: 'owner_credit' | 'client_debt' = 'owner_credit',
): RC3PropertyReport {
  const section: RC3AccountSection = {
    account_type: 'rental',
    account_label: 'Rental',
    account_label_he: 'שכירות',
    balance_convention: convention,
    opening_balance: 0,
    rows: [],
    contract_baseline: 0,
    total_income: closingBalance > 0 ? closingBalance : 0,
    total_expenses: 0,
    total_bpo: 0,
    closing_balance: closingBalance,
  }
  return {
    reporting_name: name,
    from_date: null,
    to_date: null,
    generated_at: '2026-07-13T00:00:00.000Z',
    accounts: [section],
    has_sale: false,
    has_renovation: false,
    has_rental: true,
    has_airbnb: false,
  }
}

const REFERENCE_DATE = '2026-07-13'
const PERIOD = { from: null, to: null }

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENTITY_VM  = { id: 'e1', canonical_name: 'Villa Mazotos',   entity_type: 'partnership_property' }
const ENTITY_VM2 = { id: 'e2', canonical_name: 'Villa Mazotos 2', entity_type: 'partnership_property' }

const OWNERSHIP_VM = [
  { entity_id: 'e1', partner_name: 'Avi', ownership_pct: 50, effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { entity_id: 'e1', partner_name: 'JJ',  ownership_pct: 50, effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
]
const OWNERSHIP_VM2 = [
  { entity_id: 'e2', partner_name: 'Oren', ownership_pct: 35, effective_from: '2021-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { entity_id: 'e2', partner_name: 'JJ',   ownership_pct: 65, effective_from: '2021-01-01', effective_to: null, confirmation_status: 'confirmed' },
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assemblePortfolio', () => {
  test('T_OC1: two properties, Avi 50% in VM → correct settlement and portfolio', () => {
    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      [...OWNERSHIP_VM, ...OWNERSHIP_VM2],
      new Map([
        ['Villa Mazotos',   makeReport('Villa Mazotos',   20000)],
        ['Villa Mazotos 2', makeReport('Villa Mazotos 2', 10000)],
      ]),
      'Avi', REFERENCE_DATE, PERIOD,
    )

    expect(result.dto.selectedOwner.name).toBe('Avi')
    expect(result.dto.properties).toHaveLength(2)

    const vm = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos')!
    expect(vm.ownershipPct).toBe(50)
    expect(vm.ownerAdjustedBalance).toBeCloseTo(10000)
    expect(vm.direction).toBe('payable_to_owner')

    const vm2 = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos 2')!
    expect(vm2.ownershipPct).toBe(0)
    expect(vm2.ownerAdjustedBalance).toBeCloseTo(0)

    expect(result.dto.totalOwnerCredits).toBeCloseTo(10000)
    expect(result.dto.finalNetBalance).toBeCloseTo(10000)
    expect(result.dto.finalDirection).toBe('payable_to_owner')
    expect(result.metadata.propertyCount).toBe(2)
    expect(result.metadata.ownerName).toBe('Avi')
  })

  test('T_OC2: property with no RC3 data is silently skipped', () => {
    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      OWNERSHIP_VM,
      new Map([['Villa Mazotos', makeReport('Villa Mazotos', 8000)]]),
      'Avi', REFERENCE_DATE, PERIOD,
    )

    expect(result.dto.properties).toHaveLength(1)
    expect(result.dto.properties[0].propertyName).toBe('Villa Mazotos')
    expect(result.dto.properties[0].ownerAdjustedBalance).toBeCloseTo(4000)
  })

  test('T_OC3: no entities → empty portfolio, balance = 0, direction = settled', () => {
    const result = assemblePortfolio([], [], new Map(), 'Unknown', REFERENCE_DATE, PERIOD)

    expect(result.dto.properties).toHaveLength(0)
    expect(result.dto.finalNetBalance).toBe(0)
    expect(result.dto.finalDirection).toBe('settled')
    expect(result.metadata.propertyCount).toBe(0)
  })

  test('T_OC4: Oren 35% in VM2, not in VM → correct per-property pct', () => {
    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      [...OWNERSHIP_VM, ...OWNERSHIP_VM2],
      new Map([
        ['Villa Mazotos',   makeReport('Villa Mazotos',   20000)],
        ['Villa Mazotos 2', makeReport('Villa Mazotos 2', 10000)],
      ]),
      'Oren', REFERENCE_DATE, PERIOD,
    )

    const vm  = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos')!
    const vm2 = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos 2')!

    expect(vm.ownershipPct).toBe(0)
    expect(vm.ownerAdjustedBalance).toBeCloseTo(0)
    expect(vm2.ownershipPct).toBe(35)
    expect(vm2.ownerAdjustedBalance).toBeCloseTo(3500)
    expect(vm2.direction).toBe('payable_to_owner')
    expect(result.dto.finalNetBalance).toBeCloseTo(3500)
    expect(result.metadata.ownerName).toBe('Oren')
  })
})
