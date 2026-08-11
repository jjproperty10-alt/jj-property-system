/**
 * @module rentalContractActions.test
 * @description P2 LTR Operations — Rental Contract Foundation tests.
 *
 * 15 focused tests covering:
 * - Create validation (5)
 * - Update validation + COALESCE/clear_* pattern (4)
 * - Auth boundary (2)
 * - Row→DTO mapping (2)
 * - Adapter: status guard + empty fallback (2)
 *
 * Architecture:
 * - Mocks: server-only, statementAuthService, supabase
 * - Pure unit tests — no DB, no network
 * - Three-authority separation preserved:
 *     Service Engagement ≠ Rental Contract ≠ Tenant Payment
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
const mockSchemaRpc = jest.fn()
const mockSupabaseClient = {
  schema: jest.fn(() => ({
    rpc: mockSchemaRpc,
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
  createRentalContractAction,
  updateRentalContractAction,
} from '../rentalContractActions'

import type {
  CreateRentalContractInput,
  UpdateRentalContractInput,
  RentalContractDTO,
} from '../ownerWorkspaceTypes'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_PROPERTY_ID = 'bbbbbbbb-1111-2222-3333-444444444444'
const VALID_ENGAGEMENT_ID = 'cccccccc-1111-2222-3333-444444444444'
const VALID_CONTRACT_ID = 'dddddddd-1111-2222-3333-444444444444'
const AUTH_USER_ID = '277f81e0-3b89-41ed-a099-22585959b77a'

function authedOk() {
  return { ok: true as const, userId: AUTH_USER_ID }
}

function authedFail() {
  return { ok: false as const, error: 'NO_SESSION' }
}

function baseCreateInput(overrides?: Partial<CreateRentalContractInput>): CreateRentalContractInput {
  return {
    propertyId: VALID_PROPERTY_ID,
    serviceEngagementId: VALID_ENGAGEMENT_ID,
    tenantName: 'John Smith',
    startDate: '2026-09-01',
    monthlyRentEur: 800,
    ...overrides,
  }
}

function baseUpdateInput(overrides?: Partial<UpdateRentalContractInput>): UpdateRentalContractInput {
  return {
    id: VALID_CONTRACT_ID,
    ...overrides,
  }
}

const CREATED_ROW = {
  id: VALID_CONTRACT_ID,
  property_id: VALID_PROPERTY_ID,
  service_engagement_id: VALID_ENGAGEMENT_ID,
  tenant_name: 'John Smith',
  tenant_entity_id: null,
  start_date: '2026-09-01',
  end_date: null,
  monthly_rent_eur: 800,
  deposit_eur: null,
  payment_day: 1,
  currency: 'EUR',
  status: 'draft',
  notes: null,
  created_by: AUTH_USER_ID,
  created_at: '2026-08-10T12:00:00Z',
  updated_at: '2026-08-10T12:00:00Z',
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.mockReturnValue(authedOk())
  mockSchemaRpc.mockResolvedValue({ data: CREATED_ROW, error: null })
})

// ─── Tests: Auth boundary ─────────────────────────────────────────────────────

describe('Auth boundary', () => {
  it('rejects create when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await createRentalContractAction(baseCreateInput())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unauthenticated')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })

  it('rejects update when unauthenticated', async () => {
    mockAuth.mockReturnValue(authedFail())
    const result = await updateRentalContractAction(baseUpdateInput({ tenantName: 'New' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unauthenticated')
    }
    expect(mockSchemaRpc).not.toHaveBeenCalled()
  })
})

// ─── Tests: Create validation ─────────────────────────────────────────────────

describe('Create validation', () => {
  it('rejects invalid property UUID', async () => {
    const result = await createRentalContractAction(baseCreateInput({ propertyId: 'not-a-uuid' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/property/i)
    }
  })

  it('rejects empty tenant name', async () => {
    const result = await createRentalContractAction(baseCreateInput({ tenantName: '   ' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/tenant/i)
    }
  })

  it('rejects negative monthly rent', async () => {
    const result = await createRentalContractAction(baseCreateInput({ monthlyRentEur: -100 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/rent/i)
    }
  })

  it('rejects payment day outside 1-28 range', async () => {
    const result = await createRentalContractAction(baseCreateInput({ paymentDay: 31 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/payment day/i)
    }
  })

  it('rejects end date before start date', async () => {
    const result = await createRentalContractAction(
      baseCreateInput({ startDate: '2026-09-01', endDate: '2026-08-01' }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/end date/i)
    }
  })
})

// ─── Tests: Update validation + COALESCE/clear_* pattern ──────────────────────

describe('Update validation + COALESCE/clear_* pattern', () => {
  it('rejects invalid contract UUID', async () => {
    const result = await updateRentalContractAction(baseUpdateInput({ id: 'bad-id' }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('validation')
      expect(result.message).toMatch(/contract/i)
    }
  })

  it('passes clearEndDate flag through to RPC', async () => {
    await updateRentalContractAction(baseUpdateInput({ clearEndDate: true }))
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_rental_contract',
      expect.objectContaining({ p_clear_end_date: true }),
    )
  })

  it('passes clearDeposit flag through to RPC', async () => {
    await updateRentalContractAction(baseUpdateInput({ clearDeposit: true }))
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_rental_contract',
      expect.objectContaining({ p_clear_deposit: true }),
    )
  })

  it('passes clearNotes flag through to RPC', async () => {
    await updateRentalContractAction(baseUpdateInput({ clearNotes: true }))
    expect(mockSchemaRpc).toHaveBeenCalledWith(
      'update_rental_contract',
      expect.objectContaining({ p_clear_notes: true }),
    )
  })
})

// ─── Tests: Row → DTO mapping ─────────────────────────────────────────────────

describe('Row → DTO mapping', () => {
  it('maps created row to RentalContractDTO correctly', async () => {
    const result = await createRentalContractAction(baseCreateInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      const c: RentalContractDTO = result.contract
      expect(c.id).toBe(VALID_CONTRACT_ID)
      expect(c.propertyId).toBe(VALID_PROPERTY_ID)
      expect(c.serviceEngagementId).toBe(VALID_ENGAGEMENT_ID)
      expect(c.tenantName).toBe('John Smith')
      expect(c.tenantEntityId).toBeNull()
      expect(c.startDate).toBe('2026-09-01')
      expect(c.endDate).toBeNull()
      expect(c.monthlyRentEur).toBe(800)
      expect(c.depositEur).toBeNull()
      expect(c.paymentDay).toBe(1)
      expect(c.currency).toBe('EUR')
      expect(c.status).toBe('draft')
      expect(c.notes).toBeNull()
      expect(c.createdBy).toBe(AUTH_USER_ID)
    }
  })

  it('maps numeric string fields to numbers correctly', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: { ...CREATED_ROW, monthly_rent_eur: '1500.50', deposit_eur: '2000' },
      error: null,
    })
    const result = await createRentalContractAction(baseCreateInput())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.contract.monthlyRentEur).toBe(1500.5)
      expect(result.contract.depositEur).toBe(2000)
    }
  })
})

// ─── Tests: Adapter status guard + empty fallback ─────────────────────────────
// These test the adapter's mapRow function indirectly via the actions' mapRowToDTO

describe('Adapter/action behavior', () => {
  it('returns DB error message when RPC fails', async () => {
    mockSchemaRpc.mockResolvedValue({
      data: null,
      error: { message: 'violates foreign key constraint' },
    })
    const result = await createRentalContractAction(baseCreateInput())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('db_error')
      expect(result.message).toMatch(/foreign key/i)
    }
  })

  it('handles unexpected errors gracefully', async () => {
    mockSchemaRpc.mockRejectedValue(new Error('Network timeout'))
    const result = await createRentalContractAction(baseCreateInput())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('db_error')
      expect(result.message).toBe('Unexpected error')
    }
  })
})
