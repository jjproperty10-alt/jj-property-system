/**
 * entityContextBridge.test.tsx — RC-003 Entity Context Bridge tests.
 *
 * Proves the RC-003 hypothesis end-to-end:
 *   "A workspace can become a first-class participant in the Operating Frame
 *    by communicating entity identity exclusively through GlobalContext."
 *
 * Test categories:
 *   1. Bridge sets owner context on mount (TC-RC3-01)
 *   2. Exact label preserved (TC-RC3-02)
 *   3. type is exactly 'owner' (TC-RC3-03)
 *   4. parentLabel is undefined when not provided (TC-RC3-04)
 *   5. Bridge updates context when owner identity prop changes (TC-RC3-05)
 *   6. Bridge clears context on unmount (TC-RC3-06)
 *   7. GlobalContext clears entity context when workspace changes (TC-RC3-07)
 *   8. Owner detail page integrates the bridge (TC-RC3-08 — structural)
 *   9. Owner workspace renders OwnerIdentityHeader with back link (TC-RC3-09)
 *  10. Exit link is /owners (TC-RC3-10)
 *  11. Exit is Link, not history.back() (TC-RC3-11 — source audit)
 *  12. No owner identity prop on OperatingFrame (TC-RC3-12 — source audit)
 *  13. OperatingFrame has no owner-specific imports (TC-RC3-13 — source audit)
 *  14. Bridge has no DB/Supabase/fetch imports (TC-RC3-14 — source audit)
 *  15. Owner display name comes from existing identity authority (TC-RC3-15 — source audit)
 *  16. Owner list route remains /owners (TC-RC3-16 — structural)
 *  17. Owner detail route remains /owners/[slug] (TC-RC3-17 — structural)
 *  18. No GlobalContext contract field changes (TC-RC3-18 — type audit)
 *
 * Test infrastructure: react-test-renderer (behavioral) + source audits (static).
 *
 * @see RC-003 Candidate Decision Package
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract C.2, Contract D
 */

import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'fs'
import path from 'path'
import {
  GlobalContextProvider,
  useGlobalContext,
  useUpdateEntityContext,
} from '@/components/nav/GlobalContextProvider'
import { EntityContextBridge } from '@/components/owners/EntityContextBridge'
import type {
  FrameUser,
  WorkspaceNavItem,
  EntityContext,
  GlobalContextShape,
} from '@/lib/nav/types'

// ─── Fixtures ────────────────────────────────────────────────────────────

const mockUser: FrameUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@jjproperty.com',
  role: 'ceo',
}

const mockWorkspaces: WorkspaceNavItem[] = [
  {
    id: 'home',
    label: 'Home',
    iconId: 'home',
    landingRoute: '/home',
    routePrefix: '/home',
  },
  {
    id: 'owners',
    label: 'Owners',
    iconId: 'owners',
    landingRoute: '/owners',
    routePrefix: '/owners',
  },
]

// ─── Context Capture Helper ──────────────────────────────────────────────

let captured: { ctx: GlobalContextShape }

function ContextCapture() {
  const ctx = useGlobalContext()
  captured = { ctx }
  return null
}

// ─── Helper: wrap in Provider ────────────────────────────────────────────

