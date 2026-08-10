/**
 * ownerServiceEngagementAdapter.test.ts
 *
 * P2 PR #2: Read Layer — Unit tests for Service Engagement adapter.
 *
 * Tests verify:
 * 1. Empty RPC result → returns empty OwnerServiceEngagementsDTO
 * 2. Single engagement → maps all DB fields correctly to DTO
 * 3. Multiple engagements → groups by property_id
 * 4. Invalid service_type → row filtered out (not returned)
 * 5. Invalid status → row filtered out (not returned)
 * 6. RPC error → returns empty (fail-closed)
 * 7. Null optional fields → preserved as null (P-ARCH-1)
 * 8. totalEngagements count correct
 * 9. Architecture audit — no forbidden imports
 */

jest.mock('server-only', () => ({}), { virtual: true })

// Mock Supabase client
const mockRpc = jest.fn()
const mockSchema = jest.fn(() => ({
  rpc: mockRpc,
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          in: jest.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
  })),
}))

jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => ({
    schema: mockSchema,
  }),
}))

import { fetchEntityServiceEngagements } from '@/lib/owners/ownerServiceEngagementAdapter'
import type { OwnerServiceEngagementsDTO } from '@/lib/owners/ownerWorkspaceTypes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<{
  id: string
  entity_id: string
  property_id: string
  service_type: string
  status: string
  effective_from: string | null
  effective_to: string | null
  notes: string | null
  created_by: string
  created_at: string
  updated_at: string
}> = {}) {
  return {
    id: overrides.id ?? 'eng-001',
    entity_id: overrides.entity_id ?? 'entity-uuid-1',
    property_id: overrides.property_id ?? 'prop-uuid-1',
    service_type: overrides.service_type ?? 'management_ltr',
    status: overrides.status ?? 'active',
    effective_from: 'effective_from' in overrides ? overrides.effective_from! : '2026-01-01',
    effective_to: 'effective_to' in overrides ? overrides.effective_to! : null,
    notes: 'notes' in overrides ? overrides.notes! : null,
    created_by: overrides.created_by ?? 'yossi@jj.com',
    created_at: overrides.created_at ?? '2026-08-01T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-08-01T10:00:00Z',
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ownerServiceEngagementAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns empty DTO when RPC returns no rows', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result).toEqual<OwnerServiceEngagementsDTO>({
      entityId: 'entity-uuid-1',
      properties: [],
      totalEngagements: 0,
    })
  })

  it('maps a single engagement correctly', async () => {
    const row = makeRow({
      notes: 'Long-term rental management',
      effective_from: '2025-06-01',
      effective_to: '2026-12-31',
    })
    mockRpc.mockResolvedValue({ data: [row], error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(1)
    expect(result.properties).toHaveLength(1)

    const eng = result.properties[0].engagements[0]
    expect(eng.id).toBe('eng-001')
    expect(eng.entityId).toBe('entity-uuid-1')
    expect(eng.propertyId).toBe('prop-uuid-1')
    expect(eng.serviceType).toBe('management_ltr')
    expect(eng.status).toBe('active')
    expect(eng.effectiveFrom).toBe('2025-06-01')
    expect(eng.effectiveTo).toBe('2026-12-31')
    expect(eng.notes).toBe('Long-term rental management')
    expect(eng.createdBy).toBe('yossi@jj.com')
  })

  it('groups engagements by property_id', async () => {
    const rows = [
      makeRow({ id: 'eng-1', property_id: 'prop-A', service_type: 'management_ltr' }),
      makeRow({ id: 'eng-2', property_id: 'prop-B', service_type: 'airbnb_str' }),
      makeRow({ id: 'eng-3', property_id: 'prop-A', service_type: 'renovation' }),
    ]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(3)
    expect(result.properties).toHaveLength(2)

    const propA = result.properties.find((p: any) => p.propertyId === 'prop-A')
    const propB = result.properties.find((p: any) => p.propertyId === 'prop-B')

    expect(propA?.engagements).toHaveLength(2)
    expect(propB?.engagements).toHaveLength(1)
  })

  it('filters out rows with invalid service_type', async () => {
    const rows = [
      makeRow({ id: 'eng-1', service_type: 'management_ltr' }),
      makeRow({ id: 'eng-2', service_type: 'INVALID_TYPE' }),
    ]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(1)
    expect(result.properties[0].engagements[0].id).toBe('eng-1')
  })

  it('filters out rows with invalid status', async () => {
    const rows = [
      makeRow({ id: 'eng-1', status: 'active' }),
      makeRow({ id: 'eng-2', status: 'UNKNOWN_STATUS' }),
    ]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(1)
    expect(result.properties[0].engagements[0].id).toBe('eng-1')
  })

  it('returns empty DTO on RPC error (fail-closed)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result).toEqual<OwnerServiceEngagementsDTO>({
      entityId: 'entity-uuid-1',
      properties: [],
      totalEngagements: 0,
    })
  })

  it('preserves null optional fields (P-ARCH-1)', async () => {
    const row = makeRow({
      effective_from: null,
      effective_to: null,
      notes: null,
    })
    mockRpc.mockResolvedValue({ data: [row], error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    const eng = result.properties[0].engagements[0]
    expect(eng.effectiveFrom).toBeNull()
    expect(eng.effectiveTo).toBeNull()
    expect(eng.notes).toBeNull()
  })

  it('returns correct totalEngagements count', async () => {
    const rows = [
      makeRow({ id: 'e1', property_id: 'p1' }),
      makeRow({ id: 'e2', property_id: 'p1' }),
      makeRow({ id: 'e3', property_id: 'p2' }),
      makeRow({ id: 'e4', property_id: 'p3' }),
    ]
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(4)
    expect(result.properties).toHaveLength(3)
  })

  it('validates all four service types are accepted', async () => {
    const types = ['renovation', 'sale', 'management_ltr', 'airbnb_str']
    const rows = types.map((t, i) => makeRow({ id: `e${i}`, service_type: t }))
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(4)
    const serviceTypes = result.properties[0].engagements.map((e: any) => e.serviceType)
    expect(serviceTypes).toEqual(types)
  })

  it('validates all four statuses are accepted', async () => {
    const statuses = ['draft', 'active', 'suspended', 'closed']
    const rows = statuses.map((s, i) => makeRow({ id: `e${i}`, status: s }))
    mockRpc.mockResolvedValue({ data: rows, error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.totalEngagements).toBe(4)
    const actualStatuses = result.properties[0].engagements.map((e: any) => e.status)
    expect(actualStatuses).toEqual(statuses)
  })

  it('propertyName defaults to null when entity_property_associations empty', async () => {
    mockRpc.mockResolvedValue({ data: [makeRow()], error: null })

    const result = await fetchEntityServiceEngagements('entity-uuid-1')

    expect(result.properties[0].propertyName).toBeNull()
  })
})

// ─── Architecture Audit ─────────────────────────────────────────────────────

describe('ownerServiceEngagementAdapter — architecture audit', () => {
  it('does not import from public.transactions or pms.* schemas', async () => {
    const fs = require('fs')
    const path = require('path')
    const adapterPath = path.resolve(
      __dirname,
      '../../lib/owners/ownerServiceEngagementAdapter.ts',
    )
    const content = fs.readFileSync(adapterPath, 'utf-8')

    // No direct transactions reads
    expect(content).not.toMatch(/\.from\(['"]transactions['"]\)/)
    // No pms schema reads
    expect(content).not.toMatch(/\.schema\(['"]pms['"]\)/)
    // No public schema financial data
    expect(content).not.toMatch(/v_cashbox|v_rc3|v_property_pl/)
    // Uses lifecycle schema only
    expect(content).toMatch(/\.schema\(['"]lifecycle['"]\)/)
  })

  it('is server-only (imports server-only)', async () => {
    const fs = require('fs')
    const path = require('path')
    const adapterPath = path.resolve(
      __dirname,
      '../../lib/owners/ownerServiceEngagementAdapter.ts',
    )
    const content = fs.readFileSync(adapterPath, 'utf-8')
    expect(content).toMatch(/import ['"]server-only['"]/)
  })
})
