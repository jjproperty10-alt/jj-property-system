/**
 * @description Tests for GlobalContextProvider — Contract D.
 *
 * Test environment: node (jest.config.ts testEnvironment: 'node')
 * Rendering strategies:
 *   - react-test-renderer (create + act + update) for behavioral/state-mutation tests
 *   - react-dom/server renderToStaticMarkup for structural/throw tests
 *
 * Test Contracts covered:
 *   TC-GC-1: useGlobalContext returns full shape (react-test-renderer)
 *   TC-GC-2: useUpdateEntityContext sets entity (react-test-renderer + act)
 *   TC-GC-3: entityContext clears on workspace change (react-test-renderer + act + update)
 *   TC-GC-4: useUpdateAttention updates one workspace (react-test-renderer + act)
 *   TC-GC-5: null attention preserved (P-ARCH-1) (react-test-renderer + act)
 *   TC-GC-6: frameReady true after mount (react-test-renderer)
 *   TC-GC-7: hooks throw descriptive error outside provider (renderToStaticMarkup)
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import {
  GlobalContextProvider,
  useGlobalContext,
  useUpdateEntityContext,
  useUpdateAttention,
  useSetMobileMenu,
} from '../GlobalContextProvider'
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
    id: 'finance',
    label: 'Finance',
    iconId: 'finance',
    landingRoute: '/finance',
    routePrefix: '/finance',
  },
]

// ─── Context Capture (for behavioral tests with react-test-renderer) ────

interface CapturedContext {
  ctx: GlobalContextShape
  updateEntity: (entity: EntityContext | null) => void
  updateAttention: (workspaceId: string, count: number | null) => void
  setMobile: (open: boolean) => void
}

let captured: CapturedContext

/**
 * Consumer component that captures all context values and updater functions.
 * Used with react-test-renderer to test state mutations via act().
 */
function ContextCapture() {
  const ctx = useGlobalContext()
  const updateEntity = useUpdateEntityContext()
  const updateAttention = useUpdateAttention()
  const setMobile = useSetMobileMenu()
  captured = { ctx, updateEntity, updateAttention, setMobile }
  return null
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('GlobalContextProvider', () => {
  // TC-GC-1: useGlobalContext returns full shape
  it('provides full GlobalContextShape', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    expect(captured.ctx.user).toEqual(mockUser)
    expect(captured.ctx.activeWorkspaceId).toBe('home')
    expect(captured.ctx.activeWorkspaceLabel).toBe('Home')
    expect(captured.ctx.entityContext).toBeNull()
    expect(captured.ctx.attention).toBeInstanceOf(Map)
    expect(captured.ctx.frameReady).toBe(true)
    expect(captured.ctx.mobileMenuOpen).toBe(false)
  })

  // TC-GC-6: frameReady true after mount
  it('frameReady is true immediately', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    expect(captured.ctx.frameReady).toBe(true)
  })

  // TC-GC-2: useUpdateEntityContext sets entity
  it('updates entity context', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    const entity: EntityContext = {
      label: 'Villa Mazotos',
      type: 'property',
    }

    act(() => {
      captured.updateEntity(entity)
    })

    expect(captured.ctx.entityContext).toEqual(entity)
  })

  // TC-GC-3: entityContext clears on workspace change (Guarantee G3)
  it('clears entity context on workspace change', () => {
    let renderer!: TestRenderer.ReactTestRenderer

    act(() => {
      renderer = TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    // Set entity in current workspace
    act(() => {
      captured.updateEntity({ label: 'Test Property', type: 'property' })
    })
    expect(captured.ctx.entityContext).not.toBeNull()

    // Change workspace — entity must clear (G3)
    act(() => {
      renderer.update(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="finance"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    expect(captured.ctx.entityContext).toBeNull()
  })

  // TC-GC-4: useUpdateAttention updates one workspace
  it('updates attention for a single workspace', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    act(() => {
      captured.updateAttention('finance', 5)
    })

    const financeAttention = captured.ctx.attention.get('finance')
    expect(financeAttention?.count).toBe(5)

    // Home should still be null (not affected)
    const homeAttention = captured.ctx.attention.get('home')
    expect(homeAttention?.count).toBeNull()
  })

  // TC-GC-5: null attention preserved (P-ARCH-1)
  it('preserves null attention count (P-ARCH-1)', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    // Initial state — null
    expect(captured.ctx.attention.get('home')?.count).toBeNull()

    // Set to a number first
    act(() => {
      captured.updateAttention('home', 3)
    })
    expect(captured.ctx.attention.get('home')?.count).toBe(3)

    // Set back to null — must not coerce to 0
    act(() => {
      captured.updateAttention('home', null)
    })
    expect(captured.ctx.attention.get('home')?.count).toBeNull()
  })

  // Mobile menu toggle (bonus behavioral test)
  it('toggles mobile menu', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId="home"
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    expect(captured.ctx.mobileMenuOpen).toBe(false)

    act(() => {
      captured.setMobile(true)
    })
    expect(captured.ctx.mobileMenuOpen).toBe(true)

    act(() => {
      captured.setMobile(false)
    })
    expect(captured.ctx.mobileMenuOpen).toBe(false)
  })

  // activeWorkspaceLabel is null when no match
  it('returns null activeWorkspaceLabel when no workspace matches', () => {
    act(() => {
      TestRenderer.create(
        <GlobalContextProvider
          user={mockUser}
          workspaces={mockWorkspaces}
          activeWorkspaceId={null}
        >
          <ContextCapture />
        </GlobalContextProvider>
      )
    })

    expect(captured.ctx.activeWorkspaceLabel).toBeNull()
  })

  // Provider renders children (structural — renderToStaticMarkup)
  it('renders children inside provider', () => {
    const html = renderToStaticMarkup(
      <GlobalContextProvider
        user={mockUser}
        workspaces={mockWorkspaces}
        activeWorkspaceId="home"
      >
        <div>Hello from child</div>
      </GlobalContextProvider>
    )
    expect(html).toContain('Hello from child')
  })

  // TC-GC-7: hooks throw descriptive error outside provider
  it('useGlobalContext throws outside provider', () => {
    function Orphan() {
      useGlobalContext()
      return <div />
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
      'useGlobalContext must be used within <GlobalContextProvider>'
    )
  })

  it('useUpdateEntityContext throws outside provider', () => {
    function Orphan() {
      useUpdateEntityContext()
      return <div />
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
      'useUpdateEntityContext must be used within <GlobalContextProvider>'
    )
  })

  it('useUpdateAttention throws outside provider', () => {
    function Orphan() {
      useUpdateAttention()
      return <div />
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
      'useUpdateAttention must be used within <GlobalContextProvider>'
    )
  })

  it('useSetMobileMenu throws outside provider', () => {
    function Orphan() {
      useSetMobileMenu()
      return <div />
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(
      'useSetMobileMenu must be used within <GlobalContextProvider>'
    )
  })
})
