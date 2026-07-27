/**
 * @description Tests for GlobalContextProvider — Contract D.
 *
 * Test Contracts covered:
 *   TC-GC-1: useGlobalContext returns full shape
 *   TC-GC-2: useUpdateEntityContext sets entity
 *   TC-GC-3: entityContext clears on workspace change
 *   TC-GC-4: useUpdateAttention updates one workspace
 *   TC-GC-5: null attention preserved (P-ARCH-1)
 *   TC-GC-6: frameReady true after mount
 *   TC-GC-7: hooks throw descriptive error outside provider
 */

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import {
  GlobalContextProvider,
  useGlobalContext,
  useUpdateEntityContext,
  useUpdateAttention,
  useSetMobileMenu,
} from '../GlobalContextProvider'
import type { FrameUser, WorkspaceRegistration, EntityContext } from '@/lib/nav/types'
import { Home } from 'lucide-react'

// ─── Fixtures ────────────────────────────────────────────────────────────

const mockUser: FrameUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@jjproperty.com',
  role: 'ceo',
}

const mockWorkspaces: WorkspaceRegistration[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    landingRoute: '/home',
    routePrefix: '/home',
    attentionProvider: async () => null,
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: Home,
    landingRoute: '/finance',
    routePrefix: '/finance',
    attentionProvider: async () => 3,
  },
]

function wrapper(
  activeWorkspaceId: string | null = 'home'
): React.FC<{ children: React.ReactNode }> {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <GlobalContextProvider
        user={mockUser}
        workspaces={mockWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
      >
        {children}
      </GlobalContextProvider>
    )
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('GlobalContextProvider', () => {
  // TC-GC-1: useGlobalContext returns full shape
  it('provides full GlobalContextShape', () => {
    const { result } = renderHook(() => useGlobalContext(), {
      wrapper: wrapper('home'),
    })

    const ctx = result.current
    expect(ctx.user).toEqual(mockUser)
    expect(ctx.activeWorkspaceId).toBe('home')
    expect(ctx.activeWorkspaceLabel).toBe('Home')
    expect(ctx.entityContext).toBeNull()
    expect(ctx.attention).toBeInstanceOf(Map)
    expect(ctx.frameReady).toBe(true)
    expect(ctx.mobileMenuOpen).toBe(false)
  })

  // TC-GC-6: frameReady true after mount
  it('frameReady is true immediately', () => {
    const { result } = renderHook(() => useGlobalContext(), {
      wrapper: wrapper(),
    })
    expect(result.current.frameReady).toBe(true)
  })

  // TC-GC-2: useUpdateEntityContext sets entity
  it('updates entity context', () => {
    const { result: ctxResult } = renderHook(
      () => ({
        ctx: useGlobalContext(),
        update: useUpdateEntityContext(),
      }),
      { wrapper: wrapper() }
    )

    const entity: EntityContext = {
      label: 'Villa Mazotos',
      type: 'property',
    }

    act(() => {
      ctxResult.current.update(entity)
    })

    expect(ctxResult.current.ctx.entityContext).toEqual(entity)
  })

  // TC-GC-3: entityContext clears on workspace change
  it('clears entity context on workspace change', () => {
    let activeWs = 'home'

    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalContextProvider
        user={mockUser}
        workspaces={mockWorkspaces}
        activeWorkspaceId={activeWs}
      >
        {children}
      </GlobalContextProvider>
    )

    const { result, rerender } = renderHook(
      () => ({
        ctx: useGlobalContext(),
        update: useUpdateEntityContext(),
      }),
      { wrapper: Wrapper }
    )

    // Set entity
    act(() => {
      result.current.update({ label: 'Test', type: 'property' })
    })
    expect(result.current.ctx.entityContext).not.toBeNull()

    // Change workspace
    activeWs = 'finance'
    rerender()

    expect(result.current.ctx.entityContext).toBeNull()
  })

  // TC-GC-4: useUpdateAttention updates one workspace
  it('updates attention for a single workspace', () => {
    const { result } = renderHook(
      () => ({
        ctx: useGlobalContext(),
        updateAttention: useUpdateAttention(),
      }),
      { wrapper: wrapper() }
    )

    act(() => {
      result.current.updateAttention('finance', 5)
    })

    const financeAttention = result.current.ctx.attention.get('finance')
    expect(financeAttention?.count).toBe(5)

    // Home should still be null (not affected)
    const homeAttention = result.current.ctx.attention.get('home')
    expect(homeAttention?.count).toBeNull()
  })

  // TC-GC-5: null attention preserved (P-ARCH-1)
  it('preserves null attention count (P-ARCH-1)', () => {
    const { result } = renderHook(
      () => ({
        ctx: useGlobalContext(),
        updateAttention: useUpdateAttention(),
      }),
      { wrapper: wrapper() }
    )

    // Set to a number first
    act(() => {
      result.current.updateAttention('home', 3)
    })
    expect(result.current.ctx.attention.get('home')?.count).toBe(3)

    // Set back to null
    act(() => {
      result.current.updateAttention('home', null)
    })
    expect(result.current.ctx.attention.get('home')?.count).toBeNull()
  })

  // Mobile menu toggle
  it('toggles mobile menu', () => {
    const { result } = renderHook(
      () => ({
        ctx: useGlobalContext(),
        setMobile: useSetMobileMenu(),
      }),
      { wrapper: wrapper() }
    )

    expect(result.current.ctx.mobileMenuOpen).toBe(false)

    act(() => {
      result.current.setMobile(true)
    })
    expect(result.current.ctx.mobileMenuOpen).toBe(true)

    act(() => {
      result.current.setMobile(false)
    })
    expect(result.current.ctx.mobileMenuOpen).toBe(false)
  })

  // activeWorkspaceLabel is null when no match
  it('returns null activeWorkspaceLabel when no workspace matches', () => {
    const { result } = renderHook(() => useGlobalContext(), {
      wrapper: wrapper(null),
    })
    expect(result.current.activeWorkspaceLabel).toBeNull()
  })

  // TC-GC-7: hooks throw descriptive error outside provider
  it('useGlobalContext throws outside provider', () => {
    expect(() => {
      renderHook(() => useGlobalContext())
    }).toThrow('useGlobalContext must be used within <GlobalContextProvider>')
  })

  it('useUpdateEntityContext throws outside provider', () => {
    expect(() => {
      renderHook(() => useUpdateEntityContext())
    }).toThrow('useUpdateEntityContext must be used within <GlobalContextProvider>')
  })

  it('useUpdateAttention throws outside provider', () => {
    expect(() => {
      renderHook(() => useUpdateAttention())
    }).toThrow('useUpdateAttention must be used within <GlobalContextProvider>')
  })

  it('useSetMobileMenu throws outside provider', () => {
    expect(() => {
      renderHook(() => useSetMobileMenu())
    }).toThrow('useSetMobileMenu must be used within <GlobalContextProvider>')
  })
})
