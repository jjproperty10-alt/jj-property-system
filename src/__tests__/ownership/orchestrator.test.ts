/**
 * JJ Property 10 — Orchestrator Unit Tests
 * Phase 2-B — 2026-07-13
 *
 * Tests the pure `assemblePortfolio` function.
 * No DB calls — all data is provided inline.
 *
 * Coverage:
 *   T_OC1 — Two properties, owner has ownership in both → correct portfolio
 *   T_OC2 — Property with no RC3 data in reports map → skipped (not in output)
 *   T_OC3 — Empty entity list → empty portfolio, finalNetBalance = 0
 *   T_OC4 — Owner not found in one property's ownership rows → pct = 0 for that property
 */

import { assemblePortfolio } from '@/lib/ownership/orchestrator'
import type { RC3PropertyReport, RC3AccountSection } from '@/lib/report/types'

// ─── Test helpers ──────────────────────────────────────────────────────────────

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

// ─── Test data ─────────────────────────────────────────────────────────────────

const ENTITY_VM = { id: 'e1', canonical_name: 'Villa Mazotos', entity_type: 'partnership_property' }
const ENTITY_VM2 = { id: 'e2', canonical_name: 'Villa Mazotos 2', entity_type: 'partnership_property' }

// Avi 50% in Villa Mazotos, JJ 50%
const OWNERSHIP_VM = [
  { entity_id: 'e1', partner_name: 'Avi', ownership_pct: 50, effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { entity_id: 'e1', partner_name: 'JJ', ownership_pct: 50, effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
]

// Oren 35%, JJ 65% in Villa Mazotos 2
const OWNERSHIP_VM2 = [
  { entity_id: 'e2', partner_name: 'Oren', ownership_pct: 35, effective_from: '2021-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { entity_id: 'e2', partner_name: 'JJ', ownership_pct: 65, effective_from: '2021-01-01', effective_to: null, confirmation_status: 'confirmed' },
]

// ─── T_OC1: Two properties, owner in both ─────────────────────────────────────

describe('assemblePortfolio', () => {
  test('T_OC1: two properties with confirmed ownership → correct settlements and portfolio', () => {
    const allOwnershipRows = [...OWNERSHIP_VM, ...OWNERSHIP_VM2]
    const reports = new Map([
      ['Villa Mazotos', makeReport('Villa Mazotos', 20000)],
      ['Villa Mazotos 2', makeReport('Villa Mazotos 2', 10000)],
    ])

    // Avi: 50% of VM (20000) = 10000; 0% of VM2 (not a partner) → ownershipPct = 0
    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      allOwnershipRows,
      reports,
      'Avi',
      REFERENCE_DATE,
      PERIOD,
    )

    expect(result.dto.selectedOwner.name).toBe('Avi')
    expect(result.dto.properties).toHaveLength(2)

    // Villa Mazotos: Avi 50% → ownerAdjustedBalance = 0.5 * 20000 = 10000
    const vmSettlement = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos')
    expect(vmSettlement).toBeDefined()
    expect(vmSettlement!.ownershipPct).toBe(50)
    expect(vmSettlement!.ownerAdjustedBalance).toBeCloseTo(10000)
    expect(vmSettlement!.direction).toBe('payable_to_owner')

    // Villa Mazotos 2: Avi not a partner → ownershipPct = 0, balance = 0
    const vm2Settlement = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos 2')
    expect(vm2Settlement).toBeDefined()
    expect(vm2Settlement!.ownershipPct).toBe(0)
    expect(vm2Settlement!.ownerAdjustedBalance).toBeCloseTo(0)

    // Portfolio: only VM contributes positively
    expect(result.dto.totalOwnerCredits).toBeCloseTo(10000)
    expect(result.dto.finalNetBalance).toBeCloseTo(10000)
    expect(result.dto.finalDirection).toBe('payable_to_owner')

    // Metadata
    expect(result.metadata.propertyCount).toBe(2)
    expect(result.metadata.ownerName).toBe('Avi')
  })

  // ─── T_OC2: Property in entities but missing from reports map → skipped ───

  test('T_OC2: property with no RC3 data is silently skipped', () => {
    const reports = new Map([
      // Only VM has data; VM2 has no RC3 report
      ['Villa Mazotos', makeReport('Villa Mazotos', 8000)],
    ])

    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      OWNERSHIP_VM,
      reports,
      'Avi',
      REFERENCE_DATE,
      PERIOD,
    )

    // Only Villa Mazotos should appear
    expect(result.dto.properties).toHaveLength(1)
    expect(result.dto.properties[0].propertyName).toBe('Villa Mazotos')
    expect(result.dto.properties[0].ownerAdjustedBalance).toBeCloseTo(4000) // 50% of 8000
  })

  // ─── T_OC3: Empty entity list → empty portfolio ───────────────────────────

  test('T_OC3: no entities → empty portfolio with zero net balance', () => {
    const result = assemblePortfolio(
      [],
      [],
      new Map(),
      'Unknown Owner',
      REFERENCE_DATE,
      PERIOD,
    )

    expect(result.dto.properties).toHaveLength(0)
    expect(result.dto.finalNetBalance).toBe(0)
    expect(result.dto.finalDirection).toBe('settled')
    expect(result.metadata.propertyCount).toBe(0)
  })

  // ─── T_OC4: Owner in both properties (Oren case) ─────────────────────────

  test('T_OC4: Oren 35% in VM2, not in VM → correct per-property pct', () => {
    const allOwnershipRows = [...OWNERSHIP_VM, ...OWNERSHIP_VM2]
    const reports = new Map([
      ['Villa Mazotos', makeReport('Villa Mazotos', 20000)],
      ['Villa Mazotos 2', makeReport('Villa Mazotos 2', 10000)],
    ])

    const result = assemblePortfolio(
      [ENTITY_VM, ENTITY_VM2],
      allOwnershipRows,
      reports,
      'Oren',
      REFERENCE_DATE,
      PERIOD,
    )

    // VM: Oren not a partner → pct = 0, adjusted = 0
    const vm = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos')
    expect(vm!.ownershipPct).toBe(0)
    expect(vm!.ownerAdjustedBalance).toBeCloseTo(0)

    // VM2: Oren 35% → adjusted = 0.35 * 10000 = 3500
    const vm2 = result.dto.properties.find(p => p.propertyName === 'Villa Mazotos 2')
    expect(vm2!.ownershipPct).toBe(35)
    expect(vm2!.ownerAdjustedBalance).toBeCloseTo(3500)
    expect(vm2!.direction).toBe('payable_to_owner')

    expect(result.dto.finalNetBalance).toBeCloseTo(3500)
    expect(result.metadata.ownerName).toBe('Oren')
  })
})
