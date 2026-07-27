/**
 * @module nav/GlobalContextProvider
 * @description NAV-1 — React Context Provider implementing Contract D.
 *
 * Stability: FROZEN — mirrors Contract D.
 *
 * Provides:
 *   - useGlobalContext()        → read the current GlobalContext
 *   - useUpdateEntityContext()  → set/clear entity context
 *   - useUpdateAttention()     → update a workspace's attention count
 *   - useSetMobileMenu()       → toggle mobile sidebar drawer
 *
 * Guarantees:
 *   G1: Context shape matches Contract D exactly.
 *   G2: user is resolved before frameReady becomes true.
 *   G3: entityContext clears on workspace change.
 *   G4: null values are preserved — never coerced to defaults.
 *   G5: Context value is referentially stable (memoized).
 *   G6: Update hooks are the only way to modify context.
 *
 * Forbidden:
 *   GC-F1: No business data fetching.
 *   GC-F2: No direct context mutation.
 *   GC-F3: No cross-session persistence.
 *   GC-F4: No null coercion (P-ARCH-1).
 *
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract D
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — GlobalContextProvider contract
 */

'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import type {
  GlobalContextShape,
  FrameUser,
  WorkspaceRegistration,
  EntityContext,
  WorkspaceAttention,
} from '@/lib/nav/types'

// ─── Contexts ───────────────────────────────────────────────────────────

/**
 * Separate contexts for value vs. updaters prevents unnecessary re-renders.
 * Components that only dispatch updates don't re-render when the value changes.
 */
const GlobalCtx = createContext<GlobalContextShape | null>(null)

const EntityCtxUpdater = createContext<
  ((entity: EntityContext | null) => void) | null
>(null)

const AttentionUpdater = createContext<
  ((workspaceId: string, count: number | null) => void) | null
>(null)

const MobileMenuUpdater = createContext<
  ((open: boolean) => void) | null
>(null)

// ─── Hooks (TC-GC-7: descriptive error outside provider) ───────────────

/** Read the current GlobalContext (TC-GC-1). */
export function useGlobalContext(): GlobalContextShape {
  const ctx = useContext(GlobalCtx)
  if (!ctx) {
    throw new Error(
      'useGlobalContext must be used within <GlobalContextProvider>. ' +
      'Ensure the component is rendered inside the Operating Frame.'
    )
  }
  return ctx
}

/** Set or clear entity context (TC-GC-2, TC-GC-3). */
export function useUpdateEntityContext(): (entity: EntityContext | null) => void {
  const updater = useContext(EntityCtxUpdater)
  if (!updater) {
    throw new Error(
      'useUpdateEntityContext must be used within <GlobalContextProvider>.'
    )
  }
  return updater
}

/** Update a workspace's attention count (TC-GC-4). */
export function useUpdateAttention(): (workspaceId: string, count: number | null) => void {
  const updater = useContext(AttentionUpdater)
  if (!updater) {
    throw new Error(
      'useUpdateAttention must be used within <GlobalContextProvider>.'
    )
  }
  return updater
}

/** Toggle mobile sidebar drawer. */
export function useSetMobileMenu(): (open: boolean) => void {
  const updater = useContext(MobileMenuUpdater)
  if (!updater) {
    throw new Error(
      'useSetMobileMenu must be used within <GlobalContextProvider>.'
    )
  }
  return updater
}

// ─── Provider ───────────────────────────────────────────────────────────

interface GlobalContextProviderProps {
  user: FrameUser
  workspaces: readonly WorkspaceRegistration[]
  activeWorkspaceId: string | null
  children: ReactNode
}

export function GlobalContextProvider({
  user,
  workspaces,
  activeWorkspaceId,
  children,
}: GlobalContextProviderProps) {
  const [entityContext, setEntityContext] = useState<EntityContext | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [attention, setAttention] = useState<ReadonlyMap<string, WorkspaceAttention>>(
    () => new Map(workspaces.map((ws) => [ws.id, { count: null, items: [] }]))
  )

  // ── G3: entity context clears on workspace change ───────────────────
  const prevWorkspaceRef = useRef(activeWorkspaceId)
  useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      setEntityContext(null) // G4: null preserved
      setMobileMenuOpen(false) // close mobile menu on navigation
      prevWorkspaceRef.current = activeWorkspaceId
    }
  }, [activeWorkspaceId])

  // ── G6: update hooks are the only way to modify context ─────────────

  const updateEntityContext = useCallback(
    (entity: EntityContext | null) => {
      setEntityContext(entity) // G4: null preserved, not coerced
    },
    []
  )

  const updateAttention = useCallback(
    (workspaceId: string, count: number | null) => {
      setAttention((prev) => {
        const next = new Map(prev)
        const existing = next.get(workspaceId)
        next.set(workspaceId, {
          count, // G4: null preserved
          items: existing?.items ?? [],
        })
        return next
      })
    },
    []
  )

  const updateMobileMenu = useCallback((open: boolean) => {
    setMobileMenuOpen(open)
  }, [])

  // ── Derived values ──────────────────────────────────────────────────
  const activeWorkspaceLabel =
    workspaces.find((ws) => ws.id === activeWorkspaceId)?.label ?? null

  // ── G5: referentially stable context value ──────────────────────────
  const contextValue = useMemo<GlobalContextShape>(
    () => ({
      user,
      activeWorkspaceId,
      activeWorkspaceLabel,
      entityContext,
      attention,
      frameReady: true, // G2: user already resolved server-side before this mounts
      mobileMenuOpen,
    }),
    [
      user,
      activeWorkspaceId,
      activeWorkspaceLabel,
      entityContext,
      attention,
      mobileMenuOpen,
    ]
  )

  return (
    <GlobalCtx.Provider value={contextValue}>
      <EntityCtxUpdater.Provider value={updateEntityContext}>
        <AttentionUpdater.Provider value={updateAttention}>
          <MobileMenuUpdater.Provider value={updateMobileMenu}>
            {children}
          </MobileMenuUpdater.Provider>
        </AttentionUpdater.Provider>
      </EntityCtxUpdater.Provider>
    </GlobalCtx.Provider>
  )
}
