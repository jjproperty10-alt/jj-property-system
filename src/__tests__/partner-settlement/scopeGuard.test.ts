import {
  classifyPropertyScope, splitPropertyScopeSets, computeScopeConflicts, buildConflictSet,
  isOwnableRelationshipType, type PropertyScopeSets, type PropertyDefRow,
} from '@/lib/partner-settlement/scope'
import { resolvePartnerSplit } from '@/lib/partner-settlement/ownershipRules'
import { buildPartnerLedger } from '@/lib/partner-settlement/partnerLedgerEngine'
import { normalizePartnerTx, type RawLedgerRow } from '@/lib/partner-settlement/ledgerRowFilter'

// Realistic property_definitions rows. Yogev has DISTINCT canonical / reporting / alias
// to prove conflict propagates across ALL names of a row.
const DEFS: PropertyDefRow[] = [
  { canonical_name: 'Villa Mazotos', reporting_name: null, relationship_type: 'partnership', aliases: null },
  { canonical_name: 'Villa Mazotos 2', reporting_name: null, relationship_type: 'partnership', aliases: null },
  { canonical_name: 'Yogev Port', reporting_name: 'Yogev Marina', relationship_type: 'jj_company', aliases: ['Yogev Apartment'] },
  { canonical_name: 'office', reporting_name: null, relationship_type: 'jj_company', aliases: null },
  { canonical_name: 'JJ Ground Floor Dekeleia', reporting_name: null, relationship_type: 'jj', aliases: null },
  { canonical_name: 'Liron and Alon', reporting_name: null, relationship_type: 'client', aliases: ['Ron and Alon'] },
]
// contact_properties owners: Yogev (canonical only), a jj property, a client, AND BOTH
// partnerships (Avi/Oren are legitimate external co-owners — must NOT become conflicts).
const OWNERS = new Set([
  'yogev port', 'jj ground floor dekeleia', 'liron and alon',
  'villa mazotos', 'villa mazotos 2',
])

