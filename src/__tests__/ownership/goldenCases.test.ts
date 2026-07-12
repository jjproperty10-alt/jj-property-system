/**
 * JJ Property 10 — Ownership Engine: Golden Case Suite
 * Phase 2-B QA — 2026-07-13
 *
 * 18 deterministic tests across 6 golden cases.
 * Expected values are independently calculated from first principles
 * (arithmetic verified below each expect call in a comment).
 *
 * Golden Cases:
 *   G1  Villa Mazotos / Avi   — 50%, positive balance   (5 tests)
 *   G2  Villa Mazotos / JJ    — 50%, symmetric with Avi (2 tests)
 *   G3  Villa Mazotos 2 / Oren — 35%, negative balance  (3 tests)
 *   G4  Villa Mazotos 2 / JJ  — 65%, negative balance   (3 tests)
 *   G5  Client property        — 100% passthrough        (3 tests)
 *   G6  Multi-property portfolio (JJ: VM@50% + VM2@65%) (2 tests)
 *
 * Mock RC3 figures (simple round numbers for obvious arithmetic):
 *   Villa Mazotos:
 *     airbnb     — owner_credit — closing_balance = €8,000
 *     renovation — client_debt  — closing_balance = €3,000
 *     projectBalance100 = +8,000 − 3,000 = +5,000
 *
 *   Villa Mazotos 2:
 *     purchase — client_debt — closing_balance = €10,000
 *     projectBalance100 = −10,000
 *
 *   Liron (client property):
 *     rental — owner_credit — closing_balance = €5,000
 *     projectBalance100 = +5,000
 */

// MUST be first — jest.mock is hoisted before imports.
// Prevents createClient() from throwing "supabaseUrl is required" at module load.
jest.mock('@/lib/supabase', () => ({
  supabase: {},
  createServiceClient: jest.fn(),
  createSupabaseBrowserClient: jest.fn(),
}))

import { resolveOwnership } from '@/lib/ownership/ownershipService'
import {
  buildPropertySettlement,
  computeProjectBalance100,
} from '@/lib/ownership/settlementEngine'
import { buildPortfolio } from '@/lib/ownership/portfolioEngine'
import type { RC3AccountSection } from '@/lib/report/types'
import type { OwnerIdentity, PropertySettlementDTO } from '@/lib/ownership/types'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const REF_DATE = '2026-07-13'
const PERIOD   = { from: '2020-01-01', to: REF_DATE }

const VM_ENTITY = {
  id: 'd7261371-a473-4d39-a0c7-75a4211c2c71',
  canonical_name: 'Villa Mazotos',
  entity_type: 'partnership_property',
}

const VM2_ENTITY = {
  id: '0918755d-9c9f-42fd-ba07-630826065bc0',
  canonical_name: 'Villa Mazotos 2',
  entity_type: 'partnership_property',
}

const LIRON_ENTITY = {
  id: 'cccccccc-0000-0000-0000-000000000001',
  canonical_name: 'Liron and Alon',
  entity_type: 'client_property',
}

