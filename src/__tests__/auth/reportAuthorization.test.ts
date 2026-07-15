/**
 * JJ Property 10 — Report Authorization Foundation Tests
 * PR A: 10 required authorization tests
 *
 * These tests verify the authorization logic by mocking the Supabase layer.
 * The server action boundary ('use server') is verified structurally in test 10.
 *
 * Test mapping to requirements:
 *   1.  Unauthenticated request → rejected
 *   2.  Authenticated user without user_roles → rejected
 *   3.  Unknown role → rejected
 *   4.  Admin (superadmin) → receives all canonical reportable properties
 *   5.  Browser-submitted property lists are never authoritative
 *   6.  Unauthorized property injection → rejected by trusted server path
 *   7.  Errors do not reveal another property's owner
 *   8.  Duplicate property names → normalized safely
 *   9.  Stable canonical order → preserved
 *   10. Server-only code and secrets → not included in client bundle
 */

import * as fs from 'fs'
import * as path from 'path'

// ── Mock Setup ───────────────────────────────────────────────────────────────
// We mock the Supabase clients and cookies to test authorization logic in isolation.

// Mock user state — tests set these before each case
let mockUser: { id: string } | null = null
let mockUserRole: { role: string; full_name: string; is_active: boolean } | null = null
let mockReportableProperties: string[] = []
let mockPartnerProperties: string[] = []

// Track what queries were made (for test 5 — proving browser lists aren't used)
let queriedViews: string[] = []

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: () => [],
  }),
}))

// Mock @supabase/ssr
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockImplementation(async () => {
        if (!mockUser) return { data: { user: null }, error: { message: 'No session' } }
        return { data: { user: mockUser }, error: null }
      }),
    },
  })),
}))

// Mock @/lib/supabase — createServiceClient
jest.mock('@/lib/supabase', () => ({
  createServiceClient: jest.fn(() => {
    // Return a chainable query builder mock
    const createChain = (tableName: string) => {
      queriedViews.push(tableName)

      const chain: Record<string, Function> = {}

      chain.select = jest.fn().mockReturnValue(chain)
      chain.eq = jest.fn().mockImplementation((_col: string, val: string) => {
        // Route based on table + column
        if (tableName === 'user_roles') {
          if (!mockUserRole) {
            chain._result = { data: null, error: { message: 'Not found' } }
          } else {
            chain._result = { data: mockUserRole, error: null }
          }
        }
        if (tableName === 'property_owners') {
          chain._ownerFilter = val
        }
        return chain
      })
      chain.single = jest.fn().mockImplementation(() => {
        return chain._result ?? { data: mockUserRole, error: null }
      })
      chain.order = jest.fn().mockImplementation(() => {
        if (tableName === 'property_owners') {
          const ownerProps = mockPartnerProperties.map(p => ({ property_name: p }))
          return { data: ownerProps, error: null }
        }
        return chain
      })

      // For RC3 view queries (select reporting_name)
      if (tableName.startsWith('v_rc3_')) {
        chain.select = jest.fn().mockResolvedValue({
          data: mockReportableProperties.map(n => ({ reporting_name: n })),
        })
      }

      return chain
    }

    return {
      from: jest.fn().mockImplementation((table: string) => createChain(table)),
    }
  }),
}))

// Import after mocks are set up
import {
  getAuthorizedReportProperties,
  validateAuthorizedReportScope,
  type AuthorizationResult,
  type ScopeValidationResult,
} from '../../lib/auth/reportAuthorization'

// ── Test Setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUser = null
  mockUserRole = null
  mockReportableProperties = []
  mockPartnerProperties = []
  queriedViews = []
})

// ── Test 1: Unauthenticated request is rejected ─────────────────────────────

describe('Test 1: Unauthenticated request', () => {
  it('rejects when no session exists', async () => {
    mockUser = null

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unauthenticated')
    }
  })
})

// ── Test 2: Authenticated user without user_roles is rejected ────────────────

