/** ownershipGroupResolution.test — owner identity resolution for canonical ownership groups. */
import * as fs from 'fs'
import * as path from 'path'
jest.mock('server-only', () => ({}), { virtual: true })
const mockResolveBySlug = jest.fn()
jest.mock('@/lib/identity/identityResolverService', () => ({ resolveBySlug: (...a: unknown[]) => mockResolveBySlug(...a) }))
const mockFetchEng = jest.fn()
jest.mock('../ownerServiceEngagementAdapter', () => ({ fetchEntityServiceEngagements: (...a: unknown[]) => mockFetchEng(...a) }))
jest.mock('@/lib/supabase', () => ({ createServiceClient: () => ({}) }))
jest.mock('../ownerFinancialService', () => ({ getFinancial: jest.fn() }))
jest.mock('../ownerMaintenanceService', () => ({ getMaintenanceItems: jest.fn() }))
jest.mock('../ownerReservationService', () => ({ getReservations: jest.fn(), getReservationActivity: jest.fn() }))
import { resolveOwnerWorkspace, getOwnerServiceEngagements } from '../ownerWorkspaceService'
const GROUP_ID = 'vmog-entity-id'
const managedResolved = (name: string, props: string[]) => ({ status: 'resolved' as const, data: { identity: { entityId: 'e1', displayName: name, canonicalSlug: 'x', entityKind: 'individual' as const, aliases: Object.freeze([]), status: 'active' as const, source: 'lifecycle.entity_identity', preferredLanguage: null, country: null }, managedProperties: props.map(p => ({ relationshipId: 'r', entityId: 'e1', propertyName: p, relationshipType: 'managed_owner' as const, validFrom: null, validTo: null, verificationStatus: 'verified' as const })), primaryProperty: props[0] ?? null } })
const relationshipMissing = (name: string) => ({ status: 'relationship_missing' as const, entityId: GROUP_ID, displayName: name })
const strDTO = (props: string[]) => ({ entityId: GROUP_ID, totalEngagements: props.length, properties: props.map((p, i) => ({ propertyId: `p${i}`, propertyName: p, engagements: [{ serviceType: 'airbnb_str' }] })) })
beforeEach(() => { mockResolveBySlug.mockReset(); mockFetchEng.mockReset() })
describe('ownership group + STR-engaged entity resolution', () => {
  it('managed_client still resolves (regression)', async () => {
    mockResolveBySlug.mockResolvedValue(managedResolved('Oren', ['Oren Kitty']))
    const r = await resolveOwnerWorkspace('oren'); expect(r.status).toBe('resolved')
    if (r.status === 'resolved') expect(r.workspace.identity.name).toBe('Oren')
  })
  it('active ownership_group with STR engagement resolves via engagement chain', async () => {
    mockResolveBySlug.mockResolvedValue(relationshipMissing('Villa Mazotos Ownership Group')); mockFetchEng.mockResolvedValue(strDTO(['Villa Mazotos']))
    const r = await resolveOwnerWorkspace('villa-mazotos-ownership-group'); expect(r.status).toBe('resolved')
    if (r.status === 'resolved') { expect(r.workspace.identity.name).toBe('Villa Mazotos Ownership Group'); expect(r.workspace.identity.id).toBe(GROUP_ID) }
  })
  it('fails closed: relationship_missing with NO STR engagement stays relationship_missing', async () => {
    mockResolveBySlug.mockResolvedValue(relationshipMissing('Some Group')); mockFetchEng.mockResolvedValue(strDTO([]))
    expect((await resolveOwnerWorkspace('some-group')).status).toBe('relationship_missing')
  })
  it('getOwnerServiceEngagements returns properties for a relationship_missing STR-engaged entity', async () => {
    mockResolveBySlug.mockResolvedValue(relationshipMissing('Villa Mazotos Ownership Group')); mockFetchEng.mockResolvedValue(strDTO(['Villa Mazotos']))
    const dto = await getOwnerServiceEngagements('villa-mazotos-ownership-group')
    expect(dto.properties.map(p => p.propertyName)).toContain('Villa Mazotos'); expect(mockFetchEng).toHaveBeenCalledWith(GROUP_ID)
  })
  it('STR statement code contains NO ownership-percentage / ownership_period logic', () => {
    const dir = path.join(__dirname, '..', '..', 'report', 'str')
    for (const f of ['ownerStrStatement.ts', 'ownerStrStatementService.ts', 'strStatementLine.ts']) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/ownership_period|ownershipPercent|ownership_percent|partnerAllocation/i)
    }
  })
})
