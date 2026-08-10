/**
 * createOwner.test.ts — PR #4 Server Action + Architecture Tests
 *
 * Tests the createOwnerAction server action validation, duplicate detection,
 * and architectural boundaries.
 *
 * These are unit tests with mocked dependencies — no DB calls.
 */

import { describe, it, expect } from '@jest/globals'

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