function renderWithProvider(
  children: React.ReactNode,
  activeWorkspaceId: string | null = 'owners',
) {
  let renderer!: TestRenderer.ReactTestRenderer
  act(() => {
    renderer = TestRenderer.create(
      <GlobalContextProvider
        user={mockUser}
        workspaces={mockWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
      >
        {children}
        <ContextCapture />
      </GlobalContextProvider>,
    )
  })
  return renderer
}

// ─── 1. Bridge sets owner context on mount (TC-RC3-01) ──────────────────

describe('EntityContextBridge — mount behavior', () => {
  it('TC-RC3-01: sets entityContext on mount', () => {
    renderWithProvider(
      <EntityContextBridge entityContext={{ label: 'Avi Cohen', type: 'owner' }} />,
    )

    expect(captured.ctx.entityContext).not.toBeNull()
    expect(captured.ctx.entityContext?.label).toBe('Avi Cohen')
    expect(captured.ctx.entityContext?.type).toBe('owner')
  })

  // TC-RC3-02: Exact label preserved
  it('TC-RC3-02: preserves exact label string', () => {
    renderWithProvider(
      <EntityContextBridge entityContext={{ label: 'Oren Ben-David', type: 'owner' }} />,
    )

    expect(captured.ctx.entityContext?.label).toBe('Oren Ben-David')
  })

  // TC-RC3-03: type is exactly 'owner'
  it('TC-RC3-03: type is exactly owner', () => {
    renderWithProvider(
      <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />,
    )

    expect(captured.ctx.entityContext?.type).toBe('owner')
  })

  // TC-RC3-04: parentLabel is undefined when not provided
  it('TC-RC3-04: parentLabel is undefined when not provided', () => {
    renderWithProvider(
      <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />,
    )

    expect(captured.ctx.entityContext?.parentLabel).toBeUndefined()
  })

  it('TC-RC3-04b: parentLabel is preserved when explicitly provided', () => {
    renderWithProvider(
      <EntityContextBridge
        entityContext={{ label: 'Villa Mazotos', type: 'property', parentLabel: 'Avi' }}
      />,
    )

    expect(captured.ctx.entityContext?.parentLabel).toBe('Avi')
  })
})

// ─── 5. Bridge updates on prop change (TC-RC3-05) ───────────────────────

describe('EntityContextBridge — prop change behavior', () => {
  it('TC-RC3-05: updates context when owner identity changes', () => {
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="owners"
        >
          <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    expect(captured.ctx.entityContext?.label).toBe('Avi')

    // Simulate navigating to a different owner
    act(() => {
      renderer.update(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="owners"
        >
          <EntityContextBridge entityContext={{ label: 'Oren', type: 'owner' }} />
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    expect(captured.ctx.entityContext?.label).toBe('Oren')
    expect(captured.ctx.entityContext?.type).toBe('owner')
  })
})

// ─── 6. Bridge clears on unmount (TC-RC3-06) ────────────────────────────

describe('EntityContextBridge — unmount behavior', () => {
  it('TC-RC3-06: clears entityContext on unmount', () => {
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="owners"
        >
          <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    expect(captured.ctx.entityContext).not.toBeNull()

    // Remove the bridge (simulates navigating away from owner detail)
    act(() => {
      renderer.update(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="owners"
        >
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    expect(captured.ctx.entityContext).toBeNull()
  })
})

// ─── 7. GlobalContext clears on workspace change (TC-RC3-07) ─────────────

describe('EntityContextBridge — workspace change', () => {
  it('TC-RC3-07: GlobalContext clears entity context when workspace changes', () => {
    let renderer!: TestRenderer.ReactTestRenderer
    act(() => {
      renderer = TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="owners"
        >
          <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    expect(captured.ctx.entityContext?.label).toBe('Avi')

    // Switch to a different workspace
    act(() => {
      renderer.update(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <EntityContextBridge entityContext={{ label: 'Avi', type: 'owner' }} />
          <ContextCapture />
        </GlobalContextProvider>,
      )
    })

    // G3 guarantee: entityContext clears on workspace change
    expect(captured.ctx.entityContext).toBeNull()
  })
})

// ─── 8–11: Structural + deterministic exit tests ─────────────────────────

describe('Owner Workspace structural contracts', () => {
  // TC-RC3-08: Owner detail page integrates the bridge
  it('TC-RC3-08: owner detail page imports EntityContextBridge', () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/(app)/owners/[slug]/page.tsx'),
      'utf-8',
    )
    expect(pageSrc).toContain('EntityContextBridge')
    expect(pageSrc).toContain("type: 'owner'")
  })

  // TC-RC3-09: OwnerIdentityHeader renders back link
  it('TC-RC3-09: OwnerIdentityHeader contains back link to /owners', () => {
    const headerSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/owners/OwnerIdentityHeader.tsx'),
      'utf-8',
    )
    expect(headerSrc).toContain('href="/owners"')
    expect(headerSrc).toContain('Back to Owners Room')
  })

  // TC-RC3-10: Exit link is /owners
  it('TC-RC3-10: exit destination is exactly /owners', () => {
    const headerSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/owners/OwnerIdentityHeader.tsx'),
      'utf-8',
    )
    // Must contain exactly href="/owners" — not a computed route
    expect(headerSrc).toMatch(/href="\/owners"/)
  })

  // TC-RC3-11: Exit is Link, not history.back()
  it('TC-RC3-11: exit uses Next.js Link, not history.back()', () => {
    const headerSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/owners/OwnerIdentityHeader.tsx'),
      'utf-8',
    )
    expect(headerSrc).toContain("import Link from 'next/link'")
    expect(headerSrc).not.toContain('history.back')
    expect(headerSrc).not.toContain('router.back')
    expect(headerSrc).not.toContain('window.history')
  })
})

// ─── 12–14: Source audits — forbidden imports ────────────────────────────

describe('RC-003 boundary audits', () => {
  // TC-RC3-12: No owner identity prop on OperatingFrame
  it('TC-RC3-12: OperatingFrame does not receive owner identity props', () => {
    const frameSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/nav/OperatingFrame.tsx'),
      'utf-8',
    )
    // OperatingFrame props should only be user, workspaces, children
    expect(frameSrc).not.toContain('ownerName')
    expect(frameSrc).not.toContain('ownerId')
    expect(frameSrc).not.toContain('ownerIdentity')
    expect(frameSrc).not.toContain('entityContext')
    expect(frameSrc).not.toContain('ownerSlug')
  })

  // TC-RC3-13: OperatingFrame has no owner-specific imports
  it('TC-RC3-13: OperatingFrame contains no owner-specific imports', () => {
    const frameSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/nav/OperatingFrame.tsx'),
      'utf-8',
    )
    // Check import lines only — comments may reference owners/ for documentation
    const importLines = frameSrc
      .split('\n')
      .filter((line: string) => line.trimStart().startsWith('import'))
    const importBlock = importLines.join('\n')
    expect(importBlock).not.toContain('owners/')
    expect(importBlock).not.toContain('ownerWorkspace')
    expect(importBlock).not.toContain('OwnerIdentity')
    expect(importBlock).not.toContain('EntityContextBridge')
    expect(importBlock).not.toContain('identityResolver')
  })

  // TC-RC3-14: Bridge has no DB/Supabase/fetch imports
  it('TC-RC3-14: EntityContextBridge contains no data-access imports', () => {
    const bridgeSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/owners/EntityContextBridge.tsx'),
      'utf-8',
    )
    expect(bridgeSrc).not.toContain('supabase')
    expect(bridgeSrc).not.toContain('Supabase')
    expect(bridgeSrc).not.toContain('createClient')
    expect(bridgeSrc).not.toContain('createServiceClient')
    expect(bridgeSrc).not.toContain('fetch(')
    expect(bridgeSrc).not.toContain("from '@/lib/supabase")
    expect(bridgeSrc).not.toContain("from '@/lib/owners/ownerWorkspaceService")
    expect(bridgeSrc).not.toContain("from '@/lib/identity")
  })

  // TC-RC3-15: Owner display name comes from existing identity authority
  it('TC-RC3-15: owner page uses workspace.identity.name from existing service', () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/(app)/owners/[slug]/page.tsx'),
      'utf-8',
    )
    // The page fetches from getOwnerWorkspace (existing authority)
    expect(pageSrc).toContain('getOwnerWorkspace')
    // And passes workspace.identity.name to the bridge
    expect(pageSrc).toContain('workspace.identity.name')
  })
})

