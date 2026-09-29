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
 *
 * Staff gate: authenticateStatementUser() runs before getOwnersRoom().
 * The same active-staff check as /owners/[slug]. Middleware, hidden UI,
 * and service-role RLS are not the gate.
 *
 * The Owners Room remains limited to a single active company. Do not enable
 * it for a second company until every list source, certification, and balance
 * is isolated by company and entity id. This page does not filter those
 * sources and does not establish company isolation.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageShell, WorkspaceHeader } from '@/components/ds'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { getOwnersRoom } from '@/lib/owners/ownerWorkspaceService'
import { OwnersRoomClient } from './OwnersRoomClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Owners Room',
}

export default async function OwnersRoomPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    if (auth.error === 'NO_SESSION') {
      redirect('/login')
    }
    // NOT_STAFF, STAFF_INACTIVE, AUTH_ERROR — same block as /owners/[slug].
    notFound()
  }

  const room = await getOwnersRoom()
  const initialQuery = typeof searchParams?.q === 'string' ? searchParams.q : ''

  return (
    <PageShell>
      <WorkspaceHeader
        title="Owners Room"
        actions={
          <Link
            href="/owners/new"
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
          >
            <span aria-hidden>+</span> Add Client
          </Link>
        }
      />
      <OwnersRoomClient room={room} initialQuery={initialQuery} />
    </PageShell>
  )
}
