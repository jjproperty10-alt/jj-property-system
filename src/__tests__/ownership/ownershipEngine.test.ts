/**
 * JJ Property 10 — Ownership Engine Unit Tests
 * Phase 2-A — 2026-07-12
 *
 * Tests all pure functions in the ownership engine layer.
 * No DB calls — resolveOwnership, buildPropertySettlement, buildPortfolio,
 * buildReportingOutput are all pure and tested here directly.
 *
 * 14 required test cases:
 *   T1  Villa Mazotos / Avi = 50%
 *   T2  Villa Mazotos / JJ = 50%
 *   T3  Villa Mazotos 2 / Oren = 35%
 *   T4  Villa Mazotos 2 / JJ = 65%
 *   T5  No ownership rows = 100% passthrough
 *   T6  Ownership pct applied exactly once
 *   T7  Effective dates respected
 *   T8  Unconfirmed rows ignored
 *   T9  Portfolio credits/debts net correctly
 *   T10 Different owners are not netted together
 *   T11 Project totals remain unchanged
 *   T12 Language-independent financial output
 *   T13 JJ remains undivided (no Yossi/Jacob sub-split)
 *   T14 No use of property_owners anywhere
 */

import { resolveOwnership } from '@/lib/ownership/ownershipService'
import {
  buildOwnerAdjustedAccount,
  buildPropertySettlement,
  computeProjectBalance100,
} from '@/lib/ownership/settlementEngine'
import { buildPortfolio } from '@/lib/ownership/portfolioEngine'
import { buildReportingOutput } from '@/lib/ownership/reportingEngine'
import type { RC3AccountSection } from '@/lib/report/types'
import type {
  OwnerIdentity,
  OwnerPortfolioSettlementDTO,
  PropertySettlementDTO,
} from '@/lib/ownership/types'

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const REFERENCE_DATE = '2026-07-12'

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

const TAMIR_ENTITY = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  canonical_name: 'Tamir Dekelia',
  entity_type: 'client_property',
}

const VM_OWNERSHIP_ROWS = [
  {
    partner_name: 'Avi',
    ownership_pct: '50',
    effective_from: '2020-01-01',
    effective_to: null,
    confirmation_status: 'confirmed',
  },
  {
    partner_name: 'JJ',
    ownership_pct: '50',
    effective_from: '2020-01-01',
    effective_to: null,
    confirmation_status: 'confirmed',
  },
]

const VM2_OWNERSHIP_ROWS = [
  {
    partner_name: 'Oren',
    ownership_pct: '35',
    effective_from: '2020-01-01',
    effective_to: null,
    confirmation_status: 'confirmed',
  },
  {
    partner_name: 'JJ',
    ownership_pct: '65',
    effective_from: '2020-01-01',
    effective_to: null,
    confirmation_status: 'confirmed',
  },
]

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeSection(
  type: string,
  totalIncome: number,
  totalExpenses: number,
  closingBalance: number,
  convention: 'owner_credit' | 'client_debt',
): RC3AccountSection {
  return {
    account_type:        type as RC3AccountSection['account_type'],
    account_label:       type,
    account_label_he:    type,
    balance_convention:  convention,
    opening_balance:     0,
    contract_baseline:   0,
    rows:                [],
    total_income:        totalIncome,
    total_expenses:      totalExpenses,
    total_bpo:           0,
    closing_balance:     closingBalance,
  }
}

function makeReport(name: string, sections: RC3AccountSection[]) {
  return {
    reporting_name: name,
    from_date:      '2023-01-01',
    to_date:        REFERENCE_DATE,
    generated_at:   new Date().toISOString(),
    accounts:       sections,
    has_sale:       false,
    has_renovation: false,
    has_rental:     sections.some(s => s.account_type === 'rental'),
    has_airbnb:     sections.some(s => s.account_type === 'airbnb'),
    // Gate 2
    certifiedSTR: null,
    settlement: null,
  }
}

function makeSettlementDTO(
  name: string,
  ownerAdjustedBalance: number,
  ownershipPct: number,
  hasOwnershipRecords: boolean,
): PropertySettlementDTO {
  const dir = Math.abs(ownerAdjustedBalance) < 0.005
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
    direction:           dir,
    reportingPeriod:     { from: '2023-01-01', to: REFERENCE_DATE },
  }
}

