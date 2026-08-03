/**
 * @module ownerAuditAdapter.test
 * @description R1 — Tests for the owner audit adapter RPC-based resolution.
 *
 * Five required tests (per Yossi):
 * 1. Oren receives only Oren snapshots (scoped by owner_party_id)
 * 2. Neer remains party_bridge_missing
 * 3. Empty snapshots after successfhul scoped query are valid empty
 * 4. RPC failure returns source_unavailable
 * 5. No direct .schema('statements') query remains in the adapter source
 */

import * as fs from 'fs'
import * as path from 'path'

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock server-only (no-op in test environment)
jest.mock('server-only', () => ({}), { virtual: true })

// Mock identityResolverService
const mockResolveBySlug = jest.fn()
jest.mock('@/lib/identity/identityResolverService', () => ({
  resolveBySlug: (...args: unknown[]) => mockResolveBySlug(...args),
}))

// Mock supabase client
const mockRpc = jest.fn()
const mockSupabaseClient = { rpc: mockRpc }
jest.mock('@/lib/supabase', () => ({
  createServiceClient: () => mockSupabaseClient,
}))

// Import after mocks
import { resolveOwnerAudit } from '../ownerAuditAdapter'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OREN_ENTITY_ID = '4bd5fae5-dfd2-4e0b-a96e-66d05e990533'
const OREN_PARTY_ID = '17272f6b-c092-4584-85aa-aab7caeb70ad'
const NEER_ENTITY_ID = '0e2f942b-7b8a-46c9-9a54-b62f62ee2886'

function orenIdentityResolved() {
  return {
    status: 'resolved' as const,
    data: {
      identity: {
        entityId: OREN_ENTITY_ID,
        displayName: 'Oren',
        canonicalSlug: 'oren',
        entityKind: 'individual' as const,
        aliases: Object.freeze([]),
        status: 'active' as const,
        source: 'lifecycle.entity_identity',
      },
      managedProperties: [],
      primaryProperty: null,
    },
  }
}

