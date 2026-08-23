import { filterPartnerScope } from '@/lib/partner-settlement/scope'

describe('filterPartnerScope (QA #2 — partner scope only)', () => {
  it('includes partnership/JJ scope and EXCLUDES client-management-only properties', () => {
    const rows = [
      { canonical_name: 'Villa Mazotos', reporting_name: null, relationship_type: 'partnership' },
      { canonical_name: 'Uriel Debenhams', reporting_name: null, relationship_type: 'client' },
      { canonical_name: 'JJ Airbnb', reporting_name: null, relationship_type: 'jj_company' },
      { canonical_name: 'JJ Ground Floor', reporting_name: null, relationship_type: 'jj' },
    ]
    const names = filterPartnerScope(rows).map(o => o.reportingName)
    expect(names).toContain('Villa Mazotos')
    expect(names).toContain('JJ Airbnb')
    expect(names).toContain('JJ Ground Floor')
    // regression: a client property must NEVER enter Partner Report B
    expect(names).not.toContain('Uriel Debenhams')
  })

  it('prefers reporting_name, dedupes, and skips rows with no name', () => {
    const rows = [
      { canonical_name: 'A', reporting_name: 'A-rep', relationship_type: 'partnership' },
      { canonical_name: 'A', reporting_name: 'A-rep', relationship_type: 'partnership' },
      { canonical_name: null, reporting_name: null, relationship_type: 'partnership' },
    ]
    const out = filterPartnerScope(rows)
    expect(out).toHaveLength(1)
    expect(out[0].reportingName).toBe('A-rep')
  })
})