describe('Test 2: No user_roles record', () => {
  it('rejects authenticated user with no role mapping', async () => {
    mockUser = { id: 'uid-123' }
    mockUserRole = null

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('no_role')
    }
  })
})

// ── Test 3: Unknown role is rejected ─────────────────────────────────────────

describe('Test 3: Unknown role', () => {
  it('rejects when role is not in report access policy', async () => {
    mockUser = { id: 'uid-123' }
    mockUserRole = { role: 'viewer', full_name: 'Someone', is_active: true }

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('unknown_role')
    }
  })

  it('rejects inactive role even if role type is valid', async () => {
    mockUser = { id: 'uid-123' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: false }

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('role_inactive')
    }
  })
})

// ── Test 4: Admin receives all canonical reportable properties ───────────────

describe('Test 4: Superadmin authorization', () => {
  it('returns all canonical reportable properties for superadmin', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia', 'Villa Mazotos', 'Oren Kitty']

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.properties).toContain('Tamir Dekelia')
      expect(result.properties).toContain('Villa Mazotos')
      expect(result.properties).toContain('Oren Kitty')
      expect(result.role).toBe('superadmin')
    }
  })
})

// ── Test 5: Browser-submitted property lists are never authoritative ─────────

describe('Test 5: Browser lists not authoritative', () => {
  it('validates scope via server-resolved properties, not browser input', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia', 'Villa Mazotos']

    // Browser submits a property that exists in their local list but
    // the server does NOT have it in reportable properties
    const result = await validateAuthorizedReportScope({
      type: 'single_property',
      propertyName: 'Fake Property Injected',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('no_authorized_properties')
    }

    // Verify the server queried RC3 views (not browser list)
    const rc3Queries = queriedViews.filter(v => v.startsWith('v_rc3_'))
    expect(rc3Queries.length).toBeGreaterThan(0)
  })
})

// ── Test 6: Unauthorized property injection is rejected ──────────────────────