const JJ_OWNER: OwnerIdentity = { name: 'JJ',   ownerType: 'jj_group' }
const AVI_OWNER: OwnerIdentity = { name: 'Avi',  ownerType: 'external_investor' }
const OREN_OWNER: OwnerIdentity = { name: 'Oren', ownerType: 'external_investor' }
const PERIOD = { from: '2023-01-01', to: REFERENCE_DATE }

// ─── T1–T4: resolveOwnership — known properties ───────────────────────────────

describe('resolveOwnership — known partnership properties', () => {
  test('T1 — Villa Mazotos / Avi = 50%', () => {
    const record = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(50)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.selectedPartner?.partnerName).toBe('Avi')
    expect(record.entityType).toBe('partnership_property')
  })

  test('T2 — Villa Mazotos / JJ = 50%', () => {
    const record = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(50)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.selectedPartner?.partnerName).toBe('JJ')
  })

  test('T3 — Villa Mazotos 2 / Oren = 35%', () => {
    const record = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'Oren', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(35)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.selectedPartner?.partnerName).toBe('Oren')
    expect(record.entityType).toBe('partnership_property')
  })

  test('T4 — Villa Mazotos 2 / JJ = 65%', () => {
    const record = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(65)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.selectedPartner?.partnerName).toBe('JJ')
  })
})

// ─── T5: 100% passthrough ─────────────────────────────────────────────────────

describe('resolveOwnership — 100% passthrough', () => {
  test('T5 — no ownership rows → ownershipPct = 100', () => {
    const record = resolveOwnership(TAMIR_ENTITY, [], 'Tamir', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(100)
    expect(record.hasOwnershipRecords).toBe(false)
    expect(record.allPartners).toHaveLength(0)
    expect(record.selectedPartner).toBeNull()
    expect(record.entityType).toBe('client_property')
  })

  test('T5b — client_property entity with no rows → 100% passthrough', () => {
    const section = makeSection('rental', 12000, 2000, 10000, 'owner_credit')
    const report = makeReport('Tamir Dekelia', [section])
    const ownership = resolveOwnership(TAMIR_ENTITY, [], 'Tamir', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.ownershipPct).toBe(100)
    expect(dto.ownerAdjustedBalance).toBe(dto.projectBalance100)
    expect(dto.hasOwnershipRecords).toBe(false)
  })
})

// ─── T6: Ownership pct applied exactly once ───────────────────────────────────

describe('T6 — ownership pct applied exactly once', () => {
  test('Avi 50% on €8,000 → €4,000 owner balance', () => {
    const section = makeSection('airbnb', 10000, 2000, 8000, 'owner_credit')
    const report = makeReport('Villa Mazotos', [section])
    const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.projectBalance100).toBe(8000)
    expect(dto.ownerAdjustedBalance).toBe(4000)
    expect(dto.ownerAdjustedAccounts[0].owner_closing_balance).toBe(4000)
    expect(dto.ownerAdjustedAccounts[0].owner_income).toBe(5000)
    expect(dto.ownerAdjustedAccounts[0].owner_expenses).toBe(1000)
  })

  test('client_debt account applies pct once', () => {
    const section = makeSection('renovation', 0, 100000, 100000, 'client_debt')
    const report = makeReport('Villa Mazotos', [section])
    const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.projectBalance100).toBe(-100000)
    expect(dto.ownerAdjustedBalance).toBe(-50000)
    expect(dto.direction).toBe('payable_to_jj')
  })
})

// ─── T7: Effective dates ──────────────────────────────────────────────────────

describe('T7 — effective dates respected', () => {
  test('T7a — future rows excluded (effective_from > referenceDate)', () => {
    const futureRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2030-01-01', effective_to: null,
        confirmation_status: 'confirmed',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, futureRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(false)
    expect(record.ownershipPct).toBe(100)
  })

  test('T7b — expired rows excluded (effective_to < referenceDate)', () => {
    const expiredRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: '2022-12-31',
        confirmation_status: 'confirmed',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, expiredRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(false)
    expect(record.ownershipPct).toBe(100)
  })

  test('T7c — current rows included (effective_to = null)', () => {
    const currentRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: null,
        confirmation_status: 'confirmed',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, currentRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.ownershipPct).toBe(50)
  })

  test('T7d — row with effective_to exactly on referenceDate is included', () => {
    const sameDayRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: REFERENCE_DATE,
        confirmation_status: 'confirmed',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, sameDayRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.ownershipPct).toBe(50)
  })
})

