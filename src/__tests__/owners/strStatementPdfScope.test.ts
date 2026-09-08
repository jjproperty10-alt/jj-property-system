import {
  ownerNameFromHistoricalProperty,
  historicalPropertyMatchesSlug,
  matchHistoricalPropertiesToSlug,
  filterEligibleProperties,
  rangeStatementHref,
} from '@/lib/owners/strStatementPdfScope'

const DEKELIA = { id: '47f53dde-9882-4f7c-ba49-3effeb937848', name: 'Tamir Dekelia' }
const RADISSON = { id: '20d9571e-6bf7-4307-ba4b-59ae5eb21241', name: 'Tamir Radisson' }
const YOGEV = { id: '270f0339-88d8-47bd-b62a-6019d4be2d9e', name: 'Yogev Port' }
const TOM = { id: '6077a21a-e343-4ff5-8393-4d93b2582bb1', name: 'Tom Dekelia' }
const URIEL = { id: 'f58180f8-97e2-41ef-abfd-b462ecb1595f', name: 'Uriel Duplex' }

describe('ownerNameFromHistoricalProperty', () => {
  it('uses the leading token so Yogev Port PDFs are owned by Yogev', () => {
    expect(ownerNameFromHistoricalProperty('Yogev Port')).toBe('Yogev')
  })
})

describe('historicalPropertyMatchesSlug', () => {
  it('matches property-name slug and owner-token slug', () => {
    expect(historicalPropertyMatchesSlug('Yogev Port', 'yogev-port')).toBe(true)
    expect(historicalPropertyMatchesSlug('Yogev Port', 'yogev')).toBe(true)
    expect(historicalPropertyMatchesSlug('Yogev Port', 'tamir')).toBe(false)
  })
})

describe('matchHistoricalPropertiesToSlug', () => {
  const defs = [YOGEV, TOM, URIEL]
  it('resolves yogev / yogev-port to Yogev Port only', () => {
    expect(matchHistoricalPropertiesToSlug(defs, 'yogev').map(p => p.name)).toEqual(['Yogev Port'])
    expect(matchHistoricalPropertiesToSlug(defs, 'yogev-port').map(p => p.name)).toEqual(['Yogev Port'])
  })
  it('does not steal Tom/Uriel who already have Owner Room slugs', () => {
    expect(matchHistoricalPropertiesToSlug(defs, 'tom')).toEqual([TOM])
    expect(matchHistoricalPropertiesToSlug(defs, 'uriel')).toEqual([URIEL])
  })
})

describe('filterEligibleProperties', () => {
  const eligible = [DEKELIA, RADISSON]
  it('omitted property keeps the combined owner set', () => {
    const r = filterEligibleProperties(eligible, null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.properties.map(p => p.name)).toEqual(['Tamir Dekelia', 'Tamir Radisson'])
  })
  it('filters Tamir Dekelia-only and Tamir Radisson-only', () => {
    const d = filterEligibleProperties(eligible, DEKELIA.id)
    const r = filterEligibleProperties(eligible, RADISSON.id.toUpperCase())
    expect(d.ok && d.properties).toEqual([DEKELIA])
    expect(r.ok && r.properties).toEqual([RADISSON])
  })
  it('rejects unknown UUID and non-UUID without falling back to combined', () => {
    expect(filterEligibleProperties(eligible, YOGEV.id)).toEqual({
      ok: false, status: 404, message: "Property is not in this owner's STR statement scope",
    })
    const invalid = filterEligibleProperties(eligible, 'Tamir Dekelia')
    expect(invalid.ok).toBe(false)
    if (invalid.ok) {
      throw new Error('Expected filterEligibleProperties to fail')
    }
    expect(invalid.status).toBe(400)
  })
  it('empty eligible set is 404', () => {
    expect(filterEligibleProperties([], null).ok).toBe(false)
  })
})

describe('rangeStatementHref', () => {
  it('omits property for the combined owner report', () => {
    expect(rangeStatementHref('tamir', '2026-05', '2026-07')).toBe(
      '/owners/tamir/statement/range/pdf?from=2026-05&to=2026-07',
    )
  })
  it('adds canonical property_id for a property-only PDF', () => {
    expect(rangeStatementHref('tamir', '2026-01', '2026-04', DEKELIA.id)).toBe(
      `/owners/tamir/statement/range/pdf?from=2026-01&to=2026-04&property=${DEKELIA.id}`,
    )
  })
})

describe('PDF route presentation wiring', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const rangeRoute = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(app)/owners/[slug]/statement/range/pdf/route.ts'),
    'utf8',
  )
  const monthRoute = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(app)/owners/[slug]/statement/pdf/route.ts'),
    'utf8',
  )
  it('uses the shared scope resolver and does not hard-code statement totals', () => {
    for (const src of [rangeRoute, monthRoute]) {
      expect(src).toContain('resolveStrStatementPdfScope')
      expect(src).not.toMatch(/2166\.62|3404\.02|2445\.44|5126\.00/)
    }
  })
})