describe('Test 6: Property injection rejected', () => {
  it('silently drops unauthorized properties from selected_properties', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia', 'Villa Mazotos']

    const result = await validateAuthorizedReportScope({
      type: 'selected_properties',
      propertyNames: ['Tamir Dekelia', 'INJECTED_PROPERTY', 'Villa Mazotos'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resolvedProperties).toEqual(['Tamir Dekelia', 'Villa Mazotos'])
      expect(result.resolvedProperties).not.toContain('INJECTED_PROPERTY')
    }
  })

  it('rejects entirely when all submitted properties are unauthorized', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia']

    const result = await validateAuthorizedReportScope({
      type: 'selected_properties',
      propertyNames: ['FAKE_1', 'FAKE_2'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('no_authorized_properties')
    }
  })
})

// ── Test 7: Errors do not reveal another property's owner ────────────────────

describe('Test 7: No ownership leakage in errors', () => {
  it('returns generic error for unauthorized single property', async () => {
    mockUser = { id: 'uid-partner' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia']

    const result = await validateAuthorizedReportScope({
      type: 'single_property',
      propertyName: 'Secret Property',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      // Error is 'no_authorized_properties' — does NOT say "this property belongs to X"
      expect(result.error).toBe('no_authorized_properties')
      // The error type is a fixed enum, never dynamic — cannot contain owner info
      const errorStr = JSON.stringify(result)
      expect(errorStr).not.toContain('owner')
      expect(errorStr).not.toContain('Secret Property')
    }
  })
})

// ── Test 8: Duplicate property names normalized safely ───────────────────────

describe('Test 8: Deduplication', () => {
  it('deduplicates submitted property names', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia', 'Villa Mazotos']

    const result = await validateAuthorizedReportScope({
      type: 'selected_properties',
      propertyNames: ['Tamir Dekelia', 'Tamir Dekelia', '  Tamir Dekelia  ', 'Villa Mazotos'],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Trimmed duplicates removed; 'Tamir Dekelia' appears once
      expect(result.resolvedProperties.filter(n => n === 'Tamir Dekelia')).toHaveLength(1)
      expect(result.resolvedProperties).toHaveLength(2)
    }
  })

  it('handles empty strings and whitespace-only entries', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia']

    const result = await validateAuthorizedReportScope({
      type: 'selected_properties',
      propertyNames: ['', '   ', 'Tamir Dekelia', ''],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.resolvedProperties).toEqual(['Tamir Dekelia'])
    }
  })
})

// ── Test 9: Stable canonical order preserved ─────────────────────────────────

describe('Test 9: Canonical order', () => {
  it('returns properties in stable alphabetical order for portfolio', async () => {
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Villa Mazotos', 'Tamir Dekelia', 'Oren Kitty']

    const result = await getAuthorizedReportProperties()

    expect(result.ok).toBe(true)
    if (result.ok) {
      // Verify alphabetical order
      const sorted = [...result.properties].sort((a, b) => a.localeCompare(b))
      expect(result.properties).toEqual(sorted)
    }
  })
})

// ── Test 10: Server-only code not in client bundle ───────────────────────────

describe('Test 10: Server-only boundary', () => {
  it('reportAuthorization.ts starts with "use server" directive', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/auth/reportAuthorization.ts',
    )
    const content = fs.readFileSync(filePath, 'utf-8')

    // The 'use server' directive must appear before any executable code
    // (comments and whitespace before it are fine)
    const lines = content.split('\n')
    let foundDirective = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/**')) {
        continue
      }
      if (trimmed === "'use server'" || trimmed === '"use server"') {
        foundDirective = true
        break
      }
      // Any non-comment, non-empty line before 'use server' = not a server module
      break
    }

    expect(foundDirective).toBe(true)
  })

  it('does not import or reference SUPABASE_SERVICE_KEY directly', () => {
    const filePath = path.resolve(
      __dirname,
      '../../lib/auth/reportAuthorization.ts',
    )
    const content = fs.readFileSync(filePath, 'utf-8')

    // The service key is accessed through createServiceClient() — never directly
    expect(content).not.toContain('SUPABASE_SERVICE_KEY')
    expect(content).not.toContain('service_role')
    // It imports createServiceClient which handles the key internally
    expect(content).toContain("import { createServiceClient } from '@/lib/supabase'")
  })
})

// ── Test 11: PR B integration contract ───────────────────────────────────────

describe('Test 11: PR B integration contract', () => {
  it('exports getAuthorizedReportProperties and validateAuthorizedReportScope', () => {
    // Verify the module exports the two functions PR B will consume
    expect(typeof getAuthorizedReportProperties).toBe('function')
    expect(typeof validateAuthorizedReportScope).toBe('function')
  })

  it('exports ReportScope type that matches PR B scope model', async () => {
    // Verify the server action accepts the same scope shapes PR B will submit
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia']

    // portfolio
    const r1 = await validateAuthorizedReportScope({ type: 'portfolio' })
    expect(r1.ok).toBe(true)

    // selected_properties
    const r2 = await validateAuthorizedReportScope({
      type: 'selected_properties',
      propertyNames: ['Tamir Dekelia'],
    })
    expect(r2.ok).toBe(true)

    // single_property
    const r3 = await validateAuthorizedReportScope({
      type: 'single_property',
      propertyName: 'Tamir Dekelia',
    })
    expect(r3.ok).toBe(true)
  })

  it('centralizes role policy — PR B does not need to check roles', async () => {
    // The authorization result includes the role, but PR B does not
    // need to re-check it — the server action already enforced policy
    mockUser = { id: 'uid-yossi' }
    mockUserRole = { role: 'superadmin', full_name: 'Yossi', is_active: true }
    mockReportableProperties = ['Tamir Dekelia']

    const result = await getAuthorizedReportProperties()
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Role is returned for display/logging, not for PR B to re-check
      expect(result.role).toBeDefined()
      // Properties are already filtered by policy — PR B just uses them
      expect(result.properties.length).toBeGreaterThan(0)
    }
  })
})
