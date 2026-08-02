/**
 * @module nav/OperatingFrame
 * @description NAV-1 — The root application frame.
 *
 * Stability: FROZEN (Contract A) — changes require constitutional amendment.
 *
 * Responsibilities (A-R1…A-R9):
 *   A-R1: Render sidebar navigation from workspace registry
 *   A-R2: Determine active workspace from current path
 *   A-R3: Display authenticated user identity
 *   A-R4: Provide GlobalContext to all descendants
 *   A-R5: Manage mobile sidebar state
 *   A-R6: Render skip-to-content link
 *   A-R7: Render attention layer (future)
 *   A-R8: own <div id="main-content"> landmark
 *   A-R9: Never fetch data, never compute business truth
 *
 * RSC boundary:
 *   This is a 'use client' component. It receives WorkspaceNavItem[] (serializable DTO)
 *   from the server-side layout. No React components or functions cross this boundary.
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — Contract A
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract D
 */

'use client'

import { useMemo, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import type { FrameUser, WorkspaceNavItem } from '@/lib/nav/types'
import { GlobalContextProvider } from './GlobalContextProvider'
import { Sidebar } from './Sidebar'

// ─── Types ──────────────────────────────────────────────────────────────

interface OperatingFrameProps {
  user: FrameUser
  workspaces: readonly WorkspaceNavItem[]
  children: ReactNode
}

// ─── Component ──────────────────────────────────────────────────────────

/**
 * The Operating Frame — outermost application shell.
 * Wraps all internal routes with navigation, context, and layout.
 *
 * Workspace data arrives as serializable WorkspaceNavItem[] from the server.
 * Active workspace is determined client-side from the current pathname.
 */
export function OperatingFrame({ user, workspaces, children }: OperatingFrameProps) {
  const pathname = usePathname()

  // A-R2: Determine active workspace from current path
  // Longest-prefix match ensures /owners/foo matches 'owners', not 'home'
  const activeWorkspaceId = useMemo(() => {
    const sorted = [...workspaces].sort(
      (a, b) => b.routePrefix.length - a.routePrefix.length
    )
    for (const ws of sorted) {
      if (
        pathname === ws.routePrefix ||
        pathname.startsWith(ws.routePrefix + '/')
      ) {
        return ws.id
      }
    }
    return null
  }, [pathname, workspaces])

  return (
    <GlobalContextProvider
      user={user}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
    >
      {/* A-R6: Skip-to-content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen">
        {/* A-R1: Sidebar navigation */}
        <Sidebar
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          user={user}
        />
        {/* A-R8: Main content area */}
        <div id="main-content" className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </GlobalContextProvider>
  )
}
