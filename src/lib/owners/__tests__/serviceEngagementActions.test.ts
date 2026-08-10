/**
 * @module serviceEngagementActions.test
 * @description P2 PR #4 — Service Engagement Write/Edit Lifecycle tests.
 *
 * 35 focused tests covering:
 * - Create validation (8)
 * - Update validation (7)
 * - Auth (3)
 * - Status transitions (6)
 * - Typed-patch semantics (4)
 * - Overlap detection (3)
 * - ServicesTab display constants (4)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase
 * - Pure unit tests — no DB, no network
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock server-only (no-op in test environment)
jest.mock('server-only', () => ({}), { virtual: true })

// Mock auth
const mockAuth = jest.fn()
jest.mock('@/lib/statements/statementAuthService', () => ({
  authenticateStatementUser: () => mockAuth(),
}))

// Mock supabase client
const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockSchemaRpc = jest.fn()
const mockSchemaFrom = jest.fn()
const mockSupabaseClient = {
  rpc: mockRpc,
  from: mockFrom,
  schema: jest.fn(() => ({
    rpc: mockSchemaRpc,
    from: mockSchemaFrom,
  })),
}
jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockSupabaseClient,
}))

// Mock validation
jest.mock('@/lib/owners/validation', () => ({
  isValidUUID: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
}))

// Import after mocks
import {
  createServiceEngagementAction,
  updateServiceEngagementAction,
} from '../serviceEngagementActions'

import type {
  CreateServiceEngagementInput,
  UpdateServiceEngagementInput,
} from '../ownerWorkspaceTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_ENTITY_ID = 'aaaaaaaa-1111-2222-3333-444444444444'
const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_ENGAGEMENT_ID = 'cccccccc-1111-2222-3333-444444444444'
const AUTH_USER_ID = '277f81e0-3b89-41ed-a099-22585959b77a'

function authedOk() {
  return { ok: true as const, userId: AUTH_USER_ID }
}

function authedFail() {
  return { ok: false as const, error: 'NO_SESSION' }
}

function baseCreateInput(overrides?: Partial<CreateServiceEngagementInput>): CreateServiceEngagementInput {
  return {
    entityId: VALID_ENTITY_ID,
    propertyId: VALID_PROPERTY_ID,
    serviceType: 'management_ltr',
    ...overrides,
  }
}

function baseUpdateInput(overrides?: Partial<UpdateServiceEngagementInput>): UpdateServiceEngagementInput {
  return {
    id: VALID_ENGAGEMENT_ID,
    ...overrides,
  }
}

const CREATED_ROW = {
  id: VALID_ENGAGEMENT_ID,
  entity_id: VALID_ENTITY_ID,
  property_id: VALID_PROPERTY_ID,
  service_type: 'management_ltr',
  status: 'draft',
  effective_from: null,
  effective_to: null,
  notes: null,
  created_by: AUTH_USER_ID,
  created_at: '2026-08-10T12:00:00Z',
  updated_at: '2026-08-10T12:00:00Z',
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockResolvedValue(authedOk())
})

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE VALIDATION (8 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createServiceEngagementAction — validation', () => {
  test('rejects missing entity ID', async () => {
    const result = await createServiceEngagementAction(baseCreateInput({ entityId: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('validation')
  })

  test('rejects invalid entity UUID', async () => {
    const result = await createServiceEngagementAction(baseCreateInput({ entityId: 'not-a-uuid' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('validation')
  })

  test('rejects invalid property UUID', async () => {
    const result = await createServiceEngagementAction(baseCreateInput({ propertyId: 'bad' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('validation')
  })

  test('rejects invalid service type', async () => {
    const result = await createServiceEngagementAction(
      baseCreateInput({ serviceType: 'plumbing' as any }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('service type')
  })

  test('rejects invalid status', async () => {
    const result = await createServiceEngagementAction(
      baseCreateInput({ status: 'archived' as any }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('status')
  })

  test('rejects bad date format', async () => {
    const result = await createServiceEngagementAction(
      baseCreateInput({ effectiveFrom: '10/01/2026' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('date format')
  })

  test('rejects end before start', async () => {
    const result = await createServiceEngagementAction(
      baseCreateInput({ effectiveFrom: '2026-06-01', effectiveTo: '2026-05-01' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('after start')
  })

  test('rejects notes longer than 2000 chars', async () => {
    const result = await createServiceEngagementAction(
      baseCreateInput({ notes: 'x'.repeat(2001) }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('2000')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE VALIDATION (7 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('updateServiceEngagementAction — validation', () => {
  test('rejects missing engagement ID', async () => {
    const result = await updateServiceEngagementAction(baseUpdateInput({ id: '' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('validation')
  })

  test('rejects invalid engagement UUID', async () => {
    const result = await updateServiceEngagementAction(baseUpdateInput({ id: 'nope' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('validation')
  })

  test('rejects invalid status value', async () => {
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'deleted' as any }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('status')
  })

  test('rejects bad effective_from format', async () => {
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ setEffectiveFrom: true, effectiveFrom: 'Jan 1' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('date format')
  })

  test('rejects bad effective_to format', async () => {
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ setEffectiveTo: true, effectiveTo: '2026/01/01' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('date format')
  })

  test('rejects notes longer than 2000 chars', async () => {
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ setNotes: true, notes: 'y'.repeat(2001) }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('2000')
  })

  test('accepts valid update with status only', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'active' }),
    )
    expect(result.ok).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH (3 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('auth enforcement', () => {
  test('create rejects unauthenticated user', async () => {
    mockAuth.mockResolvedValue(authedFail())
    const result = await createServiceEngagementAction(baseCreateInput())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthenticated')
  })

  test('update rejects unauthenticated user', async () => {
    mockAuth.mockResolvedValue(authedFail())
    const result = await updateServiceEngagementAction(baseUpdateInput({ status: 'active' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('unauthenticated')
  })

  test('create passes auth.userId to RPC as p_created_by', async () => {
    mockSchemaRpc.mockResolvedValue({ data: VALID_ENGAGEMENT_ID, error: null })
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: CREATED_ROW, error: null }),
        }),
      }),
    })

    await createServiceEngagementAction(baseCreateInput())

    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'create_service_engagement',
      expect.objectContaining({ p_created_by: AUTH_USER_ID }),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS TRANSITIONS (6 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('status transitions', () => {
  // These test the server action validation — the RPC also enforces transitions,
  // but the action layer should accept valid transitions and pass them through.

  test('accepts draft → active', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { ...CREATED_ROW, status: 'active' }, error: null })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'active' }),
    )
    expect(result.ok).toBe(true)
  })

  test('accepts draft → closed', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { ...CREATED_ROW, status: 'closed' }, error: null })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'closed' }),
    )
    expect(result.ok).toBe(true)
  })

  test('accepts active → suspended', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { ...CREATED_ROW, status: 'suspended' }, error: null })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'suspended' }),
    )
    expect(result.ok).toBe(true)
  })

  test('accepts suspended → active', async () => {
    mockSchemaRpc.mockResolvedValue({ data: { ...CREATED_ROW, status: 'active' }, error: null })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'active' }),
    )
    expect(result.ok).toBe(true)
  })

  test('RPC rejects closed → active and returns db_error', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'Invalid status transition: closed → active' },
    })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'active' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('db_error')
  })

  test('RPC rejects closed → suspended and returns db_error', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'Invalid status transition: closed → suspended' },
    })
    const result = await updateServiceEngagementAction(
      baseUpdateInput({ status: 'suspended' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('db_error')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TYPED-PATCH SEMANTICS (4 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('typed-patch semantics', () => {
  test('sends p_set_effective_from=true when setEffectiveFrom is true', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    await updateServiceEngagementAction(
      baseUpdateInput({ setEffectiveFrom: true, effectiveFrom: '2026-01-01' }),
    )
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_service_engagement',
      expect.objectContaining({
        p_set_effective_from: true,
        p_effective_from: '2026-01-01',
      }),
    )
  })

  test('sends p_set_effective_from=false when setEffectiveFrom is not provided', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    await updateServiceEngagementAction(
      baseUpdateInput({ status: 'active' }),
    )
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_service_engagement',
      expect.objectContaining({
        p_set_effective_from: false,
      }),
    )
  })

  test('explicitly clearing a date sends null with set flag true', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    await updateServiceEngagementAction(
      baseUpdateInput({ setEffectiveTo: true, effectiveTo: null }),
    )
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_service_engagement',
      expect.objectContaining({
        p_set_effective_to: true,
        p_effective_to: null,
      }),
    )
  })

  test('notes set flag controls whether notes are updated', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    await updateServiceEngagementAction(
      baseUpdateInput({ setNotes: true, notes: 'Updated notes' }),
    )
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_service_engagement',
      expect.objectContaining({
        p_set_notes: true,
        p_notes: 'Updated notes',
      }),
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE — SUCCESS PATH (3 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createServiceEngagementAction — success', () => {
  test('returns DTO on successful creation with full fetch', async () => {
    mockSchemaRpc.mockResolvedValue({ data: VALID_ENGAGEMENT_ID, error: null })
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: CREATED_ROW, error: null }),
        }),
      }),
    })

    const result = await createServiceEngagementAction(baseCreateInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.engagement.id).toBe(VALID_ENGAGEMENT_ID)
      expect(result.engagement.serviceType).toBe('management_ltr')
      expect(result.engagement.status).toBe('draft')
    }
  })

  test('returns minimal DTO when fetch-after-create fails', async () => {
    mockSchemaRpc.mockResolvedValue({ data: VALID_ENGAGEMENT_ID, error: null })
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: { message: 'fetch failed' } }),
        }),
      }),
    })

    const result = await createServiceEngagementAction(baseCreateInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.engagement.id).toBe(VALID_ENGAGEMENT_ID)
      expect(result.engagement.entityId).toBe(VALID_ENTITY_ID)
    }
  })

  test('returns db_error when create RPC fails', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'FK violation' },
    })

    const result = await createServiceEngagementAction(baseCreateInput())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('db_error')
      expect(result.message).toContain('FK violation')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// OVERLAP DETECTION — UI LEVEL (3 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('overlap detection (pure function)', () => {
  // Test the checkOverlap logic extracted from ServicesTab
  // Importing from the component would require React — test inline

  const existingProperties = [
    {
      propertyId: VALID_PROPERTY_ID,
      propertyName: 'Test Property',
      engagements: [
        {
          id: 'e1',
          entityId: VALID_ENTITY_ID,
          propertyId: VALID_PROPERTY_ID,
          serviceType: 'management_ltr' as const,
          status: 'active' as const,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          notes: null,
          createdBy: AUTH_USER_ID,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    },
  ] as const

  function checkOverlap(
    propertyId: string,
    serviceType: string,
    existing: readonly typeof existingProperties[number][],
  ): string | null {
    if (!propertyId) return null
    const property = existing.find(p => p.propertyId === propertyId)
    if (!property) return null
    const activeOfSameType = property.engagements.find(
      e => e.serviceType === serviceType && (e.status === 'active' || e.status === 'draft'),
    )
    return activeOfSameType ? serviceType : null
  }

  test('returns service type when same type is active on property', () => {
    expect(checkOverlap(VALID_PROPERTY_ID, 'management_ltr', existingProperties)).toBe('management_ltr')
  })

  test('returns null for different service type', () => {
    expect(checkOverlap(VALID_PROPERTY_ID, 'renovation', existingProperties)).toBeNull()
  })

  test('returns null for unknown property', () => {
    expect(checkOverlap('unknown-id', 'management_ltr', existingProperties)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// DISPLAY CONSTANTS — ARCHITECTURAL (4 tests)
// ═══════════════════════════════════════════════════════════════════════════════

describe('architectural contracts', () => {
  test('create action never sends p_created_by without auth', async () => {
    mockAuth.mockResolvedValue(authedFail())
    const result = await createServiceEngagementAction(baseCreateInput())
    expect(result.ok).toBe(false)
    // Verify RPC was never called
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('update action never calls RPC without auth', async () => {
    mockAuth.mockResolvedValue(authedFail())
    const result = await updateServiceEngagementAction(baseUpdateInput({ status: 'active' }))
    expect(result.ok).toBe(false)
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  test('create action uses lifecycle schema for RPC', async () => {
    mockSchemaRpc.mockResolvedValue({ data: VALID_ENGAGEMENT_ID, error: null })
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: CREATED_ROW, error: null }),
        }),
      }),
    })

    await createServiceEngagementAction(baseCreateInput())
    expect(mockSupabaseClient.schema).toHaveBeenCalledWith('lifecycle')
  })

  test('update action uses lifecycle schema for RPC', async () => {
    mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
    await updateServiceEngagementAction(baseUpdateInput({ status: 'active' }))
    expect(mockSupabaseClient.schema).toHaveBeenCalledWith('lifecycle')
  })
})
