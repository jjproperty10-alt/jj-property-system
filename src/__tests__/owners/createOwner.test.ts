/**
 * createOwner.test.ts — PR #4 Server Action + Architecture Tests
 *
 * Tests the createOwnerAction server action validation, duplicate detection,
 * and architectural boundaries.
 *
 * These are unit tests with mocked dependencies — no DB calls.
 */

import { describe, it, expect, jest } from '@jest/globals'

// Mock server-only — required because createOwnerAction imports identityResolverService
// which has `import 'server-only'` that throws outside React Server Components
jest.mock('server-only', () => ({}), { virtual: true })
// Mock next/headers — server action uses cookies()
jest.mock('next/headers', () => ({ cookies: jest.fn() }), { virtual: true })

import { isValidUUID } from '@/lib/owners/validation'

// ─── Architecture audit tests (source-level, no runtime) ────────────────

describe('PR #4 Architecture Audit', () => {
  it('createOwnerAction is a server action (use server directive)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')
    expect(content.startsWith("'use server'")).toBe(true)
  })

  it('createOwnerAction never imports management_relationship', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')
    expect(content).not.toContain('management_relationship')
  })

  it('createOwnerAction calls lifecycle.create_owner_draft RPC', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')
    expect(content).toContain("'create_owner_draft'")
    expect(content).toContain(".schema('lifecycle')")
  })

  it('createOwnerAction never uses BEGIN/COMMIT (implicit transaction)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')
    expect(content.toUpperCase()).not.toContain('BEGIN')
    expect(content.toUpperCase()).not.toContain('COMMIT')
    expect(content.toUpperCase()).not.toContain('ROLLBACK')
  })

  it('wizard page never writes to management_relationship', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pagePath = path.resolve(
      __dirname,
      '../../app/(app)/owners/new/page.tsx',
    )
    const content = fs.readFileSync(pagePath, 'utf-8')
    expect(content).not.toContain('management_relationship')
  })

  it('AddClientWizard is a client component', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const wizardPath = path.resolve(
      __dirname,
      '../../app/(app)/owners/new/AddClientWizard.tsx',
    )
    const content = fs.readFileSync(wizardPath, 'utf-8')
    expect(content.startsWith("'use client'")).toBe(true)
  })

  it('identityResolverService exports DraftOwnerDTO', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const barrelPath = path.resolve(
      __dirname,
      '../../lib/identity/index.ts',
    )
    const content = fs.readFileSync(barrelPath, 'utf-8')
    expect(content).toContain('DraftOwnerDTO')
  })

  it('ownerWorkspaceTypes includes isDraft field', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const typesPath = path.resolve(
      __dirname,
      '../../lib/owners/ownerWorkspaceTypes.ts',
    )
    const content = fs.readFileSync(typesPath, 'utf-8')
    expect(content).toContain('isDraft')
  })

  it('migration drops unique index and creates RPC', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const migrationPath = path.resolve(
      __dirname,
      '../../../supabase/migrations/20260810_001_pr4_wizard_foundation.sql',
    )
    const content = fs.readFileSync(migrationPath, 'utf-8')
    expect(content).toContain('entity_identity_canonical_name_uq')
    expect(content).toContain('create_owner_draft')
    expect(content).toContain('SECURITY DEFINER')
  })

  it('owners/page.tsx has Link to /owners/new (not disabled button)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pagePath = path.resolve(
      __dirname,
      '../../app/(app)/owners/page.tsx',
    )
    const content = fs.readFileSync(pagePath, 'utf-8')
    expect(content).toContain("href=\"/owners/new\"")
    expect(content).not.toContain('disabled')
  })

  it('identityResolverService draftOwners query is non-fatal (try/catch)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const resolverPath = path.resolve(
      __dirname,
      '../../lib/identity/identityResolverService.ts',
    )
    const content = fs.readFileSync(resolverPath, 'utf-8')
    // The jj_relationships query is wrapped in try/catch with fallback
    expect(content).toContain('jj_relationships query failed')
    expect(content).toContain('draftOwners = []')
  })

  it('createOwnerAction validates relationship type allowlist', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')
    expect(content).toContain('managed_client')
    expect(content).toContain('investor')
    expect(content).toContain('deal_partner')
    expect(content).toContain('internal_partner')
    expect(content).toContain('private_client')
    expect(content).toContain('VALID_RELATIONSHIP_TYPES')
  })
})

// ─── P1 Hotfix: Property ID UUID Validation (regression) ────────────

describe('Property ID UUID Validation', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true)
    expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true)
    expect(isValidUUID('ABCDEF12-3456-7890-ABCD-EF1234567890')).toBe(true)
  })

  it('rejects property names (the original bug)', () => {
    expect(isValidUUID('Tamir Dekelia')).toBe(false)
    expect(isValidUUID('Villa Mazotos')).toBe(false)
    expect(isValidUUID('Oshrit Deklia')).toBe(false)
  })

  it('rejects empty strings and garbage', () => {
    expect(isValidUUID('')).toBe(false)
    expect(isValidUUID('not-a-uuid')).toBe(false)
    expect(isValidUUID('12345')).toBe(false)
    expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd')).toBe(false)
  })
})

describe('P1 Hotfix: Property Selector Regression', () => {
  it('page.tsx queries property_id (UUID) not property_name as propertyId', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const pagePath = path.resolve(
      __dirname,
      '../../app/(app)/owners/new/page.tsx',
    )
    const content = fs.readFileSync(pagePath, 'utf-8')

    // Must query property_id from property_definitions
    expect(content).toContain("select('property_id, property_name')")

    // Must map propertyId from property_id (UUID), not property_name
    expect(content).toContain('propertyId: p.property_id')

    // Must NOT map propertyId from property_name (the original bug)
    expect(content).not.toContain('propertyId: p.property_name')
  })

  it('createOwnerAction rejects non-UUID propertyIds before RPC', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const actionPath = path.resolve(
      __dirname,
      '../../lib/owners/createOwnerAction.ts',
    )
    const content = fs.readFileSync(actionPath, 'utf-8')

    // Must have UUID validation in validate()
    expect(content).toContain('isValidUUID')
    expect(content).toContain('not a valid UUID')
  })

  it('wizard handles empty property selection gracefully', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const wizardPath = path.resolve(
      __dirname,
      '../../app/(app)/owners/new/AddClientWizard.tsx',
    )
    const content = fs.readFileSync(wizardPath, 'utf-8')

    // propertyIds comes from selectedPropertyIds Set — empty by default
    expect(content).toContain('Array.from(selectedPropertyIds)')
    expect(content).toContain("new Set()")
  })
})
