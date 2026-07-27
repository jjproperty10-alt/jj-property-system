/**
 * (app) route group layout — OperatingFrame wrapper.
 *
 * All internal JJ routes live under this route group.
 * The parenthesized folder name is transparent to URLs.
 *
 * This layout resolves the authenticated user and wraps children
 * in OperatingFrame (sidebar + navigation). Unauthenticated users
 * see children without the frame (login page, etc.).
 *
 * Partner routes (/partner/[slug]) live OUTSIDE this group,
 * ensuring they never receive OperatingFrame — even when the
 * visitor has an authenticated session (BLOCKER 2 / Contract A-F7).
 *
 * @see NAV-1_PHASE3_COMPONENT_CONTRACTS.md — OperatingFrame contract
 * @see NAV-1_PHASE2_NAVIGATION_CONTRACT.md — Contract A
 */

import { resolveFrameUser } from '@/lib/nav/resolveFrameUser'
import { getRegisteredWorkspaces } from '@/lib/nav'
import { OperatingFrame } from '@/components/nav'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Server-side user resolution — fail-closed (null = no frame)
  const user = await resolveFrameUser()

  if (!user) {
    // Unauthenticated — render without frame (login page, etc.)
    return <>{children}</>
  }

  return (
    <OperatingFrame
      user={user}
      workspaces={getRegisteredWorkspaces(user.role)}
    >
      {children}
    </OperatingFrame>
  )
}
