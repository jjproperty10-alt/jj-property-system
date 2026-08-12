import { selectStrProperties } from '@/lib/owners/selectStrProperties'
import type { OwnerServiceEngagementsDTO } from '@/lib/owners/ownerWorkspaceTypes'

const eng = (serviceType: string, status = 'active') => ({
  id: 'e', entityId: 'x', propertyId: 'p', serviceType, status,
  effectiveFrom: null, effectiveTo: null, notes: null, createdBy: 'x', createdAt: '', updatedAt: '',
}) as never

function svc(properties: unknown[]): OwnerServiceEngagementsDTO {
  return { entityId: 'ent', properties: properties as never, totalEngagements: 0 }
}

describe('selectStrProperties', () => {
  it('keeps only properties with an airbnb_str engagement (Tamir case)', () => {
    const out = selectStrProperties(svc([
      { propertyId: 'd', propertyName: 'Tamir Dekelia', engagements: [eng('airbnb_str')] },
      { propertyId: 'r', propertyName: 'Tamir Radisson', engagements: [eng('airbnb_str')] },
      { propertyId: 'k', propertyName: 'Tamir Kiti', engagements: [] },
      { propertyId: 'k1', propertyName: 'Tamir Kiti 1', engagements: [eng('management_ltr')] },
      { propertyId: 'k2', propertyName: 'Tamir Kiti 2', engagements: [] },
    ]))
    expect(out.map(o => o.name)).toEqual(['Tamir Dekelia', 'Tamir Radisson'])
  })

  it('keeps STR property with a lapsed (non-active) engagement — Needs Review still shows', () => {
    const out = selectStrProperties(svc([
      { propertyId: 'a', propertyName: 'A', engagements: [eng('airbnb_str', 'closed')] },
    ]))
    expect(out.map(o => o.id)).toEqual(['a'])
  })

  it('skips null names and dedupes by property_id', () => {
    const out = selectStrProperties(svc([
      { propertyId: 'a', propertyName: null, engagements: [eng('airbnb_str')] },
      { propertyId: 'b', propertyName: 'B', engagements: [eng('airbnb_str')] },
      { propertyId: 'b', propertyName: 'B', engagements: [eng('airbnb_str')] },
    ]))
    expect(out).toEqual([{ id: 'b', name: 'B' }])
  })

  it('returns empty when no STR engagements', () => {
    expect(selectStrProperties(svc([{ propertyId: 'x', propertyName: 'X', engagements: [eng('renovation')] }]))).toEqual([])
  })
})
