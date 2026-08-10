/**
 * /owners — Owners Room
 *
 * The daily dispatch screen. JJ sees all active owners,
 * ordered by priority: who needs attention first?
 *
 * PR #3 — JJ Workspace Navigation + Owner Workspace Design System
 * P1 Enhancement: search, filter, +Add Client, config health badge, property count.
 *
 * Architecture: Server Component fetches data → OwnersRoomClient handles
 * client-side search/filter interactivity. No new DS primitives —
 * uses existing DS tokens/styles locally.
 */

import type { Metadata } from 'next'
import { PageShell, WorkspaceHeader } from '@/components/ds'
import { getOwnersRoom } from '@/lib/owners/ownerWorkspaceService'
import { OwnersRoomClient } from './OwnersRoomClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Owners Room',
}

export default async function OwnersRoomPage() {
  const room = await getOwnersRoom()

  return (
    <PageShell>
      <WorkspaceHeader title="Owners Room" />
      <OwnersRoomClient room={room} />
    </PageShell>
  )
}