// ─── 16–18: Route and contract preservation ──────────────────────────────

describe('RC-003 preservation guarantees', () => {
  // TC-RC3-16: Owner list route remains /owners
  it('TC-RC3-16: owners list route is /owners', () => {
    const listSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/(app)/owners/page.tsx'),
      'utf-8',
    )
    // The file exists under (app)/owners — route is /owners
    expect(listSrc).toContain('OwnersRoomPage')
  })

  // TC-RC3-17: Owner detail route remains /owners/[slug]
  it('TC-RC3-17: owner detail route is /owners/[slug]', () => {
    const pageSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/(app)/owners/[slug]/page.tsx'),
      'utf-8',
    )
    expect(pageSrc).toContain('OwnerWorkspacePage')
  })

  // TC-RC3-18: No GlobalContext contract field changes
  it('TC-RC3-18: GlobalContextShape has not changed', () => {
    const typesSrc = fs.readFileSync(
      path.resolve(__dirname, '../../lib/nav/types.ts'),
      'utf-8',
    )
    // Verify the canonical fields of GlobalContextShape
    expect(typesSrc).toContain('readonly user: FrameUser')
    expect(typesSrc).toContain('readonly activeWorkspaceId: string | null')
    expect(typesSrc).toContain('readonly activeWorkspaceLabel: string | null')
    expect(typesSrc).toContain('readonly entityContext: EntityContext | null')
    expect(typesSrc).toContain('readonly attention: ReadonlyMap<string, WorkspaceAttention>')
    expect(typesSrc).toContain('readonly frameReady: boolean')
    expect(typesSrc).toContain('readonly mobileMenuOpen: boolean')

    // Verify EntityContext type has not changed
    expect(typesSrc).toContain("readonly type: 'owner' | 'property' | 'partner' | 'reservation' | 'decision'")
    expect(typesSrc).toContain('readonly label: string')
    expect(typesSrc).toContain('readonly parentLabel?: string')
  })
})
