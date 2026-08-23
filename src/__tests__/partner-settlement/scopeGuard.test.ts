import {
  classifyPropertyScope, splitPropertyScopeSets, computeScopeConflicts, buildConflictSet,
  isOwnableRelationshipType, type PropertyScopeSets, type PropertyDefRow,
} from '@/lib/partner-settlement/scope'
import { resolvePartnerSplit } from '@/lib/partner-settlement/ownershipRules'
import { buildPartnerLedger } from '@/lib/partner-settlement/partnerLedgerEngine'
import { normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'

// Realistic property_definitions rows (mirrors prod tags).
const DEFS: PropertyDefRow[] = [
  { canonical_name: 'Villa Mazotos', reporting_name: null, relationship_type: 'partnership', aliases: null },
  { canonical_name: 'Villa Mazotos 2', reporting_name: null, relationship_type: 'partnership', aliases: null },
  { canonical_name: 'Yogev Port', reporting_name: null, relationship_type: 'jj_company', aliases: null },
  { canonical_name: 'office', reporting_name: null, relationship_type: 'jj_company', aliases: null },
  { canonical_name: 'JJ Ground Floor Dekeleia', reporting_name: null, relationship_type: 'jj', aliases: null },
  { canonical_name: 'Liron and Alon', reporting_name: null, relationship_type: 'client', aliases: ['Ron and Alon'] },
]
// External owners exist on BOTH partnerships (legit co-owners), a jj_company (Yogev),
// a jj property, and a client.
const OWNERS = new Set(['villa mazotos', 'villa mazotos 2', 'yogev port', 'jj ground floor dekeleia', 'liron and alon'])

function sets(): PropertyScopeSets {
  const base = splitPropertyScopeSets(DEFS)
  const { conflict } = buildConflictSet(base.conflictEligible!, OWNERS)
  return { ...base, conflict }
}

let seq = 0
function tx(p: Partial<RawLedgerRow>) {
  seq += 1
  return normalizePartnerTx({
    id: p.id ?? `t${seq}`, date: p.date ?? '2026-08-01', property_name: p.property_name ?? null,
    category: p.category ?? 'Renovation', subcategory: p.subcategory ?? 'AC',
    payer: p.payer ?? null, payee: p.payee ?? null, amount_eur: p.amount_eur ?? 0,
  })
}

describe('Stage 2.2 — relationship-aware conflict guard (the corrected rule)', () => {
  it('conflictEligible = jj/jj_company only; partnership is NOT eligible', () => {
    const base = splitPropertyScopeSets(DEFS)
    expect(base.conflictEligible!.has('yogev port')).toBe(true)
    expect(base.conflictEligible!.has('jj ground floor dekeleia')).toBe(true)
    expect(base.conflictEligible!.has('office')).toBe(true)
    expect(base.conflictEligible!.has('villa mazotos')).toBe(false)      // partnership exempt
    expect(base.conflictEligible!.has('villa mazotos 2')).toBe(false)    // partnership exempt
    expect(base.conflictEligible!.has('liron and alon')).toBe(false)     // client not eligible
  })

  it('conflict = jj/jj_company WITH external owner only (partnerships never flagged)', () => {
    const base = splitPropertyScopeSets(DEFS)
    const conflict = computeScopeConflicts(base.conflictEligible!, OWNERS)
    expect(Array.from(conflict).sort()).toEqual(['jj ground floor dekeleia', 'yogev port'])
    expect(conflict.has('villa mazotos')).toBe(false)
    expect(conflict.has('villa mazotos 2')).toBe(false)
  })

  // 1. Yogev jj_company + external owner → CONFLICT_EXCLUDE
  it('Yogev (jj_company + owner) → CONFLICT_EXCLUDE', () => {
    expect(classifyPropertyScope('Yogev Port', sets())).toBe('CONFLICT_EXCLUDE')
  })

  // 3. Villa Mazotos partnership + external owner (Avi) → IN_SCOPE
  it('Villa Mazotos (partnership + external owner Avi) → IN_SCOPE, split stays 50/25/25', () => {
    expect(classifyPropertyScope('Villa Mazotos', sets())).toBe('IN_SCOPE')
    const split = resolvePartnerSplit('Villa Mazotos') // approved fact
    expect(split.yossi).toBeCloseTo(0.25, 6)
    expect(split.jacob).toBeCloseTo(0.25, 6)
  })

  // 4. Villa Mazotos 2 partnership + external owner (Oren) → IN_SCOPE but ownership PENDING
  it('Villa Mazotos 2 (partnership + external owner Oren) → IN_SCOPE, ownership PENDING', () => {
    expect(classifyPropertyScope('Villa Mazotos 2', sets())).toBe('IN_SCOPE')
    const split = resolvePartnerSplit('Villa Mazotos 2') // no approved fact, no confirmed shares
    expect(split.confidence).toBe('pending_verification')
    expect(split.yossi).toBeNull()
  })

  // 5. jj_company internal without owner → not ownable (no OWNERSHIP_PENDING), IN_SCOPE
  it('office (jj_company, no owner) → IN_SCOPE and NOT ownable', () => {
    expect(classifyPropertyScope('office', sets())).toBe('IN_SCOPE')
    expect(isOwnableRelationshipType('jj_company')).toBe(false)
    expect(isOwnableRelationshipType('partnership')).toBe(true)
    expect(isOwnableRelationshipType('jj')).toBe(true)
  })

  // 6. client with owner → CLIENT_EXCLUDE, not conflict
  it('Liron and Alon (client + owner) → CLIENT_EXCLUDE (never conflict); alias Ron and Alon too', () => {
    expect(classifyPropertyScope('Liron and Alon', sets())).toBe('CLIENT_EXCLUDE')
    expect(classifyPropertyScope('Ron and Alon', sets())).toBe('CLIENT_EXCLUDE') // alias honored
    expect(sets().conflict!.has('liron and alon')).toBe(false)
  })

  // 7. jj with external owner → conflict
  it('JJ Ground Floor (jj + external owner) → CONFLICT_EXCLUDE', () => {
    expect(classifyPropertyScope('JJ Ground Floor Dekeleia', sets())).toBe('CONFLICT_EXCLUDE')
  })

  // 8. owner source unavailable → fail closed by excluding ALL conflict-eligible (jj/jj_company)
  it('owner source unavailable (null) → fail closed: conflict = ALL jj/jj_company, partnerships untouched', () => {
    const base = splitPropertyScopeSets(DEFS)
    const r = buildConflictSet(base.conflictEligible!, null)
    expect(r.ownerSourceUnavailable).toBe(true)
    // every conflict-eligible name is excluded (NOT an empty set that would let them leak)
    expect(Array.from(r.conflict).sort()).toEqual(['jj ground floor dekeleia', 'office', 'yogev port'])
    // partnerships are NOT conflict-eligible → never excluded by the fail-closed path
    expect(r.conflict.has('villa mazotos')).toBe(false)
    expect(r.conflict.has('villa mazotos 2')).toBe(false)
  })
})

describe('Stage 2.2 — engine excludes only true conflicts, keeps partnerships', () => {
  it('Yogev €71.40 excluded; a partnership (Villa Mazotos) with an external owner still counts', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'jj', category: 'Renovation', subcategory: 'AC', amount_eur: 71.40, property_name: 'Yogev Port' }),      // conflict → excluded
      tx({ payer: 'yossi', payee: 'company', category: 'Management', subcategory: 'Repairs', amount_eur: 500, property_name: 'Villa Mazotos' }), // partnership → counts
      tx({ payer: 'yossi', payee: 'company', category: 'JJ', subcategory: 'Office Supplies', amount_eur: 100, property_name: 'office' }),      // internal → counts
    ], { propertyScope: sets() })

    expect(r.conflictExcludedCount).toBe(1)
    const yossi = r.partnerAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(600) // 500 (Villa) + 100 (office); NOT 671.40
    expect(r.partnerPositionsByProperty.has('Yogev Port')).toBe(false)
    expect(r.partnerPositionsByProperty.has('Villa Mazotos')).toBe(true) // partnership preserved
  })
})