function sets(): PropertyScopeSets {
  const base = splitPropertyScopeSets(DEFS)
  const { conflict } = buildConflictSet(base.conflictEligibleGroups!, OWNERS)
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

describe('Stage 2.2 — conflict is per-ROW and propagates to ALL names (QA fix)', () => {
  it('owner match on ONE name flags the whole row (canonical + reporting + alias)', () => {
    const base = splitPropertyScopeSets(DEFS)
    const conflict = computeScopeConflicts(base.conflictEligibleGroups!, OWNERS)
    // Yogev matched via canonical → all three of its names excluded
    expect(conflict.has('yogev port')).toBe(true)
    expect(conflict.has('yogev marina')).toBe(true)     // reporting name
    expect(conflict.has('yogev apartment')).toBe(true)  // alias
    // JJ Ground Floor (jj + owner) flagged; office (no owner) not; partnerships never
    expect(conflict.has('jj ground floor dekeleia')).toBe(true)
    expect(conflict.has('office')).toBe(false)
    expect(conflict.has('villa mazotos')).toBe(false)
    expect(conflict.has('villa mazotos 2')).toBe(false)
    expect(conflict.has('liron and alon')).toBe(false)  // client, not conflict-eligible
  })

  it('a transaction under the reporting name OR alias of a conflicting row is CONFLICT_EXCLUDE', () => {
    const s = sets()
    expect(classifyPropertyScope('Yogev Port', s)).toBe('CONFLICT_EXCLUDE')      // canonical
    expect(classifyPropertyScope('Yogev Marina', s)).toBe('CONFLICT_EXCLUDE')    // reporting
    expect(classifyPropertyScope('Yogev Apartment', s)).toBe('CONFLICT_EXCLUDE') // alias
  })

  it('REGRESSION: owner on canonical, tx uses reporting/alias → excluded from totals', () => {
    const r = buildPartnerLedger([
      tx({ payer: 'yossi', payee: 'jj', category: 'Renovation', subcategory: 'AC', amount_eur: 71.40, property_name: 'Yogev Marina' }),   // reporting
      tx({ payer: 'yossi', payee: 'company', category: 'Airbnb', subcategory: 'Design', amount_eur: 200, property_name: 'Yogev Apartment' }), // alias
      tx({ payer: 'yossi', payee: 'company', category: 'JJ', subcategory: 'Office Supplies', amount_eur: 100, property_name: 'office' }),   // in scope
    ], { propertyScope: sets() })
    expect(r.conflictExcludedCount).toBe(2)                       // both Yogev-name txns excluded
    const yossi = r.partnerAccounts.find(a => a.party === 'Yossi')!
    expect(yossi.ledgerBalanceEur).toBe(100)                     // only office; NOT 371.40
  })
})

describe('Stage 2.2 — relationship-aware rule table', () => {
  it('partnership WITH external owner → IN_SCOPE, never conflict (Villa Mazotos 50/25/25 preserved)', () => {
    expect(OWNERS.has('villa mazotos')).toBe(true)          // owner really present
    expect(sets().conflict!.has('villa mazotos')).toBe(false) // yet NOT a conflict
    expect(classifyPropertyScope('Villa Mazotos', sets())).toBe('IN_SCOPE')
    const split = resolvePartnerSplit('Villa Mazotos')
    expect(split.yossi).toBeCloseTo(0.25, 6)
    expect(split.jacob).toBeCloseTo(0.25, 6)
  })
  it('Villa Mazotos 2 partnership WITH external owner → IN_SCOPE, never conflict, ownership PENDING', () => {
    expect(OWNERS.has('villa mazotos 2')).toBe(true)
    expect(sets().conflict!.has('villa mazotos 2')).toBe(false)
    expect(classifyPropertyScope('Villa Mazotos 2', sets())).toBe('IN_SCOPE')
    expect(resolvePartnerSplit('Villa Mazotos 2').confidence).toBe('pending_verification')
  })
  it('office (jj_company, no owner) → IN_SCOPE and NOT ownable', () => {
    expect(classifyPropertyScope('office', sets())).toBe('IN_SCOPE')
    expect(isOwnableRelationshipType('jj_company')).toBe(false)
    expect(isOwnableRelationshipType('partnership')).toBe(true)
    expect(isOwnableRelationshipType('jj')).toBe(true)
  })
  it('client + owner → CLIENT_EXCLUDE (never conflict); alias honored', () => {
    expect(classifyPropertyScope('Liron and Alon', sets())).toBe('CLIENT_EXCLUDE')
    expect(classifyPropertyScope('Ron and Alon', sets())).toBe('CLIENT_EXCLUDE')
    expect(sets().conflict!.has('liron and alon')).toBe(false)
  })
  it('jj + external owner → CONFLICT_EXCLUDE', () => {
    expect(classifyPropertyScope('JJ Ground Floor Dekeleia', sets())).toBe('CONFLICT_EXCLUDE')
  })
  it('owner source unavailable (null) → fail closed: ALL jj/jj_company names excluded, partnerships untouched', () => {
    const base = splitPropertyScopeSets(DEFS)
    const r = buildConflictSet(base.conflictEligibleGroups!, null)
    expect(r.ownerSourceUnavailable).toBe(true)
    // every jj/jj_company name (incl Yogev reporting+alias) excluded
    expect(r.conflict.has('yogev port')).toBe(true)
    expect(r.conflict.has('yogev marina')).toBe(true)
    expect(r.conflict.has('yogev apartment')).toBe(true)
    expect(r.conflict.has('office')).toBe(true)
    expect(r.conflict.has('jj ground floor dekeleia')).toBe(true)
    // partnerships never excluded by fail-closed
    expect(r.conflict.has('villa mazotos')).toBe(false)
    expect(r.conflict.has('villa mazotos 2')).toBe(false)
  })
})