// Live ownership rows (mirror production partnership_ownership records)
const VM_OWNERSHIP_ROWS = [
  { partner_name: 'Avi', ownership_pct: '50', effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { partner_name: 'JJ',  ownership_pct: '50', effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
]

const VM2_OWNERSHIP_ROWS = [
  { partner_name: 'Oren', ownership_pct: '35', effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
  { partner_name: 'JJ',   ownership_pct: '65', effective_from: '2020-01-01', effective_to: null, confirmation_status: 'confirmed' },
]

const AVI_OWNER:  OwnerIdentity = { name: 'Avi',  ownerType: 'external_investor' }
const JJ_OWNER:   OwnerIdentity = { name: 'JJ',   ownerType: 'jj_group' }
const OREN_OWNER: OwnerIdentity = { name: 'Oren', ownerType: 'external_investor' }

// ─── Mock RC3 helpers ─────────────────────────────────────────────────────────

function makeSection(
  type: string,
  totalIncome: number,
  totalExpenses: number,
  closingBalance: number,
  convention: 'owner_credit' | 'client_debt',
): RC3AccountSection {
  return {
    account_type:       type as RC3AccountSection['account_type'],
    account_label:      type,
    account_label_he:   type,
    balance_convention: convention,
    opening_balance:    0,
    contract_baseline:  0,
    rows:               [],
    total_income:       totalIncome,
    total_expenses:     totalExpenses,
    total_bpo:          0,
    closing_balance:    closingBalance,
  }
}

function makeReport(name: string, sections: RC3AccountSection[]) {
  return {
    reporting_name: name,
    from_date:      PERIOD.from,
    to_date:        PERIOD.to,
    generated_at:   new Date().toISOString(),
    accounts:       sections,
    has_sale:       false,
    has_renovation: sections.some(s => s.account_type === 'renovation'),
    has_rental:     sections.some(s => s.account_type === 'rental'),
    has_airbnb:     sections.some(s => s.account_type === 'airbnb'),
  }
}

/**
 * Build a minimal PropertySettlementDTO for portfolio tests.
 * Keeps G6 clean — portfolio netting tests only need the balance.
 */
function makeSettlement(
  name: string,
  ownerAdjustedBalance: number,
  ownershipPct: number,
  hasOwnershipRecords: boolean,
): PropertySettlementDTO {
  const direction =
    Math.abs(ownerAdjustedBalance) < 0.005
      ? ('settled' as const)
      : ownerAdjustedBalance > 0
      ? ('payable_to_owner' as const)
      : ('payable_to_jj' as const)

  const projectBalance100 =
    ownershipPct !== 0
      ? Math.round((ownerAdjustedBalance / ownershipPct) * 100 * 100) / 100
      : 0

  return {
    propertyName:        name,
    entityType:          hasOwnershipRecords ? 'partnership_property' : 'client_property',
    hasOwnershipRecords,
    ownershipPct,
    ownershipStructure:  [],
    projectBalance100,
    projectAccounts:     [],
    ownerAdjustedBalance,
    ownerAdjustedAccounts: [],
    direction,
    reportingPeriod:     PERIOD,
  }
}

// ─── Mock RC3 figures for G1–G5 ──────────────────────────────────────────────

// Villa Mazotos: airbnb owner_credit €8,000  +  renovation client_debt €3,000
// projectBalance100 = +8,000 − 3,000 = +5,000
const VM_SECTIONS = [
  makeSection('airbnb',     20_000, 12_000, 8_000, 'owner_credit'),
  makeSection('renovation',      0, 50_000, 3_000, 'client_debt'),
]
const VM_REPORT = makeReport('Villa Mazotos', VM_SECTIONS)

// Villa Mazotos 2: purchase client_debt €10,000
// projectBalance100 = −10,000
const VM2_SECTIONS = [
  makeSection('purchase', 0, 10_000, 10_000, 'client_debt'),
]
const VM2_REPORT = makeReport('Villa Mazotos 2', VM2_SECTIONS)

// Liron (client): rental owner_credit €5,000 — 100% passthrough
const LIRON_SECTIONS = [
  makeSection('rental', 8_000, 3_000, 5_000, 'owner_credit'),
]
const LIRON_REPORT = makeReport('Liron and Alon', LIRON_SECTIONS)

// ─────────────────────────────────────────────────────────────────────────────
// G1 — Villa Mazotos / Avi (50%, positive balance)
// Independent arithmetic:
//   projectBalance100 = +8,000 − 3,000 = +5,000
//   ownerAdjustedBalance = round(5,000 × 50/100) = 2,500
//   direction = 'payable_to_owner' (positive → JJ owes Avi)
//   airbnb adjusted = round(8,000 × 0.50) = 4,000
//   renovation adjusted = round(3,000 × 0.50) = 1,500
// ─────────────────────────────────────────────────────────────────────────────

describe('G1 — Villa Mazotos / Avi (50%)', () => {
  const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REF_DATE)
  const dto = buildPropertySettlement(VM_REPORT, ownership)

  test('G1-T01 — ownershipPct = 50', () => {
    expect(dto.ownershipPct).toBe(50)
  })

  test('G1-T02 — projectBalance100 = 5,000 (sum of mixed conventions, 100% untouched)', () => {
    // +8,000 (owner_credit) − 3,000 (client_debt) = 5,000
    expect(dto.projectBalance100).toBe(5_000)
    expect(dto.projectAccounts[0].closing_balance).toBe(8_000)
    expect(dto.projectAccounts[1].closing_balance).toBe(3_000)
  })

  test('G1-T03 — ownerAdjustedBalance = 2,500 (projectBalance100 × 50%)', () => {
    // 5,000 × 0.50 = 2,500
    expect(dto.ownerAdjustedBalance).toBe(2_500)
  })

  test('G1-T04 — direction = payable_to_owner (positive adjusted balance)', () => {
    expect(dto.direction).toBe('payable_to_owner')
  })

  test('G1-T05 — per-account owner balances scaled correctly', () => {
    const airbnb     = dto.ownerAdjustedAccounts.find(a => a.account_type === 'airbnb')!
    const renovation = dto.ownerAdjustedAccounts.find(a => a.account_type === 'renovation')!
    // airbnb:     8,000 × 0.50 = 4,000
    // renovation: 3,000 × 0.50 = 1,500
    expect(airbnb.owner_closing_balance).toBe(4_000)
    expect(renovation.owner_closing_balance).toBe(1_500)
    // income / expenses also scaled once
    expect(airbnb.owner_income).toBe(10_000)    // 20,000 × 0.50
    expect(airbnb.owner_expenses).toBe(6_000)   // 12,000 × 0.50
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G2 — Villa Mazotos / JJ (50%, symmetric with Avi)
// Independent arithmetic:
//   ownerAdjustedBalance = 5,000 × 50% = 2,500 (same as Avi)
//   JJ remains undivided — no Yossi / Jacob in structure
// ─────────────────────────────────────────────────────────────────────────────

describe('G2 — Villa Mazotos / JJ (50%)', () => {
  const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'JJ', REF_DATE)
  const dto = buildPropertySettlement(VM_REPORT, ownership)

  test('G2-T06 — JJ ownerAdjustedBalance = 2,500 (same as Avi — symmetric 50%)', () => {
    expect(dto.ownershipPct).toBe(50)
    // JJ gets 50% of 5,000 = 2,500 — NOT further split to Yossi/Jacob
    expect(dto.ownerAdjustedBalance).toBe(2_500)
  })

  test('G2-T07 — JJ is undivided: no Yossi or Jacob in ownershipStructure', () => {
    const names = dto.ownershipStructure.map(r => r.partnerName)
    expect(names).not.toContain('Yossi')
    expect(names).not.toContain('Jacob')
    expect(names).toContain('JJ')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G3 — Villa Mazotos 2 / Oren (35%, negative balance)
// Independent arithmetic:
//   projectBalance100 = −10,000  (client_debt: −closing_balance)
//   ownerAdjustedBalance = round(−10,000 × 35/100) = −3,500
//   direction = 'payable_to_jj'
// ─────────────────────────────────────────────────────────────────────────────

describe('G3 — Villa Mazotos 2 / Oren (35%)', () => {
  const ownership = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'Oren', REF_DATE)
  const dto = buildPropertySettlement(VM2_REPORT, ownership)

  test('G3-T08 — ownershipPct = 35', () => {
    expect(dto.ownershipPct).toBe(35)
  })

  test('G3-T09 — client_debt convention yields negative projectBalance100', () => {
    // client_debt: contributes −closing_balance to projectBalance100
    expect(dto.projectBalance100).toBe(-10_000)
  })

  test('G3-T10 — ownerAdjustedBalance = −3,500, direction = payable_to_jj', () => {
    // round(−10,000 × 0.35) = −3,500
    expect(dto.ownerAdjustedBalance).toBe(-3_500)
    expect(dto.direction).toBe('payable_to_jj')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G4 — Villa Mazotos 2 / JJ (65%, negative balance)
// Independent arithmetic:
//   projectBalance100 = −10,000
//   ownerAdjustedBalance = round(−10,000 × 65/100) = −6,500
//   Oren (35%) + JJ (65%) = 100%
// ─────────────────────────────────────────────────────────────────────────────

describe('G4 — Villa Mazotos 2 / JJ (65%)', () => {
  const ownership = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'JJ', REF_DATE)
  const dto = buildPropertySettlement(VM2_REPORT, ownership)

  test('G4-T11 — ownershipPct = 65', () => {
    expect(dto.ownershipPct).toBe(65)
  })

  test('G4-T12 — ownership structure sums to 100% (Oren 35 + JJ 65)', () => {
    const total = dto.ownershipStructure.reduce((s, r) => s + r.ownershipPct, 0)
    expect(total).toBe(100)
  })

  test('G4-T13 — ownerAdjustedBalance = −6,500 (−10,000 × 65%)', () => {
    // round(−10,000 × 0.65) = −6,500
    expect(dto.ownerAdjustedBalance).toBe(-6_500)
    expect(dto.direction).toBe('payable_to_jj')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G5 — Client property (Liron) — 100% passthrough
// Independent arithmetic:
//   no ownership rows → hasOwnershipRecords = false → ownershipPct = 100
//   projectBalance100 = +5,000
//   ownerAdjustedBalance = 5,000 × 100% = 5,000 (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

describe('G5 — Client property passthrough (Liron)', () => {
  const ownership = resolveOwnership(LIRON_ENTITY, [], 'Liron', REF_DATE)
  const dto = buildPropertySettlement(LIRON_REPORT, ownership)

  test('G5-T14 — hasOwnershipRecords = false, ownershipPct = 100', () => {
    expect(dto.hasOwnershipRecords).toBe(false)
    expect(dto.ownershipPct).toBe(100)
  })

  test('G5-T15 — ownerAdjustedBalance equals projectBalance100 (full passthrough)', () => {
    // 5,000 × 100% = 5,000 — no reduction applied
    expect(dto.ownerAdjustedBalance).toBe(dto.projectBalance100)
    expect(dto.ownerAdjustedBalance).toBe(5_000)
  })

  test('G5-T16 — direction = payable_to_owner (JJ owes client)', () => {
    expect(dto.direction).toBe('payable_to_owner')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G6 — Multi-property portfolio: JJ (VM@50% + VM2@65%)
// Independent arithmetic:
//   VM  → ownerAdjustedBalance = +2,500 (credit)
//   VM2 → ownerAdjustedBalance = −6,500 (debt)
//   totalOwnerCredits = 2,500
//   totalOwnerDebts   = 6,500
//   finalNetBalance   = 2,500 − 6,500 = −4,000
//   finalDirection    = 'payable_to_jj'
// ─────────────────────────────────────────────────────────────────────────────

describe('G6 — Multi-property portfolio: JJ (Villa Mazotos 50% + Villa Mazotos 2 65%)', () => {
  const jjVm  = makeSettlement('Villa Mazotos',    2_500, 50, true)
  const jjVm2 = makeSettlement('Villa Mazotos 2', -6_500, 65, true)
  const portfolio = buildPortfolio([jjVm, jjVm2], JJ_OWNER, PERIOD)

  test('G6-T17 — totalOwnerCredits = 2,500 and totalOwnerDebts = 6,500', () => {
    expect(portfolio.totalOwnerCredits).toBe(2_500)
    expect(portfolio.totalOwnerDebts).toBe(6_500)
    expect(portfolio.selectedOwner.name).toBe('JJ')
    expect(portfolio.properties).toHaveLength(2)
  })

  test('G6-T18 — finalNetBalance = −4,000 and finalDirection = payable_to_jj', () => {
    // 2,500 − 6,500 = −4,000
    expect(portfolio.finalNetBalance).toBe(-4_000)
    expect(portfolio.finalDirection).toBe('payable_to_jj')
  })
})