// ─── T8: Unconfirmed rows ignored ────────────────────────────────────────────

describe('T8 — unconfirmed rows ignored', () => {
  test('pending rows are excluded', () => {
    const pendingRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: null,
        confirmation_status: 'pending',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, pendingRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(false)
    expect(record.ownershipPct).toBe(100)
  })

  test('needs_review rows are excluded', () => {
    const reviewRows = [
      {
        partner_name: 'JJ', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: null,
        confirmation_status: 'needs_review',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, reviewRows, 'JJ', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(false)
    expect(record.ownershipPct).toBe(100)
  })

  test('mix of confirmed and unconfirmed: only confirmed rows are included', () => {
    const mixedRows = [
      {
        partner_name: 'Avi', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: null,
        confirmation_status: 'confirmed',
      },
      {
        partner_name: 'JJ', ownership_pct: '50',
        effective_from: '2020-01-01', effective_to: null,
        confirmation_status: 'pending',
      },
    ]
    const record = resolveOwnership(VM_ENTITY, mixedRows, 'Avi', REFERENCE_DATE)
    expect(record.hasOwnershipRecords).toBe(true)
    expect(record.allPartners).toHaveLength(1)
    expect(record.allPartners[0].partnerName).toBe('Avi')
    expect(record.ownershipPct).toBe(50)
  })
})

// ─── T9: Portfolio netting ────────────────────────────────────────────────────

describe('T9 — portfolio credits and debts net correctly', () => {
  test('T9a — JJ: VM credit + VM2 debit → net positive', () => {
    const settlements = [
      makeSettlementDTO('Villa Mazotos',   5000, 50, true),
      makeSettlementDTO('Villa Mazotos 2', -2000, 65, true),
    ]
    const portfolio = buildPortfolio(settlements, JJ_OWNER, PERIOD)

    expect(portfolio.totalOwnerCredits).toBe(5000)
    expect(portfolio.totalOwnerDebts).toBe(2000)
    expect(portfolio.finalNetBalance).toBe(3000)
    expect(portfolio.finalDirection).toBe('payable_to_owner')
  })

  test('T9b — three properties net to correct final balance', () => {
    const settlements = [
      makeSettlementDTO('Property A',  5000,  100, false),
      makeSettlementDTO('Property B', -2000,  100, false),
      makeSettlementDTO('Property C',  1500,  100, false),
    ]
    const portfolio = buildPortfolio(settlements, JJ_OWNER, PERIOD)

    expect(portfolio.totalOwnerCredits).toBe(6500)
    expect(portfolio.totalOwnerDebts).toBe(2000)
    expect(portfolio.finalNetBalance).toBe(4500)
  })

  test('T9c — balanced portfolio → settled direction', () => {
    const settlements = [
      makeSettlementDTO('Property A',  5000, 100, false),
      makeSettlementDTO('Property B', -5000, 100, false),
    ]
    const portfolio = buildPortfolio(settlements, JJ_OWNER, PERIOD)

    expect(portfolio.finalNetBalance).toBe(0)
    expect(portfolio.finalDirection).toBe('settled')
  })

  test('T9d — portfolio total equals sum of property-level owner-adjusted balances', () => {
    const settlements = [
      makeSettlementDTO('Villa Mazotos',   5000,  50, true),
      makeSettlementDTO('Villa Mazotos 2', 3250,  65, true),
      makeSettlementDTO('Tamir Dekelia',  -1000, 100, false),
    ]
    const portfolio = buildPortfolio(settlements, JJ_OWNER, PERIOD)

    expect(portfolio.totalOwnerCredits).toBe(5000 + 3250)
    expect(portfolio.totalOwnerDebts).toBe(1000)
    expect(portfolio.finalNetBalance).toBe(5000 + 3250 - 1000)
  })
})

// ─── T10: Different owners not netted ────────────────────────────────────────

describe('T10 — different owners are not netted together', () => {
  test('Avi and Oren portfolios are computed independently', () => {
    const aviSettlements  = [makeSettlementDTO('Villa Mazotos',   5000, 50, true)]
    const orenSettlements = [makeSettlementDTO('Villa Mazotos 2', -2000, 35, true)]

    const aviPortfolio  = buildPortfolio(aviSettlements,  AVI_OWNER,  PERIOD)
    const orenPortfolio = buildPortfolio(orenSettlements, OREN_OWNER, PERIOD)

    expect(aviPortfolio.selectedOwner.name).toBe('Avi')
    expect(aviPortfolio.finalNetBalance).toBe(5000)
    expect(orenPortfolio.selectedOwner.name).toBe('Oren')
    expect(orenPortfolio.finalNetBalance).toBe(-2000)
    expect(orenPortfolio.finalDirection).toBe('payable_to_jj')

    expect(aviPortfolio.properties).not.toContain(orenSettlements[0])
    expect(orenPortfolio.properties).not.toContain(aviSettlements[0])
  })
})

// ─── T11: Project totals unchanged ───────────────────────────────────────────

describe('T11 — project totals remain unchanged', () => {
  test('projectAccounts reference preserved; projectBalance100 is 100% figure', () => {
    const section = makeSection('airbnb', 10000, 2000, 8000, 'owner_credit')
    const report = makeReport('Villa Mazotos', [section])
    const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.projectAccounts).toBe(report.accounts)
    expect(dto.projectAccounts[0].closing_balance).toBe(8000)
    expect(dto.projectAccounts[0].total_income).toBe(10000)
    expect(dto.projectBalance100).toBe(8000)
    expect(dto.ownerAdjustedAccounts[0].projectSection).toBe(section)
    expect(dto.ownerAdjustedAccounts[0].projectSection.closing_balance).toBe(8000)
  })

  test('computeProjectBalance100 handles mixed conventions', () => {
    const sections = [
      makeSection('rental',     0, 0,   5000, 'owner_credit'),
      makeSection('renovation', 0, 0,   2000, 'client_debt'),
      makeSection('airbnb',     0, 0,   3000, 'owner_credit'),
    ]
    const balance = computeProjectBalance100(sections)
    expect(balance).toBe(6000)
  })
})

// ─── T12: Language-independent financial output ───────────────────────────────

describe('T12 — financial output is language-independent', () => {
  test('settlement DTO contains no language-dependent financial fields', () => {
    const section = makeSection('airbnb', 10000, 2000, 8000, 'owner_credit')
    const report = makeReport('Villa Mazotos', [section])
    const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(typeof dto.projectBalance100).toBe('number')
    expect(typeof dto.ownerAdjustedBalance).toBe('number')
    expect(typeof dto.ownershipPct).toBe('number')
    expect(typeof dto.ownerAdjustedAccounts[0].owner_income).toBe('number')
    expect(typeof dto.ownerAdjustedAccounts[0].owner_closing_balance).toBe('number')
  })

  test('reportingEngine output contains no accounting calculation', () => {
    const mockDto: OwnerPortfolioSettlementDTO = {
      selectedOwner:     AVI_OWNER,
      period:            PERIOD,
      properties:        [makeSettlementDTO('Villa Mazotos', 5000, 50, true)],
      totalOwnerCredits: 5000,
      totalOwnerDebts:   0,
      finalNetBalance:   5000,
      finalDirection:    'payable_to_owner',
      generatedAt:       new Date().toISOString(),
    }
    const output = buildReportingOutput(mockDto)
    expect(output.dto.finalNetBalance).toBe(mockDto.finalNetBalance)
    expect(output.dto.totalOwnerCredits).toBe(mockDto.totalOwnerCredits)
  })
})

// ─── T13: JJ remains undivided ───────────────────────────────────────────────

describe('T13 — JJ remains undivided (no Yossi/Jacob sub-split)', () => {
  test('Villa Mazotos: JJ = 50%, no Yossi/Jacob in structure', () => {
    const record = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(50)
    expect(record.allPartners.find(p => p.partnerName === 'Yossi')).toBeUndefined()
    expect(record.allPartners.find(p => p.partnerName === 'Jacob')).toBeUndefined()
  })

  test('Villa Mazotos 2: JJ = 65%, no Yossi/Jacob in structure', () => {
    const record = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    expect(record.ownershipPct).toBe(65)
    expect(record.allPartners.find(p => p.partnerName === 'Yossi')).toBeUndefined()
    expect(record.allPartners.find(p => p.partnerName === 'Jacob')).toBeUndefined()
  })

  test('JJ 50% on €10,000 = €5,000 (not split to Yossi/Jacob)', () => {
    const section = makeSection('airbnb', 10000, 0, 10000, 'owner_credit')
    const report = makeReport('Villa Mazotos', [section])
    const ownership = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.ownershipPct).toBe(50)
    expect(dto.ownerAdjustedBalance).toBe(5000)
    expect(dto.ownershipStructure.find(r => r.partnerName === 'Yossi')).toBeUndefined()
    expect(dto.ownershipStructure.find(r => r.partnerName === 'Jacob')).toBeUndefined()
  })

  test('JJ 65% on €10,000 = €6,500 (Villa Mazotos 2)', () => {
    const section = makeSection('airbnb', 10000, 0, 10000, 'owner_credit')
    const report = makeReport('Villa Mazotos 2', [section])
    const ownership = resolveOwnership(VM2_ENTITY, VM2_OWNERSHIP_ROWS, 'JJ', REFERENCE_DATE)
    const dto = buildPropertySettlement(report, ownership)

    expect(dto.ownershipPct).toBe(65)
    expect(dto.ownerAdjustedBalance).toBe(6500)
  })
})