function neerIdentityResolved() {
  return {
    status: 'resolved' as const,
    data: {
      identity: {
        entityId: NEER_ENTITY_ID,
        displayName: 'Neer Yoav',
        canonicalSlug: 'neer-yoav',
        entityKind: 'individual' as const,
        aliases: Object.freeze([]),
        status: 'active' as const,
        source: 'lifecycle.entity_identity',
      },
      managedProperties: [],
      primaryProperty: null,
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

describe('ownerAuditAdapter — R1 RPC tests', () => {
  test('1. Oren receives only Oren snapshots (scoped by owner_party_id)', async () => {
    mockResolveBySlug.mockResolvedValue(orenIdentityResolved())

    // resolve_party_id returns Oren's party
    mockRpc
      .mockResolvedValueOnce({
        data: [{ canonical_id: OREN_PARTY_ID, mapping_status: 'approved' }],
        error: null,
      })
      // get_owner_statement_snapshots returns scoped data
      .mockResolvedValueOnce({
        data: [
          {
            snapshot_id: 'snap-001',
            version_number: 1,
            period_start: '2026-01-01',
            period_end: '2026-06-30',
            created_at: '2026-07-01T10:00:00Z',
            delivery_channels: ['email'],
            is_voided: false,
            is_current_in_series: true,
            parent_snapshot_id: null,
          },
        ],
        error: null,
      })

    const result = await resolveOwnerAudit('oren')

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return

    // Verify RPC was called with Oren's party_id
    expect(mockRpc).toHaveBeenCalledWith('get_owner_statement_snapshots', {
      p_owner_party_id: OREN_PARTY_ID,
      p_limit: 20,
    })

    // Verify snapshot mapping
    expect(result.data.statementVersions).toHaveLength(1)
    const sv = result.data.statementVersions[0]
    expect(sv.id).toBe('snap-001')
    expect(sv.version).toBe(1)
    expect(sv.period).toBe('2026-01-01 – 2026-06-30')
    expect(sv.sentAt).toBe('2026-07-01T10:00:00Z')
    expect(sv.status).toBe('sent')
    expect(sv.channel).toBe('email')
    expect(sv.replacedFrom).toBeNull()
  })

  test('2. Neer remains party_bridge_missing', async () => {
    mockResolveBySlug.mockResolvedValue(neerIdentityResolved())

    // resolve_party_id returns empty — no bridge row for Neer
    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const result = await resolveOwnerAudit('neer-yoav')

    expect(result.status).toBe('party_bridge_missing')
    if (result.status !== 'party_bridge_missing') return

    expect(result.entityIdentityId).toBe(NEER_ENTITY_ID)
    expect(result.canonicalName).toBe('Neer Yoav')

    // get_owner_statement_snapshots should NOT have been called
    expect(mockRpc).toHaveBeenCalledTimes(1) // only resolve_party_id
  })

  test('3. Empty snapshots after successful scoped query are valid empty', async () => {
    mockResolveBySlug.mockResolvedValue(orenIdentityResolved())

    mockRpc
      .mockResolvedValueOnce({
        data: [{ canonical_id: OREN_PARTY_ID, mapping_status: 'approved' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [], // No snapshots — table is empty but query succeeded
        error: null,
      })

    const result = await resolveOwnerAudit('oren')

    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return

    // Empty array is valid — not an error
    expect(result.data.statementVersions).toEqual([])
    // Evidence items also empty (unsupported source)
    expect(result.data.evidenceItems).toEqual([])
  })

  test('4. RPC failure returns source_unavailable', async () => {
    mockResolveBySlug.mockResolvedValue(orenIdentityResolved())

    mockRpc
      .mockResolvedValueOnce({
        data: [{ canonical_id: OREN_PARTY_ID, mapping_status: 'approved' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'function get_owner_statement_snapshots does not exist', code: '42883' },
      })

    const result = await resolveOwnerAudit('oren')

    expect(result.status).toBe('source_unavailable')
    if (result.status !== 'source_unavailable') return

    expect(result.failedSource).toBe('statements_schema')
    expect(result.error).toContain('get_owner_statement_snapshots')
  })

  test('5. No direct .schema("statements") query remains in adapter source', () => {
    const adapterPath = path.resolve(
      __dirname,
      '..',
      'ownerAuditAdapter.ts',
    )
    const source = fs.readFileSync(adapterPath, 'utf-8')

    // Must not contain any direct schema('statements') access
    expect(source).not.toMatch(/\.schema\s*\(\s*['"]statements['"]\s*\)/)

    // Must use the RPC instead
    expect(source).toContain("get_owner_statement_snapshots")

    // Must also not have direct schema('registry') access (PR #90 fix)
    expect(source).not.toMatch(/\.schema\s*\(\s*['"]registry['"]\s*\)/)
  })

  test('voided snapshot maps to status void', async () => {
    mockResolveBySlug.mockResolvedValue(orenIdentityResolved())

    mockRpc
      .mockResolvedValueOnce({
        data: [{ canonical_id: OREN_PARTY_ID, mapping_status: 'approved' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            snapshot_id: 'snap-voided',
            version_number: 1,
            period_start: '2026-01-01',
            period_end: '2026-03-31',
            created_at: '2026-04-01T08:00:00Z',
            delivery_channels: null,
            is_voided: true,
            is_current_in_series: false,
            parent_snapshot_id: null,
          },
        ],
        error: null,
      })

    const result = await resolveOwnerAudit('oren')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return

    expect(result.data.statementVersions[0].status).toBe('void')
    expect(result.data.statementVersions[0].channel).toBeNull()
  })

  test('delivery_channels JSONB array joins to comma-separated string', async () => {
    mockResolveBySlug.mockResolvedValue(orenIdentityResolved())

    mockRpc
      .mockResolvedValueOnce({
        data: [{ canonical_id: OREN_PARTY_ID, mapping_status: 'approved' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            snapshot_id: 'snap-multi',
            version_number: 2,
            period_start: '2026-01-01',
            period_end: '2026-06-30',
            created_at: '2026-07-15T12:00:00Z',
            delivery_channels: ['email', 'whatsapp'],
            is_voided: false,
            is_current_in_series: true,
            parent_snapshot_id: 'snap-001',
          },
        ],
        error: null,
      })

    const result = await resolveOwnerAudit('oren')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return

    const sv = result.data.statementVersions[0]
    expect(sv.channel).toBe('email, whatsapp')
    expect(sv.replacedFrom).toBe('snap-001')
    expect(sv.version).toBe(2)
  })
})
