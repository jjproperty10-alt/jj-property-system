import { classifyPropertyScope, splitPropertyScopeSets, type PropertyScopeSets } from '@/lib/partner-settlement/scope'
import { buildPartnerLedger } from '@/lib/partner-settlement/partnerLedgerEngine'
import { normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'

let seq = 0
function tx(p: Partial<RawLedgerRow>) {
  seq += 1
  return normalizePartnerTx({
    id: p.id ?? `t${seq}`, date: p.date ?? '2026-03-01', property_name: p.property_name ?? null,
    category: p.category ?? 'Management', subcategory: p.subcategory ?? 'Cleaning',
    payer: p.payer ?? null, payee: p.payee ?? null, amount_eur: p.amount_eur ?? 0,
  })
}

const SCOPE: PropertyScopeSets = {
  partner: new Set(['villa mazotos', 'jj airbnb']),
  client: new Set(['uriel debenhams']),
}

describe('classifyPropertyScope (QA #185-3)', () => {
  it('null → GENERAL_NULL; partner → IN_SCOPE; client → CLIENT_EXCLUDE; unknown → UNKNOWN', () => {
    expect(classifyPropertyScope(null, SCOPE)).toBe('GENERAL_NULL')
    expect(classifyPropertyScope('', SCOPE)).toBe('GENERAL_NULL')
    expect(classifyPropertyScope('Villa Mazotos', SCOPE)).toBe('IN_SCOPE')
    expect(classifyPropertyScope('Uriel Debenhams', SCOPE)).toBe('CLIENT_EXCLUDE')
    expect(classifyPropertyScope('Totally Unknown Place', SCOPE)).toBe('UNKNOWN')
  })

  it('splitPropertyScopeSets reads reporting + canonical names by relationship_type', () => {
    const sets = splitPropertyScopeSets([
      { canonical_name: 'Villa Mazotos', reporting_name: null, relationship_type: 'partnership' },
      { canonical_name: 'JJ', reporting_name: 'JJ Airbnb', relationship_type: 'jj_company' },
      { canonical_name: 'Uriel Debenhams', reporting_name: null, relationship_type: 'client' },
    ])
    expect(sets.partner.has('villa mazotos')).toBe(true)
    expect(sets.partner.has('jj airbnb')).toBe(true)
    expect(sets.client.has('uriel debenhams')).toBe(true)
    expect(sets.partner.has('uriel debenhams')).toBe(false)
  })
})

describe('buildPartnerLedger property scope enforcement', () => {
  it('REGRESSION: a Yossi-paid client-property expense cannot affect Partner Report totals', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Repairs', amount_eur: 100, property_name: 'Uriel Debenhams' }), // client → excluded
      tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Repairs', amount_eur: 50, property_name: 'Villa Mazotos' }),   // in scope
    ], { propertyScope: SCOPE })
    const yossi = r.partnerAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(50)        // only the in-scope €50, NOT €150
    expect(r.clientExcludedCount).toBe(1)
    // client property must not appear in per-property positions
    expect(r.partnerPositionsByProperty.has('Uriel Debenhams')).toBe(false)
  })

  it('unknown non-null property → PROPERTY_SCOPE_UNRESOLVED, excluded from totals (not silently included)', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'company', category: 'Management', amount_eur: 100, property_name: 'Ghost Property' }),
    ], { propertyScope: SCOPE })
    expect(r.partnerAccounts.find(a => a.party === 'Yossi')!.ledgerBalanceEur).toBeNull()
    expect(r.propertyScopeUnresolvedCount).toBe(1)
    expect(r.unresolved.some(u => u.kind === 'PROPERTY_SCOPE_UNRESOLVED')).toBe(true)
  })

  it('genuine general (no-property) partner transfer is preserved', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'jacob', payee: 'yossi', category: 'Transfer', subcategory: 'Partner Loan', amount_eur: 500, property_name: null }),
    ], { propertyScope: SCOPE })
    expect(r.interPartnerTransferNetEur).toBe(-500) // preserved, not dropped
    expect(r.clientExcludedCount).toBe(0)
  })
})
