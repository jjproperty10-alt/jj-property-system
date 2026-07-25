/**
 * ownerPortfolioAdapter.test.ts
 *
 * Tests for G3-B Portfolio Adapter:
 * - Maps listAuditableProperties() → HostawayPortfolioSummaryDTO
 * - Empty list → empty portfolio DTO
 * - All financial fields null (RC2 scope)
 * - Service throws → empty portfolio (graceful fallback)
 * - No per-property audit runs in V1
 */

jest.mock('server-only', () => ({}), { virtual: true })

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({}),
}))

const mockListAuditableProperties = jest.fn()
const mockAuditProperty           = jest.fn()

jest.mock('@/lib/hostaway-audit', () => ({
  PropertyAuditService: jest.fn().mockImplementation(() => ({
    listAuditableProperties: (...args: unknown[]) => mockListAuditableProperties(...args),
    auditProperty:           (...args: unknown[]) => mockAuditProperty(...args),
  })),
}))

import { getPortfolio } from '@/lib/owners/ownerPortfolioAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAuditableProperty(overrides: {
  jjPropertyName?: string
  hostawayPropertyId?: string
  hostawayName?: string
} = {}) {
  return {
    jjPropertyName:     overrides.jjPropertyName     ?? 'Villa Mazotos',
    hostawayPropertyId: overrides.hostawayPropertyId ?? 'ha-001',
    hostawayName:       overrides.hostawayName       ?? 'Villa Mazotos Hostaway',
    hostawayInternalName: null,
    mappingConfidence: 'exact',
    mappingStatus:     'approved',
  }
}

const BASE_INPUT = {
  startDate: '2026-07-01',
  endDate:   '2026-07-31',
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ownerPortfolioAdapter.getPortfolio', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('returns empty portfolio when listAuditableProperties returns empty array', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([])

    const result = await getPortfolio(BASE_INPUT)

    expect(result.properties).toEqual([])
    expect(result.totals.reservations).toBe(0)
    expect(result.totals.revenueEur).toBeNull()
    expect(result.sourceMode).toBe('hostaway')
    expect(result.period.startDate).toBe('2026-07-01')
    expect(result.period.endDate).toBe('2026-07-31')
  })

  it('maps each AuditableProperty to HostawayPropertySummaryDTO', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([
      makeAuditableProperty({ jjPropertyName: 'Villa Mazotos', hostawayName: 'Villa Mazotos Hostaway' }),
      makeAuditableProperty({ jjPropertyName: 'Tamir Dekelia', hostawayName: 'Tamir Dekelia HA' }),
    ])

    const result = await getPortfolio(BASE_INPUT)

    expect(result.properties).toHaveLength(2)
    const vm = result.properties.find(p => p.propertyName === 'Villa Mazotos')
    expect(vm).toBeDefined()
    expect(vm!.canonicalName).toBe('Villa Mazotos Hostaway')
    expect(vm!.mappingStatus).toBe('mapped')

    const td = result.properties.find(p => p.propertyName === 'Tamir Dekelia')
    expect(td).toBeDefined()
    expect(td!.mappingStatus).toBe('mapped')
  })

  it('all financial fields are null (explicit RC2-scope unavailability, not fabricated)', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([
      makeAuditableProperty(),
    ])

    const result = await getPortfolio(BASE_INPUT)

    const prop = result.properties[0]
    expect(prop.platformIncomeEur).toBeNull()
    expect(prop.platformFeesEur).toBeNull()
    expect(prop.cleaningIncomeEur).toBeNull()
    expect(prop.cleaningExpenseEur).toBeNull()
    expect(prop.operationalExpensesEur).toBeNull()
    expect(prop.managementFeeEur).toBeNull()
    expect(prop.ownerDueEur).toBeNull()
    // Portfolio totals also null
    expect(result.totals.revenueEur).toBeNull()
    expect(result.totals.feesEur).toBeNull()
    expect(result.totals.cleaningEur).toBeNull()
    expect(result.totals.ownerDueEur).toBeNull()
  })

  it('does not call auditProperty (no per-property audit runs in V1)', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([
      makeAuditableProperty(),
      makeAuditableProperty({ jjPropertyName: 'Tamir Dekelia' }),
    ])

    await getPortfolio(BASE_INPUT)

    expect(mockAuditProperty).not.toHaveBeenCalled()
  })

  it('returns empty portfolio when listAuditableProperties throws (graceful fallback)', async () => {
    mockListAuditableProperties.mockRejectedValueOnce(new Error('[TEST] service unavailable'))

    const result = await getPortfolio(BASE_INPUT)

    expect(result.properties).toEqual([])
    expect(result.totals.revenueEur).toBeNull()
    expect(result.reconciliation.matchedCount).toBe(0)
    expect(result.propertiesNeedingAttention).toEqual([])
  })

  it('sourceMode is always "hostaway"', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([makeAuditableProperty()])
    const result = await getPortfolio(BASE_INPUT)
    expect(result.sourceMode).toBe('hostaway')
  })

  it('reconciliation block is zero/false in V1 (requires audit runs, RC2 scope)', async () => {
    mockListAuditableProperties.mockResolvedValueOnce([makeAuditableProperty()])
    const result = await getPortfolio(BASE_INPUT)
    expect(result.reconciliation.matchedCount).toBe(0)
    expect(result.reconciliation.missingInJJ).toBe(0)
    expect(result.reconciliation.missingInHostaway).toBe(0)
    expect(result.reconciliation.amountDifferenceEur).toBeNull()
    expect(result.reconciliation.hasDifferences).toBe(false)
  })
})
