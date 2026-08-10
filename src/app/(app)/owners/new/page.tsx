/**
 * /owners/new — Add Client Wizard (PR #4)
 *
 * Server Component: auth gate + data fetching.
 * Wizard UI delegated to AddClientWizard (client component).
 *
 * Constitutional: P-ARCH-5 (lifecycle isolation), P0 Architecture.
 * Auth: cookie session → user_roles → must be active staff.
 */

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { PageShell, WorkspaceHeader } from '@/components/ds'
import { createServiceClient } from '@/lib/supabase'
import { getAllVerifiedOwners } from '@/lib/identity/identityResolverService'
import { AddClientWizard } from './AddClientWizard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'JJ — Add Client',
}

export default async function AddClientPage() {
  // ── Auth gate (same pattern as reportAuthorization.ts) ──
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect('/login?next=/owners/new')
  }

  // Check staff role
  const db = createServiceClient()
  const { data: roleData } = await db
    .from('user_roles')
    .select('role, is_active')
    .eq('user_id', user.id)
    .single()

  if (!roleData || !roleData.is_active) {
    redirect('/owners')
  }

  // ── Data for wizard ──
  const { owners, draftOwners } = await getAllVerifiedOwners()

  // Combine all entities for duplicate detection (passed to client)
  const existingEntities = [
    ...owners.map(o => ({
      entityId: o.identity.entityId,
      displayName: o.identity.displayName,
      canonicalSlug: o.identity.canonicalSlug,
    })),
    ...draftOwners.map(d => ({
      entityId: d.identity.entityId,
      displayName: d.identity.displayName,
      canonicalSlug: d.identity.canonicalSlug,
    })),
  ]

  // Fetch properties for Step 3
  // property_definitions uses property_name as the identifier (legacy table)
  let properties: { propertyId: string; displayName: string }[] = []
  try {
    const { data: propData } = await db
      .from('property_definitions')
      .select('property_name, relationship_type')
      .order('property_name')
    if (propData) {
      properties = propData.map((p: { property_name: string; relationship_type: string }) => ({
        propertyId: p.property_name,
        displayName: p.property_name,
      }))
    }
  } catch {
    // Non-fatal — wizard works without property selection
    properties = []
  }

  return (
    <PageShell>
      <WorkspaceHeader
        title="Add Client"
        backRoute="/owners"
      />
      <AddClientWizard
        existingEntities={existingEntities}
        availableProperties={properties}
      />
    </PageShell>
  )
}
