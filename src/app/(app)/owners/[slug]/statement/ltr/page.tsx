/**
 * /owners/[slug]/statement/ltr — Owner LTR Statement Route
 *
 * Server Component. Produces a printable Owner LTR Statement for a single
 * property with an active rental contract.
 *
 * Architecture:
 *   authenticateStatementUser() → resolve slug → find service_engagements
 *   → find active rental_contract → resolve property_name via canonical bridge
 *   → fetchOwnerLtrStatement() → OwnerLtrStatement UI
 *
 * Resolution chain:
 *   1. Auth: staff-only via authenticateStatementUser() (fail-closed)
 *   2. Identity: slug → entity_identity via nameToSlug matching (G1 pattern)
 *   3. Service Engagements: entity → service_engagements (management_ltr, active)
 *   4. Contract: SE → rental_contracts (status = 'active')
 *   5. Property Name: property_id → property_definitions (canonical bridge, FK-backed)
 *   6. Statement: adapter composes P1–P7 + RC3 into OwnerLtrStatementDTO
 *
 * Query params:
 *   ?period=YYYY-MM  — statement month (default: current month)
 *   ?property=UUID   — disambiguate when entity has multiple LTR properties
 *
 * Constitutional:
 *   P-ARCH-1: NULL = Unknown (no placeholders)
 *   P-ARCH-6: Owner NEVER sees JJ internals
 *   P-LEDGER-6: owner-facing amounts = COALESCE(client_charge, amount_eur)
 *
 * server-only — must never be imported into Client Components.
 */

import 'server-only'
import { notFound } from 'next/navigation'
import { authenticateStatementUser } from '@/lib/statements/statementAuthService'
import { createServiceClient } from '@/lib/supabase'
import { nameToSlug } from '@/lib/owners/ownerWorkspaceUtils'
import { fetchOwnerLtrStatement } from '@/lib/owners/ownerLtrStatementAdapter'
import { OwnerLtrStatement } from '@/components/owners/OwnerLtrStatement'
import { PrintButton } from './PrintButton'

// ─── Types ──────────────────────────────────────────────────────────────────

interface EntityRow {
  id: string
  canonical_name: string
  status: string
}

interface ServiceEngagementRow {
  id: string
  property_id: string
  service_type: string
  status: string
}

interface RentalContractRow {
  id: string
  property_id: string
  service_engagement_id: string
  tenant_name: string
  monthly_rent_eur: number
  deposit_eur: number | null
  start_date: string
  end_date: string | null
  status: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function computePeriod(periodParam: string | undefined): {
  periodStart: string
  periodEnd: string
  periodLabel: string
} {
  let year: number
  let month: number

  if (periodParam && /^\d{4}-\d{2}$/.test(periodParam)) {
    const parts = periodParam.split('-')
    year = parseInt(parts[0], 10)
    month = parseInt(parts[1], 10)
  } else {
    const now = new Date()
    year = now.getFullYear()
    month = now.getMonth() + 1
  }

  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`

  // Last day of the month
  const lastDay = new Date(year, month, 0).getDate()
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const periodLabel = `${monthNames[month - 1]} ${year}`

  return { periodStart, periodEnd, periodLabel }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { slug: string }
  searchParams: { period?: string; property?: string }
}

export default async function OwnerLtrStatementPage({ params, searchParams }: PageProps) {
  // ── Step 1: Authenticate (fail-closed) ──────────────────────────────────
  const auth = await authenticateStatementUser()
  if (!auth.ok) {
    notFound()
  }

  const { slug } = params
  const sp = searchParams

  if (!slug || slug.trim().length === 0) {
    notFound()
  }

  // ── Step 2: Resolve entity identity (G1 pattern) ────────────────────────
  const sb = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: entityData, error: entityError } = await (sb as any)
    .schema('lifecycle')
    .from('entity_identity')
    .select('id, canonical_name, status')

  if (entityError || !entityData) {
    notFound()
  }

  const entities = (entityData as EntityRow[]).filter(
    e => nameToSlug(e.canonical_name) === slug,
  )

  if (entities.length !== 1) {
    notFound()
  }

  const entity = entities[0]
  if (entity.status !== 'active') {
    notFound()
  }

  // ── Step 3: Find active LTR service engagements ─────────────────────────
  // Query by canonical property_id UUID — never by property_name text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seData, error: seError } = await (sb as any)
    .schema('lifecycle')
    .from('service_engagements')
    .select('id, property_id, service_type, status')
    .eq('entity_id', entity.id)
    .eq('service_type', 'management_ltr')
    .eq('status', 'active')

  if (seError || !seData || (seData as ServiceEngagementRow[]).length === 0) {
    notFound()
  }

  const seRows = seData as ServiceEngagementRow[]

  // ── Step 4: Find active rental contracts via service_engagement_id ──────
  const seIds = seRows.map(r => r.id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contractData, error: contractError } = await (sb as any)
    .schema('lifecycle')
    .from('rental_contracts')
    .select('id, property_id, service_engagement_id, tenant_name, monthly_rent_eur, deposit_eur, start_date, end_date, status')
    .in('service_engagement_id', seIds)
    .eq('status', 'active')

  if (contractError || !contractData || (contractData as RentalContractRow[]).length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6">
        <h1 className="text-xl font-semibold text-neutral-900 mb-4">
          No Active Rental Contract
        </h1>
        <p className="text-neutral-600">
          {entity.canonical_name} does not have any properties with an active rental contract.
        </p>
      </div>
    )
  }

  const contracts = contractData as RentalContractRow[]

  // ── Step 5: Select property ─────────────────────────────────────────────
  // If ?property=UUID provided, use that. Otherwise take the first contract.
  let selectedContract: RentalContractRow
  if (sp.property) {
    const match = contracts.find(c => c.property_id === sp.property)
    if (!match) {
      notFound()
    }
    selectedContract = match
  } else {
    selectedContract = contracts[0]
  }

  // Resolve property_name via canonical bridge: property_id → property_definitions
  // property_definitions is the single source of truth for property display names.
  // service_engagements holds only the UUID — names are never duplicated on lifecycle tables.
  const { data: pdData, error: pdError } = await sb
    .from('property_definitions')
    .select('property_name, canonical_name, display_name')
    .eq('property_id', selectedContract.property_id)
    .single()

  if (pdError || !pdData) {
    notFound()
  }

  const pdRow = pdData as { property_name: string; canonical_name: string | null; display_name: string | null }
  const propertyName = pdRow.display_name ?? pdRow.canonical_name ?? pdRow.property_name

  // ── Step 6: Compute period ──────────────────────────────────────────────
  const { periodStart, periodEnd, periodLabel } = computePeriod(sp.period)

  // ── Step 7: Fetch statement ─────────────────────────────────────────────
  const statement = await fetchOwnerLtrStatement({
    propertyId: selectedContract.property_id,
    propertyName,
    ownerName: entity.canonical_name,
    rentalContractId: selectedContract.id,
    periodStart,
    periodEnd,
  })

  // ── Step 8: Render ──────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto py-8 px-6 print:py-2 print:px-0">
      {/* Period navigation — hidden in print */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <h2 className="text-lg font-medium text-neutral-700">
          LTR Statement — {periodLabel}
        </h2>

        {contracts.length > 1 && (
          <div className="text-sm text-neutral-500">
            {contracts.length} properties with active contracts
          </div>
        )}
      </div>

      {/* Statement component */}
      <OwnerLtrStatement statement={statement} />

      {/* Print button — hidden in print */}
      <div className="mt-8 flex justify-end print:hidden">
        <PrintButton />
      </div>
    </div>
  )
}
