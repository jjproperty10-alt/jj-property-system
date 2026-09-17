import {
  AGENT_DRAFT_STATUSES,
  DRAFT_NOT_POSTED_MESSAGE,
  DRAFT_POSTED_MESSAGE,
  DRAFT_REJECTED_MESSAGE,
  parseOptionalEur,
  resolveDraftStatus,
  resolveExactPropertyId,
} from '../agentDraft'

describe('parseOptionalEur', () => {
  it('keeps empty amount as NULL, not 0', () => {
    expect(parseOptionalEur('')).toBeNull()
    expect(parseOptionalEur('   ')).toBeNull()
    expect(parseOptionalEur(null)).toBeNull()
  })

  it('parses a numeric amount', () => {
    expect(parseOptionalEur('12.50')).toBe(12.5)
  })
})

describe('resolveExactPropertyId', () => {
  const catalog = [
    { id: 'vm1', name: 'Villa Mazotos' },
    { id: 'vm2', name: 'Villa Mazotos 2' },
  ]

  it('matches exact unique names only', () => {
    expect(resolveExactPropertyId('Villa Mazotos', catalog)).toBe('vm1')
    expect(resolveExactPropertyId('Villa Mazotos 2', catalog)).toBe('vm2')
  })

  it('does not fuzzy-match or merge VM1/VM2', () => {
    expect(resolveExactPropertyId('Villa Mazotos%', catalog)).toBeNull()
    expect(resolveExactPropertyId('villa mazotos', catalog)).toBeNull()
  })

  it('unresolved or duplicate names stay null (needs_review)', () => {
    expect(resolveExactPropertyId('', catalog)).toBeNull()
    expect(resolveExactPropertyId('Unknown Place', catalog)).toBeNull()
    expect(resolveExactPropertyId('X', [
      { id: 'a', name: 'X' },
      { id: 'b', name: 'X' },
    ])).toBeNull()
  })
})

describe('resolveDraftStatus', () => {
  it('needs_review when property is unresolved', () => {
    expect(resolveDraftStatus({ propertyId: null, propertyNameInput: 'Maybe' })).toBe('needs_review')
  })

  it('draft when property is exactly resolved', () => {
    expect(resolveDraftStatus({ propertyId: 'vm1', propertyNameInput: 'Villa Mazotos' })).toBe('draft')
  })
})

describe('success copy', () => {
  it('says the draft is not posted', () => {
    expect(DRAFT_NOT_POSTED_MESSAGE).toBe('Draft saved — not posted to accounts.')
  })

  it('includes posted as a later staff-approval status', () => {
    expect(AGENT_DRAFT_STATUSES).toContain('posted')
    expect(DRAFT_POSTED_MESSAGE).toBe('Draft posted to accounts.')
    expect(DRAFT_REJECTED_MESSAGE).toBe('Draft rejected — not posted to accounts.')
  })
})