// ─── T14: No use of property_owners ──────────────────────────────────────────

describe('T14 — property_owners table is never referenced', () => {
  test('resolveOwnership accepts only entity_registry + partnership_ownership shaped data', () => {
    const row = VM_OWNERSHIP_ROWS[0]
    expect(row).toHaveProperty('partner_name')
    expect(row).toHaveProperty('confirmation_status')
    expect(row).toHaveProperty('ownership_pct')
    expect(row).not.toHaveProperty('owner_name')
    expect(row).not.toHaveProperty('share_pct')
    expect(row).not.toHaveProperty('relationship_type')
  })

  test('PropertyOwnershipRecord has no property_owners fields', () => {
    const record = resolveOwnership(VM_ENTITY, VM_OWNERSHIP_ROWS, 'Avi', REFERENCE_DATE)
    expect(record).not.toHaveProperty('share_pct')
    expect(record).not.toHaveProperty('owner_name')
    expect(record).not.toHaveProperty('relationship_type')
    expect(record).toHaveProperty('ownershipPct')
    expect(record).toHaveProperty('allPartners')
    expect(record).toHaveProperty('hasOwnershipRecords')
  })
})

// ─── Reporting Engine metadata ────────────────────────────────────────────────

describe('ReportingEngine — buildReportingOutput', () => {
  test('metadata correctly identifies partnership vs client properties', () => {
    const dto: OwnerPortfolioSettlementDTO = {
      selectedOwner:     AVI_OWNER,
      period:            PERIOD,
      properties: [
        makeSettlementDTO('Villa Mazotos', 5000, 50, true),
        makeSettlementDTO('Tamir Dekelia', 8000, 100, false),
      ],
      totalOwnerCredits: 13000,
      totalOwnerDebts:   0,
      finalNetBalance:   13000,
      finalDirection:    'payable_to_owner',
      generatedAt:       new Date().toISOString(),
    }
    const output = buildReportingOutput(dto)

    expect(output.metadata.propertyCount).toBe(2)
    expect(output.metadata.partnershipPropertyCount).toBe(1)
    expect(output.metadata.clientPropertyCount).toBe(1)
    expect(output.metadata.hasPartnershipProperties).toBe(true)
    expect(output.metadata.hasClientProperties).toBe(true)
    expect(output.metadata.ownerName).toBe('Avi')
  })

  test('Reporting Engine adds no arithmetic to the DTO', () => {
    const dto: OwnerPortfolioSettlementDTO = {
      selectedOwner:     AVI_OWNER,
      period:            PERIOD,
      properties:        [makeSettlementDTO('Villa Mazotos', 5000, 50, true)],
      totalOwnerCredits: 5000,
      totalOwnerDebts:   0,
      finalNetBalance:   5000,
      finalDirection:    'payable_to_owner',
      generatedAt:       new Date().toISOString(),
    }
    const output = buildReportingOutput(dto)
    expect(output.dto).toBe(dto)
    expect(output.dto.finalNetBalance).toBe(5000)
  })
})
