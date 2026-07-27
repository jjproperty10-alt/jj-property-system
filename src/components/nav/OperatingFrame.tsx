/**
 * @module nav/OperatingFrame
 * @description NAV-1 — The permanent application shell.
 *
 * Stability: FROZEN
 *
 * The Operating Frame is the outermost visual container of the application.
 * It renders the sidebar, the main content area, and wraps everything in
 * GlobalContextProvider for navigation state management.
 *
 * Responsibilities:
 *   OF-R1: Render sidebar navigation (workspace-derived, A-R1).
 *   OF-R2: Detect active workspace from URL (usePathname, G3).
 *   OF-R3: Ensure content area is skip-to-content target.
 *          <main> landmark delegated to workspace/page shell.
 *          (Amendment: WorkspaceShell already renders <main>;
 *           Frame rendering <main> too causes invalid nested landmarks.)
 *   OF-R4: Render skip-to-content link (A-R2).
 *   OF-R5: Wrap children in GlobalContextProvider.
 *
 * Guarantees:
 *   G1: Sidebar is always present (not lazy-loaded — no Layout Shift).
 *   G2: Content area occupies remaining width.
 *   G3: Active workspace derived from URL, not from state.
 *   G4: Renders correctly when activeWorkspaceId is null.
 *   G5: Mobile: sidebar hidden by default, hamburger button visible.
 *
 * Forbidden:
 *   OF-F1: No business data fetching.
 *   OF-F2: No direct DB queries.
 *   OF-F3: No hard-coded routes — all from registry.
 *   OF-F4: Does not produce Business Truth (Responsibility Chain Invariant).
 *
 * Layout: Tree B for Home workspace (PageShell, no tabs).
 *         Tree A for tabbed workspaces (WorkspaceShell — future PRs).
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — OperatingFrame contract
 * @see NAV-1_PHASE4_COMPOSITION_RULES.md — Tree A, Tree B
 */

'use client'

import { usePathname } from 'next/navigation'
import { useMemo, type ReactNode } from 'react'
import type { FrameUser, WorkspaceRegistration } from '@/lib/nav/types'
import { GlobalContextProvider } from './GlobalContextProvider'
import { Sidebar } from './Sidebar'

// ─── Types ──────────────────────────────────────────────────────────────

interface OperatingFrameProps {
  user: FrameUser
  workspaces: readonly WorkspaceRegistration[]
  children: ReactNode
}

// ─── Component ──────────────────────────────────────────────────────────

export function OperatingFrame({ user, workspaces, children }: OperatingFrameProps) {
  const pathname = usePathname()

  // G3: Active workspace derived from URL, not from state.
  // OF-F3: no hard-coded routes — matched via registry routePrefix.
  const activeWorkspaceId = useMemo(() => {
    // Match longest routePrefix first (more specific wins)
    const sorted = [...workspaces].sort(
      (a, b) => b.routePrefix.length - a.routePrefix.length
    )
    for (const ws of sorted) {
      if (pathname === ws.routePrefix || pathname.startsWith(ws.routePrefix + '/')) {
        return ws.id
      }
    }
    return null // G4: null when no workspace matches
  }, [pathname, workspaces])

  return (
    <GlobalContextProvider
      user={user}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
    >
      {/* OF-R4: Skip to content link (A-R2) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen">
        {/* OF-R1: Sidebar navigation */}
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          user={user}
        />

        {/* OF-R3 (amended): Content area — skip-to-content target.
         * <main> landmark is provided by the active workspace/page shell:
         *   - Tree A pages: WorkspaceShell renders <main>
         *   - Tree B pages: page component renders <main>
         * OperatingFrame does NOT render <main> to avoid nested landmarks.
         */}
        <div
          id="main-content"
          className="flex-1 min-w-0"
        >
          {children}
        </div>
      </div>
    </GlobalContextProvider>
  )
}
