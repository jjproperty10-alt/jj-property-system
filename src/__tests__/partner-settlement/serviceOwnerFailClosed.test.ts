/**
 * Stage 2.2 — service-level integration proof (QA blocker #8).
 * When the external-owner source (contact_properties) FAILS, the report must fail
 * closed: no jj/jj_company owner-dependent transaction may enter any subtotal / current
 * account / property position; OWNER_SOURCE_UNAVAILABLE is surfaced; the headline stays
 * blocked. Partnership properties (never owner-dependent) still compute.
 *
 * All I/O adapters are mocked; the engine / scope / gate run for real.
 */

jest.mock('server-only', () => ({}))

// Chainable Supabase stub for buildJjPosition (v_jj_company_pl → maybeSingle).
jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ maybeSingle: async () => ({ data: null }) }) }),
  }),
}))

const readCashboxes = jest.fn()
const readReceivables = jest.fn()
const readOwnership = jest.fn()
const readPartnerScopeProperties = jest.fn()
const readPropertyScopeSets = jest.fn()
const readPropertyAccounts = jest.fn()
const readPartnerLedger = jest.fn()
const readExternalOwnerPropertyNames = jest.fn()

jest.mock('@/lib/partner-settlement/adapters/cashboxReader', () => ({ readCashboxes: () => readCashboxes() }))
jest.mock('@/lib/partner-settlement/adapters/receivablesReader', () => ({ readReceivables: () => readReceivables() }))
jest.mock('@/lib/partner-settlement/adapters/ownershipReader', () => ({ readOwnership: () => readOwnership() }))
jest.mock('@/lib/partner-settlement/adapters/propertyReader', () => ({
  readPartnerScopeProperties: () => readPartnerScopeProperties(),
  readPropertyScopeSets: () => readPropertyScopeSets(),
}))
jest.mock('@/lib/partner-settlement/adapters/accountReaders', () => ({
  readPropertyAccounts: (...a: unknown[]) => readPropertyAccounts(...a),
}))
jest.mock('@/lib/partner-settlement/adapters/transactionsReader', () => ({
  readPartnerLedger: (...a: unknown[]) => readPartnerLedger(...a),
}))
jest.mock('@/lib/partner-settlement/adapters/ownerScopeReader', () => ({
  readExternalOwnerPropertyNames: () => readExternalOwnerPropertyNames(),
}))

import { buildPartnerReportB } from '@/lib/partner-settlement/partnerReportBService'
import { normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'

function tx(p: Partial<RawLedgerRow>) {
  return normalizePartnerTx({
    id: p.id ?? 'x', date: p.date ?? '2026-08-01', property_name: p.property_name ?? null,
    category: p.category ?? 'Management', subcategory: p.subcategory ?? 'Repairs',
    payer: p.payer ?? null, payee: p.payee ?? null, amount_eur: p.amount_eur ?? 0,
  })
}

beforeEach(() => {
  readCashboxes.mockResolvedValue([])
  readReceivables.mockResolvedValue({ receivableToJjEur: null, payableByJjEur: null, unknownRows: 0, coveredCounterpartyTypes: [], scope: 'PARTIAL' })
  readOwnership.mockResolvedValue(new Map())
  readPropertyAccounts.mockResolvedValue([])
  readPartnerScopeProperties.mockResolvedValue([
    { reportingName: 'Yogev Port', relationshipType: 'jj_company' },
    { reportingName: 'Villa Mazotos', relationshipType: 'partnership' },
  ])
  readPropertyScopeSets.mockResolvedValue({
    partner: new Set(['yogev port', 'villa mazotos']),
    client: new Set<string>(),
    conflictEligible: new Set(['yogev port']), // jj_company
  })
  readPartnerLedger.mockResolvedValue({
    txns: [
      tx({ id: 'yog', payer: 'yossi', payee: 'jj', category: 'Renovation', subcategory: 'AC', amount_eur: 71.40, property_name: 'Yogev Port' }),
      tx({ id: 'vm', payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Repairs', amount_eur: 500, property_name: 'Villa Mazotos' }),
    ],
    sourceFailures: [],
  })
  // THE FAILURE: external-owner source unavailable
  readExternalOwnerPropertyNames.mockResolvedValue(null)
})

describe('buildPartnerReportB — owner source failure fails closed (Stage 2.2 #8)', () => {
  it('excludes Yogev €71.40 from every total, surfaces OWNER_SOURCE_UNAVAILABLE, blocks headline', async () => {
    const dto = await buildPartnerReportB({ periodStart: '2026-08-01', periodEnd: '2026-08-31', generatedAt: '2026-08-23T00:00:00.000Z' })

    // 1. Yogev €71.40 is NOT in any current account (Yossi = 500 from Villa Mazotos only).
    const yossi = dto.partnerCurrentAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(500)
    expect(yossi.ledgerBalanceEur).not.toBe(571.4)

    // ...nor in any property position (Yogev excluded entirely; not even listed).
    expect(dto.properties.some(p => p.propertyName === 'Yogev Port')).toBe(false)
    const anyYogevPosition = dto.properties.some(p => p.propertyName === 'Yogev Port' && p.partnerPositions.length > 0)
    expect(anyYogevPosition).toBe(false)

    // ...nor in the certified inter-partner subtotal.
    expect(dto.equalization.certifiedSubtotalEur).toBe(0)

    // 2. OWNER_SOURCE_UNAVAILABLE is surfaced.
    expect(dto.unresolved.some(u => u.kind === 'OWNER_SOURCE_UNAVAILABLE')).toBe(true)

    // 3. No sum is shown as CERTIFIED, and the headline stays blocked.
    expect(dto.equalization.headline.certificationStatus).not.toBe('CERTIFIED')
    expect(dto.equalization.headline.canAssertDebtorCreditor).toBe(false)

    // 4. Partnership (Villa Mazotos) is unaffected — still present and computed.
    expect(dto.properties.some(p => p.propertyName === 'Villa Mazotos')).toBe(true)
  })

  it('when the owner source is healthy, only genuine conflicts are excluded (Yogev owned → excluded)', async () => {
    readExternalOwnerPropertyNames.mockResolvedValue(new Set(['yogev port'])) // Yogev has an external owner
    const dto = await buildPartnerReportB({ periodStart: '2026-08-01', periodEnd: '2026-08-31', generatedAt: '2026-08-23T00:00:00.000Z' })
    const yossi = dto.partnerCurrentAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(500) // Yogev still excluded (real conflict); Villa counts
    expect(dto.unresolved.some(u => u.kind === 'SCOPE_DEFINITION_CONFLICT' && u.ref === 'yogev port')).toBe(true)
    expect(dto.unresolved.some(u => u.kind === 'OWNER_SOURCE_UNAVAILABLE')).toBe(false)
  })
})
